import type { PluginSurfaceProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useWorkspace } from "@getpaseo/plugin/client";
import { IssuesBoard } from "./board";

export function IssuesPanel(props: PluginWorkspacePanelProps) {
  const repositoryPath = useWorkspace(props.workspaceId, (workspace) => workspace.projectRootPath);
  return <IssuesBoard theme={props.theme} layout={props.layout} repositoryPath={repositoryPath ?? undefined} />;
}

export function IssuesSurface(props: PluginSurfaceProps) {
  return <IssuesBoard theme={props.theme} layout={props.layout} />;
}
