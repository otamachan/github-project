import { useCallback, useEffect, useState } from "react";
import type { Route } from "./types";
import { clearToken, getToken } from "./lib/github";
import { pathToRoute, routeToPath } from "./lib/router";
import { useTheme, type Theme } from "./hooks/useTheme";
import TokenInput from "./components/TokenInput";
import ProjectList from "./components/ProjectList";
import ProjectView from "./components/ProjectView";
import ItemDetail from "./components/ItemDetail";

const THEME_LABELS: Record<Theme, string> = {
  dark: "Dark",
  light: "Light",
  system: "Auto",
};
const THEME_ORDER: Theme[] = ["system", "dark", "light"];

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [route, setRouteState] = useState<Route>(() =>
    pathToRoute(window.location.pathname),
  );
  const { theme, setTheme } = useTheme();

  const setRoute = useCallback((r: Route) => {
    setRouteState(r);
    const path = routeToPath(r);
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  }, []);

  useEffect(() => {
    const handlePop = () => {
      setRouteState(pathToRoute(window.location.pathname));
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  const handleBack = () => {
    if (route.page === "item") {
      setRoute({ page: "project", owner: route.owner, number: route.number });
    } else if (route.page === "project") {
      setRoute({ page: "list" });
    }
  };

  const handleLogout = () => {
    clearToken();
    setAuthed(false);
    setRoute({ page: "list" });
  };

  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]!);
  };

  if (!authed) {
    return <TokenInput onAuth={() => setAuthed(true)} />;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center h-[44px] px-3 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
        {route.page !== "list" ? (
          <button
            onClick={handleBack}
            className="text-[var(--accent)] text-sm active:opacity-80 mr-2"
          >
            ← Back
          </button>
        ) : (
          <span className="font-bold text-sm">GitHub Project</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={cycleTheme}
            className="text-xs text-[var(--text-secondary)] active:opacity-80 px-2 py-1 rounded bg-[var(--bg-tertiary)]"
          >
            {THEME_LABELS[theme]}
          </button>
          <button
            onClick={handleLogout}
            className="text-xs text-[var(--text-secondary)] active:opacity-80"
          >
            Log out
          </button>
        </div>
      </header>

      {route.page === "list" && <ProjectList navigate={setRoute} />}
      {route.page === "project" && (
        <ProjectView
          owner={route.owner}
          number={route.number}
          navigate={setRoute}
        />
      )}
      {route.page === "item" && (
        <ItemDetail
          owner={route.owner}
          number={route.number}
          itemId={route.itemId}
        />
      )}
    </div>
  );
}
