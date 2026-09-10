import type { PluginTheme } from "@getpaseo/plugin";
import { type PluginSurfaceProps, type PluginWorkspacePanelProps, useRpc } from "@getpaseo/plugin/client";
import { FlatList, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Issue } from "../shared/issue";
import { listIssuesRpc, startWorkRpc } from "../shared/rpc";
import { IssueCard, IssueChip } from "./chip";
import { LaunchFollowUp, useLaunchFollowUp } from "./launch";

type PluginLayout = PluginSurfaceProps["layout"];

const SCOPES = [
  { id: "assigned", label: "Assigned" },
  { id: "cycle", label: "Cycle" },
  { id: "triage", label: "Triage" },
] as const;

type Scope = (typeof SCOPES)[number]["id"];

export function IssuesList({ theme, layout }: { theme: PluginTheme; layout: PluginLayout }) {
  const [scope, setScope] = useState<Scope>("assigned");
  const [selected, setSelected] = useState<Issue | null>(null);
  const listIssues = useRpc(listIssuesRpc);
  const startWork = useRpc(startWorkRpc);
  const toast = useToast();
  const { pending, offer, dismiss } = useLaunchFollowUp();

  const query = useQuery({
    queryKey: ["linear", "issues", scope],
    queryFn: () => listIssues({ scope }),
  });

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        backgroundColor: theme.colors.surface0,
        padding: layout.compact ? 12 : 16,
        gap: 12,
      },
      tabs: { flexDirection: "row" as const, gap: 8 },
      tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
      tabText: { fontSize: 13 },
      row: { paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
      title: { color: theme.colors.foreground, fontSize: 14 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
      start: { color: theme.colors.accent, fontSize: 13, paddingVertical: 8 },
      empty: { color: theme.colors.foregroundMuted, fontSize: 13, paddingVertical: 16, textAlign: "center" as const },
    }),
    [theme, layout.compact],
  );

  async function begin(issue: Issue) {
    try {
      const result = await startWork({ identifier: issue.identifier });
      toast.show(`Started ${issue.identifier} on ${result.branchName}`, { variant: "success" });
      setSelected(null);
      offer(issue);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start work");
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {SCOPES.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            onPress={() => setScope(entry.id)}
            style={[
              styles.tab,
              { backgroundColor: scope === entry.id ? theme.colors.surface2 : "transparent" },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: scope === entry.id ? theme.colors.foreground : theme.colors.foregroundMuted },
              ]}
            >
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {query.isPending ? <Text style={styles.muted}>Loading issues…</Text> : null}
      {query.isError ? (
        <Text style={styles.error}>{query.error instanceof Error ? query.error.message : "Could not load issues"}</Text>
      ) : null}

      {query.data ? (
        <FlatList
          style={{ flex: 1, minHeight: 0 }}
          data={query.data.issues}
          keyExtractor={(issue) => issue.id}
          refreshing={query.isFetching}
          onRefresh={() => void query.refetch()}
          ListEmptyComponent={<Text style={styles.empty}>No issues in this view.</Text>}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelected(selected?.id === item.id ? null : item)}
              style={styles.row}
            >
              <IssueChip issue={item} theme={theme} layout={layout} onPress={() => setSelected(item)} />
              <Text style={styles.title}>{item.title}</Text>
              <Text style={[styles.muted, { color: item.state.color }]}>{item.state.name}</Text>
              {selected?.id === item.id ? (
                <View>
                  <IssueCard issue={item} theme={theme} layout={layout} />
                  <Pressable accessibilityRole="button" onPress={() => void begin(item)}>
                    <Text style={styles.start}>Start work in a new worktree</Text>
                  </Pressable>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      ) : null}

      <LaunchFollowUp issue={pending} theme={theme} layout={layout} onDone={dismiss} />
    </View>
  );
}

export function IssuesPanel(props: PluginWorkspacePanelProps) {
  return <IssuesList theme={props.theme} layout={props.layout} />;
}

export function IssuesSurface(props: PluginSurfaceProps) {
  return <IssuesList theme={props.theme} layout={props.layout} />;
}
