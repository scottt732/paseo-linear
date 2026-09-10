import { describe, expect, it } from "vitest";
import { type Issue, IssueSchema, issueAttachmentItem, issueAttachmentText, issueBreadcrumb } from "./issue";

const issue: Issue = {
  id: "f92cd857-debd-4b61-bae7-535f2aa8af59",
  identifier: "ENG-14236",
  title: "Randomize the products on the tabs & Brands pages",
  description: "Shuffle daily.",
  url: "https://linear.app/thecosmos/issue/ENG-14236/randomize",
  branchName: "feature/eng-14236-randomize",
  priorityLabel: "No priority",
  createdAt: "2026-09-09T14:40:17.035Z",
  updatedAt: "2026-09-10T03:00:44.419Z",
  state: { id: "s1", name: "In Progress", type: "started", color: "#f2c94c" },
  team: { id: "t1", key: "ENG", name: "Engineering" },
  assignee: { id: "u1", name: "Stephanos Tsoucas" },
  project: { id: "p1", name: "Shopping", icon: "🎁", color: "#5e6ad2" },
  parents: [{ identifier: "ENG-14095", title: "Shop Tab" }],
  labels: [{ name: "Backend", color: "#bb87fc" }],
};

describe("IssueSchema", () => {
  it("accepts a complete issue", () => {
    expect(IssueSchema.parse(issue)).toEqual(issue);
  });
  it("accepts nullable optional relations", () => {
    const bare = { ...issue, assignee: null, project: null, description: null, parents: [], labels: [] };
    expect(IssueSchema.parse(bare).assignee).toBeNull();
  });
  it("rejects a non-URL url", () => {
    expect(() => IssueSchema.parse({ ...issue, url: "not-a-url" })).toThrow();
  });
});

describe("issueBreadcrumb", () => {
  it("puts the project first, then ancestors, then the title", () => {
    expect(issueBreadcrumb(issue)).toEqual(["Shopping", "Shop Tab", issue.title]);
  });
  it("omits the project when there is none", () => {
    expect(issueBreadcrumb({ ...issue, project: null })).toEqual(["Shop Tab", issue.title]);
  });
});

describe("issueAttachmentText", () => {
  it("leads with the identifier and includes the branch name and description", () => {
    const text = issueAttachmentText(issue);
    expect(text.startsWith("Linear issue ENG-14236: ")).toBe(true);
    expect(text).toContain("Branch: feature/eng-14236-randomize");
    expect(text).toContain("Status: In Progress");
    expect(text).toContain("Shuffle daily.");
  });
  it("says so when there is no description", () => {
    expect(issueAttachmentText({ ...issue, description: null })).toContain("No description.");
  });
});

describe("issueAttachmentItem", () => {
  it("produces the attachment payload Paseo expects", () => {
    const item = issueAttachmentItem(issue);
    expect(item.id).toBe(issue.id);
    expect(item.identifier).toBe("ENG-14236");
    expect(item.resourceType).toBe("issue");
    expect(item.subtitle).toBe("In Progress · Stephanos Tsoucas");
    expect(item.url).toBe(issue.url);
  });
  it("omits the subtitle when there is no state or assignee detail", () => {
    const item = issueAttachmentItem({ ...issue, assignee: null });
    expect(item.subtitle).toBe("In Progress");
  });
});
