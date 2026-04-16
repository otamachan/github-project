import { useCallback, useEffect, useState } from "react";
import type {
  FieldDef,
  FieldValue,
  ProjectDetail,
  ProjectItem,
} from "../types";
import { fetchItem, fetchProject, updateDraftIssue } from "../lib/github";
import { iterationDates, selectColor, timeAgo } from "../lib/format";
import FieldEditor from "./FieldEditor";
import Markdown from "./Markdown";

function contentTitle(item: ProjectItem): string {
  switch (item.content.kind) {
    case "DraftIssue":
      return item.content.title || "(untitled draft)";
    case "Issue":
    case "PullRequest":
      return item.content.title;
    default:
      return "(redacted)";
  }
}

function renderFieldValue(v: FieldValue) {
  switch (v.kind) {
    case "SINGLE_SELECT":
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
          style={{
            background: `${selectColor(v.color)}22`,
            color: selectColor(v.color),
            border: `1px solid ${selectColor(v.color)}55`,
          }}
        >
          {v.name}
        </span>
      );
    case "ITERATION":
      return (
        <span className="text-sm">
          {v.title}{" "}
          <span className="text-xs text-[var(--text-secondary)]">
            {iterationDates(v.startDate, v.duration)}
          </span>
        </span>
      );
    case "TEXT":
      return (
        <span className="text-sm break-words whitespace-pre-wrap">
          {v.text}
        </span>
      );
    case "NUMBER":
      return <span className="text-sm">{v.number}</span>;
    case "DATE":
      return <span className="text-sm">{v.date}</span>;
    case "LABELS":
      return (
        <span className="flex flex-wrap gap-1">
          {v.labels.map((l) => (
            <span
              key={l.name}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: `#${l.color}33`,
                color: `#${l.color}`,
                border: `1px solid #${l.color}66`,
              }}
            >
              {l.name}
            </span>
          ))}
        </span>
      );
    case "ASSIGNEES":
      return (
        <span className="flex items-center gap-1">
          {v.users.map((u) => (
            <img
              key={u.login}
              src={u.avatarUrl}
              alt={u.login}
              title={u.login}
              className="w-5 h-5 rounded-full"
            />
          ))}
        </span>
      );
    case "MILESTONE":
      return <span className="text-sm">{v.title}</span>;
    case "REPOSITORY":
      return <span className="text-sm mono">{v.nameWithOwner}</span>;
    case "TITLE":
      return <span className="text-sm">{v.text}</span>;
    default:
      return <span className="text-xs text-[var(--text-secondary)]">—</span>;
  }
}

function isEditable(f: FieldDef): boolean {
  return (
    f.kind === "SINGLE_SELECT" ||
    f.kind === "ITERATION" ||
    f.kind === "TEXT" ||
    f.kind === "NUMBER" ||
    f.kind === "DATE"
  );
}

/* ---------------- Draft editor (inline bottom sheet) ---------------- */

