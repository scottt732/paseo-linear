import type { PluginClientContext } from "@getpaseo/plugin/client";
import { LinearSettingsScreen } from "./client/settings";
import { pushSettings } from "./client/sync";
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

  return () => {};
}
