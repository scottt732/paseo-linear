import { z } from "zod";
import { type Issue, IssueSchema } from "../../shared/issue";
import type { LinearTransport } from "./client";

export const ISSUE_FIELDS = `
  id identifier title description url branchName priorityLabel priority estimate dueDate createdAt updatedAt
  state { id name type color position }
  team { id key name }
  assignee { id name }
  project { id name icon color }
  parent { identifier title parent { identifier title parent { identifier title } } }
  labels { nodes { name color parent { name } } }
  attachments { nodes { url } }
`;

const ParentSchema: z.ZodType<{ identifier: string; title: string; parent?: unknown } | null> =
  z.lazy(() =>
    z
      .object({ identifier: z.string(), title: z.string(), parent: ParentSchema.optional() })
      .nullable(),
  );

const RawIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  branchName: z.string(),
  priorityLabel: z.string(),
  priority: z.number(),
  estimate: z.number().nullable(),
  dueDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  state: z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    color: z.string(),
    position: z.number(),
  }),
  team: z.object({ id: z.string(), key: z.string(), name: z.string() }),
  assignee: z.object({ id: z.string(), name: z.string() }).nullable(),
  project: z
    .object({
      id: z.string(),
      name: z.string(),
      icon: z.string().nullable(),
      color: z.string().nullable(),
    })
    .nullable(),
  parent: ParentSchema.optional(),
  labels: z.object({
    nodes: z.array(
      z.object({ name: z.string(), color: z.string(), parent: z.object({ name: z.string() }).nullable() }),
    ),
  }),
  attachments: z.object({ nodes: z.array(z.object({ url: z.string() })) }),
});

const SingleIssueSchema = z.object({ issue: RawIssueSchema.nullable() });
const IssueListSchema = z.object({ issues: z.object({ nodes: z.array(RawIssueSchema) }) });
const ViewerSchema = z.object({ viewer: z.object({ id: z.string(), name: z.string() }) });
const StatesSchema = z.object({
  team: z.object({
    states: z.object({
      nodes: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          type: z.string(),
          position: z.number(),
        }),
      ),
    }),
  }),
});

const ISSUE_QUERY = `query PaseoLinearIssue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`;
const ISSUES_QUERY = `query PaseoLinearIssues($filter: IssueFilter) {
  issues(first: 25, filter: $filter, orderBy: updatedAt) { nodes { ${ISSUE_FIELDS} } }
}`;
const VIEWER_QUERY = `query PaseoLinearViewer { viewer { id name } }`;
const STATES_QUERY = `query PaseoLinearStates($teamId: String!) {
  team(id: $teamId) { states { nodes { id name type position } } }
}`;
const TEAMS_QUERY = `query PaseoLinearTeams { teams(first: 100) { nodes { id key name } } }`;
const LABEL_GROUPS_QUERY = `query PaseoLinearLabelGroups {
  issueLabels(first: 250) { nodes { parent { name } } }
}`;

const TeamsSchema = z.object({
  teams: z.object({
    nodes: z.array(z.object({ id: z.string(), key: z.string(), name: z.string() })),
  }),
});

const LabelGroupsSchema = z.object({
  issueLabels: z.object({
    nodes: z.array(z.object({ parent: z.object({ name: z.string() }).nullable() })),
  }),
});

const IDENTIFIER = /^[A-Z][A-Z0-9]*-\d+$/i;

function flattenParents(parent: unknown): Array<{ identifier: string; title: string }> {
  const chain: Array<{ identifier: string; title: string }> = [];
  let node = parent as { identifier: string; title: string; parent?: unknown } | null | undefined;
  while (node) {
    chain.unshift({ identifier: node.identifier, title: node.title });
    node = node.parent as typeof node;
  }
  return chain;
}

const PULL_REQUEST_URL = /\/(?:pull|merge_requests)\/\d+(?:[/?#]|$)/;

export function countPullRequests(urls: string[]): number {
  return urls.filter((url) => PULL_REQUEST_URL.test(url)).length;
}

export function toIssue(raw: unknown): Issue {
  const parsed = RawIssueSchema.parse(raw);
  return IssueSchema.parse({
    ...parsed,
    parents: flattenParents(parsed.parent),
    labels: parsed.labels.nodes.map((label) => ({
      name: label.name,
      color: label.color,
      group: label.parent?.name ?? null,
    })),
    prCount: countPullRequests(parsed.attachments.nodes.map((node) => node.url)),
  });
}

export async function fetchIssue(
  transport: LinearTransport,
  identifier: string,
): Promise<Issue | null> {
  const data = await transport.request(
    ISSUE_QUERY,
    { id: identifier.trim().toUpperCase() },
    SingleIssueSchema,
  );
  return data.issue ? toIssue(data.issue) : null;
}

function teamFilter(teamKey: string): Record<string, unknown> {
  return teamKey ? { team: { key: { eq: teamKey } } } : {};
}

export async function searchIssues(
  transport: LinearTransport,
  query: string,
  teamKey: string,
): Promise<Issue[]> {
  const normalized = query.trim();
  if (IDENTIFIER.test(normalized)) {
    const issue = await fetchIssue(transport, normalized);
    return issue ? [issue] : [];
  }
  const filter = { title: { containsIgnoreCase: normalized }, ...teamFilter(teamKey) };
  const data = await transport.request(ISSUES_QUERY, { filter }, IssueListSchema);
  return data.issues.nodes.map(toIssue);
}

export type IssueScope = "assigned" | "cycle" | "triage" | "unassigned";

const SCOPE_FILTERS: Record<IssueScope, Record<string, unknown>> = {
  assigned: { assignee: { isMe: { eq: true } }, state: { type: { nin: ["completed", "canceled"] } } },
  cycle: { cycle: { isActive: { eq: true } } },
  triage: { state: { type: { eq: "triage" } } },
  unassigned: { assignee: { null: true }, state: { type: { nin: ["completed", "canceled"] } } },
};

export async function listIssues(
  transport: LinearTransport,
  scope: IssueScope,
  teamKey: string,
): Promise<Issue[]> {
  const filter = { ...SCOPE_FILTERS[scope], ...teamFilter(teamKey) };
  const data = await transport.request(ISSUES_QUERY, { filter }, IssueListSchema);
  return data.issues.nodes.map(toIssue);
}

export async function fetchViewer(
  transport: LinearTransport,
): Promise<{ id: string; name: string }> {
  return (await transport.request(VIEWER_QUERY, {}, ViewerSchema)).viewer;
}

export async function fetchStates(
  transport: LinearTransport,
  teamId: string,
): Promise<Array<{ id: string; name: string; type: string; position: number }>> {
  const data = await transport.request(STATES_QUERY, { teamId }, StatesSchema);
  return [...data.team.states.nodes].sort((a, b) => a.position - b.position);
}

export async function fetchTeams(
  transport: LinearTransport,
): Promise<Array<{ id: string; key: string; name: string }>> {
  const data = await transport.request(TEAMS_QUERY, {}, TeamsSchema);
  return data.teams.nodes;
}

export async function fetchLabelGroups(transport: LinearTransport): Promise<string[]> {
  const data = await transport.request(LABEL_GROUPS_QUERY, {}, LabelGroupsSchema);
  const groups = new Set<string>();
  for (const node of data.issueLabels.nodes) {
    if (node.parent) groups.add(node.parent.name);
  }
  return [...groups].sort();
}
