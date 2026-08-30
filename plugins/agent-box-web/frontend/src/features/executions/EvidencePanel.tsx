import { api } from "../../api/client";
import { useQuery } from "../../api/query";
import { Status } from "../../shared/Status";
export function EvidencePanel({
  id,
  terminal,
}: {
  id: string;
  terminal: boolean;
}) {
  const q = useQuery(() => api.evidence(id), [id]);
  if (!terminal)
    return (
      <section className="wb-panel">
        Evidence is available after finalization.
      </section>
    );
  return (
    <section className="wb-panel">
      <h2>Evidence reconciliation</h2>
      <p>
        Frozen inputs are the primary rows. No global resource verdict is
        inferred.
      </p>
      <div className="evidence-list">
        {q.data?.inputs.map((input) => (
          <article key={`${input.contract_id}:${input.ref.native_id}`}>
            <header>
              <strong>{input.contract_id}</strong>
              <code>
                {input.ref.type} · {input.ref.provider} · {input.ref.native_id}
              </code>
            </header>
            {input.observations.length ? (
              input.observations.map((observation, index) => (
                <div
                  className="observation"
                  key={`${observation.observer_id}-${index}`}
                >
                  <span>
                    <Status value={observation.result} />
                    <small>
                      {observation.kind} · {observation.coverage}
                    </small>
                  </span>
                  <span>
                    Observer: <code>{observation.observer_id}</code> (
                    {observation.observer_role})
                    <small>{observation.observed_at}</small>
                  </span>
                  <span>
                    {observation.evidence_ref
                      ? `Evidence Ref: ${observation.evidence_ref.native_id}`
                      : observation.detail || "—"}
                  </span>
                </div>
              ))
            ) : (
              <p className="wb-empty">No observation for this frozen input.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
