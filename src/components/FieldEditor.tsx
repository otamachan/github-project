import { useState } from "react";
import type { FieldDef, FieldValue } from "../types";
import { clearFieldValue, updateFieldValue } from "../lib/github";
import { iterationDates, selectColor } from "../lib/format";

export default function FieldEditor({
  projectId,
  itemId,
  field,
  current,
  onDone,
  onCancel,
}: {
  projectId: string;
  itemId: string;
  field: FieldDef;
  current: FieldValue | undefined;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(
    current?.kind === "TEXT" ? current.text : "",
  );
  const [num, setNum] = useState(
    current?.kind === "NUMBER" ? String(current.number) : "",
  );
  const [date, setDate] = useState(
    current?.kind === "DATE" ? current.date : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError("");
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const pickOption = (optionId: string) =>
    run(() =>
      updateFieldValue(projectId, itemId, field.id, {
        type: "single_select",
        optionId,
      }),
    );

  const pickIteration = (iterationId: string) =>
    run(() =>
      updateFieldValue(projectId, itemId, field.id, {
        type: "iteration",
        iterationId,
      }),
    );

  const saveText = () =>
    run(() =>
      updateFieldValue(projectId, itemId, field.id, { type: "text", text }),
    );

  const saveNumber = () => {
    const n = Number(num);
    if (!Number.isFinite(n)) {
      setError("Invalid number");
      return;
    }
    return run(() =>
      updateFieldValue(projectId, itemId, field.id, {
        type: "number",
        number: n,
      }),
    );
  };

  const saveDate = () =>
    run(() =>
      updateFieldValue(projectId, itemId, field.id, { type: "date", date }),
    );

  const clear = () =>
    run(() => clearFieldValue(projectId, itemId, field.id));

  const currentOptionId =
    current?.kind === "SINGLE_SELECT" ? current.optionId : null;
  const currentIterationId =
    current?.kind === "ITERATION" ? current.iterationId : null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="w-full sm:max-w-md bg-[var(--bg-secondary)] border-t sm:border border-[var(--border)] sm:rounded-lg p-4 space-y-3 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center">
          <h2 className="text-base font-bold">{field.name}</h2>
          <button
            onClick={onCancel}
            disabled={saving}
            className="ml-auto text-sm text-[var(--text-secondary)] active:opacity-80"
          >
            Close
          </button>
        </div>

        {error && <p className="text-[var(--danger)] text-xs">{error}</p>}

        {field.kind === "SINGLE_SELECT" && (
          <div className="divide-y divide-[var(--border)] -mx-2">
            {(field.options ?? []).map((opt) => {
              const selected = opt.id === currentOptionId;
              return (
                <button
                  key={opt.id}
                  onClick={() => pickOption(opt.id)}
                  disabled={saving}
                  className={`w-full flex items-center gap-2 px-3 py-3 text-left text-sm active:bg-[var(--bg-tertiary)] disabled:opacity-50 ${
                    selected ? "bg-[var(--bg-tertiary)]" : ""
                  }`}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: selectColor(opt.color) }}
                  />
                  <span className="flex-1">{opt.name}</span>
                  {selected && (
                    <span className="text-[var(--accent)] text-xs">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {field.kind === "ITERATION" && (
          <div className="divide-y divide-[var(--border)] -mx-2">
            {(field.iterations ?? []).map((it) => {
              const selected = it.id === currentIterationId;
              return (
                <button
                  key={it.id}
                  onClick={() => pickIteration(it.id)}
                  disabled={saving}
                  className={`w-full flex items-center gap-2 px-3 py-3 text-left text-sm active:bg-[var(--bg-tertiary)] disabled:opacity-50 ${
                    selected ? "bg-[var(--bg-tertiary)]" : ""
                  }`}
                >
                  <span className="flex-1">
                    <span>{it.title}</span>
                    <span className="ml-2 text-xs text-[var(--text-secondary)]">
                      {iterationDates(it.startDate, it.duration)}
                    </span>
                  </span>
                  {selected && (
                    <span className="text-[var(--accent)] text-xs">✓</span>
                  )}
                </button>
              );
            })}
            {(field.completedIterations?.length ?? 0) > 0 && (
              <div className="pt-2 px-3 text-[10px] text-[var(--text-secondary)]">
                Completed
              </div>
            )}
            {(field.completedIterations ?? []).map((it) => {
              const selected = it.id === currentIterationId;
              return (
                <button
                  key={it.id}
                  onClick={() => pickIteration(it.id)}
                  disabled={saving}
                  className={`w-full flex items-center gap-2 px-3 py-3 text-left text-sm text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)] disabled:opacity-50 ${
                    selected ? "bg-[var(--bg-tertiary)]" : ""
                  }`}
                >
                  <span className="flex-1">
                    <span>{it.title}</span>
                    <span className="ml-2 text-xs">
                      {iterationDates(it.startDate, it.duration)}
                    </span>
                  </span>
                  {selected && (
                    <span className="text-[var(--accent)] text-xs">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {field.kind === "TEXT" && (
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent)] resize-none"
              autoFocus
            />
            <button
              onClick={saveText}
              disabled={saving}
              className="w-full py-2 rounded bg-[var(--accent)] text-white text-sm font-medium active:opacity-80 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}

        {field.kind === "NUMBER" && (
          <div className="space-y-2">
            <input
              type="number"
              inputMode="decimal"
              value={num}
              onChange={(e) => setNum(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent)]"
              autoFocus
            />
            <button
              onClick={saveNumber}
              disabled={saving}
              className="w-full py-2 rounded bg-[var(--accent)] text-white text-sm font-medium active:opacity-80 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}

        {field.kind === "DATE" && (
          <div className="space-y-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent)]"
              autoFocus
            />
            <button
              onClick={saveDate}
              disabled={saving}
              className="w-full py-2 rounded bg-[var(--accent)] text-white text-sm font-medium active:opacity-80 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}

        {(field.kind === "SINGLE_SELECT" ||
          field.kind === "ITERATION" ||
          field.kind === "TEXT" ||
          field.kind === "NUMBER" ||
          field.kind === "DATE") && (
          <button
            onClick={clear}
            disabled={saving || !current}
            className="w-full py-2 rounded bg-[var(--bg-tertiary)] text-[var(--danger)] text-sm active:opacity-80 disabled:opacity-30"
          >
            Clear
          </button>
        )}

        {field.kind !== "SINGLE_SELECT" &&
          field.kind !== "ITERATION" &&
          field.kind !== "TEXT" &&
          field.kind !== "NUMBER" &&
          field.kind !== "DATE" && (
            <p className="text-xs text-[var(--text-secondary)]">
              This field type ({field.kind}) is not editable in this app.
            </p>
          )}
      </div>
    </div>
  );
}
