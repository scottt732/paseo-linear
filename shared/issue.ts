import { z } from "zod";

const RefSchema = z.object({ id: z.string(), name: z.string() });

export const IssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.url(),
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
  assignee: RefSchema.nullable(),
  project: z
    .object({ id: z.string(), name: z.string(), icon: z.string().nullable(), color: z.string().nullable() })
    .nullable(),
  parents: z.array(z.object({ identifier: z.string(), title: z.string() })),
  labels: z.array(z.object({ name: z.string(), color: z.string(), group: z.string().nullable() })),
  prCount: z.number(),
});

export type Issue = z.infer<typeof IssueSchema>;

export const AttachmentItemSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  url: z.url(),
  text: z.string(),
  resourceType: z.string(),
});

export type AttachmentItem = z.infer<typeof AttachmentItemSchema>;

export function issueBreadcrumb(issue: Issue): string[] {
  const crumbs = issue.parents.map((parent) => parent.title);
  if (issue.project) crumbs.unshift(issue.project.name);
  crumbs.push(issue.title);
  return crumbs;
}

export function issueAttachmentText(issue: Issue): string {
  const lines = [
    `Linear issue ${issue.identifier}: ${issue.title}`,
    `URL: ${issue.url}`,
    `Status: ${issue.state.name}`,
    `Priority: ${issue.priorityLabel}`,
    `Team: ${issue.team.name}`,
    `Branch: ${issue.branchName}`,
  ];
  if (issue.assignee) lines.push(`Assignee: ${issue.assignee.name}`);
  if (issue.project) lines.push(`Project: ${issue.project.name}`);
  if (issue.labels.length > 0) {
    lines.push(`Labels: ${issue.labels.map((label) => label.name).join(", ")}`);
  }
  lines.push("", issue.description || "No description.");
  return lines.join("\n");
}

export function issueAttachmentItem(issue: Issue): AttachmentItem {
  const subtitle = [issue.state.name, issue.assignee?.name].filter(Boolean).join(" · ");
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    ...(subtitle ? { subtitle } : {}),
    url: issue.url,
    text: issueAttachmentText(issue),
    resourceType: "issue",
  };
}
