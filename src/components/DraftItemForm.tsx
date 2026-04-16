import { useState } from "react";
import type { FieldDef } from "../types";
import { addDraftIssue, updateFieldValue } from "../lib/github";
import { selectColor } from "../lib/format";

export default function DraftItemForm({
  projectId,
  fields,
  onDone,
  onCancel,
}: {
  projectId: string;
  fields: FieldDef[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Track selected option per single-select / iteration field
  const [fieldSelections, setFieldSelections] = useState<
    Record<string, string>
  >({});

  const editableFields = fields.filter(
    (f) => f.kind === "SINGLE_SELECT" || f.kind === "ITERATION",
  );

  const setSelection = (fieldId: string, value: string) => {
    setFieldSelections((prev) => ({ ...prev, [fieldId]: value }));
  };

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setSubmitting(true);
    setError("");
    try {
      const { itemId } = await addDraftIssue(projectId, t, body);

      // Set selected field values on the newly created item
      const mutations = Object.entries(fieldSelections)
        .filter(([, val]) => val !== "")
        .map(([fieldId, val]) => {
          const field = fields.find((f) => f.id === fieldId);
          if (!field) return null;
          if (field.kind === "SINGLE_SELECT") {
            return updateFieldValue(projectId, itemId, fieldId, {
              type: "single_select",
              optionId: val,
            });
          }
          if (field.kind === "ITERATION") {
            return updateFieldValue(projectId, itemId, fieldId, {
              type: "iteration",
              iterationId: val,
            });
          }
          return null;
        })
        .filter(Boolean);

      await Promise.all(mutations);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full sm:max-w-md bg-[var(--bg-secondary)] border-t sm:border border-[var(--border)] sm:rounded-lg p-4 space-y-3 max-h-[85vh] overflow-y-auto">
        <h2 className="text-base font-bold">New draft item</h2>
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent)]"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Body (optional)"
          rows={3}
          className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent)] resize-none"
        />

        {editableFields.map((f) => (
          <div key={f.id}>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">
              {f.name}
            </label>
            <select
              value={fieldSelections[f.id] ?? ""}
              onChange={(e) => setSelection(f.id, e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">— none —</option>
              {f.kind === "SINGLE_SELECT" &&
                (f.options ?? []).map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              {f.kind === "ITERATION" &&
                (f.iterations ?? []).map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.title}
                  </option>
                ))}
            </select>
            {/* Show color indicator for the selected option */}
            {f.kind === "SINGLE_SELECT" && fieldSelections[f.id] && (() => {
              const opt = f.options?.find(
                (o) => o.id === fieldSelections[f.id],
              );
              if (!opt) return null;
              return (
                <span
                  className="inline-block mt-1 w-2 h-2 rounded-full"
                  style={{ backgroundColor: selectColor(opt.color) }}
                />
              );
            })()}
          </div>
        ))}

        {error && <p className="text-[var(--danger)] text-xs">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-2 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-sm active:opacity-80 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !title.trim()}
            className="flex-1 py-2 rounded bg-[var(--accent)] text-white text-sm font-medium active:opacity-80 disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
