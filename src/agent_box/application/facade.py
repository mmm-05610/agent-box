from __future__ import annotations
from dataclasses import asdict
from datetime import datetime, timezone
import json, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from agent_box import config
from agent_box.extensions.finalization import HostFinalizationCoordinator
from agent_box.work_core import Ref, RefType
from agent_box.work_core.repository import CoreRepository, RefRelation
from agent_box.work_core.services import WorkService, ExecutionService
from .operations import OperationStore

def _ref(r): return {"type":r.type.value,"provider":r.provider,"native_id":r.native_id,"uri":r.uri,"metadata":dict(r.metadata)}
def _execution(e): return {"id":e.id,"work_id":e.work_id,"provider_id":e.provider_id,"phase":e.projection.phase.value,"outcome":e.projection.outcome.value if e.projection.outcome else None,"freshness":e.projection.freshness.value,"created_at":e.created_at.isoformat()}

def _requirements(provider):
    limits = provider.input_limits() if callable(getattr(provider, "input_limits", None)) else provider.input_limits
    return [{"contract_id": cid, "min": minimum, "max": maximum, "required": minimum > 0} for cid, (minimum, maximum) in sorted(limits.items())]

class HostApplication:
    def __init__(self,registry,report,home:Path|None=None):
        self.registry,self.report,self.repo=registry,report,CoreRepository(); self.work,self.execution=WorkService(self.repo),ExecutionService(self.repo); self.lock=threading.RLock(); self._finish_locks: dict[str, threading.Lock] = {}; self._submitted_operations: set[str] = set(); self.root=(home or config.agent_box_home())/"host"; self.root.mkdir(parents=True,exist_ok=True); self.draft_root=self.root/"binding-drafts"; self.draft_root.mkdir(exist_ok=True); self.commands={}; self.operation_store=OperationStore(self.root); self.finish_pool=ThreadPoolExecutor(max_workers=2, thread_name_prefix="agent-box-finish")
        self.controls={c.provider_id:c for r in report.ready for c in (r.registration.host_controls if r.registration else ())}; self.selectors={s.id:s for r in report.ready for s in (r.registration.resource_selectors if r.registration else ())}; self.harnesses={h.harness_id:h for r in report.ready for h in (r.registration.harness_managers if r.registration else ())}
        for x in (*self.controls.values(),*self.selectors.values()):
            if hasattr(x,"bind"): x.bind(registry)
        self.finalization=HostFinalizationCoordinator(self.execution,registry,tuple(c for r in report.ready for c in (r.registration.finalization_contributors if r.registration else ())))
    def _path(self,e): return self.draft_root/f"{e}.json"
    def _draft(self,e):
        try: draft = json.loads(self._path(e).read_text())
        except FileNotFoundError: draft = {"execution_id":e,"revision":0,"provider_id":self.repo.get_execution(e).provider_id,"slots":[],"errors":[],"reviewed":False}
        provider = self.registry.get(draft["provider_id"])
        draft["requirements"] = _requirements(provider)
        for index, slot in enumerate(draft.get("slots", [])):
            slot.setdefault("slot_id", f"{slot.get('contract_id', 'input')}-{index + 1}")
            slot["status"] = "satisfied" if slot.get("ref") else "missing"
        draft.setdefault("errors", [])
        draft.setdefault("reviewed", False)
        return draft
    def _save(self,d):
        d["updated_at"]=datetime.now(timezone.utc).isoformat(); p=self._path(d["execution_id"]); t=p.with_suffix(".tmp"); t.write_text(json.dumps(d,ensure_ascii=False)); t.replace(p)
    def create_work(self,command_id,objective):
        if not objective.strip():raise ValueError("OBJECTIVE_REQUIRED")
        if command_id in self.commands:return self.commands[command_id]
        w=self.work.create_work(objective.strip()); v={"work":{"id":w.id,"objective":w.objective,"lifecycle":w.lifecycle.value}}; self.commands[command_id]=v; return v
    def list_works(self):return [{"id":w.id,"objective":w.objective,"lifecycle":w.lifecycle.value,"updated_at":w.updated_at.isoformat()} for w in self.repo.list_works()]
    def work_detail(self,wid):
        w=self.repo.get_work(wid); return {"id":w.id,"objective":w.objective,"lifecycle":w.lifecycle.value,"closure_reason":w.closure_reason,"executions":[self._execution_view(e) for e in self.repo.list_executions(wid)]}
    def create_execution(self,command_id,work_id,provider_id,responsibility,source_ref=None):
        if command_id in self.commands:return self.commands[command_id]
        self.registry.get(provider_id); e=self.execution.create_execution(work_id,provider_id,responsibility_intent=responsibility.strip()); d=self._draft(e.id); d.update(provider_id=provider_id,requested_summary=responsibility.strip());
        if source_ref:d["slots"]=[{"slot_id":"source-output","selector_id":"source-output","contract_id":source_ref["contract_id"],"requested_summary":"Output of source Execution","exact_summary":"exact output Ref","ref":source_ref["ref"]}]
        self._save(d); v={"execution":_execution(e),"draft":d}; self.commands[command_id]=v; return v
    def _execution_view(self,e):
        value=_execution(e)
        value["responsibility"]=self.repo.get_execution_responsibility_intent(e.id)
        dispatch=self.repo.get_dispatch_for_execution(e.id)
        value["dispatch_state"]=dispatch["state"] if dispatch else None
        operation=self.operation_store.latest_for_execution(e.id)
        if operation and operation.status in {"accepted", "running", "failed", "interrupted", "ambiguous"}:
            value["operation"]=operation.public()
        return value
    def get_execution(self,e):return self._execution_view(self.repo.get_execution(e))
    def get_draft(self,e):return self._draft(e)
    def update_draft(self,command_id,e,expected,changes):
        with self.lock:
            d=self._draft(e)
            if d["revision"]!=expected:raise ValueError("REVISION_CONFLICT")
            if self.repo.get_dispatch_for_execution(e):raise ValueError("BINDING_FROZEN")
            if "slots" in changes:d["slots"]=changes["slots"]
            if "provider_id" in changes and changes["provider_id"] != self.repo.get_execution(e).provider_id: raise ValueError("PROVIDER_IMMUTABLE_AFTER_CREATE")
            d["revision"]+=1;d["reviewed"]=False;d["errors"]=[];self._save(d);return self._draft(e)
    def selectors_json(self):return [{"id":s.id,"contract_id":s.contract_id,"title":s.title,"fields":[asdict(f) for f in getattr(s,"fields",())]} for s in self.selectors.values()]
    def harness_list(self): return [dict(h.descriptor()) for h in self.harnesses.values()]
    def harness_detail(self,hid):
        h=self.harnesses.get(hid)
        if not h: raise KeyError("HARNESS_NOT_FOUND")
        return dict(h.descriptor())
    def harness_diagnostics(self,hid):
        h=self.harnesses.get(hid)
        if not h: raise KeyError("HARNESS_NOT_FOUND")
        return h.diagnostics() if hasattr(h,"diagnostics") else {"harness_id":hid,"status":"degraded"}
    def profiles(self,hid):
        h=self.harnesses.get(hid)
        if not h: raise KeyError("HARNESS_NOT_FOUND")
        return {"profiles":list(h.list_profiles())}
    def profile(self,hid,pid,revision=None):
        h=self.harnesses.get(hid)
        if not h: raise KeyError("HARNESS_NOT_FOUND")
        return h.get_profile(pid,revision)
    def profile_mutation(self,command_id,hid,op,pid=None,body=None):
        if command_id in self.commands:return self.commands[command_id]
        h=self.harnesses.get(hid)
        if not h: raise KeyError("HARNESS_NOT_FOUND")
        body=body or {}
        if op=="create": value=h.create(body)
        elif op=="update": value=h.update(pid,body,int(body.get("expected_revision",-1)))
        elif op=="disable": value=h.disable(pid,int(body.get("revision",-1)))
        elif op=="validate": value=h.validate(body)
        elif op=="projection": value=h.projection_preview(pid,body.get("revision"))
        else: raise KeyError("NOT_FOUND")
        result={"profile":value} if op in {"create","update","disable"} else value
        self.commands[command_id]=result; return result
    def selector_choices(self,sid,query):
        s=self.selectors[sid];return list(s.choices(query) if hasattr(s,"choices") else ())
    def prepare(self,e,sid,parameters,slot_id=None):
        r=self.selectors[sid].prepare(parameters,execution_id=e);d=self._draft(e)
        slot_id = slot_id or f"{r.contract_id}-{sum(x.get('contract_id') == r.contract_id for x in d['slots']) + 1}"
        d["slots"]=[x for x in d["slots"] if x.get("slot_id")!=slot_id]
        d["slots"].append({"slot_id":slot_id,"selector_id":sid,"contract_id":r.contract_id,"requested_summary":r.requested_summary,"exact_summary":r.exact_summary,"ref":_ref(r.ref)})
        d["revision"]+=1;d["reviewed"]=False;d["errors"]=[];self._save(d);return self._draft(e)
    def review(self,e):
        d=self._draft(e);errors=[]
        try:limits=self.registry.get(d["provider_id"]).input_limits()
        except Exception as exc:limits={};errors.append(str(exc))
        counts={}
        for x in d["slots"]:counts[x["contract_id"]]=counts.get(x["contract_id"],0)+1
        for cid,(lo,hi) in limits.items():
            if counts.get(cid,0)<lo or (hi is not None and counts.get(cid,0)>hi):errors.append(f"resource count outside provider limit: {cid}")
        for slot in d["slots"]:
            if not slot.get("ref"): errors.append(f"binding slot is unresolved: {slot.get('slot_id')}")
        d["errors"]=errors;d["reviewed"]=not errors;d["requirement_status"]=[{**item,"selected":counts.get(item["contract_id"],0),"satisfied":lo <= counts.get(item["contract_id"],0) <= (hi if hi is not None else counts.get(item["contract_id"],0))} for item in d["requirements"] for lo,hi in [(item["min"],item["max"])]];self._save(d);return self._draft(e)
    def freeze(self,command_id,e,expected):
        d=self.review(e)
        if d["revision"]!=expected:raise ValueError("REVISION_CONFLICT")
        if d["errors"]:raise ValueError("BINDING_INVALID: "+"; ".join(d["errors"]))
        inputs=[]
        for x in d["slots"]:
            r=x.get("ref")
            if r:inputs.append((x["contract_id"],Ref(RefType(r["type"]),r["provider"],r["native_id"],r.get("uri"),r.get("metadata",{}))))
        receipt=self.execution.dispatch_execution(e,tuple(inputs),self.registry,f"web:{command_id}");return {"dispatch_id":receipt.dispatch_id,"state":receipt.state,"binding":[{"contract_id":c,"ref":_ref(r)} for c,r in inputs]}
    def _facts(self,e):return type("Facts",(),{"execution":self.repo.get_execution(e),"dispatch":self.repo.get_dispatch_for_execution(e),"inputs":self.repo.list_input_refs(e)})()
    def observe(self,op,e):
        f=self._facts(e);c=self.controls.get(f.execution.provider_id)
        if not c:raise ValueError("CONTROL_UNAVAILABLE")
        o=c.observe(f);self.execution.observe_projection(e,o.projection);return self.get_execution(e)
    def finish(self,op,e):
        if not op: raise ValueError("OPERATION_ID_REQUIRED")
        execution = self.repo.get_execution(e)
        dispatch = self.repo.get_dispatch_for_execution(e)
        if not dispatch or dispatch["state"] != "accepted": raise ValueError("FINISH_REQUIRES_ACCEPTED_DISPATCH")
        if execution.projection.phase.value == "terminal": raise ValueError("EXECUTION_ALREADY_TERMINAL")
        with self.lock:
            latest = self.operation_store.latest_for_execution(e)
            if latest and latest.operation_type == "finish" and latest.status in {"accepted", "running"}: return latest.public()
            record=self.operation_store.create(op,e,"finish",f"web:{op}")
            if record.status == "accepted" and op not in self._submitted_operations:
                self._submitted_operations.add(op)
                self.finish_pool.submit(self._run_finish,op,e)
        return record.public()
    def _run_finish(self,op,e):
        with self._finish_locks.setdefault(e, threading.Lock()):
            try:
                self.operation_store.update(op,status="running",progress=("accepted","running","provider responsibility ended"))
                f=self._facts(e);c=self.controls.get(f.execution.provider_id)
                if not c: raise ValueError("CONTROL_UNAVAILABLE")
                o=c.finish(f)
                self.operation_store.update(op,progress=("accepted","running","provider responsibility ended","collecting external contributions"))
                self.operation_store.update(op,progress=("accepted","running","provider responsibility ended","collecting external contributions","preparing output references"))
                r=self.finalization.finalize(f,o,idempotency_key=f"web:{op}")
                self.operation_store.update(op,status="succeeded",result={"receipt":asdict(r)},progress=("accepted","running","provider responsibility ended","collecting external contributions","preparing output references","committing finalization","succeeded"))
            except Exception:
                self.operation_store.update(op,status="failed",error="FINALIZATION_FAILED",progress=("accepted","running","failed"))
    def get_operation(self,op):
        record=self.operation_store.get(op)
        if record is None: raise ValueError("OPERATION_NOT_FOUND")
        return record.public()

    def shutdown(self):
        self.finish_pool.shutdown(wait=True, cancel_futures=False)
    def outputs(self,e):
        values=[]
        for ref in self.repo.list_refs(e,RefRelation.OUTPUT):
            contract_id=next((cid for c in self.finalization.contributors if getattr(c,"id",None)==ref.provider for cid in getattr(c,"supported_contract_ids",())),None)
            item=_ref(ref)
            item["execution_id"] = e
            if contract_id:item["contract_id"]=contract_id
            values.append(item)
        return values
    def evidence(self,e):
        observations = []
        for item in self.repo.list_resource_observations(e):
            value = asdict(item)
            value["ref"] = _ref(item.ref)
            value["kind"] = item.kind.value
            value["result"] = item.result.value
            value["observer_role"] = item.observer_role.value
            value["coverage"] = item.coverage.value
            value["observed_at"] = item.observed_at.isoformat()
            if item.evidence_ref is not None: value["evidence_ref"] = _ref(item.evidence_ref)
            observations.append(value)
        grouped = []
        for contract_id, ref in self.repo.list_input_refs(e):
            grouped.append({"contract_id": contract_id, "ref": _ref(ref), "observations": [item for item in observations if item["contract_id"] == contract_id and item["ref"] == _ref(ref)]})
        return {"inputs": grouped}
    def attach(self,e):
        f=self._facts(e);c=self.controls.get(f.execution.provider_id)
        command = list(c.attach_command(f) or ()) if c else []
        return {"available": bool(command), "target": e, "command": command, "limitation": "The browser can copy this native attach command; it does not execute shells." if command else "No attach control is available."}
    def continue_from_output(self,cmd,e,output_ref,provider_id,responsibility,contract_id):return self.create_execution(cmd,self.repo.get_execution(e).work_id,provider_id,responsibility,{"contract_id":contract_id,"ref":output_ref})
    def complete_work(self,cmd,wid,reason):return {"work":{"lifecycle":self.work.complete_work(wid,reason).lifecycle.value}}
