# Paseo ↔ Linear plugin — design

Status: proposed
Date: 2026-09-10
Target: Paseo plugin API v0.8 (`requirements.paseo: ">=0.8.0"`)

## 1. Purpose

Make a Linear issue the unit of work in Paseo. You should be able to start from an issue and
get a running agent in an isolated worktree without retyping anything, see which issue any
agent belongs to at a glance, and push results back to Linear — without leaving Paseo, and
without the plugin ever mutating Linear on its own.

The plugin is named `paseo-linear` and installs under the runtime ID `linear`.

### Design principles

1. **Linear owns its conventions.** Branch names, prompt templates, and started-status
   transitions already exist as Linear features. The plugin consumes them rather than
   inventing parallel ones.
2. **No surprise writes.** Every Linear mutation is behind a press. Lifecycle hooks may
   *offer* an action; they never take one.
3. **Credentials stay on the daemon.** No API key ever enters the client bundle.
4. **Mobile is not an afterthought.** Every surface is React Native, theme-token-colored, and
   checked in the compact layout.

## 2. Non-goals

- **Linear OAuth.** v1 uses a personal API key. OAuth is deferred (§13).
- **Linear for Agents / agent sessions.** Registering Paseo as a first-class Linear agent that
  users delegate issues to requires a public webhook endpoint. Deferred (§13), but §4 keeps
  the server layer shaped so it can host that later.
- **Two-way sync.** No background poller, no local mirror of Linear state. Every read is
  on-demand and cached only by TanStack Query.
- **Issue authoring.** Creating and editing issue bodies stays in Linear.

## 3. Architecture

One plugin, three runtimes, per the v0.8 import boundaries. Nothing but the two entries lives
in the plugin root.

```
paseo-linear/
  paseo-plugin.json          { id: "linear", requirements: { paseo: ">=0.8.0" } }
  index.client.tsx           registers every client contribution
  index.server.ts            registers every RPC handler, settings doc, and lifecycle hook
  shared/
    issue.ts                 IssueSchema — the one issue shape crossing the boundary
    rpc.ts                   every defineRpc contract
    attachments.ts           defineAttachmentSource
    settings.ts              defineSettings document
    format.ts                pure formatters (relative time, branch slug, prompt render)
  server/
    linear/client.ts         GraphQL transport, auth, error mapping
    linear/queries.ts        issue fetch / search / my-issues documents
    linear/mutations.ts      comment, state change, attachment link
    credentials.ts           env-var-then-settings resolution
    handlers/*.ts            one file per RPC
    binding.ts               issue ↔ agent resolution
    hooks.ts                 agent.turn_ended, workspace.archived
  client/
    chip.tsx                 IssueChip + IssueCard (§5)
    panel.tsx                workspace panel: my issues / cycle / triage
    settings.tsx             Settings → Plugins → Linear
    launch.tsx               "start work" flow
    web.ts                   openExternal, the only place platform globals appear
```

**Boundary rules that bite:** `shared/` may not import `node:*`, React, or any
runtime-specific SDK entry. `server/` may not import React or `client/`. `client/` may not
import `node:*` or `server/`. Type-only imports and transitive dependencies count. Zod is the
only dependency shared across all three.

## 4. The Linear API layer

`server/linear/client.ts` is a thin GraphQL POST against `https://api.linear.app/graphql`,
extended well past the upstream `plugin-examples/linear`. It takes an injectable `endpoint`
and `request` so tests drive it against a local `node:http` server with no network and no
mocking framework.

**Verified against the live API** (`ENG-14236`, this workspace):

| Need | Field |
|---|---|
| Branch name in the workspace's configured format | `issue.branchName` |
| Identity and link | `id`, `identifier`, `url` |
| Card header | `title`, `project { name icon color }`, `parent { identifier title parent { … } }` |
| Card status line | `state { name type color }`, `priority`, `priorityLabel` |
| Card badges | `team { key name }`, `labels { nodes { name color } }` |
| Card timestamps | `createdAt`, `updatedAt` |
| Card body | `description` |
| Linked PRs | `attachments { nodes { title subtitle url } }` |
| Started-status target | `team { states { nodes { id name type position } } }` |
| "Assign to me" | `viewer { id name }` |

The parent chain is walked three levels deep in one query; the breadcrumb renders
`project · ancestor · ancestor · title`.

**Mutations** (all behind a press):

| Action | Mutation |
|---|---|
| Comment | `commentCreate` |
| Move state | `issueUpdate(stateId:)` |
| Assign to me | `issueUpdate(assigneeId:)` |
| Link branch/PR | `attachmentLinkURL` |

