import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useQuery } from "../api/query";
import { Shell } from "./Shell";
import { route } from "./router";
import { ExecutionPage } from "../features/executions/ExecutionPage";
import { WorkDetail } from "../features/works/WorkDetail";
import { WorkList } from "../features/works/WorkList";
import { HarnessStudio } from "../features/harnesses/HarnessStudio";
import { QuickLaunch } from "../features/quick-launch/QuickLaunch";
import { SkillLibrary } from "../features/skills/SkillLibrary";
function Utility({ kind }: { kind: string }) {
  const plugins = useQuery(api.plugins, []);
  const providers = useQuery(api.providers, []);
  if (kind === "settings")
    return (
      <div className="wb-page">
        <header className="wb-title">
          <h1>Settings</h1>
        </header>
        <section className="wb-panel">
          <label>
            Language
            <select
              defaultValue={
                localStorage.getItem("agent-box-language") || "system"
              }
              onChange={(event) => {
                localStorage.setItem("agent-box-language", event.target.value);
                location.reload();
              }}
            >
              <option value="system">System</option>
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </label>
        </section>
      </div>
    );
  return (
    <div className="wb-page">
      <header className="wb-title">
        <h1>{kind === "harness" ? "Harness" : "Integrations"}</h1>
      </header>
      <section className="wb-panel">
        <p>
          {kind === "harness"
            ? "Harness configuration is outside Phase 1."
            : "Installed components exposed by the Local Web Host."}
        </p>
        {plugins.data?.plugins.map((plugin) => (
          <p key={plugin.id}>
            <strong>{plugin.display_name}</strong> · {plugin.status}
          </p>
        ))}
        {kind === "harness" &&
          providers.data?.providers.map((provider) => (
            <p key={provider.id}>
              <code>{provider.id}</code> · {provider.display_name}
            </p>
          ))}
      </section>
    </div>
  );
}
export default function App() {
  const [current, setCurrent] = useState(route());
  useEffect(() => {
    const update = () => setCurrent(route());
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  const parts = current.split("/").filter(Boolean);
  let content = <WorkList />;
  if (parts[0].startsWith("quick-launch")) content = <QuickLaunch initialWorkId={new URLSearchParams(current.split("?", 2)[1] || "").get("work") || undefined} />;
  if (parts[0] === "works" && parts[1]) content = <WorkDetail id={parts[1]} />;
  else if (parts[0] === "executions" && parts[1])
    content = <ExecutionPage id={parts[1]} />;
  else if (parts[0] === "harnesses") content = <HarnessStudio harnessId={parts[1]} profileId={parts[3]} />;
  else if (parts[0] === "harness") { navigate("/harnesses"); content = <HarnessStudio />; }
  else if (parts[0] === "skills") content = <SkillLibrary />;
  else if (["integrations", "settings"].includes(parts[0]))
    content = <Utility kind={parts[0]} />;
  return <Shell>{content}</Shell>;
}
