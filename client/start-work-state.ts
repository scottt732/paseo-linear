/**
 * What the "Start work" row on an issue card should show, given whether the
 * settings document has resolved yet and — once it has — whether a required
 * setting is missing.
 *
 * A settings document that is still loading must never be reported as
 * "missing" a setting: `useSettings` briefly returns `status: "loading"` on
 * every card open, and rendering the same copy used for a real misconfiguration
 * ("Set a provider in Settings → Plugins → Linear") during that window is a
 * false alarm, not an honest one.
 */
export type StartWorkAvailability =
  | { status: "loading" }
  | { status: "missing"; message: string }
  | { status: "ready" };

/**
 * Decides between the three states. `settingsLoading` is true only while the
 * settings document has not resolved (`useSettings` status "loading"); a
 * resolved-but-unreadable document (status "error"/"invalid") is treated the
 * same as "ready but nothing configured", since it is a final state rather
 * than a momentary one — the message from `missingSettingMessage` still
 * applies. `missingSettingMessage` is the pure message built from the
 * resolved settings (e.g. `missingStartWorkSetting` in board.tsx); pass null
 * once every required setting is present.
 */
export function resolveStartWorkAvailability(
  settingsLoading: boolean,
  missingSettingMessage: string | null,
): StartWorkAvailability {
  if (settingsLoading) return { status: "loading" };
  if (missingSettingMessage) return { status: "missing", message: missingSettingMessage };
  return { status: "ready" };
}
