import { useState } from "react";
import { api } from "../../api/client";
import { useQuery } from "../../api/query";
import { navigate } from "../../app/router";
import { Status } from "../../shared/Status";
export function WorkList() {
  const q = useQuery(api.works, []);
  const [creating, setCreating] = useState(false);
  const [objective, setObjective] = useState("");
  if (q.loading) return <div className="wb-page">Loading works…</div>;
  return (
    <div className="wb-page">
      <header className="wb-title">
        <p>WORKS / LOCAL HOST</p>
        <h1>Works</h1>
        <span>
          Long-lived objectives with a governed history of executions.
        </span>
      </header>
      {q.error && (
        <p className="wb-error">Unable to load works: {q.error.message}</p>
      )}
      <section className="wb-ledger">
        {q.data?.works.map((work) => (
          <a key={work.id} href={`#/works/${work.id}`} data-testid="work-row">
            <div>
              <Status value={work.lifecycle} />
              <h2>{work.objective}</h2>
              <code>{work.id}</code>
            </div>
            <b aria-hidden="true">→</b>
          </a>
        ))}
        {!q.data?.works.length && (
          <p className="wb-empty">
            No Work yet. Start with an objective you want to govern over time.
          </p>
        )}
      </section>
      {creating ? (
        <form
          className="wb-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await api.createWork(objective);
            setCreating(false);
            navigate(`/works/${result.work.id}`);
          }}
        >
          <label>
            Objective
            <textarea
              autoFocus
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="Describe the objective"
            />
          </label>
          <button type="button" onClick={() => setCreating(false)}>
            Cancel
          </button>
          <button className="primary" disabled={!objective.trim()}>
            Create Work
          </button>
        </form>
      ) : (
        <button
          className="primary"
          data-testid="create-work"
          onClick={() => setCreating(true)}
        >
          {q.data?.works.length ? "Create Work" : "Create your first work"}
        </button>
      )}
    </div>
  );
}
