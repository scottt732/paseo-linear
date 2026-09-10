import type { PluginSurfaceProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { IssuesBoard } from "./board";

export function IssuesPanel(props: PluginWorkspacePanelProps) {
  return <IssuesBoard theme={props.theme} layout={props.layout} />;
}

export function IssuesSurface(props: PluginSurfaceProps) {
  return <IssuesBoard theme={props.theme} layout={props.layout} />;
}
