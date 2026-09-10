const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

export const DEFAULT_PROMPT_TEMPLATE = [
  "Work on Linear issue {{identifier}}: {{title}}",
  "{{url}}",
  "",
  "{{description}}",
].join("\n");

export function relativeTime(iso: string, now: Date): string {
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (elapsed >= YEAR) return iso.slice(0, 10);
  if (elapsed >= DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  if (elapsed >= HOUR) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed >= MINUTE) return `${Math.floor(elapsed / MINUTE)}m ago`;
  return "just now";
}

export function renderPrompt(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

export function clampText(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return `${lines.slice(0, maxLines).join("\n")}…`;
}

const BRANCH_IDENTIFIER = /(?:^|[/_-])([a-z][a-z0-9]*-\d+)(?:$|[/_-])/i;

export function identifierFromBranch(branch: string): string | null {
  const match = BRANCH_IDENTIFIER.exec(branch);
  return match ? match[1].toUpperCase() : null;
}
