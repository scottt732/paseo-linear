import { describe, expect, it } from "vitest";
import { matchProject, repoLabelFromIssue, type ProjectRef } from "./repo-match";

const webApiScripts: ProjectRef = {
  id: "remote:github.com/acme-co/web-api",
  name: "web-api",
  rootPath: "/home/dev/src/web-api/scripts",
};
const webApiRoot: ProjectRef = {
  id: "prj_2da46a36603f00d8",
  name: "web-api",
  rootPath: "/home/dev/src/web-api",
};
const paseoLinear: ProjectRef = {
  id: "prj_paseolinear",
  name: "paseo-linear",
  rootPath: "/home/dev/src/paseo-linear",
};

describe("repoLabelFromIssue", () => {
  it("returns the name of the label in the configured group", () => {
    const labels = [{ name: "web-api", group: "Agent" }];
    expect(repoLabelFromIssue(labels, "Agent")).toBe("web-api");
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
      { name: "web-api", group: "Agent" },
      { name: "High", group: "⭐️ Benefit" },
    ];
    expect(repoLabelFromIssue(labels, "Agent")).toBe("web-api");
  });

  it("matches the group exactly and case-sensitively", () => {
    const labels = [{ name: "web-api", group: "agent" }];
    expect(repoLabelFromIssue(labels, "Agent")).toBeNull();
  });

  it("ignores labels with no group at all", () => {
    const labels = [{ name: "web-api", group: null }];
    expect(repoLabelFromIssue(labels, "Agent")).toBeNull();
  });

  it("returns null when repoLabelGroup is empty", () => {
    const labels = [{ name: "web-api", group: "Agent" }];
    expect(repoLabelFromIssue(labels, "")).toBeNull();
  });
});

describe("matchProject", () => {
  const baseOptions = {
    labels: [{ name: "web-api", group: "Agent" }],
    repoLabelGroup: "Agent",
    projects: [webApiScripts, webApiRoot, paseoLinear] as ReadonlyArray<ProjectRef>,
    projectByRepoLabel: {},
    lastProjectId: "",
  };

  it("prefers a remembered project id over a unique name match", () => {
    const result = matchProject({
      ...baseOptions,
      labels: [{ name: "paseo-linear", group: "Agent" }],
      projects: [paseoLinear, webApiRoot],
      projectByRepoLabel: { "paseo-linear": webApiRoot.id },
    });
    expect(result).toEqual({
      repoLabel: "paseo-linear",
      project: webApiRoot,
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
      projects: [paseoLinear, webApiRoot],
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
      repoLabel: "web-api",
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
