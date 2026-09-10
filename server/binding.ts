import { identifierFromBranch } from "../shared/format";

export const ISSUE_LABEL = "linear.issue";
export const ISSUE_ID_LABEL = "linear.issueId";
export const ISSUE_URL_LABEL = "linear.url";

export interface Binding {
  identifier: string;
  issueId: string | null;
  url: string | null;
}

export function issueLabels(issue: {
  identifier: string;
  id: string;
  url: string;
}): Record<string, string> {
  return {
    [ISSUE_LABEL]: issue.identifier,
    [ISSUE_ID_LABEL]: issue.id,
    [ISSUE_URL_LABEL]: issue.url,
  };
}

export function bindingFromLabels(labels: Record<string, string> | undefined): Binding | null {
  const identifier = labels?.[ISSUE_LABEL];
  if (!identifier) return null;
  return {
    identifier,
    issueId: labels?.[ISSUE_ID_LABEL] ?? null,
    url: labels?.[ISSUE_URL_LABEL] ?? null,
  };
}

export function bindingFromBranch(branch: string | null | undefined): Binding | null {
  if (!branch) return null;
  const identifier = identifierFromBranch(branch);
  return identifier ? { identifier, issueId: null, url: null } : null;
}

export function resolveBinding(
  labels: Record<string, string> | undefined,
  branch: string | null | undefined,
): Binding | null {
  return bindingFromLabels(labels) ?? bindingFromBranch(branch);
}
