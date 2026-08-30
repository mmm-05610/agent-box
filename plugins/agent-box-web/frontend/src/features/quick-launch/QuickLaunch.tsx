import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api/client";
import { useQuery } from "../../api/query";
import { navigate } from "../../app/router";

const errorText = (value: unknown) => String(value instanceof Error ? value.message : value).slice(0, 300);

export function QuickLaunch({ initialWorkId }: { initialWorkId?: string }) {
  const works = useQuery(api.works, []);
  const providers = useQuery(api.providers, []);
  const profiles = useQuery(() => api.profiles("codex"), []);
  const repositories = useQuery(api.repositories, []);
  const [workId, setWorkId] = useState(initialWorkId || "__new__");
  const [objective, setObjective] = useState("");
  const [responsibility, setResponsibility] = useState("");
  const [provider, setProvider] = useState("codex-app-server");
  const [profileId, setProfileId] = useState("");
  const [revision, setRevision] = useState("HEAD");
  const [repositoryId, setRepositoryId] = useState("");
  const [mode, setMode] = useState("fresh");
  const [terminal, setTerminal] = useState("managed");
  const [continuations, setContinuations] = useState<any[]>([]);
  const [sourceExecution, setSourceExecution] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [paneChoices, setPaneChoices] = useState<any[]>([]);
  const [paneId, setPaneId] = useState("");
  const interactive = provider === "codex-tmux-interactive";
  useEffect(() => { if (interactive && terminal === "existing") void api.choices("tmux-pane").then((value) => setPaneChoices(value.choices)).catch((cause) => setError(errorText(cause))); }, [interactive, terminal]);
  const loadContinuations = async (id: string) => { setSourceExecution(""); if (!id || id === "__new__") { setContinuations([]); return; } try { setContinuations((await api.continuations(id)).candidates); } catch (cause) { setError(errorText(cause)); } };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (pending) return; setPending(true); setError("");
    try {
      const inputs: any[] = [
        { selector_id: "git-workspace", parameters: { selector: revision, repository_id: repositoryId } },
        { selector_id: "responsibility", parameters: { text: responsibility, title: "responsibility" } },
        { selector_id: "agent-box-profile", parameters: { profile_id: profileId } },
      ];
      if (interactive) inputs.push({ selector_id: terminal === "managed" ? "tmux-console" : "tmux-pane", parameters: terminal === "managed" ? { layout: "tiled" } : { pane: paneId } });
      const result = await api.quickLaunch({ work_id: workId === "__new__" ? undefined : workId, objective, responsibility, provider_id: provider, inputs, continuation_source_execution_id: mode === "continue" ? sourceExecution : undefined });
      navigate(`/executions/${result.execution.id}/binding`);
    } catch (cause) { setError(errorText(cause)); setPending(false); }
  };
  return <div className="wb-page"><header className="wb-title"><p>QUICK LAUNCH / GOVERNED</p><h1>Quick Launch</h1><span>Prepare one Work, one accountable Execution and its exact Binding inputs.</span></header><form className="wb-form" onSubmit={submit} aria-busy={pending}><label>Work<select value={workId} onChange={(e) => { setWorkId(e.target.value); void loadContinuations(e.target.value); }}><option value="__new__">Create new Work</option>{works.data?.works.filter((w) => w.lifecycle === "open").map((w) => <option key={w.id} value={w.id}>{w.objective}</option>)}</select></label>{workId === "__new__" && <label>Work objective<textarea value={objective} onChange={(e) => setObjective(e.target.value)} required /></label>}<label>Execution responsibility<textarea value={responsibility} onChange={(e) => setResponsibility(e.target.value)} required placeholder="Describe the bounded outcome" /></label><label>Execution mode/provider<select value={provider} onChange={(e) => setProvider(e.target.value)}>{providers.data?.providers.filter((p) => p.id.includes("codex")).map((p) => <option key={p.id} value={p.id}>{p.display_name} · {p.id}</option>)}</select></label><label>Repository<select value={repositoryId} onChange={(e) => setRepositoryId(e.target.value)} required><option value="">Choose registered repository</option>{repositories.data?.repositories.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.git_root || r.path}</option>)}</select></label><label>Repository revision<input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="HEAD, branch, or exact commit" required /></label><label>Harness Profile<select value={profileId} onChange={(e) => setProfileId(e.target.value)} required><option value="">Choose exact Profile revision</option>{profiles.data?.profiles.filter((p) => !p.disabled).map((p) => <option key={p.profile_id} value={p.profile_id}>{p.name} · r{p.revision}</option>)}</select></label><label>Session mode<select value={mode} onChange={(e) => { setMode(e.target.value); if (e.target.value === "continue") void loadContinuations(workId); }}><option value="fresh">Fresh session</option><option value="continue">Continue previous native session</option></select></label>{mode === "continue" && <label>Previous terminal Execution<select value={sourceExecution} onChange={(e) => setSourceExecution(e.target.value)} required><option value="">Choose terminal session</option>{continuations.map((c) => <option key={`${c.source_execution_id}-${c.native_id}`} value={c.source_execution_id}>{c.source_execution_id} · TERMINAL · {c.provider} · {c.native_id}</option>)}</select></label>}{interactive && <label>Terminal target<select value={terminal} onChange={(e) => setTerminal(e.target.value)}><option value="managed">Create managed tmux console</option><option value="existing">Use existing exact pane</option></select></label>}{interactive && terminal === "existing" && <label>Exact existing pane<select value={paneId} onChange={(e) => setPaneId(e.target.value)} required><option value="">Choose an observed pane</option>{paneChoices.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>}{error && <p className="wb-error">{error}</p>}<p className="wb-notice">Quick Launch prepares requested → exact Refs and opens Binding review. It never freezes or dispatches automatically.</p><button className="primary" disabled={pending || !provider || !profileId || !repositoryId || !responsibility.trim() || (workId === "__new__" && !objective.trim())}>{pending ? "Preparing…" : "Prepare Binding"}</button></form></div>;
}
