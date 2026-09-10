import { describe, expect, it } from "vitest";
import { clampText, identifierFromBranch, isValidDueDate, relativeTime, renderPrompt } from "./format";

const now = new Date("2026-09-10T12:00:00.000Z");

describe("relativeTime", () => {
  it("reports seconds under a minute as just now", () => {
    expect(relativeTime("2026-09-10T11:59:30.000Z", now)).toBe("just now");
  });
  it("reports whole minutes", () => {
    expect(relativeTime("2026-09-10T11:45:00.000Z", now)).toBe("15m ago");
  });
  it("reports whole hours", () => {
    expect(relativeTime("2026-09-10T09:00:00.000Z", now)).toBe("3h ago");
  });
  it("reports whole days", () => {
    expect(relativeTime("2026-08-31T12:00:00.000Z", now)).toBe("10d ago");
  });
  it("falls back to a date past a year", () => {
    expect(relativeTime("2024-01-02T12:00:00.000Z", now)).toBe("2024-01-02");
  });
});

describe("renderPrompt", () => {
  it("substitutes every placeholder", () => {
    expect(renderPrompt("{{identifier}}: {{title}}", { identifier: "ENG-1", title: "Fix" }))
      .toBe("ENG-1: Fix");
  });
  it("substitutes a repeated placeholder everywhere", () => {
    expect(renderPrompt("{{a}}/{{a}}", { a: "x" })).toBe("x/x");
  });
  it("replaces an unknown placeholder with an empty string", () => {
    expect(renderPrompt("[{{nope}}]", { a: "x" })).toBe("[]");
  });
  it("leaves text with no placeholders untouched", () => {
    expect(renderPrompt("plain", {})).toBe("plain");
  });
});

describe("clampText", () => {
  it("returns short text unchanged", () => {
    expect(clampText("a\nb", 3)).toBe("a\nb");
  });
  it("truncates and appends an ellipsis", () => {
    expect(clampText("a\nb\nc\nd", 2)).toBe("a\nb…");
  });
});

describe("identifierFromBranch", () => {
  it("extracts an identifier from a Linear-formatted branch", () => {
    expect(identifierFromBranch("feature/eng-14236-randomize-the-products")).toBe("ENG-14236");
  });
  it("extracts from a bare identifier branch", () => {
    expect(identifierFromBranch("ENG-1")).toBe("ENG-1");
  });
  it("returns null when there is no identifier", () => {
    expect(identifierFromBranch("main")).toBeNull();
  });
  it("returns null for a digit-only segment", () => {
    expect(identifierFromBranch("release/1-2")).toBeNull();
  });
});

describe("isValidDueDate", () => {
  it("accepts a well-formed real calendar date", () => {
    expect(isValidDueDate("2026-09-10")).toBe(true);
  });
  it("rejects an empty string", () => {
    expect(isValidDueDate("")).toBe(false);
  });
  it("rejects a malformed string", () => {
    expect(isValidDueDate("not-a-date")).toBe(false);
  });
  it("rejects an impossible date", () => {
    expect(isValidDueDate("2026-02-30")).toBe(false);
  });
});
