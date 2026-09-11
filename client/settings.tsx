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
import { syncSettingsRpc, verifyRpc } from "../shared/rpc";

const NOT_SET_OPTION = { label: "Not set", value: "" };

export function LinearSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(linearSettings);
  const paseo = usePaseo();
  const verify = useRpc(verifyRpc);
  const sync = useRpc(syncSettingsRpc);
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const providersQuery = useQuery({
    queryKey: ["linear", "settings", "providers"],
    queryFn: () => paseo.providers.listAvailable(),
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
          <SettingsInput
            label="Default team key"
            hint="Scopes search and the issue panel. Leave empty for all teams."
            initialValue={values.defaultTeamKey}
            placeholder="ENG"
            onChangeText={(text) => setDraft((d) => ({ ...d, defaultTeamKey: text }))}
          />
          <SettingsInput
            label="Repository path"
            hint="Absolute path to the checkout worktrees are created from. Optional when starting work from the Linear panel inside a workspace, which defaults to that workspace's project root — required for the sidebar surface, the /linear slash command, and the Command Center item."
            initialValue={values.repositoryPath}
            onChangeText={(text) => setDraft((d) => ({ ...d, repositoryPath: text }))}
          />
          <SettingsInput
            label="Base ref"
            hint="Use a remote-tracking ref like origin/main so worktrees start from fetched history, not a stale local branch."
            initialValue={values.baseRef}
            onChangeText={(text) => setDraft((d) => ({ ...d, baseRef: text }))}
          />
          {providerFieldUsable ? (
            <SettingsSelect
              label="Provider"
              hint="A bare provider like claude is valid; provider/model (e.g. claude/claude-opus-5) pins a model. Not set uses the daemon default."
              value={draft.provider ?? values.provider}
              options={providerOptions}
              onValueChange={(value) => setDraft((d) => ({ ...d, provider: value }))}
            />
          ) : (
            <SettingsInput
              label="Provider"
              hint="A bare provider like claude is valid; provider/model (e.g. claude/claude-opus-5) pins a model. Empty uses the daemon default. Could not load the list of available providers from the daemon, so this is a free-text field for now."
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
