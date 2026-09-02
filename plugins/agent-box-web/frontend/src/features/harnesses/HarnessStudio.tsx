import { useState } from "react";
import { api } from "../../api/client";
import { useQuery } from "../../api/query";
import { navigate } from "../../app/router";
import { useTranslation } from "react-i18next";

const boundedError = (error: unknown) => String(error instanceof Error ? error.message : error).slice(0, 300);

export function HarnessStudio({ harnessId, profileId }: { harnessId?: string; profileId?: string }) {
  const { t } = useTranslation();
  const hs = useQuery(api.harnesses, []);
  if (!harnessId) return <div className="wb-page"><header className="wb-title"><p>{t("harnesses.eyebrow")}</p><h1>{t("harnesses.title")}</h1><span>{t("harnesses.hint")}</span></header><section className="wb-ledger">{hs.loading && <p>{t("harnesses.loadingHarnesses")}</p>}{hs.error && <p className="wb-error">{t("harnesses.error", { message: boundedError(hs.error) })}</p>}{hs.data?.harnesses.map((h) => <a key={h.id} href={`#/harnesses/${h.id}`}><div><StatusDot value={h.status} /><h2>{h.display_name}</h2><code>{h.id} · v{h.version}</code></div><b>→</b></a>)}</section></div>;
  if (!profileId) return <HarnessDetail harnessId={harnessId} />;
  return <ProfileDetail harnessId={harnessId} profileId={profileId} />;
}

function StatusDot({ value }: { value: string }) { return <span className="wb-kicker">{value}</span>; }

function HarnessDetail({ harnessId }: { harnessId: string }) {
  const { t } = useTranslation();
  const q = useQuery(() => api.profiles(harnessId), [harnessId]);
  const [create, setCreate] = useState(false);
  return <div className="wb-page"><header className="wb-title"><p>HARNESS / {harnessId.toUpperCase()}</p><h1>Codex</h1><span>{t("harnesses.codexHint")}</span></header><section className="wb-panel"><h2>{t("harnesses.profiles")}</h2>{q.loading && <p>{t("harnesses.loading")}</p>}{q.error && <p className="wb-error">{boundedError(q.error)}</p>}{q.data?.profiles.map((p) => <a className="wb-row" key={p.profile_id} href={`#/harnesses/${harnessId}/profiles/${p.profile_id}`}><span><strong>{p.name}</strong><br /><code>{t("harnesses.revision", { revision: p.revision })} · {p.digest.slice(0, 18)}…</code></span><b>→</b></a>)}{!q.loading && !q.data?.profiles.length && <p className="wb-empty">{t("harnesses.empty")}</p>}<button className="primary" onClick={() => setCreate(true)}>{t("harnesses.create")}</button></section>{create && <ProfileForm harnessId={harnessId} onDone={(p) => navigate(`/harnesses/${harnessId}/profiles/${p.profile_id}`)} />}<ImportPanel harnessId={harnessId} onDone={(p) => navigate(`/harnesses/${harnessId}/profiles/${p.profile_id}`)} /></div>;
}

function ImportPanel({ harnessId, onDone }: { harnessId: string; onDone: (p: any) => void }) {
  const [source, setSource] = useState("legacy-agent-box"); const [root, setRoot] = useState(""); const [candidates, setCandidates] = useState<any[]>([]); const [preview, setPreview] = useState<any>(); const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  const load = async () => { setPending(true); setError(""); try { const value = await api.importCandidates(harnessId, source, root); setCandidates(value.candidates); } catch (e) { setError(boundedError(e)); } finally { setPending(false); } };
  const showPreview = async (id: string) => { setPending(true); setError(""); try { setPreview(await api.previewImport(harnessId, source, root, id)); } catch (e) { setError(boundedError(e)); } finally { setPending(false); } };
  const confirm = async () => { if (!preview) return; setPending(true); setError(""); try { const result = await api.confirmImport(harnessId, preview); onDone(result.profile); } catch (e) { setError(boundedError(e)); setPending(false); } };
  return <section className="wb-panel"><h2>Import external configuration</h2><p>Read-only preview first. Runtime, cache, history and credential values are never imported.</p><label>Source<select value={source} onChange={(e) => { setSource(e.target.value); setCandidates([]); setPreview(undefined); }}><option value="legacy-agent-box">Legacy Agent-Box</option><option value="cc-switch">cc-switch / ACS export</option></select></label><label>Fixture or export directory<input value={root} onChange={(e) => setRoot(e.target.value)} placeholder="/path/to/export" /></label><button onClick={() => void load()} disabled={pending || !root}>Find profiles</button>{error && <p className="wb-error">{error}</p>}{candidates.map((candidate) => <button key={candidate.source_id} onClick={() => void showPreview(candidate.source_id)} disabled={pending}>{candidate.name}</button>)}{preview && <div className="wb-panel"><h3>Import preview</h3><p>Source: {preview.source_type} · {preview.source_profile_name}</p><p>Import: {preview.fields_to_import.join(", ") || "none"}</p><p>Ignored: {preview.fields_ignored.join(", ") || "none"}</p><p>Rejected/redacted: {preview.fields_rejected.join(", ") || "none"}</p><p>Credential locator: {preview.credential_locator?.native_locator || "none"}</p><p>Digest expectation: <code>{preview.source_digest}</code></p><button className="primary" onClick={() => void confirm()} disabled={pending}>Confirm import as new revision</button></div>}</section>;
}