Errors map to messages a person can act on: 401/403 → "Linear rejected the API key", 429 →
"Rate limited, try again shortly", GraphQL `errors[]` → joined messages. HTTP 200 with a
populated `errors` array is a failure, not a success — the upstream example already gets this
right and we keep that test.

## 5. The issue chip and card

This is the visual contract, taken from the reference screenshot.

**Chip** — a pill showing just the identifier (`ENG-14236`), rounded and sized to content.
Chips sit in rows and wrap. The pill takes `theme.colors.raised` for its ground and
`theme.colors.foreground` for its label, so it reads as a raised token against the page in
either theme rather than being pinned to the light-on-dark of the reference screenshot.

**Card** — opens from the chip and contains, in order:

1. Breadcrumb: project icon/emoji, then `project · ancestor · ancestor · title`, wrapping,
   in `theme.colors.foreground`.
2. Status line: state name **in the state's own Linear color**, then priority label in
   `foregroundMuted`.
3. Badge row: team, then labels, each in its Linear color at low opacity.
4. Meta line: `created 10d ago · updated 1d ago` in `foregroundMuted`, from a pure
   `relativeTime` helper in `shared/format.ts`.
5. Divider.
6. Description, clamped to ~12 lines with an ellipsis. Rendered as plain text with inline
   `` `code` `` spans styled monospace — not a full Markdown engine.

**Interaction.** Pressing the chip opens the card; pressing the card opens the issue on
linear.app. There is no hover behavior: React Native has no portable hover, and the v0.8 docs
explicitly forbid DOM hover handlers. Press works identically on desktop and phone.

**Presentation depends on where the chip lives:**

- Inside a header button or composer pill → `behavior: { kind: "popover", Content: IssueCard }`.
  Paseo anchors it on wide layouts and presents a bottom sheet on compact ones — the hover-card
  feel on desktop, a native sheet on mobile, for free.
- Inside a panel row or timeline row → a controlled `Modal` from
  `@getpaseo/plugin/client/react-native`, same dual presentation.

**Hyperlinking.** `client/web.ts` exports `openExternal(url)`, gated on `Platform.OS`:
`window.open(url, "_blank", "noopener,noreferrer")` on web, `Linking.openURL(url)` on native.
It declares only the one global it uses. `tsconfig.json` omits the DOM lib so every other
`window` reference is a type error. Card and chip call `openExternal`; they never touch
platform globals. Every card also offers **Copy identifier** and **Copy branch name** via
`copyText`, confirmed with a toast.

## 6. Credentials and settings

Per your choice: **read the env var if set, otherwise the settings value.**

`server/credentials.ts` resolves in this order and reports which source won, so the settings
screen can show "Using LINEAR_API_KEY from the daemon environment" and disable the input
rather than letting you edit a value that is being ignored.

1. `process.env.LINEAR_API_KEY`
2. `settings.apiKey`
3. Neither → every RPC fails with "Add a Linear API key in Settings → Plugins → Linear."

`shared/settings.ts` defines a `defineSettings` document (`id: "linear"`, `scope: "host"`,
`version: 1`), registered with `server.registerSettings(...)`:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `apiKey` | string | `""` | Personal API key. Ignored when the env var is set. |
| `defaultTeamKey` | string | `""` | Scopes search and the panel. Empty means all teams. |
| `provider` | string | `""` | Provider/model for issue-launched agents. Empty means the daemon default. |
| `baseRef` | string | `"origin/main"` | Base for `branch-off`. Remote-tracking by design — see §7. |
| `repositoryPath` | string | `""` | Checkout to create worktrees from. Empty means ask at launch. |
| `promptTemplate` | string | (built-in) | The prompt seeded into the agent. Supports `{{identifier}}`, `{{title}}`, `{{url}}`, `{{description}}`, `{{branchName}}`. |
| `moveToStarted` | boolean | `true` | Offer to move the issue to the team's first started status on launch. |
| `assignToMe` | boolean | `false` | Offer to self-assign on launch. |

The docs are explicit that these documents are ordinary host-side JSON, not a credential
vault. The settings screen says so next to the key input, and the input uses
`secureTextEntry`. Anyone wanting the key off disk uses the env var.

## 7. Binding an issue to an agent

**Agent labels are the source of truth**, as approved. At creation:

```
labels: {
  "linear.issue":   "ENG-14236",
  "linear.issueId": "f92cd857-…",
  "linear.url":     "https://linear.app/thecosmos/issue/ENG-14236/…",
}
```

Durable across daemon restarts, filterable through `agents.list`, visible to you, and settable
from `paseo run --label k=v` — which is what makes the Linear-launched path in §9 work.

