import { describe, expect, it } from "vitest";
import { resolveStartWorkAvailability } from "./start-work-state";

describe("resolveStartWorkAvailability", () => {
  it("is loading while settings have not resolved, regardless of the message", () => {
    expect(resolveStartWorkAvailability(true, "Set a provider in Settings → Plugins → Linear")).toEqual({
      status: "loading",
    });
    expect(resolveStartWorkAvailability(true, null)).toEqual({ status: "loading" });
  });

  it("is missing once settings resolve with an unmet requirement", () => {
    expect(resolveStartWorkAvailability(false, "Set a provider in Settings → Plugins → Linear")).toEqual({
      status: "missing",
      message: "Set a provider in Settings → Plugins → Linear",
    });
  });

  it("is ready once settings resolve with nothing missing", () => {
    expect(resolveStartWorkAvailability(false, null)).toEqual({ status: "ready" });
  });
});
