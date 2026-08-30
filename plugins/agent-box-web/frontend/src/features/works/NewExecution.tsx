import { useState } from "react";
import { api } from "../../api/client";
import { useQuery } from "../../api/query";
import { Modal } from "../../shared/Modal";
export function NewExecution({
  workId,
  close,
  done,
}: {
  workId: string;
  close: () => void;
  done: (id: string) => void;
}) {
  const providers = useQuery(api.providers, []);
  const [provider, setProvider] = useState("");
  const [responsibility, setResponsibility] = useState("");
  return (
    <Modal>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await api.createExecution(
            workId,
            provider,
            responsibility,
          );
          done(result.execution.id);
        }}
      >
        <h2>New Execution</h2>
        <p>
          Choose the accountable provider before assembling its input contract.
        </p>
        <label>
          Responsibility
          <textarea
            autoFocus
            value={responsibility}
            onChange={(event) => setResponsibility(event.target.value)}
            placeholder="Describe the outcome this execution owns"
          />
        </label>
        <label>
          Accountable ExecutionProvider
          <select
            required
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          >
            <option value="">Choose a provider</option>
            {providers.data?.providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name} · {item.id}
              </option>
            ))}
          </select>
        </label>
        {provider && (
          <p className="wb-notice">
            Provider selected. Requirements will be shown in the Binding
            composer.
          </p>
        )}
        <button type="button" onClick={close}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={!provider || !responsibility.trim()}
        >
          Create draft
        </button>
      </form>
    </Modal>
  );
}