Resolution differs by runtime, and both paths read the same labels:

- **Client** — the agent snapshot already carries `labels: Record<string, string>`, so
  `useAgent(agentId, a => a.labels["linear.issue"])` resolves synchronously against cached
  state. No RPC, and no violation of the rule against calling a plugin RPC to discover the
  current agent.
- **Server** — `PluginHookAgent` does not carry labels, so `server/binding.ts` calls
  `paseo.agents.ref(id).refresh()` and reads them, memoized per agent id for the process
  lifetime.

**Fallback for workspaces created outside the plugin:** parse a Linear identifier out of the
worktree branch name (`feature/eng-14236-…` → `ENG-14236`). Read-only and best-effort — it
recognizes an issue but never writes a label back, so there is exactly one writer.

## 8. Features

### 8.1 Attach an issue

Keeps the upstream attachment source and hardens it: identifier lookup stays exact-match, and
title search gains team scoping from `defaultTeamKey`. The attachment `text` is the full
snapshot the agent sees — identifier, title, URL, state, priority, assignee, project, labels,
branch name, then the description.

### 8.2 Configure

`addSettingsScreen` renders §6 with `SettingsSection` / `SettingsCard` / `SettingsInput` /
`SettingsSwitch` / `SettingsSelect` from `@getpaseo/plugin/client/ui`. A **Test connection**
`SettingsAction` calls a `linear.verify` RPC that runs `viewer { id name }` and toasts the
authenticated user's name — so you find out the key is wrong here, not three screens later.

Draft text stays in component state; `save(values, revision)` is called on an explicit press,
holding the revision captured when the draft opened so a stale write is rejected rather than
clobbering.

### 8.3 Start work from an issue

Reachable three ways — Command Center item, `/linear ENG-14236` slash command, and a press on
any panel row — all funnelling into one `linear.startWork` RPC.

1. Fetch the issue, including `branchName`.
2. Create the workspace:
   `workspaces.create({ source: { kind: "worktree", cwd: repositoryPath, action: "branch_off", newBranch: issue.branchName, base: baseRef } })`.
   **The exact discriminant is unverified** — see §11.
3. Set the workspace title to `ENG-14236 · <title>`.
4. Create the agent with the §7 labels, the configured provider, and the rendered prompt.
5. If `moveToStarted` or `assignToMe` is on, show a confirm sheet listing exactly what will
   change in Linear, and mutate only on press. This mirrors Linear's own "on git branch copy,
   move issue to started status" behavior, which is opt-in there too.

`baseRef` defaults to `origin/main` rather than `main` deliberately: Paseo fetches remote refs
in the background, so the remote-tracking ref is current while a local `main` is whatever was
last pulled.

### 8.4 See your issues

A workspace panel (`locations: ["workspace", "explorer"]`) with three tabs — **Assigned**,
**Current cycle**, **Triage** — each a `FlatList` of rows built from the §5 chip plus title
and state. Pressing a row opens the card; the card's primary action is **Start work**, which
calls 8.3. Fetching is TanStack Query against a `linear.listIssues` RPC, with pull-to-refresh
and a real empty state per tab.

### 8.5 Push back to Linear

A composer pill, registered per agent, visible only when §7 resolves an issue for that agent.
Its label is the identifier; its behavior is a menu:

| Entry | Effect |
|---|---|
| View issue | Opens the card popover |
| Open in Linear | `openExternal(issue.url)` |
| Comment last turn summary | Opens a modal pre-filled with the last assistant message, editable, posts on **Post** |
| Move to… | Submenu of the team's workflow states; posts `issueUpdate` on selection |
| Link this branch | `attachmentLinkURL` with the worktree branch or its PR |
| Copy branch name | `copyText(issue.branchName)` |

**The `agent.turn_ended` hook offers, it does not act.** When a turn completes on an agent
bound to an issue, the hook appends one plugin timeline row (stable `id`, so re-appending
replaces rather than stacks) reading "Turn finished on ENG-14236" with **Comment on issue**
and **Move to…** buttons. Its `data` payload carries only the identifier, a truncated summary,
and the state options — comfortably under the 64 KiB cap. A registered timeline renderer draws
it. Nothing reaches Linear until you press something.

`workspace.archived` clears the binding memo. Nothing else listens.

## 9. Linear-native features we adopt

This is where the integration stops being a wrapper.

