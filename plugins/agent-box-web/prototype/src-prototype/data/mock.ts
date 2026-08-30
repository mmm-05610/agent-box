export const executionId = 'exe-e2-isolation-20260829'
export const workId = 'wrk-deepseek-harness-isolation'
export type BindingSlot = { slot: string; type: string; requested: string; exact: string; label: string; required: boolean; group?: string }
export const bindingSlots: BindingSlot[] = [
  { slot: 'workspace.primary', type: 'WorkspaceRef', requested: 'workspace://deepseek-harness', exact: 'git:9c61c4d', label: 'bindings.selectWorkspace', required: true },
  { slot: 'profile.codex', type: 'ProfileRef', requested: 'profile://codex/deepseek-isolation', exact: 'profile:codex-isolation-v4', label: 'bindings.selectProfile', required: true },
  { slot: 'responsibility.artifact', type: 'ArtifactRef', requested: 'artifact://responsibility/e2', exact: 'artifact:resp-e2-8f1', label: 'bindings.selectArtifact', required: true },
  { slot: 'session.pane', type: 'PaneRef', requested: 'tmux://deepseek-harness/2.1', exact: 'pane:%42', label: 'bindings.selectPane', required: true },
  { slot: 'workflow.instance', type: 'WorkflowInstanceRef', requested: 'langgraph://isolation/multi-session', exact: 'workflow:wg-9821', label: 'bindings.selectWorkflow', required: true, group: 'workflow' },
  { slot: 'workflow.checkpoint', type: 'WorkflowCheckpointRef', requested: 'langgraph://isolation/checkpoint', exact: 'checkpoint:cp-441', label: 'bindings.selectCheckpoint', required: true, group: 'workflow' },
  { slot: 'review.criteria', type: 'ArtifactRef', requested: 'artifact://review/isolation-criteria', exact: 'artifact:criteria-e3-11', label: 'bindings.selectCriteria', required: false },
  { slot: 'server.optional', type: 'ServerRef', requested: 'server://staging-server', exact: 'ServerRef:ssh-resources/staging-server@sha256:5ce12b', label: 'bindings.selectServer', required: false },
]

export const evidenceResources = [
  { resource: 'WorkspaceRef · commit 9c61c4d', observations: ['Git actual HEAD = 9c61c4d'], observer: 'Git probe · independent observer', result: 'match', coverage: 'commit HEAD', audit: 'evidence.auditGit' },
  { resource: 'ProfileRef · digest profile:codex-isolation-v4', observations: ['执行提供方已投射 digest profile:codex-isolation-v4'], observer: 'provider.codex.local · self-report', result: 'selfReport', coverage: 'provider projection', audit: 'evidence.auditProfile' },
  { resource: 'ArtifactRef · artifact:resp-e2-8f1', observations: ['已 materialize artifact:resp-e2-8f1', '实际读取：unknown'], observer: 'provider.codex.local · self-report', result: 'partial', coverage: 'prompt materialization；不含实际读取', audit: 'evidence.auditPrompt' },
  { resource: 'MCPRef · mcp:shared-deepseek', observations: ['Endpoint visible', '实际调用：unknown'], observer: 'provider.codex.local · self-report', result: 'partial', coverage: 'projected endpoint surface；不含 invocation', audit: 'evidence.auditMcp' },
  { resource: 'PluginSetRef · pluginset:shared-v1', observations: ['Projection visible', '每个 plugin 实际使用：unverifiable'], observer: 'provider.codex.local · self-report', result: 'unverifiable', coverage: 'provider projection；无 consumption evidence', audit: 'evidence.auditPlugins' },
  { resource: 'ArtifactRef · artifact:criteria-e3-11', observations: [], observer: '—', result: 'unknown', coverage: '尚未记录观察', audit: 'evidence.auditNone' },
] as const
