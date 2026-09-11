import { describe, expect, it } from "vitest";
import { matchProject, repoLabelFromIssue, type ProjectRef } from "./repo-match";

const cosmosGraphqlScripts: ProjectRef = {
  id: "remote:github.com/Cosmos-Entity/cosmos-graphql",
  name: "cosmos-graphql",
  rootPath: "/Users/sholodak/cosmos/cosmos-graphql/scripts",
};
const cosmosGraphqlRoot: ProjectRef = {
  id: "prj_2da46a36603f00d8",
  name: "cosmos-graphql",
  rootPath: "/Users/sholodak/cosmos/cosmos-graphql",
};
const paseoLinear: ProjectRef = {
  id: "prj_paseolinear",
  name: "paseo-linear",
  rootPath: "/Users/sholodak/cosmos/paseo-linear",
};

describe("repoLabelFromIssue", () => {
  it("returns the name of the label in the configured group", () => {
    const labels = [{ name: "cosmos-graphql", group: "Agent" }];
    expect(repoLabelFromIssue(labels, "Agent")).toBe("cosmos-graphql");
  });

  it("returns null when there is no label in the configured group", () => {
    const labels = [{ name: "Product", group: "Team" }];
    expect(repoLabelFromIssue(labels, "Agent")).toBeNull();
  });

  it("returns null when the issue has no labels", () => {
    expect(repoLabelFromIssue([], "Agent")).toBeNull();
  });

  it("picks the label in the configured group among several", () => {
    const labels = [
      { name: "Product", group: "Team" },
      { name: "cosmos-graphql", group: "Agent" },
      { name: "High", group: "⭐️ Benefit" },
    ];
    expect(repoLabelFromIssue(labels, "Agent")).toBe("cosmos-graphql");
  });

  it("matches the group exactly and case-sensitively", () => {
    const labels = [{ name: "cosmos-graphql", group: "agent" }];
    expect(repoLabelFromIssue(labels, "Agent")).toBeNull();
  });

  it("ignores labels with no group at all", () => {
    const labels = [{ name: "cosmos-graphql", group: null }];
    expect(repoLabelFromIssue(labels, "Agent")).toBeNull();
  });

  it("returns null when repoLabelGroup is empty", () => {
    const labels = [{ name: "cosmos-graphql", group: "Agent" }];
    expect(repoLabelFromIssue(labels, "")).toBeNull();
  });
});

describe("matchProject", () => {
  const baseOptions = {
    labels: [{ name: "cosmos-graphql", group: "Agent" }],
    repoLabelGroup: "Agent",
    projects: [cosmosGraphqlScripts, cosmosGraphqlRoot, paseoLinear] as ReadonlyArray<ProjectRef>,
    projectByRepoLabel: {},
    lastProjectId: "",
  };

  it("prefers a remembered project id over a unique name match", () => {
    const result = matchProject({
      ...baseOptions,
      labels: [{ name: "paseo-linear", group: "Agent" }],
      projects: [paseoLinear, cosmosGraphqlRoot],
      projectByRepoLabel: { "paseo-linear": cosmosGraphqlRoot.id },
    });
    expect(result).toEqual({
      repoLabel: "paseo-linear",
      project: cosmosGraphqlRoot,
      reason: "remembered",
    });
  });

  it("falls through to a name match when the remembered id no longer exists", () => {
    const result = matchProject({
      ...baseOptions,
      labels: [{ name: "paseo-linear", group: "Agent" }],
      projects: [paseoLinear],
      projectByRepoLabel: { "paseo-linear": "prj_removed" },
    });
    expect(result).toEqual({
      repoLabel: "paseo-linear",
      project: paseoLinear,
      reason: "unique-label-match",
    });
  });

  it("returns unique-label-match when exactly one project's name equals the label", () => {
    const result = matchProject({
      ...baseOptions,
      labels: [{ name: "paseo-linear", group: "Agent" }],
      projects: [paseoLinear, cosmosGraphqlRoot],
    });
    expect(result).toEqual({
      repoLabel: "paseo-linear",
      project: paseoLinear,
      reason: "unique-label-match",
    });
  });

  it("returns ambiguous with a null project when two projects share the label's name", () => {
    const result = matchProject(baseOptions);
    expect(result).toEqual({
      repoLabel: "cosmos-graphql",
      project: null,
      reason: "ambiguous",
    });
  });

  it("never picks one of the ambiguous projects even when a lastProjectId is set", () => {
    const result = matchProject({ ...baseOptions, lastProjectId: paseoLinear.id });
    expect(result.reason).toBe("ambiguous");
    expect(result.project).toBeNull();
  });

  it("falls back to lastProjectId when there is no repo label", () => {
    const result = matchProject({
      ...baseOptions,
      labels: [],
      lastProjectId: paseoLinear.id,
    });
    expect(result).toEqual({
      repoLabel: null,
      project: paseoLinear,
      reason: "last-used",
    });
  });

  it("falls back to lastProjectId when the label matched no project", () => {
    const result = matchProject({
      ...baseOptions,
      labels: [{ name: "unknown-repo", group: "Agent" }],
      lastProjectId: paseoLinear.id,
    });
    expect(result).toEqual({
      repoLabel: "unknown-repo",
      project: paseoLinear,
      reason: "last-used",
    });
  });

  it("ignores a lastProjectId pointing at a removed project", () => {
    const result = matchProject({
      ...baseOptions,
      labels: [],
      lastProjectId: "prj_removed",
    });
    expect(result).toEqual({
      repoLabel: null,
      project: null,
      reason: "no-label",
    });
  });

  it("returns no-match when a repo label exists, matches nothing, and there is no usable lastProjectId", () => {
    const result = matchProject({
      ...baseOptions,
      labels: [{ name: "unknown-repo", group: "Agent" }],
      lastProjectId: "",
    });
    expect(result).toEqual({
      repoLabel: "unknown-repo",
      project: null,
      reason: "no-match",
    });
  });

  it("returns no-label when the issue has no repo label and there is no usable lastProjectId", () => {
    const result = matchProject({
      ...baseOptions,
      labels: [],
      lastProjectId: "",
    });
    expect(result).toEqual({
      repoLabel: null,
      project: null,
      reason: "no-label",
    });
  });

  it("ignores a label in a different group than configured", () => {
    const result = matchProject({
      ...baseOptions,
      labels: [{ name: "Product", group: "Team" }],
      lastProjectId: "",
    });
    expect(result).toEqual({
      repoLabel: null,
      project: null,
      reason: "no-label",
    });
  });

  it("never returns a project when there are no projects at all", () => {
    const result = matchProject({
      ...baseOptions,
      projects: [],
      lastProjectId: paseoLinear.id,
    });
    expect(result.project).toBeNull();
  });

  it("takes the last-used / no-label path when repoLabelGroup is empty", () => {
    const result = matchProject({
      ...baseOptions,
      repoLabelGroup: "",
      lastProjectId: paseoLinear.id,
      projects: [paseoLinear],
    });
    expect(result).toEqual({
      repoLabel: null,
      project: paseoLinear,
      reason: "last-used",
    });
  });

  it("takes the no-label path when repoLabelGroup is empty and there is no lastProjectId", () => {
    const result = matchProject({
      ...baseOptions,
      repoLabelGroup: "",
      lastProjectId: "",
    });
    expect(result).toEqual({
      repoLabel: null,
      project: null,
      reason: "no-label",
    });
  });
});
