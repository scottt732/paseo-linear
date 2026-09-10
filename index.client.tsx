import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { issueAttachments } from "./shared/attachments";
import { syncSettingsRpc } from "./shared/rpc";
import { LinearSettingsSchema } from "./shared/settings";

const linearSettingsRpc = settingsRpc("linear");

export async function pushSettings(client: PluginClientContext): Promise<void> {
  const stored = await client.rpc(linearSettingsRpc.read, {});
  if (stored.status !== "ready") return;
  await client.rpc(syncSettingsRpc, { values: LinearSettingsSchema.parse(stored.values) });
}

export default function contribute(client: PluginClientContext) {
  client.addAttachmentSource(issueAttachments);
  void pushSettings(client).catch(() => {
    // The settings screen pushes again on save; a cold read failure is not fatal.
  });
  return () => {};
}
