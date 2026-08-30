import { useState } from "react";
import { api } from "../../api/client";
import { useQuery } from "../../api/query";
import { navigate } from "../../app/router";
import { Modal } from "../../shared/Modal";
import { Status } from "../../shared/Status";
import { NewExecution } from "./NewExecution";
export function WorkDetail({ id }: { id: string }) {
  const q = useQuery(() => api.work(id), [id]);
  const [newExecution, setNewExecution] = useState(false);
  const [complete, setComplete] = useState(false);
  const [reason, setReason] = useState("");
  if (q.loading) return <div className="wb-page">Loading work…</div>;
  if (!q.data) return <div className="wb-page">Work not found.</div>;
  const work = q.data;
  return (
    <div className="wb-page">
      <header className="wb-objective">
        <div>
          <p>
            WORK / <code>{work.id}</code>
          </p>
          <h1>{work.objective}</h1>
        </div>
        {work.lifecycle === "open" && (
          <button
            className="secondary"
            onClick={() => setComplete(true)}
            data-testid="complete-work"
          >
            Complete Work
          </button>
        )}
      </header>
      <section className="wb-chronicle">
        <p className="eyebrow">Chronicle</p>
        {work.executions.length ? (
          work.executions.map((execution) => (
            <article key={execution.id}>
              <div>
                <Status value={execution.phase} />
                <h3>
                  {execution.responsibility || "Execution responsibility"}
                </h3>
                <small>
                  Provider: <code>{execution.provider_id}</code> ·{" "}
                  {execution.dispatch_state || "not dispatched"}
                </small>
              </div>
              <a href={`#/executions/${execution.id}/overview`}>
                Open Execution →
              </a>
            </article>
          ))
        ) : (
          <p className="wb-empty">
            No executions yet. Provider choice happens when you create the first
            bounded attempt.
          </p>
        )}
      </section>
      {work.lifecycle === "open" && (
        <section className="wb-decision">
          <p className="eyebrow">Decide next</p>
          <h2>Create a new accountable Execution</h2>
          <button
            className="primary"
            onClick={() => setNewExecution(true)}
            data-testid="new-execution"
          >
            New Execution
          </button>
        </section>
      )}
      {newExecution && (
        <NewExecution
          workId={id}
          close={() => setNewExecution(false)}
          done={(executionId) => {
            setNewExecution(false);
            navigate(`/executions/${executionId}/binding`);
          }}
        />
      )}
      {complete && (
        <Modal>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              await api.complete(id, reason);
              setComplete(false);
              q.reload();
            }}
          >
            <h2>Complete Work</h2>
            <p>
              This is a human governance decision; it does not claim all
              possible work is done.
            </p>
            <label>
              Why is this Work complete?
              <textarea
                autoFocus
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button type="button" onClick={() => setComplete(false)}>
              Cancel
            </button>
            <button className="primary" disabled={!reason.trim()}>
              Confirm Complete Work
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
