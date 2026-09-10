import { describe, expect, it } from "vitest";
import { columnAtPoint, dropEffect, resolveTargetStateId } from "./drag";

const columns = [
  { name: "Backlog", x: 0, width: 100 },
  { name: "In Progress", x: 100, width: 120 },
  { name: "Done", x: 220, width: 100 },
];

describe("columnAtPoint", () => {
  it("finds the first column for a point inside it", () => {
    expect(columnAtPoint(columns, 50)).toBe("Backlog");
  });

  it("finds a middle column for a point inside it", () => {
    expect(columnAtPoint(columns, 150)).toBe("In Progress");
  });

  it("treats a left boundary as inclusive", () => {
    expect(columnAtPoint(columns, 100)).toBe("In Progress");
  });

  it("treats a right boundary as exclusive, belonging to the next column", () => {
    expect(columnAtPoint(columns, 220)).toBe("Done");
  });

  it("returns null left of all columns", () => {
    expect(columnAtPoint(columns, -10)).toBeNull();
  });

  it("returns null right of all columns", () => {
    expect(columnAtPoint(columns, 500)).toBeNull();
  });

  it("returns null for an empty column list", () => {
    expect(columnAtPoint([], 50)).toBeNull();
  });
});

describe("resolveTargetStateId", () => {
  const states = [
    { id: "s1", name: "Backlog" },
    { id: "s2", name: "In Progress" },
    { id: "s3", name: "Done" },
  ];

  it("resolves an exact name match", () => {
    expect(resolveTargetStateId(states, "In Progress")).toBe("s2");
  });

  it("returns null for no match", () => {
    expect(resolveTargetStateId(states, "Cancelled")).toBeNull();
  });

  it("does not match case-insensitively", () => {
    expect(resolveTargetStateId(states, "in progress")).toBeNull();
  });

  it("does not match as a substring", () => {
    expect(resolveTargetStateId(states, "Progress")).toBeNull();
  });
});

describe("dropEffect", () => {
  it("is move when target is non-null and differs from origin", () => {
    expect(dropEffect("Done", "Backlog")).toBe("move");
  });

  it("is none when target is null", () => {
    expect(dropEffect(null, "Backlog")).toBe("none");
  });

  it("is none when target equals origin", () => {
    expect(dropEffect("Backlog", "Backlog")).toBe("none");
  });

  it("is none when origin is null", () => {
    expect(dropEffect("Backlog", null)).toBe("none");
  });

  it("is none when both target and origin are null", () => {
    expect(dropEffect(null, null)).toBe("none");
  });
});
