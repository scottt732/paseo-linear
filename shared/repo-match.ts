export interface ProjectRef {
  id: string;
  name: string;
  rootPath: string;
}

export interface RepoMatch {
  /** The repo name taken from the issue's label, or null when it has none. */
  repoLabel: string | null;
  /** The project to preselect, or null when the caller must choose. */
  project: ProjectRef | null;
  /** Why — for explaining the choice, and for testing. */
  reason: "remembered" | "unique-label-match" | "last-used" | "ambiguous" | "no-match" | "no-label";
}

export function repoLabelFromIssue(
  labels: ReadonlyArray<{ name: string; group: string | null }>,
  repoLabelGroup: string,
): string | null {
  if (!repoLabelGroup) return null;
  const label = labels.find((candidate) => candidate.group === repoLabelGroup);
  return label ? label.name : null;
}

export function matchProject(options: {
  labels: ReadonlyArray<{ name: string; group: string | null }>;
  repoLabelGroup: string;
  projects: ReadonlyArray<ProjectRef>;
  projectByRepoLabel: Readonly<Record<string, string>>;
  lastProjectId: string;
}): RepoMatch {
  const { labels, repoLabelGroup, projects, projectByRepoLabel, lastProjectId } = options;
  const repoLabel = repoLabelFromIssue(labels, repoLabelGroup);

  if (repoLabel) {
    const rememberedId = projectByRepoLabel[repoLabel];
    if (rememberedId) {
      const remembered = projects.find((project) => project.id === rememberedId);
      if (remembered) return { repoLabel, project: remembered, reason: "remembered" };
    }

    const nameMatches = projects.filter((project) => project.name === repoLabel);
    if (nameMatches.length === 1) {
      return { repoLabel, project: nameMatches[0], reason: "unique-label-match" };
    }
    if (nameMatches.length > 1) {
      return { repoLabel, project: null, reason: "ambiguous" };
    }
  }

  const lastUsed = lastProjectId ? projects.find((project) => project.id === lastProjectId) : undefined;
  if (lastUsed) {
    return { repoLabel, project: lastUsed, reason: "last-used" };
  }

  return { repoLabel, project: null, reason: repoLabel ? "no-match" : "no-label" };
}
