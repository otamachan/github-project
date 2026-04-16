import type { ProjectItem, ItemContent } from "../types";

interface TypeBadge {
  label: string;
  color: string;
}

function typeBadge(c: ItemContent): TypeBadge {
  switch (c.kind) {
    case "DraftIssue":
      return { label: "Draft", color: "#8b949e" };
    case "Issue":
      return c.state === "OPEN"
        ? { label: "Issue", color: "#3fb950" }
        : { label: "Issue", color: "#a371f7" };
    case "PullRequest":
      if (c.isDraft) return { label: "PR", color: "#8b949e" };
      if (c.state === "MERGED") return { label: "PR", color: "#a371f7" };
      if (c.state === "CLOSED") return { label: "PR", color: "#f85149" };
      return { label: "PR", color: "#3fb950" };
    default:
      return { label: "?", color: "#8b949e" };
  }
}

export default function ItemRow({
  item,
  expanded,
  onToggle,
}: {
  item: ProjectItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const c = item.content;
  const badge = typeBadge(c);

  let title = "(empty)";
  let subtitle = "";

  switch (c.kind) {
    case "DraftIssue":
      title = c.title || "(untitled draft)";
      break;
    case "Issue":
      title = c.title;
      subtitle = `${c.repo}#${c.number}`;
      break;
    case "PullRequest":
      title = c.title;
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
    <button
      onClick={onToggle}
      className={`w-full block text-left px-4 py-3 active:bg-[var(--bg-tertiary)] transition-colors ${
        expanded ? "bg-[var(--bg-tertiary)]" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] mb-1">
        <span
          className={`transition-transform inline-block text-[10px] ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
        <span
          className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-medium"
          style={{
            backgroundColor: `${badge.color}22`,
            color: badge.color,
            border: `1px solid ${badge.color}44`,
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: badge.color }}
          />
          {badge.label}
        </span>
        {subtitle && <span className="truncate">{subtitle}</span>}
      </div>
      <div className="text-sm leading-snug break-words pl-4">{title}</div>
      {assignees.length > 0 && (
        <div className="flex items-center gap-1 mt-2 pl-4">
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
    </button>
  );
}
