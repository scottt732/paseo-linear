import type { PluginClientContext } from "@getpaseo/plugin/client";
import { LinearButtonIcon } from "./client/logo";
import { IssuesPanel, IssuesSurface } from "./client/panel";
import { LinearSettingsScreen } from "./client/settings";
import { pushSettings } from "./client/sync";
import { openExternal } from "./client/web";
import { CommentPopover, LinkBranchPopover, MoveStatePopover, turnSchema, TurnOffer } from "./client/writeback";
import { issueAttachments } from "./shared/attachments";
import { startWorkRpc } from "./shared/rpc";

export default function contribute(client: PluginClientContext) {
  client.addAttachmentSource(issueAttachments);
  client.addSettingsScreen({
    id: "linear",
    title: "Linear",
    icon: "CircleDot",
    Component: LinearSettingsScreen,
  });
  void pushSettings(client).catch(() => {
    // The settings screen pushes again on save; a cold read failure is not fatal.
  });

  client.addWorkspacePanel({
    id: "issues",
    title: "Linear",
    icon: "CircleDot",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: IssuesPanel,
  });
  client.addSurface("issues", IssuesSurface);
  client.addSidebarItem({ id: "issues", title: "Linear", icon: "CircleDot", surface: "issues" });

  client.addCommandCenterItem({
    id: "start-work",
    title: "Linear: start work on an issue",
    icon: "CirclePlay",
    keywords: ["linear", "issue", "worktree"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("issues");
    },
  });

  client.addSlashCommand({
    name: "linear",
    description: "Start work on a Linear issue",
    argumentHint: "<identifier>",
    context: "workspace",
    async onSubmit({ args, rpc }) {
      const identifier = args.trim();
      if (!identifier) throw new Error("Usage: /linear ENG-123");
      await rpc(startWorkRpc, { identifier });
    },
  });

  client.addTimelineRenderer({
    kind: "linear-turn",
    version: 1,
    schema: turnSchema,
    Component: TurnOffer,
  });

  const pills = new Map<string, () => void>();
  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind !== "upsert") return;
    const { id: agentId, workspaceId, labels } = update.agent;
    const identifier = labels?.["linear.issue"];
    pills.get(agentId)?.();
    pills.delete(agentId);
    if (!identifier || !workspaceId) return;
    const registration = client.addComposerPill({
      id: "linear",
      workspaceId,
      agentId,
      button: {
        title: `Linear ${identifier}`,
        icon: LinearButtonIcon,
        label: identifier,
        behavior: {
          kind: "menu",
          items: [
            {
              kind: "item",
              id: "view",
              title: "View issue",
              icon: LinearButtonIcon,
              behavior: {
                kind: "action",
                onPress() {
                  client.openPanel("issues", { workspaceId });
                },
              },
            },
            {
              kind: "item",
              id: "open",
              title: "Open in Linear",
              icon: "ExternalLink",
              behavior: {
                kind: "action",
                async onPress() {
                  const url = labels?.["linear.url"];
                  if (url) await openExternal(url);
                },
              },
            },
            { kind: "separator", id: "write-divider" },
            {
              kind: "item",
              id: "comment",
              title: "Comment on issue",
              icon: "MessageSquare",
              behavior: { kind: "popover", Content: CommentPopover },
            },
            {
              kind: "item",
              id: "move",
              title: "Move to…",
              icon: "ArrowRight",
              behavior: { kind: "popover", Content: MoveStatePopover },
            },
            {
              kind: "item",
              id: "link",
              title: "Link this branch",
              icon: "GitBranch",
              behavior: { kind: "popover", Content: LinkBranchPopover },
            },
          ],
        },
      },
    });
    pills.set(agentId, () => registration.remove());
  });

  return () => {
    unsubscribe();
    for (const remove of pills.values()) remove();
  };
}
