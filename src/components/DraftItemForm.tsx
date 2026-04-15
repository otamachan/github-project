import { useState } from "react";
import { addDraftIssue } from "../lib/github";

export default function DraftItemForm({
  projectId,
  onDone,
  onCancel,
}: {
  projectId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setSubmitting(true);
    setError("");
    try {
      await addDraftIssue(projectId, t, body);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full sm:max-w-md bg-[var(--bg-secondary)] border-t sm:border border-[var(--border)] sm:rounded-lg p-4 space-y-3">
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
          rows={4}
          className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent)] resize-none"
        />
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
