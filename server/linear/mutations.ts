import { z } from "zod";
import { LinearApiError } from "./client";
import type { LinearTransport } from "./client";

const CommentSchema = z.object({
  commentCreate: z.object({
    success: z.boolean(),
    comment: z.object({ url: z.string() }).nullable(),
  }),
});

const IssueUpdateSchema = z.object({
  issueUpdate: z.object({
    success: z.boolean(),
    issue: z.object({
      state: z.object({ name: z.string() }),
      assignee: z.object({ name: z.string() }).nullable(),
    }),
  }),
});

const AttachmentSchema = z.object({ attachmentLinkURL: z.object({ success: z.boolean() }) });

const IssueCreateSchema = z.object({
  issueCreate: z.object({
    success: z.boolean(),
    issue: z.object({ id: z.string(), identifier: z.string(), url: z.string() }).nullable(),
  }),
});

const COMMENT_MUTATION = `mutation PaseoLinearComment($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) { success comment { url } }
}`;

const ISSUE_UPDATE_MUTATION = `mutation PaseoLinearIssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success issue { state { name } assignee { name } } }
}`;

const LINK_MUTATION = `mutation PaseoLinearLink($issueId: String!, $url: String!, $title: String!) {
  attachmentLinkURL(issueId: $issueId, url: $url, title: $title) { success }
}`;

const ISSUE_CREATE_MUTATION = `mutation PaseoLinearIssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id identifier url } }
}`;

export interface CreateIssueInput {
  title: string;
  teamId: string;
  stateId?: string;
  assigneeId?: string;
  priority?: number;
  dueDate?: string;
  description?: string;
}

export async function createComment(
  transport: LinearTransport,
  issueId: string,
  body: string,
): Promise<{ url: string }> {
  const data = await transport.request(COMMENT_MUTATION, { issueId, body }, CommentSchema);
  if (!data.commentCreate.success || !data.commentCreate.comment) {
    throw new LinearApiError("Linear did not accept the comment");
  }
  return { url: data.commentCreate.comment.url };
}

async function updateIssue(
  transport: LinearTransport,
  id: string,
  input: Record<string, unknown>,
): Promise<z.infer<typeof IssueUpdateSchema>["issueUpdate"]["issue"]> {
  const data = await transport.request(ISSUE_UPDATE_MUTATION, { id, input }, IssueUpdateSchema);
  if (!data.issueUpdate.success) throw new LinearApiError("Linear did not accept the update");
  return data.issueUpdate.issue;
}

export async function moveIssueState(
  transport: LinearTransport,
  issueId: string,
  stateId: string,
): Promise<{ stateName: string }> {
  const issue = await updateIssue(transport, issueId, { stateId });
  return { stateName: issue.state.name };
}

export async function assignIssue(
  transport: LinearTransport,
  issueId: string,
  assigneeId: string,
): Promise<{ assigneeName: string }> {
  const issue = await updateIssue(transport, issueId, { assigneeId });
  return { assigneeName: issue.assignee?.name ?? "" };
}

export async function createIssue(
  transport: LinearTransport,
  input: CreateIssueInput,
): Promise<{ identifier: string; url: string; id: string }> {
  const { title, teamId, stateId, assigneeId, priority, dueDate, description } = input;
  const variables: Record<string, unknown> = { title, teamId };
  if (stateId !== undefined) variables.stateId = stateId;
  if (assigneeId !== undefined) variables.assigneeId = assigneeId;
  if (priority !== undefined) variables.priority = priority;
  if (dueDate !== undefined) variables.dueDate = dueDate;
  if (description !== undefined) variables.description = description;

  const data = await transport.request(
    ISSUE_CREATE_MUTATION,
    { input: variables },
    IssueCreateSchema,
  );
  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new LinearApiError("Linear did not accept the issue");
  }
  const { id, identifier, url } = data.issueCreate.issue;
  return { identifier, url, id };
}

export async function linkUrl(
  transport: LinearTransport,
  issueId: string,
  url: string,
  title: string,
): Promise<{ linked: boolean }> {
  const data = await transport.request(LINK_MUTATION, { issueId, url, title }, AttachmentSchema);
  if (!data.attachmentLinkURL.success) throw new LinearApiError("Linear did not accept the link");
  return { linked: true };
}
