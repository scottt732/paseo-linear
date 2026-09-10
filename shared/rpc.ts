import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { AttachmentItemSchema, IssueSchema } from "./issue";
import { LinearSettingsSchema } from "./settings";

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
  input: z.object({ scope: z.enum(["assigned", "cycle", "triage", "unassigned"]) }),
  output: z.object({ issues: z.array(IssueSchema) }),
});

export const createIssueRpc = defineRpc({
  name: "linear.create-issue",
  input: z.object({
    title: z.string().min(1),
    teamId: z.string(),
    stateId: z.string().optional(),
    assigneeId: z.string().optional(),
    assignToMe: z.boolean().optional(),
    priority: z.number().optional(),
    dueDate: z.string().optional(),
    description: z.string().optional(),
  }),
  output: z.object({ identifier: z.string(), url: z.url(), id: z.string() }),
});

export const listTeamsRpc = defineRpc({
  name: "linear.teams",
  input: z.object({}),
  output: z.object({ teams: z.array(z.object({ id: z.string(), key: z.string(), name: z.string() })) }),
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
  name: "linear.start-work",
  input: IdentifierInput,
  output: z.object({ workspaceId: z.string(), agentId: z.string(), branchName: z.string() }),
});

export const commentRpc = defineRpc({
  name: "linear.comment",
  input: z.object({ issueId: z.string(), body: z.string() }),
  output: z.object({ url: z.url() }),
});

export const moveStateRpc = defineRpc({
  name: "linear.move-state",
  input: z.object({ issueId: z.string(), stateId: z.string() }),
  output: z.object({ stateName: z.string() }),
});

export const assignSelfRpc = defineRpc({
  name: "linear.assign-self",
  input: z.object({ issueId: z.string() }),
  output: z.object({ assigneeName: z.string() }),
});

export const linkBranchRpc = defineRpc({
  name: "linear.link-branch",
  input: z.object({ issueId: z.string(), url: z.url(), title: z.string() }),
  output: z.object({ linked: z.boolean() }),
});

export const syncSettingsRpc = defineRpc({
  name: "linear.sync-settings",
  input: z.object({ values: LinearSettingsSchema }),
  output: z.object({ ok: z.boolean() }),
});
