# paseo-linear

A Paseo plugin that integrates Paseo with [Linear](https://linear.app). It turns a Linear issue
into a Paseo worktree agent — pull an issue's context into a workspace, start an agent working
on it in a dedicated branch, and push comments, state changes, and branch links back to Linear
as you go.

## Installation

```bash
paseo plugin install /Users/sholodak/cosmos/paseo-linear
```

After editing the plugin source, reload it for the changes to take effect:

```bash
paseo plugin reload linear
```

## What it does

The plugin adds these to Paseo:

- **Attach a Linear issue in the composer.** The attachment picker can search Linear and attach
  an issue's context to a message.
- **Settings → Plugins → Linear.** Configure your API key, default team, provider, repository
  path, base ref, and prompt template. A connection test discloses which credential source is
  active.
- **A Linear board**, in the sidebar and as a workspace tab. Four views — **Mine**, **Cycle**,
  **Up for grabs** (unassigned), and **Triage** — each a horizontally-scrolling kanban board
  grouped by workflow state, ordered by Linear's own state positions. Cards show the
  identifier, parent, assignee, priority, estimate, project, labels, linked PR count, and due
  date. The board is not a Linear replacement; it exists to answer "what am I working on" and
  "what should I pick up next".
- **Create an issue** from the `+` on any column header, pre-filled with that column's state.
  Title, description, priority, due date, and team. It assigns to you on **Mine** and leaves
  the issue unassigned on **Up for grabs**.
- **Move an issue by dragging it.** Long-press a card to lift it, drag, and drop it on another
  column; the target column highlights, and no highlight means releasing would do nothing.
  Every card's detail view also has a **Move to…** list, which is the keyboard- and
  screen-reader-reachable equivalent and the way to reach a column scrolled off-screen.
- **Start work on an issue.** From the card, the Command Center ("Linear: start work on an
  issue"), or the `/linear ENG-123` slash command. Any of these creates a worktree agent on
  Linear's own suggested branch name, with the issue attached as its first context.
- **A per-agent composer pill.** Any agent tagged with a `linear.issue` label
  gets a "Linear ENG-123" pill in its composer, with a menu to view the issue, open it in
  Linear, comment on it, move its state, or link the current branch. A turn-end offer row also
  appears at the end of an agent turn, offering to do the same.

**Every Linear mutation requires an explicit press.** Nothing the plugin does writes to Linear
on its own — the turn-end hook only *offers* a comment, state change, or branch link; it never
sends one. Every write to Linear happens because you clicked something.

## Operational notes

**Credentials.** The plugin needs a Linear personal API key, supplied one of two ways: as
`LINEAR_API_KEY` in the daemon's environment, or entered into Settings → Plugins → Linear. If
both are set, the environment variable wins. The settings value is stored as ordinary host-side
JSON on the daemon — it is not held in a credential vault, so treat the daemon's settings file
with the same care as any other file containing a secret.

**How the daemon gets settings — and the one case where it doesn't.** `PluginHandlerContext`
has no settings accessor, so the client pushes the full settings document to the daemon on
startup and again after every save. Any daemon-side code that runs while a Paseo client is
connected therefore sees whatever credential source you've configured. But a lifecycle hook
that runs on a headless daemon — one with **no Paseo client ever connected** — never receives
that push and falls back to schema defaults (an empty API key, empty provider, empty
repository path). If you run Paseo headless, you must set `LINEAR_API_KEY` in the daemon
environment; the settings-screen key will not reach it. This is the one sharp edge in the
design — do not assume the settings-screen key is enough for headless use.

**A provider must be set.** Settings → Plugins → Linear has a provider picker, populated from
the providers your daemon reports as available, and it must be set before "start work" will
run. There is no fallback: the Paseo SDK exposes no default-provider accessor, and the plugin
deliberately will not pick a model for you and start an agent on it. A bare provider such as
`claude` is valid; `provider/model` (for example `claude/claude-opus-5`) pins a model.

**A repository path, usually automatic.** This is the local checkout the new worktree branches
from. When you open the Linear board as a tab inside a workspace, it defaults to that
workspace's project root and you do not need to set anything. You only need to fill the field
in Settings for the paths that have no workspace context: the sidebar surface, the `/linear`
slash command, and the Command Center item. A value set in Settings always wins over the
workspace default, so configuring it never gets silently overridden.

The branch's base ref (`baseRef`) defaults to `origin/main` rather than local `main`,
deliberately: Paseo fetches remote refs in the background, so `origin/main` reflects a recent
remote state, while a local `main` can be stale if it has not been pulled recently.

## Launch from Linear

Linear can open an issue directly into a Paseo agent using a custom coding tool.

1. Make the launcher script executable (it already is, if you cloned this repo as-is):

   ```bash
   chmod +x bin/paseo-linear-open
   ```

2. In Linear, go to Settings → Code & reviews → External tools, and register
   `bin/paseo-linear-open` (the absolute path on your machine) as a custom coding tool.

3. Linear invokes the script with the issue identifier as its first argument, which starts a
   background Paseo agent labeled with `linear.issue=<identifier>`.

**What the script does and does not do.** It is a thin launcher: it starts an agent in the
current directory, labeled with the issue, and tells that agent to fetch the issue itself. It
does **not** create a worktree, resolve Linear's configured branch name, or attach the issue
body — that richer path is what "start work" inside Paseo does (Command Center, `/linear`, or
the panel). Because the agent carries the `linear.issue` label, the composer pill and the
turn-end offer row still work for it. If you want the worktree and the prepared prompt, start
from inside Paseo rather than from Linear.

Linear's own "on open in coding tool, move issue to started status" preference handles moving
the issue to Started — the script does not do this itself. Once the tool is registered, you can
launch it from an issue with the `Cmd Option .` keyboard shortcut.

Because GUI-launched processes on macOS often do not inherit a login shell's `PATH`, the script
calls `paseo` assuming it resolves; if it doesn't in your environment, edit the script to call
the absolute path, `/Users/sholodak/.local/bin/paseo`, instead.

### Note on the `paseo://` URL scheme

The Paseo app registers a `paseo://` URL scheme, but its routes are not verified as part of
this plugin. The launcher script above, registered as a custom coding tool, is the supported
way to open a Linear issue into Paseo today.

## Development

```bash
npm run typecheck
npm test
```

Client code (everything under `client/`) has no unit tests by design — there's no React Native
test renderer in this project, and it isn't worth adding one for presentational code. Client
changes are instead gated on typecheck and a "mobile audit": a grep that flags any web-only API
or JSX-shaped syntax slipping into React Native code, since this plugin's client surfaces render
on mobile as well as desktop.

```bash
rg -n "document\.|window\.|localStorage|navigator\.|<(div|span|button|a|p|ul|li|input|form|img|h[1-6])[ >/]|className=|onClick=" client/
```

This should report exactly one match: the `window.open` call in `client/web.ts`, which is
guarded to only run on web.