function DraftEditor({
  draftId,
  initialTitle,
  initialBody,
  onDone,
  onCancel,
}: {
  draftId: string;
  initialTitle: string;
  initialBody: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    setError("");
    try {
      await updateDraftIssue(draftId, t, body);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="w-full sm:max-w-md bg-[var(--bg-secondary)] border-t sm:border border-[var(--border)] sm:rounded-lg p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold">Edit draft</h2>
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
          placeholder="Body"
          rows={8}
          className="w-full px-3 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent)] resize-none font-mono"
        />
        {error && <p className="text-[var(--danger)] text-xs">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-2 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-sm active:opacity-80 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !title.trim()}
            className="flex-1 py-2 rounded bg-[var(--accent)] text-white text-sm font-medium active:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- ItemDetailView — the pure render, reusable inline ---------------- */

export function ItemDetailView({
  project,
  item,
  onItemUpdated,
  embedded = false,
}: {
  project: ProjectDetail;
  item: ProjectItem;
  onItemUpdated?: (item: ProjectItem) => void;
  embedded?: boolean;
}) {
  const [editFieldId, setEditFieldId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState(false);

  const handleAfterEdit = useCallback(async () => {
    try {
      const fresh = await fetchItem(item.id);
      onItemUpdated?.(fresh);
    } catch {
      // surfaced on the next full reload; swallow here so the editor
      // modal still closes cleanly.
    }
  }, [item.id, onItemUpdated]);

  const editField = editFieldId
    ? (project.fields.find((f) => f.id === editFieldId) ?? null)
    : null;

  const c = item.content;
  const isDraft = c.kind === "DraftIssue";
  const url = c.kind === "Issue" || c.kind === "PullRequest" ? c.url : null;
  const subtitle =
    c.kind === "Issue"
      ? `${c.repo}#${c.number} • ${c.state}`
      : c.kind === "PullRequest"
        ? `${c.repo}#${c.number} • ${c.isDraft ? "Draft PR" : c.state}`
        : c.kind === "DraftIssue"
          ? "Draft"
          : "Redacted";

  const body = c.kind === "DraftIssue" ? c.body : "";

  return (
    <div className={embedded ? "bg-[var(--bg-secondary)]" : ""}>
      {/* Full header — only on the dedicated page, not when expanded inline */}
      {!embedded && (
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-1">
            <span>{subtitle}</span>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] active:opacity-80"
              >
                Open on GitHub ↗
              </a>
            )}
            <span className="ml-auto">{timeAgo(item.updatedAt)}</span>
          </div>
          <div className="flex items-start gap-2">
            <h2 className="flex-1 text-base font-bold leading-snug break-words">
              {contentTitle(item)}
            </h2>
            {isDraft && (
              <button
                onClick={() => setEditingDraft(true)}
                className="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--accent)] active:opacity-80"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      )}

      {/* Compact link row — embedded mode only, for Issue / PR */}
      {embedded && url && (
        <div className="px-4 py-2 border-b border-[var(--border)] text-xs">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] active:opacity-80"
          >
            Open on GitHub ↗
          </a>
        </div>
      )}

      {/* Draft body with rendered markdown */}
      {isDraft && (
        <div className="px-4 py-3 border-b border-[var(--border)]">
          {body ? (
            <Markdown content={body} />
          ) : (
            <span className="text-xs text-[var(--text-secondary)]">
              (no body)
            </span>
          )}
          {embedded && (
            <div className="mt-2">
              <button
                onClick={() => setEditingDraft(true)}
                className="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--accent)] active:opacity-80"
              >
                Edit draft
              </button>
            </div>
          )}
        </div>
      )}

      {/* Fields */}
      <div className="divide-y divide-[var(--border)]">
        {project.fields
          .filter((f) => f.kind !== "TITLE")
          .map((f) => {
            const value = item.fieldValues[f.id];
            const editable = isEditable(f);
            return (
              <button
                key={f.id}
                onClick={() => {
                  if (editable) setEditFieldId(f.id);
                }}
                disabled={!editable}
                className="w-full flex items-start gap-3 px-4 py-3 text-left active:bg-[var(--bg-tertiary)] disabled:opacity-70"
              >
                <div className="w-28 flex-shrink-0 text-xs text-[var(--text-secondary)] pt-0.5">
                  {f.name}
                </div>
                <div className="flex-1 min-w-0">
                  {value ? (
                    renderFieldValue(value)
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">
                      —
                    </span>
                  )}
                </div>
                {editable && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    ›
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {editField && (
        <FieldEditor
          projectId={project.id}
          itemId={item.id}
          field={editField}
          current={item.fieldValues[editField.id]}
          onDone={() => {
            setEditFieldId(null);
            void handleAfterEdit();
          }}
          onCancel={() => setEditFieldId(null)}
        />
      )}

      {editingDraft && c.kind === "DraftIssue" && (
        <DraftEditor
          draftId={c.draftId}
          initialTitle={c.title}
          initialBody={c.body}
          onDone={() => {
            setEditingDraft(false);
            void handleAfterEdit();
          }}
          onCancel={() => setEditingDraft(false)}
        />
      )}
    </div>
  );
}

/* ---------------- ItemDetailPage — stand-alone page (kept for /items/:id deep links) ---------------- */

export default function ItemDetailPage({
  owner,
  number,
  itemId,
}: {
  owner: string;
  number: number;
  itemId: string;
}) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [item, setItem] = useState<ProjectItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([fetchProject(owner, number), fetchItem(itemId)])
      .then(([p, it]) => {
        setProject(p);
        setItem(it);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [owner, number, itemId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading && !item) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-secondary)]">
        Loading...
      </div>
    );
  }
  if (!item || !project) {
    return (
      <div className="p-4 text-[var(--danger)] text-sm break-words">
        {error || "Item not found"}
      </div>
    );
  }

  return (
    <ItemDetailView project={project} item={item} onItemUpdated={setItem} />
  );
}
