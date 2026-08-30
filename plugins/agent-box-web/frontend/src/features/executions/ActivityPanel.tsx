import { useEffect, useState } from "react";
import {
  api,
  type AttachDescriptor,
  type Execution,
  type Operation,
} from "../../api/client";
import { Status } from "../../shared/Status";
export function ActivityPanel({
  id,
  execution,
  reload,
}: {
  id: string;
  execution: Execution;
  reload: () => void;
}) {
  const [operation, setOperation] = useState<Operation | undefined>(
    execution.operation,
  );
  const [attach, setAttach] = useState<AttachDescriptor>();
  const [terminalStatus, setTerminalStatus] = useState<string>();
  const [openingTerminal, setOpeningTerminal] = useState(false);
  useEffect(() => {
    if (!operation || !["accepted", "running"].includes(operation.status))
      return;
    const timer = window.setInterval(
      () =>
        void api.operation(operation.operation_id).then((next) => {
          setOperation(next);
          if (
            next.status === "succeeded" ||
            next.status === "failed" ||
            next.status === "ambiguous"
          )
            reload();
        }),
      500,
    );
    return () => window.clearInterval(timer);
  }, [operation, reload]);
  const dispatched = execution.dispatch_state === "accepted";
  const terminal = execution.phase === "terminal";
  const finish = async () => {
    if (operation) return;
    const next = await api.finish(id, crypto.randomUUID());
    setOperation(next);
  };
  const openTerminal = async () => {
    if (openingTerminal || !attach?.available) return;
    setOpeningTerminal(true); setTerminalStatus("opening");
    try {
      const result = await api.openTerminal(id, crypto.randomUUID());
      setTerminalStatus(result.status === "opened" ? "succeeded" : result.status);
      if (result.status !== "opened") setAttach({ ...attach, limitation: result.diagnostic });
    } catch (error) {
      setTerminalStatus("failed"); setAttach({ ...attach, limitation: String(error) });
    } finally { setOpeningTerminal(false); }
  };
  return (
    <section className="wb-panel">
      <h2>Activity</h2>
      <p>
        <Status value={execution.phase} /> · freshness: {execution.freshness} ·
        dispatch: {execution.dispatch_state || "not requested"}
      </p>
      {execution.outcome && (
        <p>
          Outcome: <strong>{execution.outcome}</strong>
        </p>
      )}
      {operation && (
        <div className="wb-operation">
          <Status value={operation.status} />
          <code>{operation.operation_id}</code>
          <p>{operation.progress?.join(" · ")}</p>
          {operation.error && <p className="wb-error">{operation.error}</p>}
        </div>
      )}
      {!terminal && dispatched && (
        <div className="action-row">
          <button onClick={() => void api.observe(id).then(reload)}>
            Observe
          </button>
          <button onClick={() => void api.attach(id).then(setAttach)}>
            Attach
          </button>
          <button
            className="primary"
            disabled={Boolean(operation)}
            onClick={() => void finish()}
            data-testid="finish-execution"
          >
            Finish Execution
          </button>
        </div>
      )}
      {!dispatched && !terminal && (
        <p className="wb-notice">
          Dispatch has not been accepted; Finish is unavailable.
        </p>
      )}
      {attach && (
        <div className="attach-drawer">
          <h3>Native attach</h3>
          <p>
            Target: <code>{attach.target}</code>
          </p>
          {attach.command?.length ? (
            <>
              <code>{attach.command.join(" ")}</code>
              <button
                onClick={() =>
                  void navigator.clipboard?.writeText(attach.command!.join(" "))
                }
              >
                Copy command
              </button>
              <button onClick={() => void openTerminal()} disabled={openingTerminal} data-testid="open-terminal">
                {openingTerminal ? "Opening…" : "Open terminal"}
              </button>
              {terminalStatus && <p data-testid={`terminal-${terminalStatus}`}>Terminal: {terminalStatus}</p>}
            </>
          ) : (
            <p>{attach.limitation}</p>
          )}
          <button onClick={() => setAttach(undefined)}>Close</button>
        </div>
      )}
    </section>
  );
}
