# Issue grooming — design

Status: proposed
Date: 2026-09-10
Depends on: `2026-09-10-paseo-linear-plugin-design.md` (implemented)

## 1. Purpose

Turn a thin Linear issue into one that is actually actionable, by having an agent read the
codebase rather than guess. "Search is broken" becomes a scoped description naming the files,
the existing pattern to reuse, and what must not change — which is exactly the difference
Linear's own coding-session docs identify between an issue an agent can execute and one it
cannot.

Then act on it: an accepted groom flows straight into the existing start-work path.

The loop is **groom → review the diff → accept → start work**, and a human presses the button
at every transition.

## 2. Non-goals

- **No autonomous writes.** Grooming never edits a Linear issue on its own. §6 is the whole
  answer to "what reaches Linear".
- **No scheduling in v1.** §8 designs the seam so a schedule can drive grooming later; it is
  not built.
- **No batch grooming.** One issue at a time.
- **No new chat surface.** Refining by conversation happens in the Paseo agent that grooming
  spawns — that is what Paseo agents already are. The plugin does not rebuild a chat UI.

## 3. Mechanism: a real agent in a real checkout

Grooming spawns a Paseo agent, because the value is in reading the code. A one-shot model call
against the Linear API can only reword what the issue already says.

`linear.groom` creates a **worktree** workspace on branch `groom/<identifier-lowercase>`, not a
directory workspace on your checkout. A grooming agent is meant to read, but "meant to" is not
an enforcement boundary — the worktree guarantees it cannot dirty your working tree no matter
what it does. The cost is a throwaway branch per groom, which is the right trade.

The agent is created with:

| Field | Value |
|---|---|
| `labels` | `linear.issue`, `linear.issueId`, `linear.url` (as today) **plus `linear.groom: "1"`** |
| `prompt` | `groomPromptTemplate` rendered with the issue, same placeholders as `promptTemplate` |
| `outputSchema` | the proposal schema in §4 |
| `config.provider` | the configured provider, same requirement as start-work |

The `linear.groom` label is the load-bearing part — see §8.

## 4. Getting the proposal back

The RPC returns as soon as the agent is created; it does not block on the research. The result
arrives through the **`agent.turn_ended` hook the plugin already registers**.

The hook currently ignores agents it has no binding for. It gains one branch: when the agent
carries `linear.groom`, read the proposal and append a `linear-groom` timeline row instead of
the ordinary `linear-turn` offer row.

Proposal shape:

```ts
{
  description: string,        // the proposed replacement body, Markdown
  summary: string,            // one line on what changed and why
  openQuestions: string[],    // what the agent could not determine
  filesInspected: string[],   // evidence — what it actually read
}
```

