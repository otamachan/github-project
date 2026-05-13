import { useCallback, useEffect, useState } from "react";
import type { Project, Route } from "../types";
import { fetchMyProjects, type ProjectsResult } from "../lib/github";
import { routeToPath } from "../lib/router";
import { timeAgo } from "../lib/format";
import { usePullToRefresh } from "../hooks/usePullToRefresh";

const CACHE_KEY = "github-project-list-cache";

function loadCache(): Project[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Project[];
  } catch {
    return null;
  }
}

function saveCache(projects: Project[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(projects));
  } catch {
    // ignore quota
  }
}

function EmptyDiagnostics({ meta }: { meta: ProjectsResult | null }) {
  if (!meta) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-secondary)]">
        No projects
      </div>
    );
  }
  const orgsWith = meta.orgs.filter((o) => o.count > 0);
  return (
    <div className="p-6 text-sm text-[var(--text-secondary)] space-y-3">
      <p className="font-medium text-[var(--text-primary)]">No projects found</p>
      <div className="space-y-1 mono text-xs">
        <div>viewer: {meta.viewerLogin}</div>
        <div>own projects: {meta.viewerOwnCount}</div>
        <div>
          orgs visible: {meta.orgs.length}
          {meta.orgs.length > 0 &&
            ` (${meta.orgs.map((o) => o.login).join(", ")})`}
        </div>
        <div>orgs with projects: {orgsWith.length}</div>
      </div>
      <ul className="text-xs list-disc pl-5 space-y-1">
        {meta.orgFetchError && (
          <li className="text-[var(--danger)] break-words">
            Org query failed — add <code>read:org</code> to your PAT to see
            org-owned projects. Details: {meta.orgFetchError}
          </li>
        )}
        {!meta.orgFetchError && meta.orgs.length === 0 && (
          <li>
            No orgs visible to this token. Fine-grained PATs also need org
            membership read permission.
          </li>
        )}
        {!meta.orgFetchError &&
          meta.orgs.length > 0 &&
          orgsWith.length === 0 && (
            <li>
              Orgs are visible but none expose Projects V2 to this token —
              check per-org PAT access policy (some orgs block tokens unless
              SSO-enabled or fine-grained PAT is explicitly approved).
            </li>
          )}
        <li>
          You can always open a known project directly:{" "}
          <code>/&lt;owner&gt;/projects/&lt;number&gt;</code>.
        </li>
      </ul>
    </div>
  );
}

export default function ProjectList({
  navigate,
}: {
  navigate: (r: Route) => void;
}) {
  const [projects, setProjects] = useState<Project[]>(() => loadCache() ?? []);
  const [meta, setMeta] = useState<ProjectsResult | null>(null);
  const [loading, setLoading] = useState(() => loadCache() === null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const result = await fetchMyProjects();
      setProjects(result.projects);
      setMeta(result);
      saveCache(result.projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (loadCache() === null) setLoading(true);
    void reload();
  }, [reload]);

  const { armed: pullArmed } = usePullToRefresh({
    onRefresh: reload,
    enabled: !loading && !refreshing,
  });

  const visible = showClosed
    ? projects
    : projects.filter((p) => !p.closed);

  return (
    <div>
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => setShowClosed(false)}
          className={`flex-1 py-2.5 text-sm text-center ${
            !showClosed
              ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
              : "text-[var(--text-secondary)]"
          }`}
        >
          Open
        </button>
        <button
          onClick={() => setShowClosed(true)}
          className={`flex-1 py-2.5 text-sm text-center ${
            showClosed
              ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
              : "text-[var(--text-secondary)]"
          }`}
        >
          All
        </button>
      </div>

      {(refreshing || pullArmed) && (
        <div className="px-4 py-1 text-[10px] text-[var(--text-secondary)] text-center bg-[var(--bg-secondary)]">
          {refreshing ? "Refreshing..." : "Release to refresh"}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-[var(--text-secondary)]">
          Loading...
        </div>
      ) : error ? (
        <div className="p-4 text-[var(--danger)] text-sm break-words">
          Error: {error}
        </div>
      ) : visible.length === 0 ? (
        <EmptyDiagnostics meta={meta} />
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {visible.map((p) => {
            const route: Route = {
              page: "project",
              owner: p.owner.login,
              number: p.number,
            };
            return (
              <a
                key={p.id}
                href={routeToPath(route)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)
                    return;
                  e.preventDefault();
                  navigate(route);
                }}
                className="block px-4 py-3 active:bg-[var(--bg-tertiary)] transition-colors text-inherit no-underline"
              >
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-1">
                  <span>
                    {p.owner.login}/#{p.number}
                  </span>
                  {p.closed && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)]">
                      Closed
                    </span>
                  )}
                  <span className="ml-auto">{timeAgo(p.updatedAt)}</span>
                </div>
                <div className="text-sm font-medium leading-snug">{p.title}</div>
                {p.shortDescription && (
                  <div className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                    {p.shortDescription}
                  </div>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
