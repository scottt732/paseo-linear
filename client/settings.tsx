import { type PluginSurfaceProps, useRpc, useSettings, usePaseo } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ScrollView, Text } from "react-native";
import { linearSettings, type LinearSettings } from "../shared/settings";
import { listLabelGroupsRpc, listTeamsRpc, syncSettingsRpc, verifyRpc } from "../shared/rpc";

const NOT_SET_OPTION = { label: "Not set", value: "" };
const ALL_TEAMS_OPTION = { label: "All teams", value: "" };
const NO_LABEL_GROUP_OPTION = { label: "None", value: "" };

export function LinearSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(linearSettings);
  const paseo = usePaseo();
  const verify = useRpc(verifyRpc);
  const sync = useRpc(syncSettingsRpc);
  const listTeams = useRpc(listTeamsRpc);
  const listLabelGroups = useRpc(listLabelGroupsRpc);
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const providersQuery = useQuery({
    queryKey: ["linear", "settings", "providers"],
    queryFn: () => paseo.providers.listAvailable(),
  });

  const teamsQuery = useQuery({
    queryKey: ["linear", "settings", "teams"],
    queryFn: () => listTeams({}),
  });

  const labelGroupsQuery = useQuery({
    queryKey: ["linear", "settings", "label-groups"],
    queryFn: () => listLabelGroups({}),
  });

  if (settings.status === "loading") {
    return <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>;
  }
  if (settings.status === "error" || settings.status === "invalid") {
    return <Text style={{ color: theme.colors.foreground }}>{String(settings.error)}</Text>;
  }

  const values = settings.values;
  const revision = settings.revision;
  const saveValues = settings.save;

  const providerOptions = useMemo(() => {
    const available = (providersQuery.data?.providers ?? [])
      .filter((entry) => entry.available)
      .map((entry) => ({ label: entry.provider, value: entry.provider }));
    const savedProvider = values.provider.trim();
    const options = [NOT_SET_OPTION, ...available];
    // Never silently drop a configured value: a saved provider that pins a model
    // (e.g. "claude/claude-opus-5") or is otherwise absent from the daemon's
    // available list must still round-trip when the screen is opened.
    if (savedProvider && !available.some((option) => option.value === savedProvider)) {
      options.splice(1, 0, { label: savedProvider, value: savedProvider });
    }
    return options;
  }, [providersQuery.data, values.provider]);

  const providerFieldUsable = providersQuery.isSuccess;

  const teamOptions = useMemo(() => {
    const teams = teamsQuery.data?.teams ?? [];
    // Two teams can only share a display name if their keys differ, so only
    // pay the "(KEY)" suffix tax on names that are actually ambiguous.
    const nameCounts = new Map<string, number>();
    for (const team of teams) nameCounts.set(team.name, (nameCounts.get(team.name) ?? 0) + 1);
    const available = teams.map((team) => ({
      label: (nameCounts.get(team.name) ?? 0) > 1 ? `${team.name} (${team.key})` : team.name,
      value: team.key,
    }));
    const savedTeamKey = values.defaultTeamKey.trim();
    const options = [ALL_TEAMS_OPTION, ...available];
    // Never silently drop a configured value: a renamed/deleted team, or a key
    // typed by hand before this was a picker, must still round-trip.
    if (savedTeamKey && !available.some((option) => option.value === savedTeamKey)) {
      options.splice(1, 0, { label: savedTeamKey, value: savedTeamKey });
    }
    return options;
  }, [teamsQuery.data, values.defaultTeamKey]);

  const teamFieldUsable = teamsQuery.isSuccess;

  const labelGroupOptions = useMemo(() => {
    const groups = labelGroupsQuery.data?.groups ?? [];
    const available = groups.map((group) => ({ label: group, value: group }));
    const savedGroup = values.repoLabelGroup.trim();
    const options = [NO_LABEL_GROUP_OPTION, ...available];
    // Never silently drop a configured value: a group renamed/removed in Linear,
    // or one typed by hand before this was a picker, must still round-trip.
    if (savedGroup && !available.some((option) => option.value === savedGroup)) {
      options.splice(1, 0, { label: savedGroup, value: savedGroup });
    }
    return options;
  }, [labelGroupsQuery.data, values.repoLabelGroup]);

  const labelGroupFieldUsable = labelGroupsQuery.isSuccess;

  async function save(patch: Partial<LinearSettings>) {
    const nextValues = { ...values, ...patch };
    const ok = await saveValues(nextValues, revision);
    if (!ok) {
      toast.error("Could not save — reload and try again");
      return;
    }
    // The daemon holds the credentials used for verification and issue work;
    // push every successful save so it stays in sync with what was just saved.
    await sync({ values: nextValues });
  }

  return (
    <ScrollView>
      <SettingsSection title="Connection">
        <SettingsCard>
          <SettingsInput
            label="API key"
            hint="Stored as plain JSON on this daemon, not in a credential vault. Set LINEAR_API_KEY in the daemon environment to keep it off disk — the environment variable wins when both are set."
            secureTextEntry
            initialValue={values.apiKey}
            placeholder="lin_api_…"
            onChangeText={(text) => setDraft((d) => ({ ...d, apiKey: text }))}
          />
          <SettingsAction
            label="Save API key"
            actionLabel="Save"
            onPress={() => void save({ apiKey: draft.apiKey ?? values.apiKey })}
          />
          <SettingsAction
            label="Test connection"
            actionLabel="Test"
            onPress={async () => {
              try {
                const result = await verify({});
                toast.show(
                  `Connected as ${result.name} (key from ${result.source === "env" ? "environment" : "settings"})`,
                  { variant: "success" },
                );
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Connection failed");
              }
            }}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Defaults">
        <SettingsCard>
          {teamFieldUsable ? (
            <SettingsSelect
              label="Default team"
              hint="Scopes issue search and the board's tabs to one team. All teams searches everywhere."
              value={draft.defaultTeamKey ?? values.defaultTeamKey}
              options={teamOptions}
              onValueChange={(value) => setDraft((d) => ({ ...d, defaultTeamKey: value }))}
            />
          ) : (
            <SettingsInput
              label="Default team"
              hint="Scopes issue search and the board's tabs to one team. Leave empty for all teams. Could not load the list of teams from Linear, so this is a free-text field for now — enter a team key like ENG."
              initialValue={values.defaultTeamKey}
              placeholder="ENG"
              onChangeText={(text) => setDraft((d) => ({ ...d, defaultTeamKey: text }))}
            />
          )}
          <SettingsInput
            label="Repository path"
            hint="Absolute path to the checkout worktrees are created from. Optional when starting work from the Linear panel inside a workspace, which defaults to that workspace's project root — required for the sidebar surface, the /linear slash command, and the Command Center item."
            initialValue={values.repositoryPath}
            onChangeText={(text) => setDraft((d) => ({ ...d, repositoryPath: text }))}
          />
          {labelGroupFieldUsable ? (
            <SettingsSelect
              label="Repository label group"
              hint="Names which Linear label group identifies the repository, e.g. Agent for labels like Agent/web-api. Used to preselect the repository when starting work from an issue. None disables label matching."
              value={draft.repoLabelGroup ?? values.repoLabelGroup}
              options={labelGroupOptions}
              onValueChange={(value) => setDraft((d) => ({ ...d, repoLabelGroup: value }))}
            />
          ) : (
            <SettingsInput
              label="Repository label group"
              hint="Names which Linear label group identifies the repository, e.g. Agent for labels like Agent/web-api. Used to preselect the repository when starting work from an issue. Leave empty to disable label matching. Could not load the list of label groups from Linear, so this is a free-text field for now."
              initialValue={values.repoLabelGroup}
              placeholder="Agent"
              onChangeText={(text) => setDraft((d) => ({ ...d, repoLabelGroup: text }))}
            />
          )}
          <SettingsInput
            label="Base ref"
            hint="Use a remote-tracking ref like origin/main so worktrees start from fetched history, not a stale local branch."
            initialValue={values.baseRef}
            onChangeText={(text) => setDraft((d) => ({ ...d, baseRef: text }))}
          />
          {providerFieldUsable ? (
            <SettingsSelect
              label="Provider"
              hint="Required before starting work from an issue — there is no default. A bare provider like claude is valid; provider/model (e.g. claude/claude-opus-5) pins a model."
              value={draft.provider ?? values.provider}
              options={providerOptions}
              onValueChange={(value) => setDraft((d) => ({ ...d, provider: value }))}
            />
          ) : (
            <SettingsInput
              label="Provider"
              hint="Required before starting work from an issue — there is no default. A bare provider like claude is valid; provider/model (e.g. claude/claude-opus-5) pins a model. Could not load the list of available providers from the daemon, so this is a free-text field for now."
              initialValue={values.provider}
              placeholder="claude"
              onChangeText={(text) => setDraft((d) => ({ ...d, provider: text }))}
            />
          )}
          <SettingsAction
            label="Save defaults"
            actionLabel="Save"
            onPress={() =>
              void save({
                defaultTeamKey: draft.defaultTeamKey ?? values.defaultTeamKey,
                repositoryPath: draft.repositoryPath ?? values.repositoryPath,
                repoLabelGroup: draft.repoLabelGroup ?? values.repoLabelGroup,
                baseRef: draft.baseRef ?? values.baseRef,
                provider: draft.provider ?? values.provider,
              })
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="On starting work">
        <SettingsCard>
          <SettingsSwitch
            label="Offer to move the issue to the first started status"
            value={values.moveToStarted}
            onValueChange={(next) => void save({ moveToStarted: next })}
          />
          <SettingsSwitch
            label="Offer to assign the issue to me"
            value={values.assignToMe}
            onValueChange={(next) => void save({ assignToMe: next })}
          />
          <SettingsRow label="Prompt template" hint="Placeholders: {{identifier}} {{title}} {{url}} {{description}} {{branchName}}">
            <SettingsInput
              label="Template"
              initialValue={values.promptTemplate}
              onChangeText={(text) => setDraft((d) => ({ ...d, promptTemplate: text }))}
            />
          </SettingsRow>
          <SettingsAction
            label="Save template"
            actionLabel="Save"
            onPress={() => void save({ promptTemplate: draft.promptTemplate ?? values.promptTemplate })}
          />
        </SettingsCard>
      </SettingsSection>
    </ScrollView>
  );
}
