import type { PluginTheme } from "@getpaseo/plugin";
import { type PluginSurfaceProps, useRpc } from "@getpaseo/plugin/client";
import { FlatList, Icon, Modal, ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { relativeTime } from "../shared/format";
import type { Issue } from "../shared/issue";
import { listIssuesRpc, startWorkRpc } from "../shared/rpc";
import { CreateIssueModal } from "./create-issue";
import { IssueCard } from "./chip";
import { LaunchFollowUp, useLaunchFollowUp } from "./launch";

type PluginLayout = PluginSurfaceProps["layout"];

const SCOPES = [
  { id: "assigned", label: "Mine" },
  { id: "cycle", label: "Cycle" },
  { id: "unassigned", label: "Up for grabs" },
  { id: "triage", label: "Triage" },
] as const;

export type Scope = (typeof SCOPES)[number]["id"];

interface Column {
  name: string;
  color: string;
  minPosition: number;
  issues: Issue[];
}

function buildColumns(issues: Issue[]): Column[] {
  const byName = new Map<string, Column>();
  for (const issue of issues) {
    const key = issue.state.name;
    const existing = byName.get(key);
    if (existing) {
      existing.issues.push(issue);
      if (issue.state.position < existing.minPosition) existing.minPosition = issue.state.position;
    } else {
      byName.set(key, {
        name: key,
        color: issue.state.color,
        minPosition: issue.state.position,
        issues: [issue],
      });
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.minPosition - b.minPosition);
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

const PRIORITY_ICON: Record<number, string> = {
  1: "CircleAlert",
  2: "SignalHigh",
  3: "SignalMedium",
  4: "SignalLow",
};

function PriorityIndicator({ issue, theme }: { issue: Issue; theme: PluginTheme }) {
  const icon = PRIORITY_ICON[issue.priority];
  if (!icon) return null;
  const color = issue.priority === 1 ? theme.colors.statusDanger : theme.colors.foregroundMuted;
  return <Icon name={icon} size={12} color={color} />;
}

function BoardCard({
  issue,
  theme,
  now,
  onPress,
}: {
  issue: Issue;
  theme: PluginTheme;
  now: Date;
  onPress(): void;
}) {
  const styles = useMemo(
    () => ({
      card: {
        backgroundColor: theme.colors.surface1,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 10,
        gap: 6,
        marginBottom: 8,
      },
      topRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
      identifier: { color: theme.colors.foregroundMuted, fontSize: 11 },
      parentCrumb: { color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1 },
      spacer: { flex: 1 },
      avatar: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: theme.colors.surface2,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      avatarText: { color: theme.colors.foregroundMuted, fontSize: 9, fontWeight: "600" as const },
      title: { color: theme.colors.foreground, fontSize: 13 },
      metaRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, gap: 6 },
      metaItem: { flexDirection: "row" as const, alignItems: "center" as const, gap: 3 },
      metaText: { color: theme.colors.foregroundMuted, fontSize: 11 },
      chip: { backgroundColor: theme.colors.surface2, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
      chipText: { fontSize: 10 },
      created: { color: theme.colors.foregroundMuted, fontSize: 11 },
    }),
    [theme],
  );

  const lastParent = issue.parents.length > 0 ? issue.parents[issue.parents.length - 1] : null;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.identifier}>{issue.identifier}</Text>
        {lastParent ? (
          <Text style={styles.parentCrumb} numberOfLines={1}>
            {`› ${lastParent.title}`}
          </Text>
        ) : null}
        <View style={styles.spacer} />
        {issue.assignee ? (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(issue.assignee.name)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {issue.title}
      </Text>
      <View style={styles.metaRow}>
        {issue.priority > 0 ? <PriorityIndicator issue={issue} theme={theme} /> : null}
        {issue.estimate !== null ? (
          <View style={styles.metaItem}>
            <Icon name="CircleDot" size={11} color={theme.colors.foregroundMuted} />
            <Text style={styles.metaText}>{issue.estimate}</Text>
          </View>
        ) : null}
        {issue.project ? (
          <View style={styles.metaItem}>
            {issue.project.icon ? (
              <Icon name={issue.project.icon} size={11} color={issue.project.color ?? theme.colors.foregroundMuted} />
            ) : null}
            <Text style={styles.metaText}>{issue.project.name}</Text>
          </View>
        ) : null}
        {issue.labels.map((label) => (
          <View key={label.name} style={styles.chip}>
            <Text style={[styles.chipText, { color: label.color }]}>{label.name}</Text>
          </View>
        ))}
        {issue.prCount > 0 ? (
          <View style={styles.metaItem}>
            <Icon name="GitPullRequest" size={11} color={theme.colors.foregroundMuted} />
            <Text style={styles.metaText}>{issue.prCount}</Text>
          </View>
        ) : null}
        {issue.dueDate ? (
          <View style={styles.metaItem}>
            <Icon name="Calendar" size={11} color={theme.colors.foregroundMuted} />
            <Text style={styles.metaText}>{issue.dueDate}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.created}>{`Created ${relativeTime(issue.createdAt, now)}`}</Text>
    </Pressable>
  );
}

function BoardColumn({
  column,
  theme,
  columnWidth,
  now,
  isRefreshing,
  onRefresh,
  onOpenIssue,
  onCreate,
}: {
  column: Column;
  theme: PluginTheme;
  columnWidth: number;
  now: Date;
  isRefreshing: boolean;
  onRefresh(): void;
  onOpenIssue(issue: Issue): void;
  onCreate(): void;
}) {
  const styles = useMemo(
    () => ({
      // No explicit height: the horizontal ScrollView's content container defaults to
      // alignItems "stretch", so each column fills the bounded height of the board.
      column: { width: columnWidth, marginRight: 12 },
      header: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, paddingBottom: 8 },
      dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: column.color },
      name: { color: theme.colors.foreground, fontSize: 13, fontWeight: "600" as const, flexShrink: 1 },
      count: { color: theme.colors.foregroundMuted, fontSize: 12 },
      spacer: { flex: 1 },
      list: { flex: 1, minHeight: 0 },
      empty: { color: theme.colors.foregroundMuted, fontSize: 12, paddingVertical: 12, textAlign: "center" as const },
    }),
    [theme, columnWidth, column.color],
  );

  return (
    <View style={styles.column}>
      <View style={styles.header}>
        <View style={styles.dot} />
        <Text style={styles.name} numberOfLines={1}>
          {column.name}
        </Text>
        <Text style={styles.count}>{column.issues.length}</Text>
        <View style={styles.spacer} />
        <Pressable accessibilityRole="button" accessibilityLabel={`New issue in ${column.name}`} onPress={onCreate}>
          <Icon name="Plus" size={16} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
      <FlatList
        style={styles.list}
        data={column.issues}
        keyExtractor={(issue) => issue.id}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<Text style={styles.empty}>No issues.</Text>}
        renderItem={({ item }) => (
          <BoardCard issue={item} theme={theme} now={now} onPress={() => onOpenIssue(item)} />
        )}
      />
    </View>
  );
}

export function IssuesBoard({ theme, layout }: { theme: PluginTheme; layout: PluginLayout }) {
  const [scope, setScope] = useState<Scope>("assigned");
  const [selected, setSelected] = useState<Issue | null>(null);
  const [createFor, setCreateFor] = useState<string | null>(null);
  const listIssues = useRpc(listIssuesRpc);
  const startWork = useRpc(startWorkRpc);
  const toast = useToast();
  const { pending, offer, dismiss } = useLaunchFollowUp();
  const now = useMemo(() => new Date(), []);

  const query = useQuery({
    queryKey: ["linear", "issues", scope],
    queryFn: () => listIssues({ scope }),
  });

  const columns = useMemo(() => buildColumns(query.data?.issues ?? []), [query.data]);
  const columnWidth = layout.compact ? 260 : 280;

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
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
      empty: { color: theme.colors.foregroundMuted, fontSize: 13, paddingVertical: 16, textAlign: "center" as const },
      // The board is the vertical extent: flex 1 bounds the ScrollView, and its content
      // container stretches the columns to that height. A percentage-height chain here
      // collapses when any ancestor is unbounded, so keep this flex-based.
      boardWrap: { flex: 1, minHeight: 0 },
      board: { flex: 1 },
      boardContent: { flexDirection: "row" as const, paddingBottom: 8 },
      start: { color: theme.colors.accent, fontSize: 13, paddingVertical: 8 },
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
        columns.length === 0 ? (
          <Text style={styles.empty}>No issues in this view.</Text>
        ) : (
          <View style={styles.boardWrap}>
            <ScrollView horizontal style={styles.board} contentContainerStyle={styles.boardContent}>
              {columns.map((column) => (
                <BoardColumn
                  key={column.name}
                  column={column}
                  theme={theme}
                  columnWidth={columnWidth}
                  now={now}
                  isRefreshing={query.isFetching}
                  onRefresh={() => void query.refetch()}
                  onOpenIssue={setSelected}
                  onCreate={() => setCreateFor(column.name)}
                />
              ))}
            </ScrollView>
          </View>
        )
      ) : null}

      <Modal
        title={selected ? `${selected.identifier} · ${selected.title}` : ""}
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
        }}
      >
        <Modal.Content>
          {selected ? (
            <View style={{ gap: layout.compact ? 8 : 12 }}>
              <IssueCard issue={selected} theme={theme} layout={layout} />
              <Pressable accessibilityRole="button" onPress={() => void begin(selected)}>
                <Text style={styles.start}>Start work in a new worktree</Text>
              </Pressable>
            </View>
          ) : null}
        </Modal.Content>
      </Modal>

      <CreateIssueModal
        open={createFor !== null}
        stateName={createFor ?? ""}
        assignToMe={scope === "assigned"}
        theme={theme}
        layout={layout}
        onClose={() => setCreateFor(null)}
        onCreated={(identifier) => {
          setCreateFor(null);
          toast.show(`Created ${identifier}`, { variant: "success" });
          void query.refetch();
        }}
      />

      <LaunchFollowUp issue={pending} theme={theme} layout={layout} onDone={dismiss} />
    </View>
  );
}
