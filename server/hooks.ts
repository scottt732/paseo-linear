import type { PluginServerContext } from "@getpaseo/plugin/server";
import { clampText } from "../shared/format";
import { resolveBinding } from "./binding";

export function registerHooks(server: PluginServerContext): () => void {
  const remove = server.on("agent.turn_ended", async ({ agent, outcome, timeline }, { paseo }) => {
    if (outcome.kind !== "completed") return;

    const refreshed = await paseo.agents.ref(agent.id).refresh();
    const binding = resolveBinding(refreshed?.agent.labels, null);
    if (!binding) return;

    const lastAssistant = [...timeline]
      .reverse()
      .find((item) => item.type === "assistant_message");
    const summary = clampText(lastAssistant?.text ?? "", 20).slice(0, 4000);

    await paseo.agents.ref(agent.id).timeline.append({
      type: "plugin",
      id: `linear-turn-${binding.identifier}`,
      kind: "linear-turn",
      version: 1,
      data: {
        identifier: binding.identifier,
        issueId: binding.issueId,
        url: binding.url,
        summary,
      },
    });
  });

  return () => remove();
}
