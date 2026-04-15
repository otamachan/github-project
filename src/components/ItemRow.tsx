import type { ProjectItem, Route } from "../types";
import { routeToPath } from "../lib/router";

export default function ItemRow({
  item,
  owner,
  number,
  navigate,
}: {
  item: ProjectItem;
  owner: string;
  number: number;
  navigate: (r: Route) => void;
}) {
  const route: Route = {
    page: "item",
    owner,
    number,
    itemId: item.id,
  };

  const c = item.content;
  let title = "(empty)";
  let badge = "";
  let subtitle = "";

  switch (c.kind) {
    case "DraftIssue":
      title = c.title || "(untitled draft)";
      badge = "Draft";
      break;
    case "Issue":
      title = c.title;
      badge = `${c.state}`;
      subtitle = `${c.repo}#${c.number}`;
      break;
    case "PullRequest":
      title = c.title;
      badge = c.isDraft ? "PR • Draft" : `PR • ${c.state}`;
      subtitle = `${c.repo}#${c.number}`;
      break;
    case "Redacted":
      title = "(redacted)";
      break;
  }

  const assigneesValue = Object.values(item.fieldValues).find(
    (v) => v.kind === "ASSIGNEES",
  );
  const assignees =
    assigneesValue && assigneesValue.kind === "ASSIGNEES"
      ? assigneesValue.users
      : [];

  return (
    <a
      href={routeToPath(route)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(route);
      }}
      className="block px-4 py-3 active:bg-[var(--bg-tertiary)] transition-colors text-inherit no-underline"
    >
      <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] mb-1">
        {subtitle && <span className="truncate">{subtitle}</span>}
        <span className="ml-auto">{badge}</span>
      </div>
      <div className="text-sm leading-snug break-words">{title}</div>
      {assignees.length > 0 && (
        <div className="flex items-center gap-1 mt-2">
          {assignees.slice(0, 5).map((u) => (
            <img
              key={u.login}
              src={u.avatarUrl}
              alt={u.login}
              className="w-5 h-5 rounded-full"
            />
          ))}
          {assignees.length > 5 && (
            <span className="text-[10px] text-[var(--text-secondary)] ml-1">
              +{assignees.length - 5}
            </span>
          )}
        </div>
      )}
    </a>
  );
}
