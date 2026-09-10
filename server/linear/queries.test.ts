import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import type { LinearTransport } from "./client";
import { countPullRequests, fetchIssue, fetchTeams, listIssues, searchIssues, toIssue } from "./queries";

const rawIssue = {
  id: "uuid-1",
  identifier: "ENG-14236",
  title: "Randomize the products",
  description: "Shuffle daily.",
  url: "https://linear.app/thecosmos/issue/ENG-14236/randomize",
  branchName: "feature/eng-14236-randomize",
  priorityLabel: "No priority",
  priority: 0,
  estimate: null,
  dueDate: null,
  createdAt: "2026-09-09T14:40:17.035Z",
  updatedAt: "2026-09-10T03:00:44.419Z",
  state: { id: "s1", name: "In Progress", type: "started", color: "#f2c94c", position: 956.71 },
  team: { id: "t1", key: "ENG", name: "Engineering" },
  assignee: { id: "u1", name: "Stephanos Tsoucas" },
  project: { id: "p1", name: "Shopping", icon: "🎁", color: "#5e6ad2" },
  parent: { identifier: "ENG-14095", title: "Shop Tab", parent: null },
  labels: { nodes: [{ name: "Backend", color: "#bb87fc" }] },
  attachments: { nodes: [] },
};

function stubTransport(handler: (query: string, variables: Record<string, unknown>) => unknown): {
  transport: LinearTransport;
  calls: Array<{ query: string; variables: Record<string, unknown> }>;
} {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const transport: LinearTransport = {
    async request<T>(query: string, variables: Record<string, unknown>, schema: ZodType<T>) {
      calls.push({ query, variables });
      return schema.parse(handler(query, variables));
    },
  };
  return { transport, calls };
}

describe("toIssue", () => {
  it("flattens the parent chain into an ordered ancestor list", () => {
    const nested = {
      ...rawIssue,
      parent: { identifier: "B", title: "Child", parent: { identifier: "A", title: "Root", parent: null } },
    };
    expect(toIssue(nested).parents).toEqual([
      { identifier: "A", title: "Root" },
      { identifier: "B", title: "Child" },
    ]);
  });
  it("returns an empty ancestor list when there is no parent", () => {
    expect(toIssue({ ...rawIssue, parent: null }).parents).toEqual([]);
  });
  it("flattens label nodes", () => {
    expect(toIssue(rawIssue).labels).toEqual([{ name: "Backend", color: "#bb87fc" }]);
  });
  it("derives prCount from attachment urls", () => {
    const withPr = {
      ...rawIssue,
      attachments: { nodes: [{ url: "https://github.com/acme/repo/pull/42" }] },
    };
    expect(toIssue(withPr).prCount).toBe(1);
  });
});

describe("countPullRequests", () => {
  it("counts a GitHub pull request URL", () => {
    expect(countPullRequests(["https://github.com/acme/repo/pull/42"])).toBe(1);
  });
  it("counts a GitLab merge request URL", () => {
    expect(countPullRequests(["https://gitlab.com/acme/repo/-/merge_requests/7"])).toBe(1);
  });
  it("does not count a plain issue URL", () => {
    expect(countPullRequests(["https://github.com/acme/repo/issues/9"])).toBe(0);
  });
  it("does not count a document URL", () => {
    expect(countPullRequests(["https://linear.app/thecosmos/document/abc"])).toBe(0);
  });
  it("returns 0 for an empty list", () => {
    expect(countPullRequests([])).toBe(0);
  });
  it("counts duplicates each without deduping", () => {
    const url = "https://github.com/acme/repo/pull/42";
    expect(countPullRequests([url, url])).toBe(2);
  });
});

describe("fetchIssue", () => {
  it("queries by identifier and returns the normalized issue", async () => {
    const { transport, calls } = stubTransport(() => ({ issue: rawIssue }));
    const issue = await fetchIssue(transport, "eng-14236");
    expect(calls[0].variables).toEqual({ id: "ENG-14236" });
    expect(issue?.identifier).toBe("ENG-14236");
  });
  it("returns null for an unknown identifier", async () => {
    const { transport } = stubTransport(() => ({ issue: null }));
    expect(await fetchIssue(transport, "ENG-9")).toBeNull();
  });
});

describe("searchIssues", () => {
  it("filters by case-insensitive title when the query is not an identifier", async () => {
    const { transport, calls } = stubTransport(() => ({ issues: { nodes: [rawIssue] } }));
    await searchIssues(transport, " randomize ", "");
    expect(calls[0].variables).toEqual({
      filter: { title: { containsIgnoreCase: "randomize" } },
    });
  });
  it("adds a team filter when a default team key is set", async () => {
    const { transport, calls } = stubTransport(() => ({ issues: { nodes: [] } }));
    await searchIssues(transport, "randomize", "ENG");
    expect(calls[0].variables).toEqual({
      filter: { title: { containsIgnoreCase: "randomize" }, team: { key: { eq: "ENG" } } },
    });
  });
  it("resolves an exact identifier through the single-issue query", async () => {
    const { transport, calls } = stubTransport(() => ({ issue: rawIssue }));
    const issues = await searchIssues(transport, "ENG-14236", "");
    expect(calls[0].variables).toEqual({ id: "ENG-14236" });
    expect(issues).toHaveLength(1);
  });
});

describe("listIssues", () => {
  it("scopes assigned issues to the viewer", async () => {
    const { transport, calls } = stubTransport(() => ({ issues: { nodes: [rawIssue] } }));
    await listIssues(transport, "assigned", "");
    expect(calls[0].variables.filter).toMatchObject({ assignee: { isMe: { eq: true } } });
  });
  it("scopes cycle issues to the active cycle", async () => {
    const { transport, calls } = stubTransport(() => ({ issues: { nodes: [] } }));
    await listIssues(transport, "cycle", "");
    expect(calls[0].variables.filter).toMatchObject({ cycle: { isActive: { eq: true } } });
  });
  it("scopes triage issues to the triage state type", async () => {
    const { transport, calls } = stubTransport(() => ({ issues: { nodes: [] } }));
    await listIssues(transport, "triage", "");
    expect(calls[0].variables.filter).toMatchObject({ state: { type: { eq: "triage" } } });
  });
  it("scopes unassigned issues to no assignee and an open state", async () => {
    const { transport, calls } = stubTransport(() => ({ issues: { nodes: [] } }));
    await listIssues(transport, "unassigned", "");
    expect(calls[0].variables.filter).toMatchObject({
      assignee: { null: true },
      state: { type: { nin: ["completed", "canceled"] } },
    });
  });
});

describe("fetchTeams", () => {
  it("returns the team list from the teams query", async () => {
    const { transport, calls } = stubTransport(() => ({
      teams: { nodes: [{ id: "t1", key: "ENG", name: "Engineering" }] },
    }));
    expect(await fetchTeams(transport)).toEqual([{ id: "t1", key: "ENG", name: "Engineering" }]);
    expect(calls[0].variables).toEqual({});
  });
});
