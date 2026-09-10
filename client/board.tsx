import type { PluginTheme } from "@getpaseo/plugin";
import { type PluginSurfaceProps, useRpc } from "@getpaseo/plugin/client";
import { FlatList, Icon, Modal, ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { relativeTime } from "../shared/format";
import type { Issue } from "../shared/issue";
import { listIssuesRpc, listStatesRpc, moveStateRpc, startWorkRpc } from "../shared/rpc";
import { type DropEffect, columnAtPoint, dropEffect, resolveTargetStateId } from "./drag";
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

export function IssuesBoard({ theme, layout }: { theme: PluginTheme; layout: PluginLayout }) {
  const [scope, setScope] = useState<Scope>("assigned");
  const [selected, setSelected] = useState<Issue | null>(null);
  const [createFor, setCreateFor] = useState<string | null>(null);
  const [liftedIssue, setLiftedIssue] = useState<Issue | null>(null);
  const [originColumn, setOriginColumn] = useState<string | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const listIssues = useRpc(listIssuesRpc);
  const listStates = useRpc(listStatesRpc);
  const moveState = useRpc(moveStateRpc);
  const startWork = useRpc(startWorkRpc);
  const toast = useToast();
  const { pending, offer, dismiss } = useLaunchFollowUp();
  const now = useMemo(() => new Date(), []);

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
      start: { color: theme.colors.accent, fontSize: 13, paddingVertical: 8 },
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
    if (!issue || !origin || targetName === null || targetName === origin) return;
    void moveIssueToColumn(issue, targetName);
  }

  function onCancelDrag() {
    clearDrag();
  }

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
              <Pressable accessibilityRole="button" onPress={() => void begin(selected)}>
                <Text style={styles.start}>Start work in a new worktree</Text>
              </Pressable>
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
