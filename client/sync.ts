import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { syncSettingsRpc } from "../shared/rpc";
import { LinearSettingsSchema } from "../shared/settings";

const linearSettingsRpc = settingsRpc("linear");

export async function pushSettings(client: PluginClientContext): Promise<void> {
  const stored = await client.rpc(linearSettingsRpc.read, {});
  if (stored.status !== "ready") return;
  await client.rpc(syncSettingsRpc, { values: LinearSettingsSchema.parse(stored.values) });
}
