import type { FieldDef, ProjectItem, ItemContent } from "../types";
import { selectColor } from "../lib/format";

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
  fields,
  groupFieldId,
  expanded,
  onToggle,
}: {
  item: ProjectItem;
  fields: FieldDef[];
  groupFieldId: string | null;
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

  // Collect single-select / iteration field values to show as chips,
  // excluding the field used for grouping (already visible as section header).
  const fieldChips: { name: string; value: string; color: string }[] = [];
  for (const f of fields) {
    if (f.id === groupFieldId) continue;
    if (f.kind !== "SINGLE_SELECT" && f.kind !== "ITERATION") continue;
    const v = item.fieldValues[f.id];
    if (!v) continue;
    if (v.kind === "SINGLE_SELECT") {
      fieldChips.push({
        name: f.name,
        value: v.name,
        color: selectColor(v.color),
      });
    } else if (v.kind === "ITERATION") {
      fieldChips.push({
        name: f.name,
        value: v.title,
        color: selectColor("BLUE"),
      });
    }
  }

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
      {(fieldChips.length > 0 || assignees.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pl-4">
          {fieldChips.map((chip) => (
            <span
              key={chip.name}
              className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px]"
              style={{
                backgroundColor: `${chip.color}18`,
                color: chip.color,
                border: `1px solid ${chip.color}33`,
              }}
              title={chip.name}
            >
              {chip.value}
            </span>
          ))}
          {assignees.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              {assignees.slice(0, 5).map((u) => (
                <img
                  key={u.login}
                  src={u.avatarUrl}
                  alt={u.login}
                  className="w-4 h-4 rounded-full"
                />
              ))}
              {assignees.length > 5 && (
                <span className="text-[10px] text-[var(--text-secondary)] ml-0.5">
                  +{assignees.length - 5}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
