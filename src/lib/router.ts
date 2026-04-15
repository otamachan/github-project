import type { Route } from "../types";

const BASE = "/github-project";

export function routeToPath(route: Route): string {
  switch (route.page) {
    case "list":
      return `${BASE}/`;
    case "project":
      return `${BASE}/${route.owner}/projects/${route.number}`;
    case "item":
      return `${BASE}/${route.owner}/projects/${route.number}/items/${encodeURIComponent(
        route.itemId,
      )}`;
  }
}

export function pathToRoute(path: string): Route {
  let p = path;
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  p = p.replace(/\/+$/, "");
  if (p === "" || p === "/") return { page: "list" };

  const parts = p.split("/").filter(Boolean);
  // [owner, "projects", number] or [owner, "projects", number, "items", itemId]
  if (parts.length >= 3 && parts[1] === "projects") {
    const owner = parts[0]!;
    const number = parseInt(parts[2]!, 10);
    if (!Number.isFinite(number)) return { page: "list" };

    if (parts[3] === "items" && parts.length >= 5) {
      const itemId = decodeURIComponent(parts[4]!);
      return { page: "item", owner, number, itemId };
    }
    return { page: "project", owner, number };
  }
  return { page: "list" };
}
