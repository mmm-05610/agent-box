export type ApiError = { code: string; message?: string };
export type Ref = {
  type: string;
  provider: string;
  native_id: string;
  uri?: string | null;
  metadata: Record<string, string>;
};
export type ProviderRequirement = {
  contract_id: string;
  min: number;
  max: number | null;
  required: boolean;
};
export type Provider = {
  id: string;
  display_name: string;
  version: string;
  requirements: ProviderRequirement[];
  capabilities: Record<string, string>;
};
export type Work = {
  id: string;
  objective: string;
  lifecycle: string;
  updated_at?: string;
};
export type Execution = {
  id: string;
  work_id: string;
  provider_id: string;
  phase: string;
  outcome?: string | null;
  freshness: string;
  dispatch_state?: string | null;
  responsibility?: string;
  created_at?: string;
  operation?: Operation;
};
export type WorkDetail = Work & {
  executions: Execution[];
  closure_reason?: string | null;
};
export type ExecutionCreate = { execution: Execution; draft?: Draft };
export type SelectorField = {
  key: string;
  label: string;
  kind: string;
  default: string;
  required: boolean;
  help?: string;
};
export type Selector = {
  id: string;
  contract_id: string;
  title: string;
  fields: SelectorField[];
};
export type Choice = { value: string; label?: string; detail?: string };
export type Slot = {
  slot_id: string;
  selector_id?: string;
  contract_id: string;
  requested_summary: string;
  exact_summary: string;
  ref?: Ref;
  status?: "satisfied" | "missing" | "invalid";
};
export type Draft = {
  execution_id: string;
  revision: number;
  provider_id: string;
  requested_summary?: string;
  slots: Slot[];
  requirements?: ProviderRequirement[];
  requirement_status?: RequirementStatus[];
  errors: string[];
  reviewed: boolean;
};
export type RequirementStatus = ProviderRequirement & {
  selected: number;
  satisfied: boolean;
};
export type Dispatch = {
  dispatch_id: string;
  state: "requested" | "accepted" | "failed" | "ambiguous";
  binding: Array<{ contract_id: string; ref: Ref }>;
};
export type Operation = {
  operation_id: string;
  execution_id?: string;
  operation_type?: string;
  status:
    | "accepted"
    | "running"
    | "succeeded"
    | "failed"
    | "interrupted"
    | "ambiguous";
  progress?: string[];
  error?: string;
};
export type Output = Ref & { execution_id: string; contract_id: string };
export type Observation = {
  contract_id: string;
  ref: Ref;
  kind: string;
  result: "match" | "mismatch" | "partial" | "unknown" | "unverifiable";
  observer_role: string;
  observer_id: string;
  observed_at: string;
  coverage: "complete" | "partial" | "unknown";
  evidence_ref?: Ref | null;
  detail?: string | null;
};
export type Evidence = {
  inputs: Array<{ contract_id: string; ref: Ref; observations: Observation[] }>;
};
export type AttachDescriptor = {
  available: boolean;
  target?: string;
  command?: string[];
  limitation?: string;
};
export type TerminalOpenResult = { status: "opened" | "unavailable" | "failed"; diagnostic: string };
export type Plugin = {
  id: string;
  display_name: string;
  status: string;
  error?: string | null;
};
export type Harness = { id: string; display_name: string; version: string; status: string; supported: boolean; extension_points?: string[] };
export type HarnessProfile = { schema_version:number; harness_id:string; profile_id:string; name:string; revision:number; digest:string; provider:string; disabled:boolean; config:Record<string,unknown>; capability_refs:unknown[]; credential_source_ref?:Record<string,unknown>|null; session_overlay_policy:Record<string,unknown> };
export type ProjectionPreview = { profile_ref: {harness_id:string;profile_id:string;revision:number;digest:string}; files:Array<{path:string;source:string;writable:boolean}>; shared_capability_refs:unknown[]; credential_source_ref?:Record<string,unknown>|null; environment_names:string[]; cleanup_policy:string; verification:Record<string,string[]> };
