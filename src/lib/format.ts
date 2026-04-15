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
