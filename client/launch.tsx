import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Issue } from "../shared/issue";
import { assignSelfRpc, listStatesRpc, moveStateRpc } from "../shared/rpc";
import { linearSettings } from "../shared/settings";

type PluginLayout = PluginSurfaceProps["layout"];

export function useLaunchFollowUp() {
  const [pending, setPending] = useState<Issue | null>(null);
  return { pending, offer: setPending, dismiss: () => setPending(null) };
}

export function LaunchFollowUp({
  issue,
  theme,
  layout,
  onDone,
}: {
  issue: Issue | null;
  theme: PluginTheme;
  layout: PluginLayout;
  onDone(): void;
}) {
  const settings = useSettings(linearSettings);
  const listStates = useRpc(listStatesRpc);
  const moveState = useRpc(moveStateRpc);
  const assignSelf = useRpc(assignSelfRpc);
  const toast = useToast();

  if (!issue || settings.status !== "ready") return null;
  const { moveToStarted, assignToMe } = settings.values;
  if (!moveToStarted && !assignToMe) return null;

  async function apply() {
    try {
      if (assignToMe) {
        const result = await assignSelf({ issueId: issue!.id });
        toast.show(`Assigned ${issue!.identifier} to ${result.assigneeName}`, { variant: "success" });
      }
      if (moveToStarted) {
        const { states } = await listStates({ teamId: issue!.team.id });
        const started = states.find((state) => state.type === "started");
        if (started) {
          const result = await moveState({ issueId: issue!.id, stateId: started.id });
          toast.show(`Moved ${issue!.identifier} to ${result.stateName}`, { variant: "success" });
        } else {
          toast.error("This team has no started status");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update Linear");
    } finally {
      onDone();
    }
  }

  const changes = [
    assignToMe ? `Assign ${issue.identifier} to you` : null,
    moveToStarted ? `Move ${issue.identifier} to the first started status` : null,
  ].filter((entry): entry is string => entry !== null);

  return (
    <Modal title="Update Linear?" open onOpenChange={(next) => (next ? undefined : onDone())}>
      <Modal.Content>
        <View style={{ gap: layout.compact ? 8 : 12 }}>
          {changes.map((change) => (
            <Text key={change} style={{ color: theme.colors.foreground, fontSize: 14 }}>
              {`• ${change}`}
            </Text>
          ))}
          <Pressable accessibilityRole="button" onPress={() => void apply()}>
            <Text style={{ color: theme.colors.accent, fontSize: 14 }}>Update Linear</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onDone}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 14 }}>Skip</Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}
