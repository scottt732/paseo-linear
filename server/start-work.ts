import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { renderPrompt } from "../shared/format";
import { type Issue, issueAttachmentText } from "../shared/issue";
import { issueLabels } from "./binding";
import { loadLinearContext } from "./context";
import { fetchIssue } from "./linear/queries";

export interface StartWorkSettings {
  repositoryPath: string;
  baseRef: string;
  promptTemplate: string;
}

export function buildWorkspaceRequest(issue: Issue, settings: StartWorkSettings) {
  const cwd = settings.repositoryPath.trim();
  if (!cwd) {
    throw new Error(
      "Set a repository path in Settings → Plugins → Linear before starting work from an issue",
    );
  }
  return {
    title: `${issue.identifier} · ${issue.title}`,
    source: {
      kind: "worktree" as const,
      cwd,
      action: "branch-off" as const,
      branchName: issue.branchName,
      baseBranch: settings.baseRef,
    },
    firstAgentContext: {
      prompt: renderPrompt(settings.promptTemplate, {
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        description: issue.description ?? "",
        branchName: issue.branchName,
      }),
      attachments: [
        {
          type: "text" as const,
          mimeType: "text/plain" as const,
          title: `${issue.identifier} · ${issue.title}`,
          text: issueAttachmentText(issue),
          externalResource: {
            provider: "linear",
            providerLabel: "Linear",
            resourceType: "issue",
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            url: issue.url,
          },
        },
      ],
    },
  };
}

export async function startWork(
  context: PluginHandlerContext,
  identifier: string,
): Promise<{ workspaceId: string; agentId: string; branchName: string }> {
  const { transport, settings } = loadLinearContext(context);
  const issue = await fetchIssue(transport, identifier);
  if (!issue) throw new Error(`No Linear issue found for ${identifier}`);

  const provider = settings.provider.trim();
  if (!provider) {
    throw new Error(
      "Set a provider in Settings → Plugins → Linear before starting work from an issue",
    );
  }

  const request = buildWorkspaceRequest(issue, settings);
  const workspace = await context.paseo.workspaces.create(request);
  const agent = await workspace.agents.create({
    config: { provider },
    labels: issueLabels(issue),
    title: `${issue.identifier} · ${issue.title}`,
  });

  return { workspaceId: workspace.id, agentId: agent.id, branchName: issue.branchName };
}
