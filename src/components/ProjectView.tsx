import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FieldDef,
  IssueParentRef,
  ProjectDetail,
  ProjectItem,
  Route,
} from "../types";
import {
  archiveItem,
  fetchProject,
  fetchProjectItems,
  fetchItem,
} from "../lib/github";
import { selectColor, timeAgo } from "../lib/format";
import ItemRow from "./ItemRow";
import DraftItemForm from "./DraftItemForm";
import FieldEditor from "./FieldEditor";
import { ItemDetailView } from "./ItemDetail";

const NONE_KEY = "__none__";

/**
 * On reload, keep paging until we hit this many pages (or the cursor is
 * exhausted). Beyond this, the user opts in to more via "Load more".
 * Balances initial load latency against having enough items for the parent
 * filter (which only sees items that have actually been fetched).
 */
const AUTO_PAGES = 3;

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

/**
 * Stale-while-revalidate cache for a single project's header + items, keyed
 * by owner/number so switching projects doesn't clobber the other's cache.
 * Re-entering the view (e.g. from item detail) paints instantly from the
 * cached snapshot while a fresh fetch runs in the background.
 */
const VIEW_CACHE_PREFIX = "github-project-view-cache";

interface ProjectViewCache {
  project: ProjectDetail;
  items: ProjectItem[];
  nextCursor: string | null;
}

function viewCacheKey(owner: string, number: number): string {
  return `${VIEW_CACHE_PREFIX}-${owner}-${number}`;
}

function loadViewCache(
  owner: string,
  number: number,
): ProjectViewCache | null {
  try {
    const raw = localStorage.getItem(viewCacheKey(owner, number));
    if (!raw) return null;
    return JSON.parse(raw) as ProjectViewCache;
  } catch {
    return null;
  }
}

function saveViewCache(
  owner: string,
  number: number,
  data: ProjectViewCache,
) {
  try {
    localStorage.setItem(viewCacheKey(owner, number), JSON.stringify(data));
  } catch {
    // ignore quota
  }
}

