import type { PluginTheme } from "@getpaseo/plugin";
import { type PluginSurfaceProps, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { isValidDueDate } from "../shared/format";
import { createIssueRpc, listStatesRpc, listTeamsRpc } from "../shared/rpc";
import { linearSettings } from "../shared/settings";

type PluginLayout = PluginSurfaceProps["layout"];

const PRIORITIES = [
  { value: 0, label: "No priority" },
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
] as const;

export function CreateIssueModal({
  open,
  stateName,
  assignToMe,
  theme,
  layout,
  onClose,
  onCreated,
}: {
  open: boolean;
  stateName: string;
  assignToMe: boolean;
  theme: PluginTheme;
  layout: PluginLayout;
  onClose(): void;
  onCreated(identifier: string): void;
}) {
  const settings = useSettings(linearSettings);
  const listTeams = useRpc(listTeamsRpc);
  const listStates = useRpc(listStatesRpc);
  const createIssue = useRpc(createIssueRpc);
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [teams, setTeams] = useState<Array<{ id: string; key: string; name: string }> | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultTeamKey = settings.status === "ready" ? settings.values.defaultTeamKey : "";

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setPriority(0);
    setDueDate("");
    setError(null);
    setTeams(null);
    setTeamId(null);
    listTeams({})
      .then((result) => {
        setTeams(result.teams);
        const preferred = defaultTeamKey
          ? result.teams.find((team) => team.key === defaultTeamKey)
          : undefined;
        setTeamId((preferred ?? result.teams[0])?.id ?? null);
      })
      .catch((teamsError) => {
        setError(teamsError instanceof Error ? teamsError.message : "Could not load teams");
        setTeams([]);
      });
    // Only re-run when the modal opens for a new column.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const styles = useMemo(
    () => ({
      body: { gap: layout.compact ? 10 : 14 },
      label: { color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const },
      context: { color: theme.colors.foreground, fontSize: 13 },
      input: {
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        borderRadius: 8,
        padding: 10,
      },
      priorityRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
      priorityOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
      priorityText: { fontSize: 12 },
      teamRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
      teamOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
      teamText: { fontSize: 12 },
      error: { color: theme.colors.statusDanger, fontSize: 12 },
      submit: { color: theme.colors.accent, fontSize: 14, paddingVertical: 8 },
      submitDisabled: { color: theme.colors.foregroundMuted, fontSize: 14, paddingVertical: 8 },
      cancel: { color: theme.colors.foregroundMuted, fontSize: 14, paddingVertical: 8 },
    }),
    [theme, layout.compact],
  );

  const dueDateInvalid = dueDate.trim().length > 0 && !isValidDueDate(dueDate.trim());
  const canSubmit = title.trim().length > 0 && teamId !== null && !dueDateInvalid && !submitting;

  async function submit() {
    if (!canSubmit || teamId === null) return;
    setSubmitting(true);
    setError(null);
    try {
      let stateId: string | undefined;
      const { states } = await listStates({ teamId });
      const matched = states.find((state) => state.name === stateName);
      if (matched) stateId = matched.id;

      const result = await createIssue({
        title: title.trim(),
        teamId,
        ...(stateId !== undefined ? { stateId } : {}),
        ...(priority !== 0 ? { priority } : {}),
        ...(dueDate.trim() ? { dueDate: dueDate.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(assignToMe ? { assignToMe: true } : {}),
      });
      onCreated(result.identifier);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create the issue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`New issue in ${stateName}`} open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <Modal.Content>
        <View style={styles.body}>
          <Text style={styles.context}>{`Status: ${stateName}`}</Text>

          <View>
            <Text style={styles.label}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Issue title"
              style={styles.input}
            />
          </View>

          <View>
            <Text style={styles.label}>Description</Text>
            <TextInput
              multiline
              value={description}
              onChangeText={setDescription}
              placeholder="Optional description"
              style={[styles.input, { minHeight: 80 }]}
            />
          </View>

          <View>
            <Text style={styles.label}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => setPriority(option.value)}
                  style={[
                    styles.priorityOption,
                    { backgroundColor: priority === option.value ? theme.colors.surface2 : "transparent" },
                  ]}
                >
                  <Text
                    style={[
                      styles.priorityText,
                      { color: priority === option.value ? theme.colors.foreground : theme.colors.foregroundMuted },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View>
            <Text style={styles.label}>Due date</Text>
            <TextInput
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              style={styles.input}
            />
            {dueDateInvalid ? <Text style={styles.error}>Enter a valid date as YYYY-MM-DD.</Text> : null}
          </View>

          <View>
            <Text style={styles.label}>Team</Text>
            {teams === null ? (
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>Loading teams…</Text>
            ) : (
              <View style={styles.teamRow}>
                {teams.map((team) => (
                  <Pressable
                    key={team.id}
                    accessibilityRole="button"
                    onPress={() => setTeamId(team.id)}
                    style={[
                      styles.teamOption,
                      { backgroundColor: teamId === team.id ? theme.colors.surface2 : "transparent" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.teamText,
                        { color: teamId === team.id ? theme.colors.foreground : theme.colors.foregroundMuted },
                      ]}
                    >
                      {team.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable accessibilityRole="button" disabled={!canSubmit} onPress={() => void submit()}>
            <Text style={canSubmit ? styles.submit : styles.submitDisabled}>
              {submitting ? "Creating…" : "Create issue"}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}
