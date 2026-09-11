import type { PluginTheme } from "@getpaseo/plugin";
import { type PluginSurfaceProps, useRpc, useSettings, usePaseo } from "@getpaseo/plugin/client";
import { FlatList, Icon, Modal, ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { relativeTime } from "../shared/format";
import type { Issue } from "../shared/issue";
import { listIssuesRpc, listStatesRpc, moveStateRpc, startWorkRpc, syncSettingsRpc } from "../shared/rpc";
import { explainRepoMatch } from "../shared/repo-explain";
import { matchProject, type ProjectRef } from "../shared/repo-match";
import { linearSettings } from "../shared/settings";
import { type DropEffect, columnAtPoint, dropEffect, resolveTargetStateId } from "./drag";
import { resolveStartWorkAvailability } from "./start-work-state";
import { LinearLogo } from "./logo";
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

// Long-press-to-lift timing and the move threshold that distinguishes a
// scroll gesture from an intentional drag. See client/drag.ts for the pure
// column/state resolution helpers used once a drag ends.
const LONG_PRESS_MS = 250;
const MOVE_THRESHOLD = 8;

interface Column {
  name: string;
  color: string;
  minPosition: number;
  issues: Issue[];
}

interface CardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PendingMove {
  issueId: string;
  toColumn: string;
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

/**
 * Names exactly what is missing before "Start work in a new worktree" can run,
 * so the user learns it by reading the card instead of by pressing the button
 * and getting a failure toast. The server-side guards in server/start-work.ts
 * stay the source of truth; this is a second, earlier layer of discoverability.
 */
function missingStartWorkSetting(missingProvider: boolean, missingRepositoryPath: boolean): string | null {
  if (missingProvider && missingRepositoryPath) {
    return "Set a provider and a repository path in Settings → Plugins → Linear";
  }
  if (missingProvider) return "Set a provider in Settings → Plugins → Linear";
  if (missingRepositoryPath) return "Set a repository path in Settings → Plugins → Linear";
  return null;
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

function useCardStyles(theme: PluginTheme) {
  return useMemo(
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
      dimmed: { opacity: 0.4 },
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
}

function CardBody({
  issue,
  theme,
  now,
  styles,
}: {
  issue: Issue;
  theme: PluginTheme;
  now: Date;
  styles: ReturnType<typeof useCardStyles>;
}) {
  const lastParent = issue.parents.length > 0 ? issue.parents[issue.parents.length - 1] : null;
  return (
    <>
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
    </>
  );
}

/**
 * A card owns its own PanResponder from the first touch down, because a
 * responder mounted after a long-press fires never receives the in-flight
 * touch. Before the ~250ms lift timer fires, `onPanResponderTerminationRequest`
 * lets the enclosing ScrollView/FlatList steal the gesture so ordinary
 * scrolling still works; after lift, termination is refused so the drag
 * survives the scroll views around it.
 */
function BoardCard({
  issue,
  theme,
  now,
  isDimmed,
  onOpenIssue,
  onLift,
  onDragMove,
  onDrop,
  onCancelDrag,
}: {
  issue: Issue;
  theme: PluginTheme;
  now: Date;
  isDimmed: boolean;
  onOpenIssue(issue: Issue): void;
  onLift(issue: Issue, layout: CardLayout): void;
  onDragMove(dx: number, dy: number, moveX: number, moveY: number): void;
  onDrop(moveX: number, moveY: number): void;
  onCancelDrag(): void;
}) {
  const cardRef = useRef<View>(null);
  const liftedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const issueRef = useRef(issue);
  issueRef.current = issue;
  const callbacksRef = useRef({ onOpenIssue, onLift, onDragMove, onDrop, onCancelDrag });
  callbacksRef.current = { onOpenIssue, onLift, onDragMove, onDrop, onCancelDrag };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        liftedRef.current = false;
        timerRef.current = setTimeout(() => {
          liftedRef.current = true;
          const node = cardRef.current;
          if (!node) return;
          node.measureInWindow((x, y, width, height) => {
            callbacksRef.current.onLift(issueRef.current, { x, y, width, height });
          });
        }, LONG_PRESS_MS);
      },
      onPanResponderTerminationRequest: () => !liftedRef.current,
      onPanResponderMove: (_event, gestureState) => {
        if (!liftedRef.current) {
          if (Math.abs(gestureState.dx) > MOVE_THRESHOLD || Math.abs(gestureState.dy) > MOVE_THRESHOLD) {
            if (timerRef.current !== null) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
          }
          return;
        }
        callbacksRef.current.onDragMove(gestureState.dx, gestureState.dy, gestureState.moveX, gestureState.moveY);
      },
      onPanResponderRelease: (_event, gestureState) => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (liftedRef.current) {
          liftedRef.current = false;
          callbacksRef.current.onDrop(gestureState.moveX, gestureState.moveY);
          return;
        }
        if (Math.abs(gestureState.dx) < MOVE_THRESHOLD && Math.abs(gestureState.dy) < MOVE_THRESHOLD) {
          callbacksRef.current.onOpenIssue(issueRef.current);
        }
      },
      onPanResponderTerminate: () => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (liftedRef.current) {
          liftedRef.current = false;
          callbacksRef.current.onCancelDrag();
        }
      },
    }),
  ).current;

  const styles = useCardStyles(theme);

  return (
    <View
      ref={cardRef}
      accessibilityRole="button"
      accessibilityLabel={`${issue.identifier}: ${issue.title}`}
      style={[styles.card, isDimmed ? styles.dimmed : null]}
      {...panResponder.panHandlers}
    >
      <CardBody issue={issue} theme={theme} now={now} styles={styles} />
    </View>
  );
}

