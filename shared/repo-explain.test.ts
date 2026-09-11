import { describe, expect, it } from "vitest";
import { explainRepoMatch } from "./repo-explain";
import type { RepoMatch } from "./repo-match";

describe("explainRepoMatch", () => {
  it("explains a remembered match by naming the label", () => {
    const match: RepoMatch = { repoLabel: "web-api", project: null, reason: "remembered" };
    expect(explainRepoMatch(match)).toBe("Last used for web-api");
  });

  it("explains a unique label match by naming the label", () => {
    const match: RepoMatch = { repoLabel: "web-api", project: null, reason: "unique-label-match" };
    expect(explainRepoMatch(match)).toBe("Matched web-api");
  });

  it("explains an ambiguous match by naming the label and asking the user to choose", () => {
    const match: RepoMatch = { repoLabel: "web-api", project: null, reason: "ambiguous" };
    expect(explainRepoMatch(match)).toBe("Several projects named web-api — choose one");
  });

  it("explains a last-used match without naming any label", () => {
    const match: RepoMatch = { repoLabel: null, project: null, reason: "last-used" };
    expect(explainRepoMatch(match)).toBe("Last used");
  });

  it("explains a no-match result by naming the label that matched nothing", () => {
    const match: RepoMatch = { repoLabel: "unknown-repo", project: null, reason: "no-match" };
    expect(explainRepoMatch(match)).toBe("No project named unknown-repo");
  });

  it("renders nothing when the issue had no repo label", () => {
    const match: RepoMatch = { repoLabel: null, project: null, reason: "no-label" };
    expect(explainRepoMatch(match)).toBeNull();
  });
});
