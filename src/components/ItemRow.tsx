import type { FieldDef, ProjectItem, ItemContent } from "../types";
import { selectColor, shortDate } from "../lib/format";

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

export interface SubIssueProgress {
  total: number;
  closed: number;
}

export type ChipFilterToggle =
  | { kind: "single_select"; fieldId: string; optionId: string }
  | { kind: "iteration"; fieldId: string; iterationId: string };

export default function ItemRow({
  item,
  fields,
  groupFieldId,
  expanded,
  onToggle,
  onToggleFilter,
  isChipActive,
  resumable,
  resuming,
  onResume,
  stoppable,
  stopping,
  onStop,
  subIssueProgress,
}: {
  item: ProjectItem;
  fields: FieldDef[];
  groupFieldId: string | null;
  expanded: boolean;
  onToggle: () => void;
  /** Tap a chip to add/remove a filter for that value. Omitted = chips are display-only. */
  onToggleFilter?: (filter: ChipFilterToggle) => void;
  /** Lookup whether a chip's (fieldId, valueId) is currently filtering. */
  isChipActive?: (fieldId: string, valueId: string) => boolean;
  /** True when the row's 状態 field is in a "suspend" option and resume is wired. */
  resumable?: boolean;
  resuming?: boolean;
  onResume?: () => void;
  /** True when the row can be moved to the "閉じて" column (and isn't already). */
  stoppable?: boolean;
  stopping?: boolean;
  onStop?: () => void;
  /** Sub-issue progress derived from project items; null when this item has none. */
  subIssueProgress?: SubIssueProgress | null;
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

  // Collect single-select / iteration / date field values to show as chips,
  // excluding the field used for grouping (already visible as section header).
  // The chip carries the info needed to toggle a filter on the row's value;
  // DATE chips are non-filterable (treated as display-only).
  type ChipKind = "single_select" | "iteration" | "date";
  const fieldChips: {
    fieldId: string;
    name: string;
    value: string;
    color: string;
    chipKind: ChipKind;
    /** SINGLE_SELECT.optionId or ITERATION.iterationId; "" for date */
    valueId: string;
  }[] = [];
  for (const f of fields) {
    if (f.id === groupFieldId) continue;
    if (
      f.kind !== "SINGLE_SELECT" &&
      f.kind !== "ITERATION" &&
      f.kind !== "DATE"
    )
      continue;
    const v = item.fieldValues[f.id];
    if (!v) continue;
    if (v.kind === "SINGLE_SELECT") {
      fieldChips.push({
        fieldId: f.id,
        name: f.name,
        value: v.name,
        color: selectColor(v.color),
        chipKind: "single_select",
        valueId: v.optionId,
      });
    } else if (v.kind === "ITERATION") {
      fieldChips.push({
        fieldId: f.id,
        name: f.name,
        value: v.title,
        color: selectColor("BLUE"),
        chipKind: "iteration",
        valueId: v.iterationId,
      });
    } else if (v.kind === "DATE" && v.date) {
      fieldChips.push({
        fieldId: f.id,
        name: f.name,
        value: shortDate(v.date),
        color: selectColor("GRAY"),
        chipKind: "date",
        valueId: "",
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
        {((subIssueProgress && subIssueProgress.total > 0) ||
          (resumable && onResume) ||
          (stoppable && onStop)) && (
          <div className="ml-auto flex items-center gap-2 pl-2">
            {subIssueProgress && subIssueProgress.total > 0 && (
              <span
                className="inline-flex items-center gap-1"
                title={`${subIssueProgress.closed} of ${subIssueProgress.total} sub-issues closed (project items only)`}
              >
                <span className="inline-block w-10 h-1 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                  <span
                    className="block h-full bg-[var(--accent)]"
                    style={{
                      width: `${Math.round(
                        (subIssueProgress.closed / subIssueProgress.total) *
                          100,
                      )}%`,
                    }}
                  />
                </span>
                <span className="text-[10px] tabular-nums">
                  {subIssueProgress.closed}/{subIssueProgress.total}
                </span>
              </span>
            )}
            {resumable && onResume && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!resuming) onResume();
                }}
                disabled={resuming}
                className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent)] text-white active:opacity-80 disabled:opacity-50"
                title="Set 状態 to resume-pending"
              >
                {resuming ? "..." : "▶ Resume"}
              </button>
            )}
            {stoppable && onStop && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!stopping) onStop();
                }}
                disabled={stopping}
                className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] active:opacity-80 disabled:opacity-50"
                title="Move to 閉じて"
              >
                {stopping ? "..." : "■ Stop"}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="text-sm leading-snug break-words pl-4">{title}</div>
      {(fieldChips.length > 0 || assignees.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pl-4">
          {fieldChips.map((chip) => {
            const filterable =
              chip.chipKind !== "date" && !!onToggleFilter;
            const active =
              filterable &&
              !!isChipActive?.(chip.fieldId, chip.valueId);
            return (
              <span
                key={chip.name}
                role={filterable ? "button" : undefined}
                onClick={
                  filterable
                    ? (e) => {
                        e.stopPropagation();
                        if (chip.chipKind === "single_select") {
                          onToggleFilter!({
                            kind: "single_select",
                            fieldId: chip.fieldId,
                            optionId: chip.valueId,
                          });
                        } else if (chip.chipKind === "iteration") {
                          onToggleFilter!({
                            kind: "iteration",
                            fieldId: chip.fieldId,
                            iterationId: chip.valueId,
                          });
                        }
                      }
                    : undefined
                }
                className={`inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] ${
                  filterable ? "active:opacity-60" : ""
                }`}
                style={{
                  backgroundColor: `${chip.color}${active ? "44" : "18"}`,
                  color: chip.color,
                  border: `${active ? "2px" : "1px"} solid ${chip.color}${
                    active ? "99" : "33"
                  }`,
                }}
                title={
                  filterable
                    ? `${chip.name} — tap to ${
                        active ? "remove" : "add"
                      } filter`
                    : chip.name
                }
              >
                {chip.value}
              </span>
            );
          })}
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