/** The card copy that follows the finger while a drag is in flight. */
function FloatingCard({
  issue,
  theme,
  now,
  position,
  width,
  effect,
}: {
  issue: Issue;
  theme: PluginTheme;
  now: Date;
  position: Animated.ValueXY;
  width: number;
  effect: DropEffect;
}) {
  const styles = useCardStyles(theme);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.card,
        {
          position: "absolute" as const,
          left: position.x,
          top: position.y,
          width,
          marginBottom: 0,
          opacity: effect === "move" ? 0.9 : 0.5,
          transform: [{ scale: 1.03 }],
        },
      ]}
    >
      <CardBody issue={issue} theme={theme} now={now} styles={styles} />
    </Animated.View>
  );
}

function BoardColumn({
  column,
  theme,
  columnWidth,
  now,
  isRefreshing,
  isDragging,
  isDropTarget,
  liftedIssueId,
  onRefresh,
  onOpenIssue,
  onCreate,
  onLift,
  onDragMove,
  onDrop,
  onCancelDrag,
  registerColumnRef,
}: {
  column: Column;
  theme: PluginTheme;
  columnWidth: number;
  now: Date;
  isRefreshing: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  liftedIssueId: string | null;
  onRefresh(): void;
  onOpenIssue(issue: Issue): void;
  onCreate(): void;
  onLift(issue: Issue, layout: CardLayout): void;
  onDragMove(dx: number, dy: number, moveX: number, moveY: number): void;
  onDrop(moveX: number, moveY: number): void;
  onCancelDrag(): void;
  registerColumnRef(name: string, node: View | null): void;
}) {
  const styles = useMemo(
    () => ({
      // No explicit height: the horizontal ScrollView's content container defaults to
      // alignItems "stretch", so each column fills the bounded height of the board.
      // The border is always present (transparent by default) and reserves the same
      // 1px of space whether or not this column is the active drop target, so
      // highlighting it never shifts the layout.
      column: {
        width: columnWidth,
        marginRight: 12,
        borderWidth: 1,
        borderRadius: 8,
        borderColor: "transparent",
      },
      columnActive: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.surface1,
      },
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

  const setColumnRef = useCallback(
    (node: View | null) => registerColumnRef(column.name, node),
    [registerColumnRef, column.name],
  );

  return (
    <View style={[styles.column, isDropTarget ? styles.columnActive : null]} ref={setColumnRef}>
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
        scrollEnabled={!isDragging}
        ListEmptyComponent={<Text style={styles.empty}>No issues.</Text>}
        renderItem={({ item }) => (
          <BoardCard
            issue={item}
            theme={theme}
            now={now}
            isDimmed={liftedIssueId === item.id}
            onOpenIssue={onOpenIssue}
            onLift={onLift}
            onDragMove={onDragMove}
            onDrop={onDrop}
            onCancelDrag={onCancelDrag}
          />
        )}
      />
    </View>
  );
}

export function IssuesBoard({
  theme,
  layout,
  repositoryPath,
}: {
  theme: PluginTheme;
  layout: PluginLayout;
  repositoryPath?: string;
}) {
  const [scope, setScope] = useState<Scope>("assigned");
  const [selected, setSelected] = useState<Issue | null>(null);
  const [createFor, setCreateFor] = useState<string | null>(null);
  const [liftedIssue, setLiftedIssue] = useState<Issue | null>(null);
  const [originColumn, setOriginColumn] = useState<string | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [manualProjectId, setManualProjectId] = useState<string | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const listIssues = useRpc(listIssuesRpc);
  const listStates = useRpc(listStatesRpc);
  const moveState = useRpc(moveStateRpc);
  const startWork = useRpc(startWorkRpc);
  const syncSettings = useRpc(syncSettingsRpc);
  const toast = useToast();
  const { pending, offer, dismiss } = useLaunchFollowUp();
  const now = useMemo(() => new Date(), []);
  const settingsState = useSettings(linearSettings);
  const paseo = usePaseo();

  // Settings still loading is a transient, honest "don't know yet" — never
  // report it as "not configured" (see resolveStartWorkAvailability). A
  // resolved-but-unreadable document (error/invalid) falls back to the same
  // conservative default as before: never enable a write the guard exists to
  // prevent.
  const settingsLoading = settingsState.status === "loading";
  const settingsValues = settingsState.status === "ready" ? settingsState.values : null;
  const missingProvider = !(settingsValues?.provider.trim());

  const projectsQuery = useQuery({
    queryKey: ["linear", "projects"],
    queryFn: () => paseo.projects.list(),
  });

  // Prefer the custom name when set — that is the name the user sees and
  // renames in Paseo itself. rootPath is what actually disambiguates two
  // projects that happen to share a name.
  const projects = useMemo<ProjectRef[]>(
    () =>
      (projectsQuery.data?.projects ?? []).map((project) => ({
        id: project.projectId,
        name: project.projectCustomName || project.projectDisplayName,
        rootPath: project.projectRootPath,
      })),
    [projectsQuery.data],
  );

  // A fresh card open should start from the automatic match, not whatever was
  // last picked (manually or automatically) for a previous issue.
  const selectedIssueId = selected?.id ?? null;
  useEffect(() => {
    setManualProjectId(null);
    setProjectPickerOpen(false);
    // Deliberately keyed only on the issue identity, not on projects/settings —
    // those should recompute the automatic match in place, not reset a choice
    // the user already made while this modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIssueId]);

  const repoMatch = useMemo(() => {
    if (!selected) return null;
    return matchProject({
      labels: selected.labels,
      repoLabelGroup: settingsValues?.repoLabelGroup ?? "",
      projects,
      projectByRepoLabel: settingsValues?.projectByRepoLabel ?? {},
      lastProjectId: settingsValues?.lastProjectId ?? "",
    });
  }, [selected, projects, settingsValues]);

  const selectedProjectId = manualProjectId ?? repoMatch?.project?.id ?? null;
  const selectedProject = selectedProjectId
    ? (projects.find((project) => project.id === selectedProjectId) ?? null)
    : null;
  // Once the user has made an explicit choice, the automatic-match copy no
  // longer describes what's shown — only explain an unmodified preselection.
  const matchExplanation = manualProjectId === null && repoMatch ? explainRepoMatch(repoMatch) : null;

  const effectiveRepositoryPath =
    settingsValues?.repositoryPath.trim() || selectedProject?.rootPath.trim() || repositoryPath?.trim() || "";
  const missingRepositoryPath = !effectiveRepositoryPath;
  const missingSettingMessage = missingStartWorkSetting(missingProvider, missingRepositoryPath);
  const startWorkAvailability = resolveStartWorkAvailability(settingsLoading, missingSettingMessage);
  const canStartWork = startWorkAvailability.status === "ready";

  const boardWrapRef = useRef<View>(null);
  const columnRefs = useRef(new Map<string, View>());
  const columnRectsRef = useRef<Array<{ name: string; x: number; width: number }>>([]);
  const hoveredColumnRef = useRef<string | null>(null);
  const cardOffsetRef = useRef({ x: 0, y: 0 });
  const cardSizeRef = useRef({ width: 0, height: 0 });
  const dragPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const query = useQuery({
    queryKey: ["linear", "issues", scope],
    queryFn: () => listIssues({ scope }),
  });

  const effectiveIssues = useMemo(() => {
    const issues = query.data?.issues ?? [];
    if (!pendingMove) return issues;
    return issues.map((issue) =>
      issue.id === pendingMove.issueId
        ? { ...issue, state: { ...issue.state, name: pendingMove.toColumn } }
        : issue,
    );
  }, [query.data, pendingMove]);

  const columns = useMemo(() => buildColumns(effectiveIssues), [effectiveIssues]);
  const columnWidth = layout.compact ? 260 : 280;
  const isDragging = liftedIssue !== null;
  const currentDropEffect = dropEffect(hoveredColumn, originColumn);

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
      startRow: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 8 },
      start: { color: theme.colors.accent, fontSize: 13, paddingVertical: 8 },
      startDisabled: { color: theme.colors.foregroundMuted, fontSize: 13, paddingVertical: 8 },
      startHint: { color: theme.colors.foregroundMuted, fontSize: 12, marginTop: -4 },
      repoPicker: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      repoPickerText: { color: theme.colors.foreground, fontSize: 13 },
      repoPickerPlaceholder: { color: theme.colors.foregroundMuted, fontSize: 13 },
      repoMatchHint: { color: theme.colors.foregroundMuted, fontSize: 12, marginTop: -4 },
      repoProjectList: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        marginTop: 4,
        maxHeight: 200,
      },
      repoProjectRow: { paddingHorizontal: 10, paddingVertical: 8 },
      repoProjectRowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
      repoProjectName: { color: theme.colors.foreground, fontSize: 13 },
      repoProjectPath: { color: theme.colors.foregroundMuted, fontSize: 11, marginTop: 2 },
      moveLabel: { color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const, marginTop: 4 },
      moveRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, paddingVertical: 8 },
      moveDot: { width: 8, height: 8, borderRadius: 4 },
      moveText: { color: theme.colors.foreground, fontSize: 13 },
    }),
    [theme, layout.compact],
  );

  const registerColumnRef = useCallback((name: string, node: View | null) => {
    if (node) columnRefs.current.set(name, node);
    else columnRefs.current.delete(name);
  }, []);

  function clearDrag() {
    setLiftedIssue(null);
    setOriginColumn(null);
    hoveredColumnRef.current = null;
    setHoveredColumn(null);
  }

  function onLift(issue: Issue, cardLayout: CardLayout) {
    const wrap = boardWrapRef.current;
    if (!wrap) return;
    const entries = Array.from(columnRefs.current.entries());
    Promise.all(
      entries.map(
        ([name, node]) =>
          new Promise<{ name: string; x: number; width: number }>((resolve) => {
            node.measureInWindow((x, _y, width) => resolve({ name, x, width }));
          }),
      ),
    ).then((rects) => {
      columnRectsRef.current = rects;
      wrap.measureInWindow((wx, wy) => {
        cardOffsetRef.current = { x: cardLayout.x - wx, y: cardLayout.y - wy };
        cardSizeRef.current = { width: cardLayout.width, height: cardLayout.height };
        dragPosition.setValue({ x: cardOffsetRef.current.x, y: cardOffsetRef.current.y });
        setOriginColumn(issue.state.name);
        setLiftedIssue(issue);
      });
    });
  }

  function onDragMove(dx: number, dy: number, moveX: number, moveY: number) {
    dragPosition.setValue({ x: cardOffsetRef.current.x + dx, y: cardOffsetRef.current.y + dy });
    // columnAtPoint runs on every pointer move, so only touch state (and trigger a
    // re-render) when the hovered column actually changes; a setState per move event
    // would cause a re-render storm and make the drag feel laggy.
    const target = columnAtPoint(columnRectsRef.current, moveX);
    if (target !== hoveredColumnRef.current) {
      hoveredColumnRef.current = target;
      setHoveredColumn(target);
    }
  }

  async function moveIssueToColumn(issue: Issue, targetColumnName: string) {
    if (targetColumnName === issue.state.name) return;
    setPendingMove({ issueId: issue.id, toColumn: targetColumnName });
    try {
      const { states } = await listStates({ teamId: issue.team.id });
      const targetStateId = resolveTargetStateId(states, targetColumnName);
      if (targetStateId === null) {
        setPendingMove(null);
        toast.error(`${issue.team.name} has no "${targetColumnName}" state`);
        return;
      }
      const result = await moveState({ issueId: issue.id, stateId: targetStateId });
      toast.show(`Moved ${issue.identifier} to ${result.stateName}`, { variant: "success" });
      await query.refetch();
      setPendingMove(null);
    } catch (error) {
      setPendingMove(null);
      toast.error(error instanceof Error ? error.message : "Could not move issue");
    }
  }

  function onDrop(moveX: number, _moveY: number) {
    const issue = liftedIssue;
    const origin = originColumn;
    const targetName = columnAtPoint(columnRectsRef.current, moveX);
    clearDrag();
    // The explicit null check narrows targetName for the call below; dropEffect owns
    // the rest of the rule, so the highlight and the write can never disagree about
    // what a drop does.
    if (!issue || targetName === null || dropEffect(targetName, origin) === "none") return;
    void moveIssueToColumn(issue, targetName);
  }

  function onCancelDrag() {
    clearDrag();
  }

  // A convenience write, not part of the start-work operation: the worktree and
  // agent already exist by the time this runs, so a stale-revision conflict or
  // any other failure here is swallowed quietly rather than surfaced as an error.
  async function rememberProjectChoice(project: ProjectRef, repoLabel: string | null) {
    if (settingsState.status !== "ready") return;
    try {
      const nextValues = {
        ...settingsState.values,
        lastProjectId: project.id,
        ...(repoLabel
          ? { projectByRepoLabel: { ...settingsState.values.projectByRepoLabel, [repoLabel]: project.id } }
          : {}),
      };
      const ok = await settingsState.save(nextValues, settingsState.revision);
      if (ok) await syncSettings({ values: nextValues });
    } catch {
      // Swallow — see comment above.
    }
  }

  async function begin(issue: Issue) {
    const project = selectedProject;
    const repoLabel = repoMatch?.repoLabel ?? null;
    try {
      const result = await startWork({
        identifier: issue.identifier,
        repositoryPath: project?.rootPath ?? repositoryPath,
      });
      toast.show(`Started ${issue.identifier} on ${result.branchName}`, { variant: "success" });
      setSelected(null);
      offer(issue);
      if (project) void rememberProjectChoice(project, repoLabel);
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
          <View style={styles.boardWrap} ref={boardWrapRef}>
            <ScrollView horizontal style={styles.board} contentContainerStyle={styles.boardContent} scrollEnabled={!isDragging}>
              {columns.map((column) => (
                <BoardColumn
                  key={column.name}
                  column={column}
                  theme={theme}
                  columnWidth={columnWidth}
                  now={now}
                  isRefreshing={query.isFetching}
                  isDragging={isDragging}
                  isDropTarget={column.name === hoveredColumn && currentDropEffect === "move"}
                  liftedIssueId={liftedIssue?.id ?? null}
                  onRefresh={() => void query.refetch()}
                  onOpenIssue={setSelected}
                  onCreate={() => setCreateFor(column.name)}
                  onLift={onLift}
                  onDragMove={onDragMove}
                  onDrop={onDrop}
                  onCancelDrag={onCancelDrag}
                  registerColumnRef={registerColumnRef}
                />
              ))}
            </ScrollView>
            {liftedIssue ? (
              <FloatingCard
                issue={liftedIssue}
                theme={theme}
                now={now}
                position={dragPosition}
                width={cardSizeRef.current.width}
                effect={currentDropEffect}
              />
            ) : null}
          </View>
        )
      ) : null}

      <Modal
        title={selected ? `${selected.identifier} · ${selected.title}` : ""}
        icon={<LinearLogo size={16} color={theme.colors.foreground} />}
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
        }}
      >
        <Modal.Content>
          {selected ? (
            <View style={{ gap: layout.compact ? 8 : 12 }}>
              <IssueCard issue={selected} theme={theme} layout={layout} />
              <View style={styles.startRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canStartWork }}
                  onPress={() => {
                    if (canStartWork) void begin(selected);
                  }}
                >
                  <Text style={canStartWork ? styles.start : styles.startDisabled}>
                    Start work in a new worktree
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose repository"
                  onPress={() => setProjectPickerOpen((open) => !open)}
                  style={styles.repoPicker}
                >
                  <Text
                    style={selectedProject ? styles.repoPickerText : styles.repoPickerPlaceholder}
                    numberOfLines={1}
                  >
                    {selectedProject ? selectedProject.name : "Choose a repository"}
                  </Text>
                  <Icon name="ChevronDown" size={14} color={theme.colors.foregroundMuted} />
                </Pressable>
              </View>
              {startWorkAvailability.status === "missing" ? (
                <Text style={styles.startHint}>{startWorkAvailability.message}</Text>
              ) : null}
              {matchExplanation ? <Text style={styles.repoMatchHint}>{matchExplanation}</Text> : null}
              {projectPickerOpen ? (
                projectsQuery.isPending ? (
                  <Text style={styles.muted}>Loading projects…</Text>
                ) : projectsQuery.isError ? (
                  <Text style={styles.error}>
                    {projectsQuery.error instanceof Error ? projectsQuery.error.message : "Could not load projects"}
                  </Text>
                ) : projects.length === 0 ? (
                  <Text style={styles.muted}>No projects found.</Text>
                ) : (
                  <ScrollView style={styles.repoProjectList}>
                    {projects.map((project, index) => (
                      <Pressable
                        key={project.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${project.name}`}
                        onPress={() => {
                          setManualProjectId(project.id);
                          setProjectPickerOpen(false);
                        }}
                        style={[styles.repoProjectRow, index > 0 ? styles.repoProjectRowDivider : null]}
                      >
                        <Text style={styles.repoProjectName} numberOfLines={1}>
                          {project.name}
                        </Text>
                        <Text style={styles.repoProjectPath} numberOfLines={1}>
                          {project.rootPath}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )
              ) : null}
              {columns.length > 0 ? (
                <View>
                  <Text style={styles.moveLabel}>Move to…</Text>
                  {columns.map((column) => (
                    <Pressable
                      key={column.name}
                      accessibilityRole="button"
                      accessibilityLabel={`Move to ${column.name}`}
                      onPress={() => {
                        const issue = selected;
                        setSelected(null);
                        if (issue) void moveIssueToColumn(issue, column.name);
                      }}
                      style={styles.moveRow}
                    >
                      <View style={[styles.moveDot, { backgroundColor: column.color }]} />
                      <Text style={styles.moveText}>{column.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
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