**Branch names.** `issue.branchName` returns the workspace's configured Branch format —
`feature/eng-14236-randomize-the-products-on-the-tabs-brands-pages` here. We use it verbatim
as the worktree branch, so branches created from Paseo are indistinguishable from branches
created by Linear's own "Copy git branch name", and Linear's GitHub/GitLab integration links
the resulting PR back with no magic words needed.

**Prompt templates.** Linear's Settings → Account → Code & reviews lets you configure coding
tools and prompt templates, and offers "copy as prompt". The plugin's `promptTemplate` setting
uses the same placeholder idea so a template written for Linear's Claude Code integration can
be pasted straight in.

**Paseo as a custom coding tool in Linear.** Linear supports adding coding tools it doesn't
ship, either by URL with query params or by a local script. Both routes are open to us:

- `/Applications/Paseo.app` registers the `paseo` URL scheme (`CFBundleURLTypes` →
  `CFBundleURLSchemes: ["paseo"]`, named "Paseo agent link"), so a
  `paseo://…?issue=ENG-14236` link is plausible — **but the scheme's accepted routes are
  undocumented and unverified** (§11).
- The CLI route is verified today:
  `paseo run --new-workspace worktree --worktree-mode branch-off --new-branch <branchName> --base origin/main --label linear.issue=<id> --provider <p> "<prompt>"`.

We ship a small `bin/paseo-linear-open` script the user registers as a custom coding tool.
Linear's **Work on issue** menu (`W` `O`, or `Cmd Option .`) then launches Paseo directly, and
Linear's "on open in coding tool, move issue to started status" preference handles the state
transition on Linear's side. That closes the loop: start in Linear, land in Paseo.

## 10. Testing

Vitest, following the upstream example's pattern: a real `node:http` server on port 0, no
network, no mocking library.

| Unit | Covered |
|---|---|
| `server/linear/client.ts` | exact-identifier vs. title search, auth header, GraphQL errors under HTTP 200, 401/429 mapping, missing key |
| `server/credentials.ts` | env wins over settings; settings used when env absent; neither → typed error |
| `shared/format.ts` | relative time boundaries, prompt placeholder substitution incl. unknown and repeated placeholders, description clamping |
| `server/binding.ts` | label resolution, branch-name fallback, precedence, memo invalidation on archive |
| `server/linear/mutations.ts` | each mutation's variables; nothing fires without an explicit call |

Mobile audit before calling it done, per the plugin skill:
`rg -n "document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=" client/`
— a hit anywhere but `client/web.ts` is a bug.

Manual verification: install, `paseo plugin ls` shows `running`, then exercise each surface on
a wide desktop window and a compact one, in both a light and a dark theme, and watch a real
turn end rather than only inspecting completed history.

## 11. To verify against the installed types, not guessed

Three things this spec asserts that the public docs do not pin down. Each is checked against
`node_modules/@getpaseo/plugin` — which is authoritative and local — before the code that
depends on it is written.

1. **`workspaces.create({ source })` for branch-off.** The docs show the CLI form
   (`--worktree-mode branch-off --new-branch --base`) and the SDK form only for PR checkout.
   §8.3 assumes `action: "branch_off"` with `newBranch`/`base`. If the SDK shape differs, §8.3
   changes; nothing else does.
2. **Setting agent labels through `agents.create`.** The SDK lists `labels` among creation
   options and `--label` exists on the CLI, but the accepted shape is unconfirmed. If labels
   turn out not to be settable at creation, the fallback is the plugin settings document
   (approach B from the earlier discussion), isolated behind `server/binding.ts`.
3. **The `paseo://` URL scheme's routes.** Unknown. The CLI script route in §9 works
   regardless, so this is an enhancement, not a dependency.

## 12. Error handling

Every RPC returns a typed result; handlers never leak a raw GraphQL blob to the UI. Missing
credentials render an inline call to action linking to the settings screen rather than an
error toast. Rate limiting surfaces as a retryable message. A Linear outage degrades the panel
to a retry state and leaves attachment and launch paths independently usable. No plugin log
line ever contains the API key.

## 13. Deferred

- **OAuth**, replacing the personal key, once there's a redirect target to register.
- **Linear for Agents** — registering Paseo as a delegatable agent so `AgentSession` activity
  streams into the Linear issue while the Paseo agent works. The most valuable extension here,
  and the reason §4 keeps transport, queries, and mutations separated from handlers. It needs
  a public webhook endpoint; Paseo's relay or Hub is the plausible host.
- **Project and cycle surfaces** beyond the issue list.
- **Sub-issue fan-out** — one parent issue to several parallel worktree agents.

## 14. Open decisions

None blocking. Section 11 names the three facts to confirm during implementation, each with a
stated fallback that does not disturb the rest of the design.
