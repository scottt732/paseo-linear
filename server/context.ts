import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { type LinearSettings, LinearSettingsSchema } from "../shared/settings";
import { resolveApiKey } from "./credentials";
import { createTransport, type LinearTransport } from "./linear/client";

let cached: LinearSettings = LinearSettingsSchema.parse({});

/** Replaces the cached settings document. Called only by the syncSettings handler. */
export function cacheSettings(values: LinearSettings): void {
  cached = values;
}

export function currentSettings(): LinearSettings {
  return cached;
}

export interface LinearContext {
  transport: LinearTransport;
  settings: LinearSettings;
  source: "env" | "settings";
}

export function loadLinearContext(_context: PluginHandlerContext): LinearContext {
  const settings = currentSettings();
  const { apiKey, source } = resolveApiKey(process.env, settings);
  return { transport: createTransport({ apiKey }), settings, source };
}
