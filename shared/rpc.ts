import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { AttachmentItemSchema, IssueSchema } from "./issue";

const IdentifierInput = z.object({ identifier: z.string() });

export const searchIssuesRpc = defineRpc({
  name: "issues.search",
  input: z.object({ query: z.string() }),
  output: z.object({ items: z.array(AttachmentItemSchema) }),
});

export const getIssueRpc = defineRpc({
  name: "issues.get",
  input: IdentifierInput,
  output: z.object({ issue: IssueSchema.nullable() }),
});

export const listIssuesRpc = defineRpc({
  name: "issues.list",
  input: z.object({ scope: z.enum(["assigned", "cycle", "triage"]) }),
  output: z.object({ issues: z.array(IssueSchema) }),
});

export const verifyRpc = defineRpc({
  name: "linear.verify",
  input: z.object({}),
  output: z.object({ name: z.string(), source: z.enum(["env", "settings"]) }),
});

export const listStatesRpc = defineRpc({
  name: "linear.states",
  input: z.object({ teamId: z.string() }),
  output: z.object({
    states: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })),
  }),
});

export const startWorkRpc = defineRpc({
  name: "linear.startWork",
  input: IdentifierInput,
  output: z.object({ workspaceId: z.string(), agentId: z.string(), branchName: z.string() }),
});

export const commentRpc = defineRpc({
  name: "linear.comment",
  input: z.object({ issueId: z.string(), body: z.string() }),
  output: z.object({ url: z.url() }),
});

export const moveStateRpc = defineRpc({
  name: "linear.moveState",
  input: z.object({ issueId: z.string(), stateId: z.string() }),
  output: z.object({ stateName: z.string() }),
});

export const assignSelfRpc = defineRpc({
  name: "linear.assignSelf",
  input: z.object({ issueId: z.string() }),
  output: z.object({ assigneeName: z.string() }),
});

export const linkBranchRpc = defineRpc({
  name: "linear.linkBranch",
  input: z.object({ issueId: z.string(), url: z.url(), title: z.string() }),
  output: z.object({ linked: z.boolean() }),
});
