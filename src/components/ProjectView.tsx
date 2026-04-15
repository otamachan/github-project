import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FieldDef,
  ProjectDetail,
  ProjectItem,
  Route,
} from "../types";
import { fetchProject, fetchProjectItems } from "../lib/github";
import { selectColor, timeAgo } from "../lib/format";
import ItemRow from "./ItemRow";
import DraftItemForm from "./DraftItemForm";

const NONE_KEY = "__none__";

function pickDefaultGroupField(fields: FieldDef[]): string | null {
  const singleSelects = fields.filter((f) => f.kind === "SINGLE_SELECT");
  const status = singleSelects.find(
    (f) => f.name.toLowerCase() === "status",
  );
  return (status ?? singleSelects[0])?.id ?? null;
}

function groupKeyFor(item: ProjectItem, fieldId: string): string {
  const v = item.fieldValues[fieldId];
  if (!v) return NONE_KEY;
  if (v.kind === "SINGLE_SELECT") return v.optionId;
  if (v.kind === "ITERATION") return v.iterationId;
  return NONE_KEY;
}

const COLLAPSED_KEY = "github-project-collapsed";

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "{}") as Record<
      string,
      boolean
    >;
  } catch {
    return {};
  }
}

function saveCollapsed(c: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(c));
  } catch {
    // ignore
  }
}

export default function ProjectView({
  owner,
  number,
  navigate,
}: {
  owner: string;
  number: number;
  navigate: (r: Route) => void;
}) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [groupFieldId, setGroupFieldId] = useState<string | null>(null);
  const [collapsed, setCollapsedState] =
    useState<Record<string, boolean>>(loadCollapsed);
  const [showAddDraft, setShowAddDraft] = useState(false);

  const setCollapsed = useCallback(
    (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => {
      setCollapsedState((prev) => {
        const next = updater(prev);
        saveCollapsed(next);
        return next;
      });
    },
    [],
  );

  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      fetchProject(owner, number),
      fetchProjectItems(owner, number, null),
    ])
      .then(([p, page]) => {
        setProject(p);
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setGroupFieldId((prev) => prev ?? pickDefaultGroupField(p.fields));
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [owner, number]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchProjectItems(owner, number, nextCursor);
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const groupField = useMemo(
    () => project?.fields.find((f) => f.id === groupFieldId) ?? null,
    [project, groupFieldId],
  );

  const buckets = useMemo(() => {
    if (!groupField) return [{ key: NONE_KEY, label: "All", color: "", items }];
    const byKey = new Map<string, ProjectItem[]>();
    for (const item of items) {
      const key = groupKeyFor(item, groupField.id);
      const arr = byKey.get(key) ?? [];
      arr.push(item);
      byKey.set(key, arr);
    }
    type Bucket = {
      key: string;
      label: string;
      color: string;
      items: ProjectItem[];
    };
    const out: Bucket[] = [];
    if (groupField.kind === "SINGLE_SELECT") {
      for (const opt of groupField.options ?? []) {
        out.push({
          key: opt.id,
          label: opt.name,
          color: selectColor(opt.color),
          items: byKey.get(opt.id) ?? [],
        });
      }
    } else if (groupField.kind === "ITERATION") {
      const iters = [
        ...(groupField.iterations ?? []),
        ...(groupField.completedIterations ?? []),
      ];
      for (const it of iters) {
        out.push({
          key: it.id,
          label: it.title,
          color: selectColor("BLUE"),
          items: byKey.get(it.id) ?? [],
        });
      }
    }
    out.push({
      key: NONE_KEY,
      label: `No ${groupField.name}`,
      color: selectColor("GRAY"),
      items: byKey.get(NONE_KEY) ?? [],
    });
    return out;
  }, [groupField, items]);

  const singleSelectFields = useMemo(
    () =>
      project?.fields.filter(
        (f) => f.kind === "SINGLE_SELECT" || f.kind === "ITERATION",
      ) ?? [],
    [project],
  );

  if (loading && !project) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-secondary)]">
        Loading...
      </div>
    );
  }
  if (!project) {
    return (
      <div className="p-4 text-[var(--danger)] text-sm break-words">
        {error || "Project not found"}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-1">
          <span>
            {project.owner.login}/#{project.number}
          </span>
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] active:opacity-80"
          >
            Open on GitHub ↗
          </a>
          <span className="ml-auto">{timeAgo(project.updatedAt)}</span>
        </div>
        <h2 className="text-lg font-bold leading-snug break-words">
          {project.title}
        </h2>
        {project.shortDescription && (
          <p className="text-xs text-[var(--text-secondary)] mt-1 break-words">
            {project.shortDescription}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
        <label className="text-xs text-[var(--text-secondary)]">Group by</label>
        <select
          value={groupFieldId ?? ""}
          onChange={(e) => setGroupFieldId(e.target.value || null)}
          className="text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-2 py-1 outline-none"
        >
          <option value="">(none)</option>
          {singleSelectFields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-[var(--text-secondary)]">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={() => setShowAddDraft(true)}
          className="text-xs px-2 py-1 rounded bg-[var(--accent)] text-white font-medium active:opacity-80"
        >
          + Draft
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 text-[var(--danger)] text-xs break-words">
          {error}
        </div>
      )}

      {/* Buckets */}
      {buckets.map((bucket) => {
        const isCollapsed = !!collapsed[bucket.key];
        if (bucket.items.length === 0 && bucket.key === NONE_KEY) return null;
        return (
          <section
            key={bucket.key}
            className="border-b border-[var(--border)]"
          >
            <button
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [bucket.key]: !isCollapsed }))
              }
              className="w-full flex items-center gap-2 px-4 py-2 bg-[var(--bg-secondary)] active:opacity-80"
            >
              <span className="text-[10px]">{isCollapsed ? "▶" : "▼"}</span>
              {bucket.color && (
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: bucket.color }}
                />
              )}
              <span className="text-sm font-medium">{bucket.label}</span>
              <span className="text-xs text-[var(--text-secondary)] ml-1">
                {bucket.items.length}
              </span>
            </button>
            {!isCollapsed && (
              <div className="divide-y divide-[var(--border)]">
                {bucket.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    owner={owner}
                    number={number}
                    navigate={navigate}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {nextCursor && (
        <div className="px-4 py-4 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-sm text-[var(--accent)] active:opacity-80 disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}

      {showAddDraft && (
        <DraftItemForm
          projectId={project.id}
          onDone={() => {
            setShowAddDraft(false);
            reload();
          }}
          onCancel={() => setShowAddDraft(false)}
        />
      )}
    </div>
  );
}
