import { useState } from "react";
import { api, type Choice, type Draft, type Selector } from "../../api/client";
import { useQuery } from "../../api/query";
import { Status } from "../../shared/Status";
export function BindingComposer({
  id,
  draft,
  frozen,
  reload,
}: {
  id: string;
  draft?: Draft;
  frozen: boolean;
  reload: () => void;
}) {
  const selectors = useQuery(api.selectors, []);
  const [selected, setSelected] = useState<Selector>();
  const [choices, setChoices] = useState<Choice[]>([]);
  const [choicesLoading, setChoicesLoading] = useState(false);
  const [choicesError, setChoicesError] = useState<string>();
  const [value, setValue] = useState("");
  const [slotId, setSlotId] = useState<string>();
  const [working, setWorking] = useState(false);
  const requirements = (draft?.requirement_status || draft?.requirements || []).map(
    (requirement) => {
      const selectedCount = draft?.slots.filter(
        (slot) => slot.contract_id === requirement.contract_id,
      ).length ?? 0;
      const selected = "selected" in requirement ? requirement.selected : selectedCount;
      return {
        ...requirement,
        selected,
        satisfied:
          selected >= requirement.min &&
          (requirement.max == null || selected <= requirement.max),
      };
    },
  );
  const requiredInputsSatisfied = requirements.every(
    (requirement) => !requirement.required || requirement.satisfied,
  );
  const select = async (selector: Selector, slot?: string) => {
    setSelected(selector);
    setSlotId(slot);
    setValue(selector.fields[0]?.default || "");
    setChoices([]);
    setChoicesError(undefined);
    if (selector.fields[0]?.kind !== "select") return;
    setChoicesLoading(true);
    try {
      const response = await api.choices(selector.id);
      setChoices(response.choices);
    } catch (error) {
      setChoicesError(error instanceof Error ? error.message : "Unable to load choices");
    } finally {
      setChoicesLoading(false);
    }
  };
  const prepare = async () => {
    if (!selected) return;
    setWorking(true);
    await api.prepare(
      id,
      selected.id,
      { [selected.fields[0].key]: value },
      slotId,
    );
    setWorking(false);
    setSelected(undefined);
    reload();
  };
  const review = async () => {
    setWorking(true);
    await api.review(id);
    setWorking(false);
    reload();
  };
  const ready = Boolean(draft?.reviewed && !draft.errors.length);
  return (
    <section className="wb-panel">
      <div className="stepbar">
        <span className="current">1 Provider input contract</span>
        <span>2 Review exact inputs</span>
        <span>3 Freeze & Dispatch</span>
      </div>
      <h2>Binding</h2>
      <p>
        Draft revision <code>{draft?.revision ?? "—"}</code>. Each slot is Host
        draft organization; Core receives only contract and Ref.
      </p>
      <div className="requirements">
        {requirements.map((requirement) => (
          <div key={requirement.contract_id} className="requirement">
            <span>
              <strong>{requirement.contract_id}</strong>
              <small>
                {requirement.required ? "Required" : "Optional"} ·{" "}
                {requirement.min}–{requirement.max ?? "∞"}
              </small>
            </span>
            <Status value={`${requirement.selected}/${requirement.min}`} />
          </div>
        ))}
      </div>
      <div className="binding-grid">
        {draft?.slots.map((slot) => (
          <div className="binding-line" key={slot.slot_id}>
            <span>
              <b>Requested · {slot.slot_id}</b>
              <code>{slot.requested_summary}</code>
            </span>
            <span>→</span>
            <span>
              <b>Exact Ref · {slot.contract_id}</b>
              <code>{slot.ref?.native_id || "unresolved"}</code>
            </span>
            <button
              disabled={frozen}
              onClick={() =>
                slot.selector_id &&
                void select(
                  selectors.data?.selectors.find(
                    (item) => item.id === slot.selector_id,
                  )!,
                  slot.slot_id,
                )
              }
            >
              Replace
            </button>
          </div>
        ))}
      </div>
      {draft?.errors.map((error) => (
        <p className="wb-error" key={error}>
          {error}
        </p>
      ))}
      {!frozen && (
        <>
          <div className="selector-list">
            {selectors.data?.selectors.map((selector) => (
              <button
                key={selector.id}
                onClick={() => void select(selector)}
                data-testid={`selector-${selector.id}`}
              >
                Add {selector.title}
                <small>{selector.contract_id}</small>
              </button>
            ))}
          </div>
          {selected && (
            <div className="choice-list">
              <label>
                {selected.fields[0]?.label || "Input"}
                {selected.fields[0]?.kind === "select" ? (
                  <select
                    autoFocus
                    value={value}
                    disabled={choicesLoading}
                    onChange={(event) => setValue(event.target.value)}
                  >
                    <option value="">
                      {choicesLoading ? "Loading choices…" : "Select an exact resource…"}
                    </option>
                    {choices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label || choice.value}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    autoFocus
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                  />
                )}
              </label>
              {choicesError && <p className="wb-error">{choicesError}</p>}
              <button
                onClick={() => void prepare()}
                disabled={working || !value.trim()}
              >
                Resolve exact Ref
              </button>
            </div>
          )}
          <button
            className="primary"
            data-testid="review-binding"
            disabled={working || !draft?.slots.length || !requiredInputsSatisfied}
            onClick={() => void review()}
          >
            Review exact inputs
          </button>
          {draft?.reviewed && (
            <button
              className="primary"
              data-testid="freeze-dispatch"
              disabled={!ready || working}
              onClick={() => void api.freeze(id, draft.revision).then(reload)}
            >
              Freeze & Dispatch
            </button>
          )}
        </>
      )}
      {frozen && (
        <p className="wb-notice">
          Frozen exact inputs. This Binding cannot be edited.
        </p>
      )}
    </section>
  );
}
