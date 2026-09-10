import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon, Modal, copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { clampText, relativeTime } from "../shared/format";
import { type Issue, issueBreadcrumb } from "../shared/issue";
import { openExternal } from "./web";

type PluginLayout = PluginSurfaceProps["layout"];

interface ChromeProps {
  theme: PluginTheme;
  layout: PluginLayout;
}

export function IssueChip({
  issue,
  theme,
  onPress,
}: ChromeProps & { issue: Issue; onPress(): void }) {
  const styles = useMemo(
    () => ({
      chip: {
        backgroundColor: theme.colors.surface2,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: "flex-start" as const,
      },
      label: { color: theme.colors.foreground, fontSize: 12, fontWeight: "600" as const },
    }),
    [theme],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Linear issue ${issue.identifier}`}
      onPress={onPress}
      style={styles.chip}
    >
      <Text style={styles.label}>{issue.identifier}</Text>
    </Pressable>
  );
}

export function IssueCard({ issue, theme, layout }: ChromeProps & { issue: Issue }) {
  const toast = useToast();
  const now = useMemo(() => new Date(), []);
  const styles = useMemo(
    () => ({
      body: { gap: layout.compact ? 8 : 10 },
      crumbRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, flexWrap: "wrap" as const },
      crumbs: { color: theme.colors.foreground, fontSize: layout.compact ? 15 : 16, fontWeight: "600" as const, flexShrink: 1 },
      row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, flexWrap: "wrap" as const },
      state: { color: issue.state.color, fontSize: 13, fontWeight: "600" as const },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: theme.colors.surface2 },
      badgeText: { color: theme.colors.foregroundMuted, fontSize: 11 },
      divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 4 },
      description: { color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 19 },
      action: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
      actionText: { color: theme.colors.accent, fontSize: 13 },
    }),
    [theme, layout.compact, issue.state.color],
  );

  async function copy(value: string, label: string) {
    try {
      await copyText(value);
      toast.show(`${label} copied`, { variant: "success" });
    } catch {
      toast.error(`Could not copy the ${label.toLowerCase()}`);
    }
  }

  return (
    <View style={styles.body}>
      <View style={styles.crumbRow}>
        {issue.project?.icon ? (
          <Icon
            name={issue.project.icon}
            size={layout.compact ? 15 : 16}
            color={issue.project.color ?? theme.colors.foregroundMuted}
          />
        ) : null}
        <Text style={styles.crumbs}>{issueBreadcrumb(issue).join(" · ")}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.state}>{issue.state.name}</Text>
        <Text style={styles.muted}>{issue.priorityLabel}</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{issue.team.name}</Text>
        </View>
        {issue.labels.map((label) => (
          <View key={label.name} style={styles.badge}>
            <Text style={[styles.badgeText, { color: label.color }]}>{label.name}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.muted}>
        {`created ${relativeTime(issue.createdAt, now)} · updated ${relativeTime(issue.updatedAt, now)}`}
      </Text>
      <View style={styles.divider} />
      <Text style={styles.description} selectable>
        {clampText(issue.description || "No description.", 12)}
      </Text>
      <View style={styles.divider} />
      <Pressable accessibilityRole="button" onPress={() => void openExternal(issue.url)} style={styles.action}>
        <Icon name="ExternalLink" size={14} color={theme.colors.accent} />
        <Text style={styles.actionText}>Open in Linear</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => void copy(issue.branchName, "Branch name")}
        style={styles.action}
      >
        <Icon name="GitBranch" size={14} color={theme.colors.accent} />
        <Text style={styles.actionText}>Copy branch name</Text>
      </Pressable>
    </View>
  );
}

export function IssueChipRow({ issues, theme, layout }: ChromeProps & { issues: Issue[] }) {
  const [open, setOpen] = useState<Issue | null>(null);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {issues.map((issue) => (
        <IssueChip key={issue.id} issue={issue} theme={theme} layout={layout} onPress={() => setOpen(issue)} />
      ))}
      <Modal
        title={open ? `${open.identifier} · ${open.title}` : ""}
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <Modal.Content>
          {open ? <IssueCard issue={open} theme={theme} layout={layout} /> : null}
        </Modal.Content>
      </Modal>
    </View>
  );
}
