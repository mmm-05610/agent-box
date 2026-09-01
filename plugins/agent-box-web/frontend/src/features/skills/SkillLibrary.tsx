import { useState } from "react";
import { api, type SkillPreview } from "../../api/client";
import { useQuery } from "../../api/query";

export function SkillLibrary() {
  const skills = useQuery(api.skills, []);
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<SkillPreview>();
  const [error, setError] = useState("");
  const previewSkill = async () => { setError(""); try { setPreview(await api.skillPreview(path)); } catch (cause) { setError(String(cause)); } };
  const confirm = async () => { if (!preview) return; setError(""); try { await api.skillConfirm(preview.preview_id); setPreview(undefined); setPath(""); void skills.reload(); } catch (cause) { setError(String(cause)); } };
  return <div className="wb-page"><header className="wb-title"><p>RESOURCES / AGENT SKILLS</p><h1>Skill Library</h1><span>Explicit local import creates an immutable, digest-addressed revision.</span></header><section className="wb-panel"><h2>Import a local directory</h2><label>Directory<input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/absolute/path/to/skill" /></label><button onClick={() => void previewSkill()} disabled={!path}>Preview validation</button>{error && <p className="wb-error">{error.slice(0, 300)}</p>}{preview && <div className="wb-panel"><h3>{preview.name}</h3><p>{preview.description}</p><p><code>{preview.skill_id}</code> · {preview.file_count} files · <code>{preview.digest}</code></p><p>Preview is read-only. Confirm to create a new immutable revision.</p><button className="primary" onClick={() => void confirm()}>Confirm import</button></div>}</section><section className="wb-panel"><h2>Imported skills</h2>{skills.loading && <p>Loading…</p>}{skills.data?.skills.map((skill) => <p key={skill.skill_id}><strong>{skill.name}</strong> · revision {skill.revision} · <code>{skill.digest}</code><br />{skill.description}</p>)}{!skills.loading && !skills.data?.skills.length && <p className="wb-empty">No imported skills.</p>}</section></div>;
}
