export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

/**
 * Map GitHub Projects V2 single-select color tokens to hex.
 * Source: GitHub's ProjectV2SingleSelectFieldOptionColor enum.
 */
const COLOR_MAP: Record<string, string> = {
  GRAY: "#8b949e",
  BLUE: "#58a6ff",
  GREEN: "#3fb950",
  YELLOW: "#d29922",
  ORANGE: "#db6d28",
  RED: "#f85149",
  PINK: "#ff6bcb",
  PURPLE: "#a371f7",
};

export function selectColor(token: string): string {
  return COLOR_MAP[token] ?? COLOR_MAP.GRAY!;
}

export function iterationDates(startDate: string, duration: number): string {
  if (!startDate) return "";
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + duration - 1);
  const f = (d: Date) =>
    `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `${f(start)}–${f(end)}`;
}

/** Compact "M/D" — DATE field chips on item rows. */
export function shortDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/**
 * Relative description of a DATE field value vs. today, in UTC days.
 * Examples: "today", "in 3d", "5d ago", "in 2mo", "1y ago".
 * Empty string for missing or unparseable input.
 */
export function dateRelative(dateStr: string): string {
  if (!dateStr) return "";
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return "";
  const now = new Date();
  const toUTC = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.round((toUTC(target) - toUTC(now)) / 86_400_000);
  if (diffDays === 0) return "today";
  const abs = Math.abs(diffDays);
  const future = diffDays > 0;
  let body: string;
  if (abs < 30) body = `${abs}d`;
  else if (abs < 365) body = `${Math.floor(abs / 30)}mo`;
  else body = `${Math.floor(abs / 365)}y`;
  return future ? `in ${body}` : `${body} ago`;
}
