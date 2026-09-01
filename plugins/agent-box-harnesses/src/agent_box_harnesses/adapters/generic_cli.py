from __future__ import annotations
import re
from agent_box.extensions.runtime_composition import HarnessCommandSpec, declare_source
class GenericCliAdapter:
    def __init__(self,key): self.key=key
    def validate_native_payload(self,payload):
        if not isinstance(payload,dict): raise ValueError("NATIVE_PAYLOAD_OBJECT_REQUIRED")
    def build_command(self,definition,request,profile):
        mode=definition.launch_modes[0]; argv=list(mode.argv)
        executable=profile.get("executable",definition.executable.identity) if isinstance(profile,dict) else definition.executable.identity
        argv[0]="/runtime/bin/"+executable
        prompt=[]
        for item in request.resolved_inputs:
            value=getattr(item,"value",None)
            if hasattr(value,"content"): prompt.append(value.content)
        if prompt: argv.append("\n\n".join(prompt))
        home=str(profile.get("native_home","")) if isinstance(profile,dict) else ""
        sources=[declare_source("workspace",self._one(request,"agent-box.workspace@1").path,"/workspace",access="rw",provenance="workspace")]
        if home: sources.append(declare_source("profile-home",home,definition.profile.guest_home,access="rw",provenance="profile"))
        return HarnessCommandSpec(tuple(argv),"/workspace",{"AGENT_BOX_EXECUTION_ID":request.execution_id},mode.io,runtime_sources=tuple(sources),projector_id=self.key)
    def _one(self,request,contract):
        values=[x.value for x in request.resolved_inputs if x.contract_id==contract]
        if len(values)!=1: raise ValueError(f"exact input required: {contract}")
        return values[0]
    def declare_runtime_sources(self,definition,request,profile): return ()
    def decode_observation(self,value): return value
    def observe(self,handle): return handle
    def finish(self,handle): return handle
