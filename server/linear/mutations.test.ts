import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import type { LinearTransport } from "./client";
import { assignIssue, createComment, createIssue, linkUrl, moveIssueState } from "./mutations";

function stub(result: unknown): {
  transport: LinearTransport;
  calls: Array<{ query: string; variables: Record<string, unknown> }>;
} {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  return {
    calls,
    transport: {
      async request<T>(query: string, variables: Record<string, unknown>, schema: ZodType<T>) {
        calls.push({ query, variables });
        return schema.parse(result);
      },
    },
  };
}

describe("createComment", () => {
  it("posts the body against the issue and returns the comment URL", async () => {
    const { transport, calls } = stub({
      commentCreate: { success: true, comment: { url: "https://linear.app/c/1" } },
    });
    expect(await createComment(transport, "issue-1", "hello")).toEqual({
      url: "https://linear.app/c/1",
    });
    expect(calls[0].variables).toEqual({ issueId: "issue-1", body: "hello" });
  });
  it("throws when Linear reports failure", async () => {
    const { transport } = stub({ commentCreate: { success: false, comment: null } });
    await expect(createComment(transport, "issue-1", "hello")).rejects.toThrow("comment");
  });
});

describe("moveIssueState", () => {
  it("updates the state and returns the new state name", async () => {
    const { transport, calls } = stub({
      issueUpdate: { success: true, issue: { state: { name: "In Progress" }, assignee: null } },
    });
    expect(await moveIssueState(transport, "issue-1", "state-2")).toEqual({
      stateName: "In Progress",
    });
    expect(calls[0].variables).toEqual({ id: "issue-1", input: { stateId: "state-2" } });
  });
});

describe("assignIssue", () => {
  it("sets the assignee and returns their name", async () => {
    const { transport, calls } = stub({
      issueUpdate: {
        success: true,
        issue: { state: { name: "Todo" }, assignee: { name: "Scott" } },
      },
    });
    expect(await assignIssue(transport, "issue-1", "user-1")).toEqual({ assigneeName: "Scott" });
    expect(calls[0].variables).toEqual({ id: "issue-1", input: { assigneeId: "user-1" } });
  });
});

describe("createIssue", () => {
  it("creates the issue and returns its identifier, url, and id", async () => {
    const { transport, calls } = stub({
      issueCreate: {
        success: true,
        issue: { id: "issue-9", identifier: "ENG-9", url: "https://linear.app/thecosmos/issue/ENG-9" },
      },
    });
    expect(
      await createIssue(transport, {
        title: "New issue",
        teamId: "team-1",
        stateId: "state-1",
        assigneeId: "user-1",
        priority: 2,
        dueDate: "2026-09-10",
        description: "Body",
      }),
    ).toEqual({
      identifier: "ENG-9",
      url: "https://linear.app/thecosmos/issue/ENG-9",
      id: "issue-9",
    });
    expect(calls[0].variables).toEqual({
      input: {
        title: "New issue",
        teamId: "team-1",
        stateId: "state-1",
        assigneeId: "user-1",
        priority: 2,
        dueDate: "2026-09-10",
        description: "Body",
      },
    });
  });

  it("omits unset optional fields from the input", async () => {
    const { transport, calls } = stub({
      issueCreate: {
        success: true,
        issue: { id: "issue-9", identifier: "ENG-9", url: "https://linear.app/thecosmos/issue/ENG-9" },
      },
    });
    await createIssue(transport, { title: "New issue", teamId: "team-1" });
    expect(calls[0].variables).toEqual({ input: { title: "New issue", teamId: "team-1" } });
  });

  it("throws when Linear reports failure", async () => {
    const { transport } = stub({ issueCreate: { success: false, issue: null } });
    await expect(createIssue(transport, { title: "New issue", teamId: "team-1" })).rejects.toThrow(
      "issue",
    );
  });

  it("throws when success is true but issue is null", async () => {
    const { transport } = stub({ issueCreate: { success: true, issue: null } });
    await expect(createIssue(transport, { title: "New issue", teamId: "team-1" })).rejects.toThrow();
  });
});

describe("linkUrl", () => {
  it("attaches the URL with a title", async () => {
    const { transport, calls } = stub({ attachmentLinkURL: { success: true } });
    expect(await linkUrl(transport, "issue-1", "https://github.com/x/y/pull/1", "PR 1")).toEqual({
      linked: true,
    });
    expect(calls[0].variables).toEqual({
      issueId: "issue-1",
      url: "https://github.com/x/y/pull/1",
      title: "PR 1",
    });
  });
});
