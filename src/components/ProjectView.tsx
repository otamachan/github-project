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
  updateFieldValue,
} from "../lib/github";
import { selectColor, timeAgo } from "../lib/format";
import ItemRow from "./ItemRow";
import DraftItemForm from "./DraftItemForm";
import { ItemDetailView } from "./ItemDetail";

/**
 * A filter added by tapping a chip on an item row. Filters within the same
 * field OR together; filters across different fields AND together.
 * The parent filter sits alongside but is stored separately because its
 * candidates are added through a select, not by tapping a row chip.
 */
type ChipFilter =
  | { kind: "single_select"; fieldId: string; optionId: string }
  | { kind: "iteration"; fieldId: string; iterationId: string };

function chipFilterKey(f: ChipFilter): string {
  return f.kind === "single_select"
    ? `ss:${f.fieldId}:${f.optionId}`
    : `it:${f.fieldId}:${f.iterationId}`;
}

interface ResolvedChip {
  filter: ChipFilter;
  fieldName: string;
  valueName: string;
  color: string;
}

function resolveChipFilter(
  filter: ChipFilter,
  fields: FieldDef[],
): ResolvedChip | null {
  const field = fields.find((f) => f.id === filter.fieldId);
  if (!field) return null;
  if (filter.kind === "single_select") {
    const opt = field.options?.find((o) => o.id === filter.optionId);
    if (!opt) return null;
    return {
      filter,
      fieldName: field.name,
      valueName: opt.name,
      color: selectColor(opt.color),
    };
  }
  const iter = [
    ...(field.iterations ?? []),
    ...(field.completedIterations ?? []),
  ].find((it) => it.id === filter.iterationId);
  if (!iter) return null;
  return {
    filter,
    fieldName: field.name,
    valueName: iter.title,
    color: selectColor("BLUE"),
  };
}

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

/**
 * Detects the suspend→resume transition wired into the project's "状態" field.
 * The background poller advances items whose state is the resume-target option
 * back into a running session; we just need a one-tap path that flips the
 * status from suspended → resume-pending. Returns null when either side of
 * the pair is missing — the Resume button is then suppressed entirely.
 */
interface ResumeContext {
  fieldId: string;
  suspendedOptionId: string;
  targetOptionId: string;
}

function detectResumeContext(fields: FieldDef[]): ResumeContext | null {
  const field = fields.find(
    (f) => f.kind === "SINGLE_SELECT" && f.name === "状態",
  );
  if (!field || !field.options) return null;
  const suspended = field.options.find((o) =>
    o.name.toLowerCase().includes("suspend"),
  );
  const target = field.options.find((o) => o.name.includes("復帰"));
  if (!suspended || !target) return null;
  return {
    fieldId: field.id,
    suspendedOptionId: suspended.id,
    targetOptionId: target.id,
  };
}

/**
 * Stop = move the item into a "closed/done" column. Searches every
 * single-select field for an option whose name contains `閉じ`, and uses the
 * first match (Status comes first in the field list, so this lands on
 * Status."閉じて" in practice). Returns null when no such option exists.
 */
interface StopContext {
  fieldId: string;
  targetOptionId: string;
}

