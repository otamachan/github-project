import { useEffect, useState } from "react";
import type { Project, Route } from "../types";
import { fetchMyProjects } from "../lib/github";
import { routeToPath } from "../lib/router";
import { timeAgo } from "../lib/format";

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

export default function ProjectList({
  navigate,
}: {
  navigate: (r: Route) => void;
}) {
  const [projects, setProjects] = useState<Project[]>(() => loadCache() ?? []);
  const [loading, setLoading] = useState(() => loadCache() === null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = loadCache();
    if (cached) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    fetchMyProjects()
      .then((list) => {
        if (cancelled) return;
        setProjects(list);
        saveCache(list);
        setLoading(false);
        setRefreshing(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

      {refreshing && (
        <div className="px-4 py-1 text-[10px] text-[var(--text-secondary)] text-center bg-[var(--bg-secondary)]">
          Refreshing...
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
        <div className="flex items-center justify-center h-64 text-[var(--text-secondary)]">
          No projects
        </div>
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
