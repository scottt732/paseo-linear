import { describe, expect, it } from "vitest";
import { bindingFromBranch, bindingFromLabels, issueLabels, resolveBinding } from "./binding";

const issue = { identifier: "ENG-14236", id: "uuid-1", url: "https://linear.app/x/issue/ENG-14236" };

describe("issueLabels", () => {
  it("uses the three reserved label keys", () => {
    expect(issueLabels(issue)).toEqual({
      "linear.issue": "ENG-14236",
      "linear.issueId": "uuid-1",
      "linear.url": "https://linear.app/x/issue/ENG-14236",
    });
  });
});

describe("bindingFromLabels", () => {
  it("reads a full binding", () => {
    expect(bindingFromLabels(issueLabels(issue))).toEqual({
      identifier: "ENG-14236",
      issueId: "uuid-1",
      url: issue.url,
    });
  });
  it("tolerates a missing id and url", () => {
    expect(bindingFromLabels({ "linear.issue": "ENG-1" })).toEqual({
      identifier: "ENG-1",
      issueId: null,
      url: null,
    });
  });
  it("returns null with no labels", () => {
    expect(bindingFromLabels(undefined)).toBeNull();
    expect(bindingFromLabels({})).toBeNull();
  });
});

describe("bindingFromBranch", () => {
  it("derives an identifier-only binding", () => {
    expect(bindingFromBranch("feature/eng-14236-randomize")).toEqual({
      identifier: "ENG-14236",
      issueId: null,
      url: null,
    });
  });
  it("returns null for an unrelated branch", () => {
    expect(bindingFromBranch("main")).toBeNull();
    expect(bindingFromBranch(null)).toBeNull();
  });
});

describe("resolveBinding", () => {
  it("prefers labels over the branch", () => {
    expect(resolveBinding(issueLabels(issue), "feature/eng-1-other")?.identifier).toBe("ENG-14236");
  });
  it("falls back to the branch when labels are absent", () => {
    expect(resolveBinding({}, "feature/eng-99-thing")?.identifier).toBe("ENG-99");
  });
  it("returns null when neither resolves", () => {
    expect(resolveBinding({}, "main")).toBeNull();
  });
});
