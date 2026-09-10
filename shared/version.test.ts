import { describe, expect, it } from "vitest";
import { PLUGIN_ID } from "./version";

describe("plugin identity", () => {
  it("matches the manifest id", () => {
    expect(PLUGIN_ID).toBe("linear");
  });
});