export default function ProjectView({
  owner,
  number,
  navigate,
}: {
  owner: string;
  number: number;
  navigate: (route: Route) => void;
}) {
  const [project, setProject] = useState<ProjectDetail | null>(
    () => loadViewCache(owner, number)?.project ?? null,
  );
  const [items, setItems] = useState<ProjectItem[]>(
    () => loadViewCache(owner, number)?.items ?? [],
  );
  const [nextCursor, setNextCursor] = useState<string | null>(
    () => loadViewCache(owner, number)?.nextCursor ?? null,
  );
  const [loading, setLoading] = useState(
    () => loadViewCache(owner, number) === null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [groupFieldId, setGroupFieldId] = useState<string | null>(
    () => pickDefaultGroupField(loadViewCache(owner, number)?.project?.fields ?? []),
  );
  const [collapsed, setCollapsedState] =
    useState<Record<string, boolean>>(loadCollapsed);
  const [parentFilterId, setParentFilterId] = useState<string>("");
  const [showAddDraft, setShowAddDraft] = useState(false);
  const [archivingKey, setArchivingKey] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<{
    itemId: string;
    fieldId: string;
  } | null>(null);

  const handleItemUpdated = useCallback(
    (updated: ProjectItem) => {
      setItems((prev) => {
        const next = prev.map((i) => (i.id === updated.id ? updated : i));
        if (project) {
          saveViewCache(owner, number, {
            project,
            items: next,
            nextCursor,
          });
        }
        return next;
      });
    },
    [owner, number, project, nextCursor],
  );

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

  /**
   * Archive every item currently visible in the given bucket. Operates on the
   * already-filtered set (so a parent filter narrows the scope); the caller
   * passes the exact list to be archived.
   */
  const handleArchiveBucket = useCallback(
    async (bucketKey: string, label: string, targets: ProjectItem[]) => {
      if (!project || targets.length === 0) return;
      const ok = window.confirm(
        `Archive ${targets.length} item${targets.length === 1 ? "" : "s"} in "${label}"?`,
      );
      if (!ok) return;
      setArchivingKey(bucketKey);
      setError("");
      try {
        await Promise.all(
          targets.map((it) => archiveItem(project.id, it.id)),
        );
        const archivedIds = new Set(targets.map((it) => it.id));
        setItems((prev) => {
          const next = prev.filter((i) => !archivedIds.has(i.id));
          saveViewCache(owner, number, {
            project,
            items: next,
            nextCursor,
          });
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setArchivingKey(null);
      }
    },
    [project, owner, number, nextCursor],
  );

  const reload = useCallback(async () => {
    const hasCache = loadViewCache(owner, number) !== null;
    if (hasCache) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const [p, firstPage] = await Promise.all([
        fetchProject(owner, number),
        fetchProjectItems(owner, number, null),
      ]);
      setProject(p);
      setGroupFieldId((prev) => prev ?? pickDefaultGroupField(p.fields));

      let collected = firstPage.items;
      let cursor = firstPage.nextCursor;
      setItems(collected);
      setNextCursor(cursor);
      saveViewCache(owner, number, {
        project: p,
        items: collected,
        nextCursor: cursor,
      });

      let pagesFetched = 1;
      while (cursor && pagesFetched < AUTO_PAGES) {
        const next = await fetchProjectItems(owner, number, cursor);
        collected = [...collected, ...next.items];
        cursor = next.nextCursor;
        pagesFetched++;
        setItems(collected);
        setNextCursor(cursor);
        saveViewCache(owner, number, {
          project: p,
          items: collected,
          nextCursor: cursor,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [owner, number]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchProjectItems(owner, number, nextCursor);
      const merged = [...items, ...page.items];
      setItems(merged);
      setNextCursor(page.nextCursor);
      if (project) {
        saveViewCache(owner, number, {
          project,
          items: merged,
          nextCursor: page.nextCursor,
        });
      }
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

  /**
   * Unique set of parents referenced by any Issue item, keyed by parent.id.
   * Includes parents that aren't themselves project items — that's the point
   * of this filter: it follows GitHub's native sub-issue link, not project
   * membership.
   */
  const parentCandidates = useMemo<IssueParentRef[]>(() => {
    const byId = new Map<string, IssueParentRef>();
    for (const item of items) {
      const c = item.content;
      if (c.kind === "Issue" && c.parent) byId.set(c.parent.id, c.parent);
    }
    return Array.from(byId.values()).sort((a, b) => {
      if (a.repo !== b.repo) return a.repo.localeCompare(b.repo);
      return a.number - b.number;
    });
  }, [items]);

  const selectedParent = useMemo(
    () => parentCandidates.find((p) => p.id === parentFilterId) ?? null,
    [parentCandidates, parentFilterId],
  );

  /**
   * Sub-issue progress per parent issue, computed from project items only.
   * key = parent issue node id (matches `Issue.issueId` of the parent).
   * Sub-issues outside the project aren't counted — accept that trade-off
   * to avoid a separate GraphQL round trip.
   */
  const subIssueProgress = useMemo(() => {
    const map = new Map<string, { total: number; closed: number }>();
    for (const item of items) {
      const c = item.content;
      if (c.kind !== "Issue" || !c.parent) continue;
      const cur = map.get(c.parent.id) ?? { total: 0, closed: 0 };
      cur.total++;
      if (c.state === "CLOSED") cur.closed++;
      map.set(c.parent.id, cur);
    }
    return map;
  }, [items]);

  const selectedParentProgress = selectedParent
    ? subIssueProgress.get(selectedParent.id) ?? null
    : null;

  const filteredItems = useMemo(() => {
    if (!parentFilterId) return items;
    return items.filter((i) => {
      const c = i.content;
      if (c.kind !== "Issue") return false;
      return c.issueId === parentFilterId || c.parent?.id === parentFilterId;
    });
  }, [items, parentFilterId]);

  const buckets = useMemo(() => {
    if (!groupField)
      return [{ key: NONE_KEY, label: "All", color: "", items: filteredItems }];
    const byKey = new Map<string, ProjectItem[]>();
    for (const item of filteredItems) {
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
  }, [groupField, filteredItems]);

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
      {refreshing && (
        <div className="px-4 py-1 text-[10px] text-[var(--text-secondary)] text-center bg-[var(--bg-secondary)]">
          Refreshing...
        </div>
      )}

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
          {parentFilterId
            ? `${filteredItems.length}/${items.length}`
            : `${items.length} item${items.length === 1 ? "" : "s"}`}
        </span>
        <button
          onClick={() => setShowAddDraft(true)}
          className="text-xs px-2 py-1 rounded bg-[var(--accent)] text-white font-medium active:opacity-80"
        >
          + Draft
        </button>
      </div>

      {/* Parent filter */}
      {parentCandidates.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
          <label className="text-xs text-[var(--text-secondary)]">Parent</label>
          <select
            value={parentFilterId}
            onChange={(e) => setParentFilterId(e.target.value)}
            className="flex-1 min-w-0 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-2 py-1 outline-none"
          >
            <option value="">(all)</option>
            {parentCandidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.repo}#{p.number} {p.title}
              </option>
            ))}
          </select>
          {selectedParentProgress && (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-[var(--text-secondary)] tabular-nums"
              title={`${selectedParentProgress.closed} of ${selectedParentProgress.total} sub-issues closed (project items only)`}
            >
              <span className="inline-block w-10 h-1 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                <span
                  className="block h-full bg-[var(--accent)]"
                  style={{
                    width: `${Math.round(
                      (selectedParentProgress.closed /
                        selectedParentProgress.total) *
                        100,
                    )}%`,
                  }}
                />
              </span>
              {selectedParentProgress.closed}/{selectedParentProgress.total}
            </span>
          )}
          {selectedParent && (
            <button
              onClick={() => setParentFilterId("")}
              className="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] active:opacity-80"
              title="Clear filter"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="px-4 py-2 text-[var(--danger)] text-xs break-words">
          {error}
        </div>
      )}

      {/* Buckets */}
      {buckets.map((bucket) => {
        // Default to collapsed for any bucket the user hasn't explicitly
        // toggled — keeps the initial view compact on mobile.
        const isCollapsed = collapsed[bucket.key] ?? true;
        if (bucket.items.length === 0 && bucket.key === NONE_KEY) return null;
        return (
          <section
            key={bucket.key}
            className="border-b border-[var(--border)]"
          >
            <div className="w-full flex items-center bg-[var(--bg-secondary)]">
              <button
                onClick={() =>
                  setCollapsed((prev) => ({
                    ...prev,
                    [bucket.key]: !isCollapsed,
                  }))
                }
                className="flex-1 min-w-0 flex items-center gap-2 px-4 py-2 text-left active:opacity-80"
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
              {bucket.items.length > 0 && (
                <button
                  onClick={() =>
                    void handleArchiveBucket(
                      bucket.key,
                      bucket.label,
                      bucket.items,
                    )
                  }
                  disabled={archivingKey === bucket.key}
                  className="text-[10px] mr-3 px-2 py-1 rounded text-[var(--text-secondary)] active:opacity-80 disabled:opacity-50"
                  title={`Archive all ${bucket.items.length} item${
                    bucket.items.length === 1 ? "" : "s"
                  } in this column`}
                >
                  {archivingKey === bucket.key ? "Archiving..." : "Archive"}
                </button>
              )}
            </div>
            {!isCollapsed && (
              <div className="divide-y divide-[var(--border)]">
                {bucket.items.map((item) => {
                  const isExpanded = item.id === expandedItemId;
                  return (
                    <div key={item.id}>
                      <ItemRow
                        item={item}
                        fields={project.fields}
                        groupFieldId={groupFieldId}
                        expanded={isExpanded}
                        onToggle={() =>
                          setExpandedItemId((prev) =>
                            prev === item.id ? null : item.id,
                          )
                        }
                        onEditField={(itemId, fieldId) =>
                          setEditingField({ itemId, fieldId })
                        }
                        subIssueProgress={
                          item.content.kind === "Issue"
                            ? subIssueProgress.get(item.content.issueId) ?? null
                            : null
                        }
                      />
                      {isExpanded && (
                        <div className="border-t border-[var(--border)]">
                          <ItemDetailView
                            project={project}
                            item={item}
                            onItemUpdated={handleItemUpdated}
                            embedded
                            onOpenDetail={() =>
                              navigate({
                                page: "item",
                                owner,
                                number,
                                itemId: item.id,
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
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
          fields={project.fields}
          onDone={() => {
            setShowAddDraft(false);
            void reload();
          }}
          onCancel={() => setShowAddDraft(false)}
        />
      )}

      {editingField && (() => {
        const field = project.fields.find(
          (f) => f.id === editingField.fieldId,
        );
        const item = items.find((i) => i.id === editingField.itemId);
        if (!field || !item) return null;
        return (
          <FieldEditor
            projectId={project.id}
            itemId={item.id}
            field={field}
            current={item.fieldValues[field.id]}
            onDone={() => {
              setEditingField(null);
              fetchItem(item.id)
                .then((fresh) => handleItemUpdated(fresh))
                .catch(() => {});
            }}
            onCancel={() => setEditingField(null)}
          />
        );
      })()}
    </div>
  );
}