function detectStopContext(fields: FieldDef[]): StopContext | null {
  for (const f of fields) {
    if (f.kind !== "SINGLE_SELECT" || !f.options) continue;
    const target = f.options.find((o) => o.name.includes("閉じ"));
    if (target) return { fieldId: f.id, targetOptionId: target.id };
  }
  return null;
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
  const [chipFilters, setChipFilters] = useState<ChipFilter[]>([]);
  const [showAddDraft, setShowAddDraft] = useState(false);
  const [archivingKey, setArchivingKey] = useState<string | null>(null);
  const [resumingItemId, setResumingItemId] = useState<string | null>(null);
  const [stoppingItemId, setStoppingItemId] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

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

  const toggleChipFilter = useCallback((filter: ChipFilter) => {
    setChipFilters((prev) => {
      const key = chipFilterKey(filter);
      const i = prev.findIndex((f) => chipFilterKey(f) === key);
      if (i >= 0) {
        return prev.filter((_, j) => j !== i);
      }
      return [...prev, filter];
    });
  }, []);

  const isChipActive = useCallback(
    (fieldId: string, valueId: string): boolean =>
      chipFilters.some(
        (f) =>
          f.fieldId === fieldId &&
          ((f.kind === "single_select" && f.optionId === valueId) ||
            (f.kind === "iteration" && f.iterationId === valueId)),
      ),
    [chipFilters],
  );

  const clearAllFilters = useCallback(() => {
    setParentFilterId("");
    setChipFilters([]);
  }, []);

  /**
   * Apply parent filter and chip filters together.
   * - Within a single field: OR across that field's selected values.
   * - Across different fields: AND.
   * - Parent filter ANDs with everything.
   */
  const filteredItems = useMemo(() => {
    if (!parentFilterId && chipFilters.length === 0) return items;

    // Group chip filters by fieldId so same-field filters OR within the group.
    const byField = new Map<string, ChipFilter[]>();
    for (const f of chipFilters) {
      const arr = byField.get(f.fieldId) ?? [];
      arr.push(f);
      byField.set(f.fieldId, arr);
    }

    return items.filter((i) => {
      if (parentFilterId) {
        const c = i.content;
        if (c.kind !== "Issue") return false;
        if (c.issueId !== parentFilterId && c.parent?.id !== parentFilterId)
          return false;
      }
      for (const [fid, group] of byField) {
        const v = i.fieldValues[fid];
        if (!v) return false;
        const ok = group.some((f) => {
          if (f.kind === "single_select" && v.kind === "SINGLE_SELECT")
            return v.optionId === f.optionId;
          if (f.kind === "iteration" && v.kind === "ITERATION")
            return v.iterationId === f.iterationId;
          return false;
        });
        if (!ok) return false;
      }
      return true;
    });
  }, [items, parentFilterId, chipFilters]);

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

  const resolvedChips = useMemo<ResolvedChip[]>(
    () =>
      chipFilters
        .map((f) => resolveChipFilter(f, project?.fields ?? []))
        .filter((c): c is ResolvedChip => c !== null),
    [chipFilters, project],
  );

  const hasAnyFilter = !!parentFilterId || resolvedChips.length > 0;

  const resumeContext = useMemo<ResumeContext | null>(
    () => (project ? detectResumeContext(project.fields) : null),
    [project],
  );

  const stopContext = useMemo<StopContext | null>(
    () => (project ? detectStopContext(project.fields) : null),
    [project],
  );

  /**
   * Flip the "状態" field from suspended → resume-target. The background
   * poller picks the change up and actually restores the session; we just
   * optimistically update the local item so the chip reflects it instantly.
   */
  const handleResume = useCallback(
    async (itemId: string) => {
      if (!project || !resumeContext) return;
      setResumingItemId(itemId);
      setError("");
      try {
        await updateFieldValue(
          project.id,
          itemId,
          resumeContext.fieldId,
          { type: "single_select", optionId: resumeContext.targetOptionId },
        );
        const targetOpt = project.fields
          .find((f) => f.id === resumeContext.fieldId)
          ?.options?.find((o) => o.id === resumeContext.targetOptionId);
        setItems((prev) => {
          const next = prev.map((it) => {
            if (it.id !== itemId || !targetOpt) return it;
            return {
              ...it,
              fieldValues: {
                ...it.fieldValues,
                [resumeContext.fieldId]: {
                  kind: "SINGLE_SELECT" as const,
                  optionId: targetOpt.id,
                  name: targetOpt.name,
                  color: targetOpt.color,
                },
              },
            };
          });
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
        setResumingItemId(null);
      }
    },
    [project, resumeContext, owner, number, nextCursor],
  );

  /**
   * Move the item into the "閉じて" column (Status field). Optimistically
   * updates so the chip flips instantly; the row will move groups on next
   * render since groupKeyFor reads the updated value.
   */
  const handleStop = useCallback(
    async (itemId: string) => {
      if (!project || !stopContext) return;
      setStoppingItemId(itemId);
      setError("");
      try {
        await updateFieldValue(
          project.id,
          itemId,
          stopContext.fieldId,
          { type: "single_select", optionId: stopContext.targetOptionId },
        );
        const targetOpt = project.fields
          .find((f) => f.id === stopContext.fieldId)
          ?.options?.find((o) => o.id === stopContext.targetOptionId);
        setItems((prev) => {
          const next = prev.map((it) => {
            if (it.id !== itemId || !targetOpt) return it;
            return {
              ...it,
              fieldValues: {
                ...it.fieldValues,
                [stopContext.fieldId]: {
                  kind: "SINGLE_SELECT" as const,
                  optionId: targetOpt.id,
                  name: targetOpt.name,
                  color: targetOpt.color,
                },
              },
            };
          });
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
        setStoppingItemId(null);
      }
    },
    [project, stopContext, owner, number, nextCursor],
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
          {hasAnyFilter
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

      {/* Active filters bar — appears when any filter is set, lists every
          active filter as a removable chip plus a Clear all button. */}
      {hasAnyFilter && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-[var(--border)]">
          <span className="text-xs text-[var(--text-secondary)] mr-1">
            Filters
          </span>
          {selectedParent && (
            <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-[10px] bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]">
              <span className="text-[var(--text-secondary)]">Parent:</span>
              <span className="truncate max-w-[12em]">
                {selectedParent.repo}#{selectedParent.number}
              </span>
              <button
                onClick={() => setParentFilterId("")}
                className="text-[var(--text-secondary)] active:opacity-80 px-1"
                title="Remove filter"
              >
                ✕
              </button>
            </span>
          )}
          {resolvedChips.map((c) => (
            <span
              key={chipFilterKey(c.filter)}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-[10px]"
              style={{
                backgroundColor: `${c.color}18`,
                color: c.color,
                border: `1px solid ${c.color}44`,
              }}
            >
              <span className="opacity-70">{c.fieldName}:</span>
              <span>{c.valueName}</span>
              <button
                onClick={() => toggleChipFilter(c.filter)}
                className="opacity-70 active:opacity-100 px-1"
                title="Remove filter"
              >
                ✕
              </button>
            </span>
          ))}
          <button
            onClick={clearAllFilters}
            className="ml-auto text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] active:opacity-80"
          >
            Clear all
          </button>
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
                  const resumeField = resumeContext
                    ? item.fieldValues[resumeContext.fieldId]
                    : null;
                  const isResumable =
                    !!resumeContext &&
                    resumeField?.kind === "SINGLE_SELECT" &&
                    resumeField.optionId === resumeContext.suspendedOptionId;
                  const stopField = stopContext
                    ? item.fieldValues[stopContext.fieldId]
                    : null;
                  const alreadyClosed =
                    stopField?.kind === "SINGLE_SELECT" &&
                    stopField.optionId === stopContext?.targetOptionId;
                  const isStoppable = !!stopContext && !alreadyClosed;
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
                        onToggleFilter={toggleChipFilter}
                        isChipActive={isChipActive}
                        resumable={isResumable}
                        resuming={resumingItemId === item.id}
                        onResume={() => void handleResume(item.id)}
                        stoppable={isStoppable}
                        stopping={stoppingItemId === item.id}
                        onStop={() => void handleStop(item.id)}
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

    </div>
  );
}
