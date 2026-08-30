import { useState } from "react";
import { api, type Output, type Provider } from "../../api/client";
import { useQuery } from "../../api/query";
import { Modal } from "../../shared/Modal";
export function OutputsPanel({
  id,
  terminal,
}: {
  id: string;
  terminal: boolean;
}) {
  const outputs = useQuery(() => api.outputs(id), [id]);
  const providers = useQuery(api.providers, []);
  const [chosen, setChosen] = useState<Output>();
  const [provider, setProvider] = useState("");
  const [responsibility, setResponsibility] = useState("");
  if (!terminal)
    return (
      <section className="wb-panel">
        Outputs become available after terminal finalization.
      </section>
    );
  return (
    <section className="wb-panel">
      <h2>Outputs</h2>
      {outputs.data?.outputs.length ? (
        outputs.data.outputs.map((output) => (
          <div
            className="output-line"
            key={`${output.contract_id}:${output.native_id}`}
          >
            <div>
              <strong>{output.contract_id}</strong>
              <code>
                {output.type} · {output.native_id}
              </code>
            </div>
            <button
              onClick={() => setChosen(output)}
              data-testid="continue-output"
            >
              Use as input for a new Execution
            </button>
          </div>
        ))
      ) : (
        <p className="wb-empty">No output Ref was captured.</p>
      )}
      {chosen && (
        <Modal>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const next = await api.continueFromOutput(
                id,
                chosen,
                provider,
                responsibility,
              );
              location.hash = `#/executions/${next.execution.id}/binding`;
            }}
          >
            <h2>Continue from this output</h2>
            <p>
              Immutable source: <code>{chosen.native_id}</code>
            </p>
            <label>
              E2 responsibility
              <textarea
                autoFocus
                value={responsibility}
                onChange={(event) => setResponsibility(event.target.value)}
              />
            </label>
            <label>
              E2 ExecutionProvider
              <select
                required
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              >
                <option value="">Choose a provider</option>
                {providers.data?.providers.map((item: Provider) => (
                  <option key={item.id} value={item.id}>
                    {item.display_name} · {item.id}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setChosen(undefined)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={!provider || !responsibility.trim()}
            >
              Create continuation draft
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
