import type { ProjectItem } from "../types";

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
      badge = c.state;
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
    <button
      onClick={onToggle}
      className={`w-full block text-left px-4 py-3 active:bg-[var(--bg-tertiary)] transition-colors ${
        expanded ? "bg-[var(--bg-tertiary)]" : ""
      }`}
    >
      <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] mb-1">
        <span
          className={`transition-transform inline-block text-[10px] ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
        {subtitle && <span className="truncate">{subtitle}</span>}
        <span className="ml-auto">{badge}</span>
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
