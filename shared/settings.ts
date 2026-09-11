import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { DEFAULT_PROMPT_TEMPLATE } from "./format";

export const LinearSettingsSchema = z.object({
  apiKey: z.string().default(""),
  defaultTeamKey: z.string().default(""),
  provider: z.string().default(""),
  baseRef: z.string().default("origin/main"),
  repositoryPath: z.string().default(""),
  promptTemplate: z.string().default(DEFAULT_PROMPT_TEMPLATE),
  moveToStarted: z.boolean().default(true),
  assignToMe: z.boolean().default(false),
  repoLabelGroup: z.string().default("Agent"),
  projectByRepoLabel: z.record(z.string(), z.string()).default({}),
  lastProjectId: z.string().default(""),
});

export type LinearSettings = z.infer<typeof LinearSettingsSchema>;

export const linearSettings = defineSettings({
  id: "linear",
  scope: "host",
  version: 1,
  schema: LinearSettingsSchema,
});
