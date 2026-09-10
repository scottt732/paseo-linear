import type { PluginClientContext } from "@getpaseo/plugin/client";
import { pushSettings } from "./client/sync";
import { issueAttachments } from "./shared/attachments";

export default function contribute(client: PluginClientContext) {
  client.addAttachmentSource(issueAttachments);
  void pushSettings(client).catch(() => {
    // The settings screen pushes again on save; a cold read failure is not fatal.
  });
  return () => {};
}
