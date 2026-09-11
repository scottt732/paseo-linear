import { describe, expect, it } from "vitest";
import type { Issue } from "../shared/issue";
import { DEFAULT_PROMPT_TEMPLATE } from "../shared/format";
import { buildWorkspaceRequest, resolveRepositoryPath } from "./start-work";

const issue: Issue = {
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
  assignee: null,
  project: null,
  parents: [],
  labels: [],
  prCount: 0,
};

const settings = {
  baseRef: "origin/main",
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
};

const repositoryPath = "/Users/me/code/app";

describe("buildWorkspaceRequest", () => {
  it("uses the verified worktree branch-off shape", () => {
    expect(buildWorkspaceRequest(issue, repositoryPath, settings).source).toEqual({
      kind: "worktree",
      cwd: "/Users/me/code/app",
      action: "branch-off",
      branchName: "feature/eng-14236-randomize",
      baseBranch: "origin/main",
    });
  });

  it("titles the workspace with the identifier and title", () => {
    expect(buildWorkspaceRequest(issue, repositoryPath, settings).title).toBe(
      "ENG-14236 · Randomize the products",
    );
  });

  it("renders the prompt from the template", () => {
    const prompt = buildWorkspaceRequest(issue, repositoryPath, settings).firstAgentContext?.prompt;
    expect(prompt).toContain("ENG-14236: Randomize the products");
    expect(prompt).toContain("Shuffle daily.");
  });

  it("seeds the issue as an external-resource attachment", () => {
    const attachments = buildWorkspaceRequest(issue, repositoryPath, settings).firstAgentContext?.attachments;
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
    expect(() => buildWorkspaceRequest(issue, "", settings)).toThrow("repository path");
  });
});

describe("resolveRepositoryPath", () => {
  it("uses the configured setting even when an override is also given", () => {
    expect(resolveRepositoryPath("/Users/me/code/app", "/Users/me/code/other")).toBe(
      "/Users/me/code/app",
    );
  });

  it("falls back to the override only when the setting is empty", () => {
    expect(resolveRepositoryPath("", "/Users/me/code/other")).toBe("/Users/me/code/other");
  });

  it("falls back to the override when the setting is only whitespace", () => {
    expect(resolveRepositoryPath("   ", "/Users/me/code/other")).toBe("/Users/me/code/other");
  });

  it("returns an empty string when neither the setting nor an override is given", () => {
    expect(resolveRepositoryPath("", undefined)).toBe("");
  });

  it("trims a configured setting", () => {
    expect(resolveRepositoryPath("  /Users/me/code/app  ", undefined)).toBe("/Users/me/code/app");
  });
});
