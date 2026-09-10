import type { LinearSettings } from "../shared/settings";
import { LinearApiError } from "./linear/client";

export interface ResolvedApiKey {
  apiKey: string;
  source: "env" | "settings";
}

export function resolveApiKey(
  env: Record<string, string | undefined>,
  settings: Pick<LinearSettings, "apiKey">,
): ResolvedApiKey {
  const fromEnv = (env.LINEAR_API_KEY ?? "").trim();
  if (fromEnv) return { apiKey: fromEnv, source: "env" };
  const fromSettings = settings.apiKey.trim();
  if (fromSettings) return { apiKey: fromSettings, source: "settings" };
  throw new LinearApiError(
    "Add a Linear API key in Settings → Plugins → Linear, or set LINEAR_API_KEY in the daemon environment",
  );
}
