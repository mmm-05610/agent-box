import type {
  ApiError,
  AttachDescriptor,
  TerminalOpenResult,
  Choice,
  Dispatch,
  Draft,
  Evidence,
  Execution,
  ExecutionCreate,
  Operation,
  Output,
  Plugin,
  Provider,
  Selector,
  Work,
  WorkDetail,
  Harness,
  HarnessProfile,
  ProjectionPreview,
} from "./types";
export * from "./types";
export class HostError extends Error {
  code: string;
  constructor(error: ApiError) {
    super(error.message || error.code);
    this.code = error.code;
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method || "GET";
  const headers = {
    "Content-Type": "application/json",
    ...(init?.headers || {}),
  };
  if (method !== "GET") Object.assign(headers, { Origin: location.origin });
  const response = await fetch(`/api/v1${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new HostError(body.error || { code: "REQUEST_FAILED" });
  return body as T;
}
const command = () => crypto.randomUUID();
export const api = {
  works: () => request<{ works: Work[] }>("/works"),
  work: (id: string) => request<WorkDetail>(`/works/${id}`),
  createWork: (objective: string) =>
    request<{ work: Work }>("/works", {
      method: "POST",
      body: JSON.stringify({ command_id: command(), objective }),
    }),
  createExecution: (
    workId: string,
    providerId: string,
    responsibility: string,
  ) =>
    request<ExecutionCreate>(`/works/${workId}/executions`, {
      method: "POST",
      body: JSON.stringify({
        command_id: command(),
        provider_id: providerId,
        responsibility,
      }),
    }),
  execution: (id: string) => request<Execution>(`/executions/${id}`),
  draft: (id: string) => request<Draft>(`/executions/${id}/binding-draft`),
  selectors: () => request<{ selectors: Selector[] }>("/resource-selectors"),
  choices: (id: string, body: Record<string, string> = {}) =>
    request<{ choices: Choice[] }>(`/resource-selectors/${id}/choices`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  prepare: (
    executionId: string,
    selectorId: string,
    parameters: Record<string, string>,
    slotId?: string,
  ) =>
    request<Draft>(`/resource-selectors/${selectorId}/prepare`, {
      method: "POST",
      body: JSON.stringify({
        execution_id: executionId,
        parameters,
        slot_id: slotId,
      }),
    }),
  review: (id: string) =>
    request<Draft>(`/executions/${id}/binding-review`, {
      method: "POST",
      body: "{}",
    }),
  freeze: (id: string, revision: number) =>
    request<Dispatch>(`/executions/${id}/freeze-dispatch`, {
      method: "POST",
      body: JSON.stringify({
        command_id: command(),
        expected_draft_revision: revision,
      }),
    }),
  observe: (id: string) =>
    request<Execution>(`/executions/${id}/observe`, {
      method: "POST",
      body: JSON.stringify({ operation_id: command() }),
    }),
  finish: (id: string, operationId: string) =>
    request<Operation>(`/executions/${id}/finish`, {
      method: "POST",
      body: JSON.stringify({ operation_id: operationId }),
    }),
  operation: (id: string) => request<Operation>(`/operations/${id}`),
  outputs: (id: string) =>
    request<{ outputs: Output[] }>(`/executions/${id}/outputs`),
  evidence: (id: string) => request<Evidence>(`/executions/${id}/evidence`),
  attach: (id: string) => request<AttachDescriptor>(`/executions/${id}/attach`),
  openTerminal: (id: string, operationId: string) => request<TerminalOpenResult>(`/executions/${id}/terminal`, {
    method: "POST", body: JSON.stringify({ operation_id: operationId }),
  }),
  continueFromOutput: (
    id: string,
    output: Output,
    providerId: string,
    responsibility: string,
  ) =>
    request<ExecutionCreate>(`/executions/${id}/continue-from-output`, {
      method: "POST",
      body: JSON.stringify({
        command_id: command(),
        output_ref: output,
        provider_id: providerId,
        responsibility,
        contract_id: output.contract_id,
      }),
    }),
  providers: () => request<{ providers: Provider[] }>("/providers/execution"),
  quickLaunchDiscovery: () => request<{ providers: (Provider & { selectors: Selector[] })[] }>("/quick-launch/discovery"),
  plugins: () => request<{ plugins: Plugin[] }>("/plugins"),
  harnesses: () => request<{ harnesses: Harness[] }>("/harnesses"),
  harness: (id: string) => request<Harness>(`/harnesses/${id}`),
  profiles: (id: string) => request<{ profiles: HarnessProfile[] }>(`/harnesses/${id}/profiles`),
  profile: (h: string, p: string) => request<HarnessProfile>(`/harnesses/${h}/profiles/${p}`),
  createProfile: (h: string, data: Record<string, unknown>) => request<{ profile: HarnessProfile }>(`/harnesses/${h}/profiles`, { method:"POST", body: JSON.stringify({ ...data, command_id: command() }) }),
  saveProfile: (h: string, p: string, data: Record<string, unknown>, revision: number) => request<{ profile: HarnessProfile }>(`/harnesses/${h}/profiles/${p}/revisions`, { method:"POST", body: JSON.stringify({ ...data, expected_revision: revision, command_id: command() }) }),
  validateProfile: (h: string, data: Record<string, unknown>) => request<{valid:boolean;errors:string[]}>(`/harnesses/${h}/profiles/draft/validate`, {method:"POST",body:JSON.stringify({...data,command_id:command()})}),
  projectionPreview: (h: string, p: string, revision: number) => request<ProjectionPreview>(`/harnesses/${h}/profiles/${p}/projection-preview`, {method:"POST",body:JSON.stringify({revision,command_id:command()})}),
  importSources: (h: string) => request<{sources:string[]}>(`/harnesses/${h}/imports`),
  importCandidates: (h: string, source: string, root: string) => request<{candidates:any[]}>(`/harnesses/${h}/imports/${source}?root=${encodeURIComponent(root)}`),
  previewImport: (h: string, source: string, root: string, sourceId: string) => request<any>(`/harnesses/${h}/imports/${source}/preview`, {method:"POST",body:JSON.stringify({root,source_id:sourceId})}),
  confirmImport: (h: string, preview: any, expectedRevision?: number) => request<{profile: HarnessProfile}>(`/harnesses/${h}/imports/${preview.source_type}/confirm`, {method:"POST",body:JSON.stringify({...preview,expected_revision:expectedRevision,command_id:command()})}),
  complete: (id: string, reason: string) =>
    request<unknown>(`/works/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({ command_id: command(), reason }),
    }),
  quickLaunch: (body: Record<string, unknown>) => request<ExecutionCreate & {work_id:string}>("/quick-launch", {method:"POST", body:JSON.stringify({...body,command_id:command()})}),
  continuations: (workId?: string, targetProviderId?: string) => request<{candidates:any[]}>(`/continuations?${workId ? `work_id=${encodeURIComponent(workId)}&` : ""}${targetProviderId ? `target_provider_id=${encodeURIComponent(targetProviderId)}` : ""}`),
  repositories: () => request<{repositories:any[]}>("/repositories"),
  addRepository: (value: Record<string, unknown>) => request<{repository:any}>("/repositories", {method:"POST", body:JSON.stringify({...value,command_id:command()})}),
};
