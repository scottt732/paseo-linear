import type { PluginServerContext } from "@getpaseo/plugin/server";
import { issueAttachmentItem } from "../shared/issue";
import {
  assignSelfRpc,
  commentRpc,
  getIssueRpc,
  linkBranchRpc,
  listIssuesRpc,
  listStatesRpc,
  moveStateRpc,
  searchIssuesRpc,
  startWorkRpc,
  syncSettingsRpc,
  verifyRpc,
} from "../shared/rpc";
import { cacheSettings, loadLinearContext } from "./context";
import { assignIssue, createComment, linkUrl, moveIssueState } from "./linear/mutations";
import { fetchIssue, fetchStates, fetchViewer, listIssues, searchIssues } from "./linear/queries";
import { startWork } from "./start-work";

export function registerHandlers(server: PluginServerContext): void {
  server.handle(syncSettingsRpc, ({ values }) => {
    cacheSettings(values);
    return { ok: true };
  });

  server.handle(searchIssuesRpc, async ({ query }, context) => {
    const { transport, settings } = loadLinearContext(context);
    const issues = await searchIssues(transport, query, settings.defaultTeamKey);
    return { items: issues.map(issueAttachmentItem) };
  });

  server.handle(getIssueRpc, async ({ identifier }, context) => {
    const { transport } = loadLinearContext(context);
    return { issue: await fetchIssue(transport, identifier) };
  });

  server.handle(listIssuesRpc, async ({ scope }, context) => {
    const { transport, settings } = loadLinearContext(context);
    return { issues: await listIssues(transport, scope, settings.defaultTeamKey) };
  });

  server.handle(verifyRpc, async (_input, context) => {
    const { transport, source } = loadLinearContext(context);
    const viewer = await fetchViewer(transport);
    return { name: viewer.name, source };
  });

  server.handle(listStatesRpc, async ({ teamId }, context) => {
    const { transport } = loadLinearContext(context);
    const states = await fetchStates(transport, teamId);
    return { states: states.map(({ id, name, type }) => ({ id, name, type })) };
  });

  server.handle(commentRpc, async ({ issueId, body }, context) => {
    const { transport } = loadLinearContext(context);
    return createComment(transport, issueId, body);
  });

  server.handle(moveStateRpc, async ({ issueId, stateId }, context) => {
    const { transport } = loadLinearContext(context);
    return moveIssueState(transport, issueId, stateId);
  });

  server.handle(assignSelfRpc, async ({ issueId }, context) => {
    const { transport } = loadLinearContext(context);
    const viewer = await fetchViewer(transport);
    return assignIssue(transport, issueId, viewer.id);
  });

  server.handle(linkBranchRpc, async ({ issueId, url, title }, context) => {
    const { transport } = loadLinearContext(context);
    return linkUrl(transport, issueId, url, title);
  });

  server.handle(startWorkRpc, ({ identifier }, context) => startWork(context, identifier));
}
