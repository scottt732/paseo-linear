import { describe, expect, it } from "vitest";
import type { Issue } from "../shared/issue";
import { DEFAULT_PROMPT_TEMPLATE } from "../shared/format";
import { buildWorkspaceRequest } from "./start-work";

const issue: Issue = {
  id: "uuid-1",
  identifier: "ENG-14236",
  title: "Randomize the products",
  description: "Shuffle daily.",
  url: "https://linear.app/thecosmos/issue/ENG-14236/randomize",
  branchName: "feature/eng-14236-randomize",
  priorityLabel: "No priority",
  createdAt: "2026-09-09T14:40:17.035Z",
  updatedAt: "2026-09-10T03:00:44.419Z",
  state: { id: "s1", name: "In Progress", type: "started", color: "#f2c94c" },
  team: { id: "t1", key: "ENG", name: "Engineering" },
  assignee: null,
  project: null,
  parents: [],
  labels: [],
};

const settings = {
  repositoryPath: "/Users/me/code/app",
  baseRef: "origin/main",
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
};

describe("buildWorkspaceRequest", () => {
  it("uses the verified worktree branch-off shape", () => {
    expect(buildWorkspaceRequest(issue, settings).source).toEqual({
      kind: "worktree",
      cwd: "/Users/me/code/app",
      action: "branch-off",
      branchName: "feature/eng-14236-randomize",
      baseBranch: "origin/main",
    });
  });

  it("titles the workspace with the identifier and title", () => {
    expect(buildWorkspaceRequest(issue, settings).title).toBe("ENG-14236 · Randomize the products");
  });

  it("renders the prompt from the template", () => {
    const prompt = buildWorkspaceRequest(issue, settings).firstAgentContext?.prompt;
    expect(prompt).toContain("ENG-14236: Randomize the products");
    expect(prompt).toContain("Shuffle daily.");
  });

  it("seeds the issue as an external-resource attachment", () => {
    const attachments = buildWorkspaceRequest(issue, settings).firstAgentContext?.attachments;
    expect(attachments?.[0]).toMatchObject({
      type: "text",
      mimeType: "text/plain",
      externalResource: {
        provider: "linear",
        resourceType: "issue",
        identifier: "ENG-14236",
        url: issue.url,
      },
    });
  });

  it("throws a clear error when no repository path is configured", () => {
    expect(() => buildWorkspaceRequest(issue, { ...settings, repositoryPath: "" })).toThrow(
      "repository path",
    );
  });
});
