import { useState } from "react";
import { api, type Skill, type SkillInstallPreview, type SkillInstallation } from "../../api/client";
import { useQuery } from "../../api/query";

const errorText = (value: unknown) => String(value instanceof Error ? value.message : value).slice(0, 300);

export function SkillLibrary() {
  const skills = useQuery(api.skills, []);
  const harnesses = useQuery(api.harnesses, []);
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.skillPreview>>>();
  const [error, setError] = useState("");
  // install-to-profile
  const [target, setTarget] = useState({ harness: "", profile: "" });
  const [profiles, setProfiles] = useState<{ profiles: any[] }>({ profiles: [] });
  const [installSkill, setInstallSkill] = useState<Skill>();
  const [installPreview, setInstallPreview] = useState<SkillInstallPreview>();
  const [installations, setInstallations] = useState<SkillInstallation[]>([]);
  const [busy, setBusy] = useState(false);

  const previewSkill = async () => { setError(""); try { setPreview(await api.skillPreview(path)); } catch (cause) { setError(errorText(cause)); } };
  const confirm = async () => { if (!preview) return; setError(""); try { await api.skillConfirm(preview.preview_id); setPreview(undefined); setPath(""); void skills.reload(); } catch (cause) { setError(errorText(cause)); } };

  const selectHarness = async (harness: string) => {
    setTarget((old) => ({ harness, profile: "" }));
    setInstallPreview(undefined);
    if (!harness) return;
    try { setProfiles(await api.profiles(harness)); } catch (cause) { setError(errorText(cause)); }
  };
  const refreshInstallations = async () => {
    if (!target.harness || !target.profile) { setInstallations([]); return; }
    try { setInstallations((await api.skillInstallations(target.harness, target.profile)).installations); } catch { setInstallations([]); }
  };
  const chooseInstall = async (skill: Skill) => {
    setInstallSkill(skill); setInstallPreview(undefined);
    if (!target.harness || !target.profile) return;
    setError("");
    try {
      setInstallPreview(await api.skillInstallPreview(target.harness, target.profile, { skill_id: skill.skill_id, revision: skill.revision, digest: skill.digest }));
    } catch (cause) { setError(errorText(cause)); }
  };
  const confirmInstall = async () => {
    if (!installPreview) return;
    setBusy(true); setError("");
    try {
      const profile = profiles.profiles.find((p) => p.profile_id === target.profile);
      await api.skillInstallConfirm(installPreview.preview_id, Number(profile?.revision ?? 0) || 1);
      setInstallPreview(undefined); setInstallSkill(undefined);
      await refreshInstallations();
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  const removeInstallation = async (installation: SkillInstallation) => {
    setBusy(true); setError("");
    try {
      const profile = profiles.profiles.find((p) => p.profile_id === target.profile);
      await api.skillInstallRemove(target.harness, target.profile, installation.skill.skill_id, Number(profile?.revision ?? 0));
      await refreshInstallations();
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };

  return <div className="wb-page"><header className="wb-title"><p>RESOURCES / AGENT SKILLS</p><h1>Skill Library</h1><span>Central library identity; Skills become usable by a Harness only after explicit install into a Profile Native Home.</span></header>
    <section className="wb-panel"><h2>Import a local directory into the Central Library</h2><label>Directory<input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/absolute/path/to/skill" /></label><button onClick={() => void previewSkill()} disabled={!path}>Preview validation</button>{error && <p className="wb-error">{error.slice(0, 300)}</p>}{preview && <div className="wb-panel"><h3>{preview.name}</h3><p>{preview.description}</p><p><code>{preview.skill_id}</code> · {preview.file_count} files · <code>{preview.digest}</code></p><p>Preview is read-only. Confirm to create a new immutable revision.</p><button className="primary" onClick={() => void confirm()}>Confirm import</button></div>}</section>
    <section className="wb-panel"><h2>Install to Profile</h2><p className="wb-notice">Installing copies the selected central revision into the Profile Native Home; the Harness then discovers it natively (no SkillRef on ordinary Executions).</p>
      <label>Harness<select value={target.harness} onChange={(event) => void selectHarness(event.target.value)}><option value="">Choose harness</option>{harnesses.data?.harnesses.map((h) => <option key={h.id} value={h.id}>{h.display_name} · {h.id}</option>)}</select></label>
      <label>Profile<select value={target.profile} onChange={(event) => { setTarget((old) => ({ ...old, profile: event.target.value })); setInstallPreview(undefined); void refreshInstallations(); }}><option value="">Choose profile</option>{profiles.profiles.map((p) => <option key={p.profile_id} value={p.profile_id}>{p.profile_id} · r{p.revision}</option>)}</select></label>
      {target.profile && <div className="wb-panel"><h3>Installed in {target.profile}</h3>{installations.length === 0 && <p className="wb-empty">No managed installations.</p>}{installations.map((installation) => <p key={installation.skill.skill_id}><strong>{installation.skill.skill_id}</strong> · r{installation.skill.revision} · {installation.state} → <code>{installation.native_target}</code><button type="button" onClick={() => void removeInstallation(installation)} disabled={busy}>Remove from Profile</button></p>)}</div>}
      <h3>Install a library Skill</h3>{skills.data?.skills.map((skill) => <p key={skill.skill_id}><strong>{skill.name}</strong> · revision {skill.revision} · <code>{skill.digest}</code><br />{skill.description}<button type="button" onClick={() => void chooseInstall(skill)} disabled={!target.harness || !target.profile}>Preview install</button></p>)}
      {installPreview && <div className="wb-panel"><h3>Install {installPreview.name ?? installPreview.skill_id} → {target.profile}</h3><p>Target: <code>{installPreview.native_target}</code> · {installPreview.file_count} files</p>{installPreview.conflicts.length > 0 && <p className="wb-error">Conflicts: {installPreview.conflicts.join(", ")}</p>}{installPreview.unmanaged.length > 0 && <p className="wb-error">Unmanaged files: {installPreview.unmanaged.join(", ")}</p>}{installPreview.already_installed && <p className="wb-error">Already installed — use Update instead.</p>}{installPreview.conflicts.length === 0 && installPreview.unmanaged.length === 0 && !installPreview.already_installed && <button className="primary" onClick={() => void confirmInstall()} disabled={busy}>{busy ? "Installing…" : "Confirm install"}</button>}</div>}
    </section>
    <section className="wb-panel"><h2>Central Library revisions</h2>{skills.loading && <p>Loading…</p>}{skills.data?.skills.map((skill) => <p key={skill.skill_id}><strong>{skill.name}</strong> · revision {skill.revision} · <code>{skill.digest}</code><br />{skill.description}</p>)}{!skills.loading && !skills.data?.skills.length && <p className="wb-empty">No imported skills.</p>}</section></div>;
}