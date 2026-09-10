import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerHandlers } from "./server/handlers";
import { registerHooks } from "./server/hooks";
import { linearSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(linearSettings);
  registerHandlers(server);
  const removeHooks = registerHooks(server);
  return () => {
    removeHooks();
  };
}
