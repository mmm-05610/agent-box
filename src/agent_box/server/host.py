from __future__ import annotations
import json, mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from agent_box import config
from agent_box.application.facade import HostApplication
from agent_box.extensions.bootstrap import build_extension_registry
from agent_box.application.ownership import MutationOwner
from .static import locate_web_static

MAX_BODY=128*1024
def create_server(host="127.0.0.1",port=0,static_dir=None, *, registry=None, report=None):
    if host not in {"127.0.0.1","localhost"}: raise ValueError("Web Host must bind exact loopback")
    owner=MutationOwner(config.agent_box_home()); owner.acquire()
    try:
        if registry is None or report is None:
            registry,report=build_extension_registry(strict=False)
    except Exception:
        owner.release()
        raise
    # The first database access/migrations happens only after ownership admission.
    app=HostApplication(registry,report)
    static_dir = Path(static_dir).resolve() if static_dir else locate_web_static()
    if static_dir is None:
        owner.release()
        raise FileNotFoundError("Web static build not found")
    class Handler(BaseHTTPRequestHandler):
        server_version="AgentBoxWeb/1"
        def _send(self,status,payload):
            raw=json.dumps(payload,ensure_ascii=False,default=lambda x: x.value if hasattr(x,"value") else str(x)).encode(); self.send_response(status); self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(raw))); self.end_headers(); self.wfile.write(raw)
        def _json(self):
            if self.headers.get("Content-Type","").split(";",1)[0].lower()!="application/json": raise ValueError("CONTENT_TYPE_REQUIRED: application/json")
            length=int(self.headers.get("Content-Length","0"));
            if length>MAX_BODY: raise ValueError("BODY_TOO_LARGE")
            return json.loads(self.rfile.read(length) or b"{}")
        def _dispatch(self,method):
            parsed=urlparse(self.path); path=parsed.path; query=parse_qs(parsed.query); route=path[len("/api/v1"):] if path.startswith("/api/v1") else path; bits=[x for x in route.split("/") if x]; body=self._json() if method in {"POST","PUT"} else {}
            if path=="/api/v1/health": return 200,{"status":"ok","owner":"local-web-host"}
            if path=="/api/v1/plugins": return 200,{"plugins":[{"id":r.descriptor.id if r.descriptor else r.entry_point,"status":r.status,"display_name":r.descriptor.display_name if r.descriptor else r.entry_point,"error":r.error} for r in report.records]}
            if path=="/api/v1/providers/execution": return 200,{"providers":[{"id":p.id,"display_name":p.display_name,"version":p.version,"requirements":[{"contract_id":cid,"min":lo,"max":hi,"required":lo>0} for cid,(lo,hi) in sorted(registry.get(p.id).input_limits().items())],"capabilities":registry.get(p.id).capabilities()} for p in registry.descriptors()]}
            if path=="/api/v1/harnesses" and method=="GET": return 200,{"harnesses":app.harness_list()}
            if len(bits)>=2 and bits[0]=="harnesses":
                hid=bits[1]
                if len(bits)==2 and method=="GET": return 200,app.harness_detail(hid)
                if len(bits)==3 and bits[2]=="diagnostics" and method=="GET": return 200,app.harness_diagnostics(hid)
                if len(bits)>=3 and bits[2]=="profiles":
                    if len(bits)==3 and method=="GET": return 200,app.profiles(hid)
                    if len(bits)==3 and method=="POST": return 201,app.profile_mutation(body.get("command_id",""),hid,"create",body=body)
                    if len(bits)>=4:
                        pid=bits[3]
                        if len(bits)==4 and method=="GET": return 200,app.profile(hid,pid,int(query["revision"][0]) if query.get("revision") else None)
                        if len(bits)==5 and bits[4]=="revisions" and method=="POST": return 201,app.profile_mutation(body.get("command_id",""),hid,"update",pid,body)
                        if len(bits)==5 and bits[4]=="validate" and method=="POST": return 200,app.profile_mutation(body.get("command_id",""),hid,"validate",pid,body)
                        if len(bits)==5 and bits[4]=="projection-preview" and method=="POST": return 200,app.profile_mutation(body.get("command_id",""),hid,"projection",pid,body)
            if path=="/api/v1/works" and method=="GET": return 200,{"works":list(app.list_works())}
            if path=="/api/v1/works" and method=="POST": return 201,app.create_work(body.get("command_id",""),body.get("objective",""))
            if len(bits)>=2 and bits[0]=="works":
                wid=bits[1]
                if len(bits)==3 and bits[2]=="complete": return 200,app.complete_work(body.get("command_id",""),wid,body.get("reason","completed"))
                if len(bits)==2: return 200,app.work_detail(wid)
                if len(bits)==3 and bits[2]=="executions": return 201,app.create_execution(body.get("command_id",""),wid,body["provider_id"],body["responsibility"])
            if len(bits)>=2 and bits[0]=="executions":
                eid=bits[1]; action=bits[2] if len(bits)>2 else ""
                if len(bits)==2: return 200,app.get_execution(eid)
                if action in {"binding-draft","binding"} and method=="GET": return 200,app.get_draft(eid) if action.endswith("draft") else {"inputs":[{"contract_id":c,"ref":{"type":r.type.value,"provider":r.provider,"native_id":r.native_id,"uri":r.uri,"metadata":dict(r.metadata)}} for c,r in app.repo.list_input_refs(eid)]}
                if action=="binding-draft" and method=="PUT": return 200,app.update_draft(body.get("command_id",""),eid,body.get("expected_revision",-1),body.get("changes",body))
                if action=="binding-review": return 200,app.review(eid)
                if action=="freeze-dispatch": return 200,app.freeze(body.get("command_id",""),eid,body.get("expected_draft_revision",-1))
                if action=="observe": return 202,app.observe(body.get("operation_id",""),eid)
                if action=="finish": return 202,app.finish(body.get("operation_id",""),eid)
                if action=="outputs": return 200,{"outputs":app.outputs(eid)}
                if action=="evidence": return 200,app.evidence(eid)
                if action=="attach": return 200,app.attach(eid)
                if action=="continue-from-output": return 201,app.continue_from_output(body.get("command_id",""),eid,body["output_ref"],body["provider_id"],body["responsibility"],body["contract_id"])
            if bits and bits[0]=="resource-selectors":
                if len(bits)==1 and method=="GET": return 200,{"selectors":app.selectors_json()}
                sid=bits[1]
                if len(bits)==3 and bits[2]=="choices": return 200,{"choices":app.selector_choices(sid,body)}
                if len(bits)==3 and bits[2]=="prepare": return 200,app.prepare(body["execution_id"],sid,body.get("parameters",{}),body.get("slot_id"))
            if len(bits)==2 and bits[0]=="operations": return 200,app.get_operation(bits[1])
            raise KeyError("NOT_FOUND")
        def _handle(self,method):
            try:
                if method in {"POST","PUT"} and self.headers.get("Origin") not in {f"http://127.0.0.1:{self.server.server_port}",f"http://localhost:{self.server.server_port}"}: raise PermissionError("CSRF_ORIGIN_REJECTED")
                status,payload=self._dispatch(method); self._send(status,payload)
            except PermissionError as e: self._send(403,{"error":{"code":str(e)}})
            except KeyError as e: self._send(404,{"error":{"code":str(e.args[0])}})
            except Exception as e: self._send(400,{"error":{"code":str(e).split(":",1)[0],"message":str(e)[:300]}})
        def do_GET(self):
            try:
                if self.path.startswith("/api/"): self._handle("GET"); return
                rel=urlparse(self.path).path.lstrip("/") or "index.html"; candidate=(static_dir/rel).resolve()
                if not candidate.is_file() or static_dir.resolve() not in candidate.parents: candidate=static_dir/"index.html"
                raw=candidate.read_bytes(); self.send_response(200); self.send_header("Content-Type",mimetypes.guess_type(str(candidate))[0] or "text/html"); self.send_header("Content-Length",str(len(raw))); self.end_headers(); self.wfile.write(raw)
            except Exception as exc:
                self._send(500,{"error":{"code":"STATIC_HOST_ERROR","message":str(exc)[:160]}})
        def do_POST(self): self._handle("POST")
        def do_PUT(self): self._handle("PUT")
        def log_message(self,*args): pass
    server=ThreadingHTTPServer((host,port),Handler); server.app=app; server.owner=owner; return server
def run_server(host="127.0.0.1",port=4173,static_dir=None):
    server=create_server(host,port,static_dir); print(f"Agent-Box Web Host listening on http://{host}:{server.server_port}")
    try: server.serve_forever()
    finally:
        server.app.shutdown(); server.owner.release(); server.server_close()
