import type { PluginButtonContentProps, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useAgent, usePaseo, useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { commentRpc, getIssueRpc, linkBranchRpc, listStatesRpc, moveStateRpc } from "../shared/rpc";

// Mirrors server/binding.ts's label keys. Client code cannot import server/, so the
// keys are duplicated here rather than shared.
const ISSUE_LABEL = "linear.issue";
const ISSUE_ID_LABEL = "linear.issueId";

export const turnSchema = z.object({
  identifier: z.string(),
  issueId: z.string().nullable(),
  url: z.string().nullable(),
  summary: z.string(),
});

export function TurnOffer({ item, theme }: PluginTimelineItemProps<z.output<typeof turnSchema>>) {
  const comment = useRpc(commentRpc);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(item.data.summary);
  const { issueId, identifier } = item.data;

  async function post() {
    if (!issueId) {
      toast.error("This agent has no Linear issue id — reopen it from the Linear panel");
      return;
    }
    try {
      await comment({ issueId, body });
      toast.show(`Commented on ${identifier}`, { variant: "success" });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post the comment");
    }
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
      <Icon name="CircleDot" size={14} color={theme.colors.foregroundMuted} />
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
        {`Turn finished on ${identifier}`}
      </Text>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
        <Text style={{ color: theme.colors.accent, fontSize: 13 }}>Comment on issue</Text>
      </Pressable>

      <Modal title={`Comment on ${identifier}`} open={open} onOpenChange={setOpen}>
        <Modal.Content>
          <TextInput
            multiline
            value={body}
            onChangeText={setBody}
            style={{
              color: theme.colors.foreground,
              backgroundColor: theme.colors.surface1,
              borderRadius: 8,
              padding: 12,
              minHeight: 140,
            }}
          />
          <Pressable accessibilityRole="button" onPress={() => void post()}>
            <Text style={{ color: theme.colors.accent, fontSize: 14 }}>Post to Linear</Text>
          </Pressable>
        </Modal.Content>
      </Modal>
    </View>
  );
}

// PluginButtonContentProps is a union over "workspace" and "agent" button contexts.
// Composer-pill popovers only ever mount in the "agent" branch, but the SDK type
// still requires a runtime narrow before `agentId` is readable.
function agentIdFromContext(props: PluginButtonContentProps): string | null {
  return props.context === "agent" ? props.agentId : null;
}

export function CommentPopover(props: PluginButtonContentProps) {
  const { theme, layout, close } = props;
  const agentId = agentIdFromContext(props);
  const labels = useAgent(agentId ?? "", (agent) => agent.labels);
  const comment = useRpc(commentRpc);
  const toast = useToast();
  const [body, setBody] = useState("");

  if (agentId === null) return null;

  const issueId = labels?.[ISSUE_ID_LABEL] ?? null;
  const identifier = labels?.[ISSUE_LABEL] ?? null;

  async function post() {
    if (!issueId) {
      toast.error("This agent has no Linear issue id — reopen it from the Linear panel");
      return;
    }
    try {
      await comment({ issueId, body });
      toast.show(identifier ? `Commented on ${identifier}` : "Comment posted", { variant: "success" });
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post the comment");
    }
  }

  return (
    <View style={{ gap: 10, padding: layout.compact ? 12 : 16, minWidth: layout.compact ? undefined : 320 }}>
      <TextInput
        multiline
        value={body}
        onChangeText={setBody}
        placeholder="Write a comment…"
        style={{
          color: theme.colors.foreground,
          backgroundColor: theme.colors.surface1,
          borderRadius: 8,
          padding: 12,
          minHeight: 100,
        }}
      />
      <Pressable accessibilityRole="button" onPress={() => void post()}>
        <Text style={{ color: theme.colors.accent, fontSize: 14 }}>Post</Text>
      </Pressable>
    </View>
  );
}

export function MoveStatePopover(props: PluginButtonContentProps) {
  const { theme, layout, close } = props;
  const agentId = agentIdFromContext(props);
  const labels = useAgent(agentId ?? "", (agent) => agent.labels);
  const getIssue = useRpc(getIssueRpc);
  const listStates = useRpc(listStatesRpc);
  const moveState = useRpc(moveStateRpc);
  const toast = useToast();

  const identifier = labels?.[ISSUE_LABEL] ?? null;

  const issueQuery = useQuery({
    queryKey: ["linear", "issue", identifier],
    queryFn: () => {
      if (!identifier) throw new Error("This agent has no Linear issue bound");
      return getIssue({ identifier });
    },
    enabled: identifier !== null,
  });

  const issue = issueQuery.data?.issue ?? null;
  const teamId = issue?.team.id ?? null;

  const statesQuery = useQuery({
    queryKey: ["linear", "states", teamId],
    queryFn: () => {
      if (!teamId) throw new Error("No team known for this issue");
      return listStates({ teamId });
    },
    enabled: teamId !== null,
  });

  if (agentId === null) return null;

  async function move(stateId: string) {
    if (!issue) return;
    try {
      const result = await moveState({ issueId: issue.id, stateId });
      toast.show(`Moved to ${result.stateName}`, { variant: "success" });
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move the issue");
    }
  }

  return (
    <View style={{ gap: 6, padding: layout.compact ? 12 : 16, minWidth: layout.compact ? undefined : 240 }}>
      {!identifier ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
          This agent has no Linear issue bound.
        </Text>
      ) : null}
      {issueQuery.isLoading || statesQuery.isLoading ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>Loading states…</Text>
      ) : null}
      {issueQuery.isError ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>Could not load the issue.</Text>
      ) : null}
      {statesQuery.data?.states.map((state) => (
        <Pressable key={state.id} accessibilityRole="button" onPress={() => void move(state.id)}>
          <Text style={{ color: theme.colors.foreground, fontSize: 14, paddingVertical: 4 }}>
            {state.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function LinkBranchPopover(props: PluginButtonContentProps) {
  const { theme, layout, close } = props;
  const workspaceId = props.workspaceId;
  const agentId = agentIdFromContext(props);
  const labels = useAgent(agentId ?? "", (agent) => agent.labels);
  const paseo = usePaseo();
  const linkBranch = useRpc(linkBranchRpc);
  const toast = useToast();

  const workspaceQuery = useQuery({
    queryKey: ["linear", "workspace", workspaceId],
    queryFn: () => paseo.workspaces.ref(workspaceId).refresh(),
  });

  if (agentId === null) return null;

  const issueId = labels?.[ISSUE_ID_LABEL] ?? null;
  const workspace = workspaceQuery.data;
  const branch = workspace?.gitRuntime?.currentBranch ?? null;
  const pullRequest = workspace?.githubRuntime?.pullRequest ?? null;
  const url = pullRequest?.url ?? null;
  const title = pullRequest?.title ?? branch ?? "Branch";

  async function link() {
    if (!issueId) {
      toast.error("This agent has no Linear issue id — reopen it from the Linear panel");
      return;
    }
    if (!url) {
      toast.error("No forge link is known for this branch yet — open a pull request first");
      return;
    }
    try {
      await linkBranch({ issueId, url, title });
      toast.show("Branch linked", { variant: "success" });
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not link the branch");
    }
  }

  return (
    <View style={{ gap: 10, padding: layout.compact ? 12 : 16, minWidth: layout.compact ? undefined : 280 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 14 }}>
        {branch ? `Branch: ${branch}` : "No branch detected for this workspace"}
      </Text>
      {!url ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          {branch
            ? "Open a pull request to get a link Linear can use."
            : "Waiting on workspace git status…"}
        </Text>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => void link()}>
        <Text style={{ color: url ? theme.colors.accent : theme.colors.foregroundMuted, fontSize: 14 }}>
          Link this branch
        </Text>
      </Pressable>
    </View>
  );
}
