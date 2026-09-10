import { describe, expect, it } from "vitest";
import { resolveApiKey } from "./credentials";

describe("resolveApiKey", () => {
  it("prefers the environment variable", () => {
    expect(resolveApiKey({ LINEAR_API_KEY: "env-key" }, { apiKey: "settings-key" })).toEqual({
      apiKey: "env-key",
      source: "env",
    });
  });
  it("falls back to settings when the variable is absent", () => {
    expect(resolveApiKey({}, { apiKey: "settings-key" })).toEqual({
      apiKey: "settings-key",
      source: "settings",
    });
  });
  it("ignores a whitespace-only environment variable", () => {
    expect(resolveApiKey({ LINEAR_API_KEY: "   " }, { apiKey: "settings-key" }).source).toBe(
      "settings",
    );
  });
  it("throws an actionable error when neither is set", () => {
    expect(() => resolveApiKey({}, { apiKey: "" })).toThrow(
      "Set LINEAR_API_KEY in the daemon environment, or open Settings → Plugins → Linear and add a key",
    );
  });
});