**Verify before building, with a stated fallback.** Whether an `outputSchema` result is
reachable from inside `agent.turn_ended` is unconfirmed — `PaseoAgentRunResult.final` carries
it for a caller that awaited `run()`, but the hook receives `timeline`, not a run result. Check
`AgentTimelineItem` and the agent snapshot for the structured output first. If it is not
reachable there, the fallback is to parse the last `assistant_message` for a fenced ```json
block and validate it with the Zod schema — the prompt asks for exactly that block, so this
degrades to a parse rather than a redesign. Either way the proposal is validated by Zod before
it reaches a renderer; a proposal that fails validation appends a row saying grooming produced
nothing usable, rather than silently vanishing.

## 5. Reviewing the diff

A `linear-groom` timeline renderer, and the same component reachable from the board card's
modal, shows:

1. The one-line summary.
2. **A line diff of the current description against the proposal.** Computed by a new pure
   `shared/diff.ts`:

   ```ts
   export type DiffLine = { type: "same" | "add" | "remove"; text: string };
   export function diffLines(before: string, after: string): DiffLine[];
   ```

   A standard LCS line diff. Added lines tint `statusSuccess`, removed lines `statusDanger`,
   unchanged lines `foregroundMuted`. This is pure and fully unit-testable — identical input,
   pure insertion, pure deletion, a replaced middle, empty-to-nonempty, nonempty-to-empty, and
   trailing-newline handling.
3. Open questions, as a list — these are the reason to read before accepting.
4. Files inspected, collapsed. Evidence that the agent actually looked.
5. Actions: **Accept**, **Edit**, **Discard**.

`Edit` opens the proposal in a multiline `TextInput` seeded with the proposed text, so a
half-right proposal is salvageable without a re-groom.

## 6. What reaches Linear

Exactly one new mutation, behind exactly one press:

| Action | Effect |
|---|---|
| Accept | `issueUpdate(id, { description })` via a new `linear.update-description` RPC |
| Edit → Save | the same, with the edited text |
| Discard | nothing; the row is removed |

Nothing else in the grooming path writes to Linear. The turn-ended hook appends a timeline row
and stops, exactly as the existing offer row does.

After a successful accept, the row collapses to a confirmation with a **Start work** action, so
the groom → work handoff is one press and reuses `startWorkRpc` unchanged.

## 7. Where you start a groom

- The board card's detail modal gains **Groom this issue**, beside **Start work**.
- A Command Center item, **Linear: groom an issue**, taking an identifier.

Both call `linear.groom`. Grooming an issue that already has a groom agent running reuses that
agent rather than spawning a second — keyed by the `linear.groom` + `linear.issue` label pair.

## 8. The scheduling seam (designed, not built)

The seam is that **the hook keys off the label, not off who created the agent.**

Any agent carrying `linear.groom` plus `linear.issue` flows through §4 and produces a proposal
row — regardless of whether the plugin, a human, or a Paseo schedule created it. So a scheduled
groom needs no new plugin code path: a schedule that runs

```
paseo run --new-workspace worktree --worktree-mode branch-off \
  --new-branch groom/eng-123 --base origin/main \
  --label linear.issue=ENG-123 --label linear.groom=1 \
  --provider <p> "<groom prompt>"
```

lands in the same review flow. Building the scheduling UI is deferred; not foreclosing it costs
nothing today.

The one thing scheduling would need that v1 does not have: a notification path, since a
proposal appended to a timeline nobody is watching is easy to miss. That is the piece to design
when scheduling is actually built.

## 9. Settings additions

| Key | Default | Meaning |
|---|---|---|
| `groomPromptTemplate` | built-in | The research prompt. Same placeholders as `promptTemplate`, plus `{{currentDescription}}`. |
| `groomBranchPrefix` | `"groom/"` | Branch prefix for groom worktrees. |

The default prompt instructs the agent to: read the issue, locate the relevant code, propose a
description naming files and existing patterns to reuse and stating explicitly what must not
change, list what it could not determine rather than inventing it, and emit the §4 JSON.

## 10. Testing

| Unit | Covered |
|---|---|
| `shared/diff.ts` | the seven cases in §5 |
| proposal schema | valid parse; each malformed shape rejected; the fenced-block fallback parser |
| `server/groom.ts` | the workspace request shape, branch name derivation, label set |
| hook branching | a `linear.groom` agent produces a groom row; a plain bound agent still produces the ordinary offer row; an unbound agent produces neither |

Client rendering stays untested for the same reason as the rest of the plugin: no RN test
renderer. Its gate is typecheck, the mobile audit, and manual review.

## 11. Risks

- **Structured output reachability** (§4) — the one real unknown, with a stated fallback.
- **`autoArchive` shape on agent creation** is unverified; if it does not do what its name
  suggests, groom workspaces accumulate and are cleaned up by hand. Not a blocker.
- **Groom branches accumulate.** `groom/*` branches are throwaway; the README should say so and
  suggest a periodic prune.
- **A groom agent burns tokens reading the codebase.** That is the point, but it is not free,
  and the settings screen should say so next to the action.

## 12. Open decisions

None blocking. §4 and §11 name what to verify first, each with a fallback that does not disturb
the rest of the design.
