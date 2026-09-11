import type { RepoMatch } from "./repo-match";

/**
 * A short, quiet explanation of where a repository preselection came from,
 * for display under the repo picker. An automatic choice about where code
 * gets written should say why it chose — this is the pure mapping from a
 * `RepoMatch` reason to that copy. `null` means render nothing: either there
 * was no label to go on ("no-label"), so there is nothing to explain.
 */
export function explainRepoMatch(match: RepoMatch): string | null {
  const label = match.repoLabel ?? "";
  switch (match.reason) {
    case "remembered":
      return `Last used for ${label}`;
    case "unique-label-match":
      return `Matched ${label}`;
    case "ambiguous":
      return `Several projects named ${label} — choose one`;
    case "last-used":
      return "Last used";
    case "no-match":
      return `No project named ${label}`;
    case "no-label":
      return null;
  }
}