function ProfileDetail({ harnessId, profileId }: { harnessId: string; profileId: string }) {
  const q = useQuery(() => api.profile(harnessId, profileId), [harnessId, profileId]);
  const [edit, setEdit] = useState(false);
  const [preview, setPreview] = useState<any>();
  if (q.loading) return <div className="wb-page"><p>Loading profile…</p></div>;
  if (q.error || !q.data) return <div className="wb-page"><p className="wb-error">Unable to load profile.</p></div>;
  const p = q.data;
  return <div className="wb-page"><header className="wb-title"><p>CODEX PROFILE</p><h1>{p.name}</h1><span>ProfileRef is a Binding resource. Saving always creates a new immutable revision.</span></header><section className="wb-panel"><p><strong>Revision {p.revision}</strong> · <code>{p.digest}</code></p><p>CredentialSourceRef is a locator only; credential values are never stored or returned.</p><p>Frozen revision {p.revision} remains unchanged when you save a new revision.</p><div className="wb-actions"><button onClick={() => setEdit(true)}>Edit</button><button onClick={async () => setPreview(await api.projectionPreview(harnessId, profileId, p.revision))}>Projection Preview</button><button className="primary" onClick={() => navigate(`/executions/new?profile=${encodeURIComponent(profileId)}&revision=${p.revision}`)}>Use for new Execution Binding</button></div></section>{preview && <section className="wb-panel"><h2>Execution-scoped projection</h2><p>Exact ProfileRef: <code>{preview.profile_ref.profile_id} · r{preview.profile_ref.revision} · {preview.profile_ref.digest}</code></p>{preview.files.map((f: any) => <p key={f.path}><code>{f.path}</code> · {f.source} · {f.writable ? "writable overlay" : "immutable"}</p>)}<p>Environment names: {preview.environment_names.join(", ") || "none"} (values hidden)</p><p>{preview.cleanup_policy}</p></section>}<NativeHomePanel harnessId={harnessId} profileId={profileId} revision={p.revision} />{edit && <ProfileForm harnessId={harnessId} initial={p} onDone={() => { setEdit(false); void q.reload(); }} />}</div>;
}

