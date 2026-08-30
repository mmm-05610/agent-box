import { api } from "../../api/client";
import { useQuery } from "../../api/query";
import { route } from "../../app/router";
import { Status } from "../../shared/Status";
import { ActivityPanel } from "./ActivityPanel";
import { BindingComposer } from "./BindingComposer";
import { EvidencePanel } from "./EvidencePanel";
import { OutputsPanel } from "./OutputsPanel";

export function ExecutionPage({ id }: { id: string }) {
  const execution = useQuery(() => api.execution(id), [id]);
  const draft = useQuery(() => api.draft(id), [id]);
  if (execution.loading || draft.loading)
    return <div className="wb-page">Loading execution…</div>;
  if (!execution.data)
    return <div className="wb-page">Execution not found.</div>;
  const current = execution.data;
  const tab = route().split("/").pop() || "overview";
  const frozen = Boolean(current.dispatch_state);
  const open = (name: string) => {
    location.hash = `#/executions/${id}/${name}`;
  };
  return (
    <div className="wb-page">
      <header className="wb-exec-head">
        <a href={`#/works/${current.work_id}`}>← Back to Work</a>
        <p>
          EXECUTION / <code>{current.id}</code>
        </p>
        <h1>{current.responsibility}</h1>
        <Status value={current.phase} />
        <small>
          Accountable provider: <code>{current.provider_id}</code> ·{" "}
          {current.freshness}
        </small>
      </header>
      <nav className="wb-tabs" aria-label="Execution sections">
        {["overview", "binding", "activity", "outputs", "evidence"].map(
          (name) => (
            <a
              className={tab === name ? "active" : ""}
              key={name}
              href={`#/executions/${id}/${name}`}
              onClick={() => open(name)}
            >
              {name[0].toUpperCase() + name.slice(1)}
            </a>
          ),
        )}
      </nav>
      {tab === "overview" && (
        <section className="wb-panel">
          <h2>Execution receipt</h2>
          <p>Responsibility: {current.responsibility}</p>
          <p>
            Dispatch:{" "}
            <strong>{current.dispatch_state || "not dispatched"}</strong>
          </p>
          <p>
            {frozen
              ? "Frozen exact inputs are immutable."
              : "Binding draft is still editable."}
          </p>
        </section>
      )}
      {tab === "binding" && (
        <BindingComposer
          id={id}
          draft={draft.data}
          frozen={frozen}
          reload={() => {
            void Promise.all([execution.reload(), draft.reload()]);
          }}
        />
      )}
      {tab === "activity" && (
        <ActivityPanel id={id} execution={current} reload={execution.reload} />
      )}
      {tab === "outputs" && (
        <OutputsPanel id={id} terminal={current.phase === "terminal"} />
      )}
      {tab === "evidence" && (
        <EvidencePanel id={id} terminal={current.phase === "terminal"} />
      )}
    </div>
  );
}