function NativeHomePanel({ harnessId, profileId, revision }: { harnessId: string; profileId: string; revision: number }) {
  const home = useQuery(() => api.profileNativeHome(harnessId, profileId), [harnessId, profileId]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (home.loading) return <section className="wb-panel"><p>Loading native home…</p></section>;
  if (home.error || !home.data) return <section className="wb-panel"><h2>Native Home</h2><p className="wb-error">Unable to read the native home.</p></section>;
  const data = home.data;
  const act = async (action: (revision: number) => Promise<unknown>) => { setBusy(true); setError(""); try { await action(revision + 1); await home.reload(); } catch (cause) { setError(boundedError(cause)); } finally { setBusy(false); } };
  return <section className="wb-panel"><h2>Native Home</h2><p className="wb-notice">One persistent native environment per Profile; the Harness discovers installed Skills natively. Credential paths are excluded from every snapshot and view.</p>
    <p><strong>revision {data.revision}</strong> · native state generation {data.native_state_generation} · {data.file_count} files · <code>{data.native_tree_digest.slice(0, 24)}…</code></p>
    <h3>Managed installations</h3>{data.installations.length === 0 && <p className="wb-empty">No managed installations. Use the Skill Library to install.</p>}{data.installations.map((installation) => <p key={installation.skill.skill_id}><strong>{installation.skill.skill_id}</strong> · central r{installation.skill.revision} · <span className="wb-kicker">{installation.state}</span> → <code>{installation.native_target}</code><button type="button" onClick={() => void act((r) => api.skillInstallRemove(harnessId, profileId, installation.skill.skill_id, r))} disabled={busy}>Remove from Profile</button></p>)}
    <h3>Profile-local Skills (unmanaged)</h3>{data.skill_inventory.entries.filter((e) => e.source_kind === "profile-local").length === 0 && <p className="wb-empty">None.</p>}{data.skill_inventory.entries.filter((e) => e.source_kind === "profile-local").map((entry) => <p key={entry.identity}><strong>{entry.identity}</strong> · present at <code>{entry.native_target}</code> · stays unmanaged</p>)}
    <h3>Drift / update diagnostics</h3>{data.skill_inventory.entries.filter((e) => e.source_kind === "central-installed" && e.state !== "INSTALLED").map((entry) => <p key={entry.identity} className="wb-error"><strong>{entry.identity}</strong> · {entry.state} · {entry.detail}</p>)}
    {error && <p className="wb-error">{error}</p>}</section>;
}

function ProfileForm({ harnessId, initial, onDone }: { harnessId: string; initial?: any; onDone: (p: any) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name || "");
  const [model, setModel] = useState(initial?.config?.model || "");
  const [provider, setProvider] = useState(initial?.config?.model_provider || "");
  const [endpoint, setEndpoint] = useState(initial?.config?.provider_endpoint || "");
  const [instructions, setInstructions] = useState(initial?.config?.instructions || "");
  const [mcp, setMcp] = useState((initial?.config?.mcp || []).join(", "));
  const [skills, setSkills] = useState((initial?.config?.skills || []).join(", "));
  const [nativePlugins, setNativePlugins] = useState((initial?.config?.native_plugins || []).join(", "));
  const [approval, setApproval] = useState(initial?.config?.approval_policy || "on-request");
  const [sandbox, setSandbox] = useState(initial?.config?.sandbox_policy || "workspace-write");
  const [credential, setCredential] = useState(initial?.credential_source_ref?.native_locator === "codex-login/default" ? "codex-login" : "none");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return <form className="wb-form" aria-busy={pending} onSubmit={async (e) => {
    e.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    const refs = (value: string, kind: string) => value.split(",").map((item) => item.trim()).filter(Boolean).map((native_id) => ({ provider: kind, native_id, digest: "unverified" }));
    const data = { name, config: { model, model_provider: provider, provider_endpoint: endpoint, instructions, mcp: mcp.split(",").map((x) => x.trim()).filter(Boolean), skills: skills.split(",").map((x) => x.trim()).filter(Boolean), native_plugins: nativePlugins.split(",").map((x) => x.trim()).filter(Boolean), approval_policy: approval, sandbox_policy: sandbox }, capability_refs: [...(initial?.capability_refs || []), ...refs(mcp, "mcp"), ...refs(skills, "skill"), ...refs(nativePlugins, "native-plugin")], credential_source_ref: credential === "codex-login" ? { provider: "codex", native_locator: "codex-login/default" } : null, session_overlay_policy: { mode: "execution-local" } };
    try {
      const v = initial ? await api.saveProfile(harnessId, initial.profile_id, data, initial.revision) : await api.createProfile(harnessId, data);
      onDone(v.profile);
    } catch (cause) { setError(boundedError(cause)); }
    finally { setPending(false); }
  }}>
    <label>{t("harnesses.createName")}<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={128} /></label>
    <label>{t("harnesses.model")}<input value={model} onChange={(e) => setModel(e.target.value)} placeholder={t("harnesses.modelPlaceholder")} /></label>
    <label>{t("harnesses.provider")}<input value={provider} onChange={(e) => setProvider(e.target.value)} /></label>
    <label>{t("harnesses.endpoint")}<input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.example.invalid/v1" /></label>
    <label>{t("harnesses.instructions")}<textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={8192} /></label>
    <label>{t("harnesses.mcp")}<input value={mcp} onChange={(e) => setMcp(e.target.value)} placeholder="docs, browser" /></label>
    <label>{t("harnesses.skills")}<input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="review, testing" /></label>
    <label>{t("harnesses.nativePlugins")}<input value={nativePlugins} onChange={(e) => setNativePlugins(e.target.value)} /></label>
    <label>{t("harnesses.approval")}<select value={approval} onChange={(e) => setApproval(e.target.value)}><option>on-request</option><option>never</option><option>always</option></select></label>
    <label>{t("harnesses.sandbox")}<select value={sandbox} onChange={(e) => setSandbox(e.target.value)}><option>workspace-write</option><option>read-only</option></select></label>
    <label>{t("harnesses.credentialSource")}<select value={credential} onChange={(e) => setCredential(e.target.value)}><option value="none">{t("harnesses.credentialNone")}</option><option value="codex-login">{t("harnesses.credentialChatGPT")}</option></select></label>
    <p>{t("harnesses.credentialHint")}</p><p>{t("harnesses.formHint")}</p>{error && <p className="wb-error">{error}</p>}
    <button type="button" disabled={pending} onClick={() => onDone(initial)}>{t("harnesses.cancel")}</button>
    <button className="primary" disabled={pending}>{pending ? "Saving…" : initial ? t("harnesses.saveRevision") : t("harnesses.createAction")}</button>
  </form>;
}
