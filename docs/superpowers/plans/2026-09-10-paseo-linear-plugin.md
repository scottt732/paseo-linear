# Paseo ↔ Linear Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Paseo v0.8 plugin that makes a Linear issue the unit of work — attach it, launch a worktree agent from it, see your issues, and push results back — with every Linear mutation behind an explicit press.

**Architecture:** One plugin, three runtimes. `shared/` holds Zod contracts and pure formatters. `server/` holds the Linear GraphQL client, credentials, mutations, and lifecycle hooks — all credentials stay here. `client/` holds React Native surfaces. The issue↔agent binding lives in agent labels, read synchronously from the agent snapshot on the client and via `refresh()` on the server.

**Tech Stack:** TypeScript 5.9, `@getpaseo/plugin` 0.8.0, Zod 4.6, React 19.1, React Native 0.81, TanStack Query 5.90, Vitest 3.2.

**Spec:** `docs/superpowers/specs/2026-09-10-paseo-linear-plugin-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- Plugin manifest: `{ "id": "linear", "requirements": { "paseo": ">=0.8.0" } }`.
- **Import boundaries are compile errors, not style.** `shared/` imports only `zod` and other
  `shared/` — never `node:*`, React, React Native, `/client`, or `/server`. `server/` never
  imports React, React Native, or `client/`. `client/` never imports `node:*` or `server/`.
  Type-only and transitive imports count. Only `index.client.tsx` and `index.server.ts` live in
  the plugin root.
- **Client host modules only:** `@getpaseo/plugin`, `@getpaseo/plugin/client`,
  `@getpaseo/plugin/client/ui`, `@getpaseo/plugin/client/react-native`, `@tanstack/react-query`,
  `react`, `react/jsx-runtime`, `react-native`, `zod`. Never `lucide-react-native` or
  `react-native-svg` — icons are Lucide *names* passed to `Icon` or an `icon` field.
- **React Native primitives only.** `View`, `Text`, `Pressable`, `ScrollView`, `TextInput`,
  `FlatList`. No HTML elements, `className`, CSS strings, or `onClick`.
- **All colors from `theme.colors`.** Never a hardcoded hex in `client/`. Padding and stacking
  react to `layout.compact`.
- **`tsconfig.json` has no `"DOM"` in `lib`.** Platform globals appear only in `client/web.ts`,
  which declares the narrow shape it uses and gates on `Platform.OS`. Never add
  `/// <reference lib="dom" />`.
- **Zod 4:** `z.string().url()` is deprecated — use `z.url()`. `z.record()` needs both key and
  value types: `z.record(z.string(), z.string())`.
- **Linear API:** endpoint `https://api.linear.app/graphql`, header
  `Authorization: <apiKey>` (raw key, no `Bearer` prefix), `Content-Type: application/json`.
  HTTP 200 with a populated `errors` array is a failure.
- **No Linear mutation without an explicit user press.** Lifecycle hooks may offer; they never act.
- **The API key never enters the client bundle and never appears in a log line.**
- **Tests:** Vitest, real `node:http` server on port 0. No mocking library, no network.
- Agent label keys are exactly `linear.issue`, `linear.issueId`, `linear.url`.

---

### Task 1: Project baseline

Strip the scaffold's greeting sample, add Vitest, and prove the toolchain runs.

**Files:**
- Modify: `package.json`, `tsconfig.json`
- Create: `vitest.config.ts`, `README.md`, `shared/version.ts`, `shared/version.test.ts`
- Delete: `client/greeting.tsx`, `server/greeting.ts`, `shared/greeting.ts`
- Modify: `index.client.tsx`, `index.server.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PLUGIN_ID = "linear"` from `shared/version.ts`; a working `npm test` and
  `npm run typecheck`.

- [ ] **Step 1: Write the failing test**

`shared/version.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PLUGIN_ID } from "./version";

describe("plugin identity", () => {
  it("matches the manifest id", () => {
    expect(PLUGIN_ID).toBe("linear");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./version`.

- [ ] **Step 3: Add the Vitest config and the module**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["**/*.test.ts"] },
});
```

`shared/version.ts`:

```ts
export const PLUGIN_ID = "linear";
```

- [ ] **Step 4: Delete the scaffold sample and empty the entries**

Delete `client/greeting.tsx`, `server/greeting.ts`, `shared/greeting.ts`.

`index.client.tsx`:

```tsx
import type { PluginClientContext } from "@getpaseo/plugin/client";

export default function contribute(_client: PluginClientContext) {
  return () => {};
}
```

`index.server.ts`:

```ts
import type { PluginServerContext } from "@getpaseo/plugin/server";

export default function contribute(_server: PluginServerContext) {
  return () => {};
}
```

- [ ] **Step 5: Add `vitest.config.ts` to the typecheck exclusions if `tsc` objects**

Run: `npm run typecheck && npm test`
Expected: both PASS. If `tsc` reports that `vitest/config` types are missing, add
`"vitest/globals"` is *not* needed — instead confirm `vitest` is in `devDependencies` and that
`tsconfig.json` `include` covers `vitest.config.ts`.

- [ ] **Step 6: Write the README**

`README.md` states: what the plugin does (one paragraph), that it needs a Linear personal API
key set either as `LINEAR_API_KEY` in the daemon environment or in Settings → Plugins → Linear,
the install command `paseo plugin install /Users/sholodak/cosmos/paseo-linear`, and that source
edits require `paseo plugin reload linear`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: project baseline with vitest and empty plugin entries"
```

---

### Task 2: Pure formatters

Everything here is a pure function of its inputs. No I/O, no dates from `Date.now()` except
through an injected parameter — that is what makes these testable.

**Files:**
- Create: `shared/format.ts`, `shared/format.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `relativeTime(iso: string, now: Date): string`
  - `renderPrompt(template: string, values: Record<string, string>): string`
  - `clampText(text: string, maxLines: number): string`
  - `identifierFromBranch(branch: string): string | null`
  - `DEFAULT_PROMPT_TEMPLATE: string`

- [ ] **Step 1: Write the failing tests**

`shared/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clampText, identifierFromBranch, relativeTime, renderPrompt } from "./format";

const now = new Date("2026-09-10T12:00:00.000Z");

describe("relativeTime", () => {
  it("reports seconds under a minute as just now", () => {
    expect(relativeTime("2026-09-10T11:59:30.000Z", now)).toBe("just now");
  });
  it("reports whole minutes", () => {
    expect(relativeTime("2026-09-10T11:45:00.000Z", now)).toBe("15m ago");
  });
  it("reports whole hours", () => {
    expect(relativeTime("2026-09-10T09:00:00.000Z", now)).toBe("3h ago");
  });
  it("reports whole days", () => {
    expect(relativeTime("2026-08-31T12:00:00.000Z", now)).toBe("10d ago");
  });
  it("falls back to a date past a year", () => {
    expect(relativeTime("2024-01-02T12:00:00.000Z", now)).toBe("2024-01-02");
  });
});

describe("renderPrompt", () => {
  it("substitutes every placeholder", () => {
    expect(renderPrompt("{{identifier}}: {{title}}", { identifier: "ENG-1", title: "Fix" }))
      .toBe("ENG-1: Fix");
  });
  it("substitutes a repeated placeholder everywhere", () => {
    expect(renderPrompt("{{a}}/{{a}}", { a: "x" })).toBe("x/x");
  });
  it("replaces an unknown placeholder with an empty string", () => {
    expect(renderPrompt("[{{nope}}]", { a: "x" })).toBe("[]");
  });
  it("leaves text with no placeholders untouched", () => {
    expect(renderPrompt("plain", {})).toBe("plain");
  });
});

describe("clampText", () => {
  it("returns short text unchanged", () => {
    expect(clampText("a\nb", 3)).toBe("a\nb");
  });
  it("truncates and appends an ellipsis", () => {
    expect(clampText("a\nb\nc\nd", 2)).toBe("a\nb…");
  });
});

describe("identifierFromBranch", () => {
  it("extracts an identifier from a Linear-formatted branch", () => {
    expect(identifierFromBranch("feature/eng-14236-randomize-the-products")).toBe("ENG-14236");
  });
  it("extracts from a bare identifier branch", () => {
    expect(identifierFromBranch("ENG-1")).toBe("ENG-1");
  });
  it("returns null when there is no identifier", () => {
    expect(identifierFromBranch("main")).toBeNull();
  });
  it("returns null for a digit-only segment", () => {
    expect(identifierFromBranch("release/1-2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- shared/format.test.ts`
Expected: FAIL — cannot resolve `./format`.

- [ ] **Step 3: Implement**

`shared/format.ts`:

```ts
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

export const DEFAULT_PROMPT_TEMPLATE = [
  "Work on Linear issue {{identifier}}: {{title}}",
  "{{url}}",
  "",
  "{{description}}",
].join("\n");

export function relativeTime(iso: string, now: Date): string {
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (elapsed >= YEAR) return iso.slice(0, 10);
  if (elapsed >= DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  if (elapsed >= HOUR) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed >= MINUTE) return `${Math.floor(elapsed / MINUTE)}m ago`;
  return "just now";
}

export function renderPrompt(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

export function clampText(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return `${lines.slice(0, maxLines).join("\n")}…`;
}

const BRANCH_IDENTIFIER = /(?:^|[/_-])([a-z][a-z0-9]*-\d+)(?:$|[/_-])/i;

export function identifierFromBranch(branch: string): string | null {
  const match = BRANCH_IDENTIFIER.exec(branch);
  return match ? match[1].toUpperCase() : null;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- shared/format.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/format.ts shared/format.test.ts
git commit -m "feat: pure formatters for relative time, prompts, clamping, branch parsing"
```

---

### Task 3: The issue contract and attachment builder

One issue shape crosses every boundary. Define it once.

**Files:**
- Create: `shared/issue.ts`, `shared/issue.test.ts`

**Interfaces:**
- Consumes: `shared/format.ts`.
- Produces:
  - `IssueSchema` / `type Issue`
  - `issueAttachmentText(issue: Issue): string`
  - `issueAttachmentItem(issue: Issue): AttachmentItem`
  - `AttachmentItemSchema` / `type AttachmentItem`
  - `issueBreadcrumb(issue: Issue): string[]`

- [ ] **Step 1: Write the failing tests**

`shared/issue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type Issue, IssueSchema, issueAttachmentItem, issueAttachmentText, issueBreadcrumb } from "./issue";

const issue: Issue = {
  id: "f92cd857-debd-4b61-bae7-535f2aa8af59",
  identifier: "ENG-14236",
  title: "Randomize the products on the tabs & Brands pages",
  description: "Shuffle daily.",
  url: "https://linear.app/thecosmos/issue/ENG-14236/randomize",
  branchName: "feature/eng-14236-randomize",
  priorityLabel: "No priority",
  createdAt: "2026-09-09T14:40:17.035Z",
  updatedAt: "2026-09-10T03:00:44.419Z",
  state: { id: "s1", name: "In Progress", type: "started", color: "#f2c94c" },
  team: { id: "t1", key: "ENG", name: "Engineering" },
  assignee: { id: "u1", name: "Stephanos Tsoucas" },
  project: { id: "p1", name: "Shopping", icon: "🎁", color: "#5e6ad2" },
  parents: [{ identifier: "ENG-14095", title: "Shop Tab" }],
  labels: [{ name: "Backend", color: "#bb87fc" }],
};

describe("IssueSchema", () => {
  it("accepts a complete issue", () => {
    expect(IssueSchema.parse(issue)).toEqual(issue);
  });
  it("accepts nullable optional relations", () => {
    const bare = { ...issue, assignee: null, project: null, description: null, parents: [], labels: [] };
    expect(IssueSchema.parse(bare).assignee).toBeNull();
  });
  it("rejects a non-URL url", () => {
    expect(() => IssueSchema.parse({ ...issue, url: "not-a-url" })).toThrow();
  });
});

describe("issueBreadcrumb", () => {
  it("puts the project first, then ancestors, then the title", () => {
    expect(issueBreadcrumb(issue)).toEqual(["Shopping", "Shop Tab", issue.title]);
  });
  it("omits the project when there is none", () => {
    expect(issueBreadcrumb({ ...issue, project: null })).toEqual(["Shop Tab", issue.title]);
  });
});

describe("issueAttachmentText", () => {
  it("leads with the identifier and includes the branch name and description", () => {
    const text = issueAttachmentText(issue);
    expect(text.startsWith("Linear issue ENG-14236: ")).toBe(true);
    expect(text).toContain("Branch: feature/eng-14236-randomize");
    expect(text).toContain("Status: In Progress");
    expect(text).toContain("Shuffle daily.");
  });
  it("says so when there is no description", () => {
    expect(issueAttachmentText({ ...issue, description: null })).toContain("No description.");
  });
});

describe("issueAttachmentItem", () => {
  it("produces the attachment payload Paseo expects", () => {
    const item = issueAttachmentItem(issue);
    expect(item.id).toBe(issue.id);
    expect(item.identifier).toBe("ENG-14236");
    expect(item.resourceType).toBe("issue");
    expect(item.subtitle).toBe("In Progress · Stephanos Tsoucas");
    expect(item.url).toBe(issue.url);
  });
  it("omits the subtitle when there is no state or assignee detail", () => {
    const item = issueAttachmentItem({ ...issue, assignee: null });
    expect(item.subtitle).toBe("In Progress");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- shared/issue.test.ts`
Expected: FAIL — cannot resolve `./issue`.

- [ ] **Step 3: Implement**

`shared/issue.ts`:

```ts
import { z } from "zod";

const RefSchema = z.object({ id: z.string(), name: z.string() });

export const IssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.url(),
  branchName: z.string(),
  priorityLabel: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  state: z.object({ id: z.string(), name: z.string(), type: z.string(), color: z.string() }),
  team: z.object({ id: z.string(), key: z.string(), name: z.string() }),
  assignee: RefSchema.nullable(),
  project: z
    .object({ id: z.string(), name: z.string(), icon: z.string().nullable(), color: z.string().nullable() })
    .nullable(),
  parents: z.array(z.object({ identifier: z.string(), title: z.string() })),
  labels: z.array(z.object({ name: z.string(), color: z.string() })),
});

export type Issue = z.infer<typeof IssueSchema>;

export const AttachmentItemSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  url: z.url(),
  text: z.string(),
  resourceType: z.string(),
});

export type AttachmentItem = z.infer<typeof AttachmentItemSchema>;

export function issueBreadcrumb(issue: Issue): string[] {
  const crumbs = issue.parents.map((parent) => parent.title);
  if (issue.project) crumbs.unshift(issue.project.name);
  crumbs.push(issue.title);
  return crumbs;
}

export function issueAttachmentText(issue: Issue): string {
  const lines = [
    `Linear issue ${issue.identifier}: ${issue.title}`,
    `URL: ${issue.url}`,
    `Status: ${issue.state.name}`,
    `Priority: ${issue.priorityLabel}`,
    `Team: ${issue.team.name}`,
    `Branch: ${issue.branchName}`,
  ];
  if (issue.assignee) lines.push(`Assignee: ${issue.assignee.name}`);
  if (issue.project) lines.push(`Project: ${issue.project.name}`);
  if (issue.labels.length > 0) {
    lines.push(`Labels: ${issue.labels.map((label) => label.name).join(", ")}`);
  }
  lines.push("", issue.description ?? "No description.");
  return lines.join("\n");
}

export function issueAttachmentItem(issue: Issue): AttachmentItem {
  const subtitle = [issue.state.name, issue.assignee?.name].filter(Boolean).join(" · ");
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    ...(subtitle ? { subtitle } : {}),
    url: issue.url,
    text: issueAttachmentText(issue),
    resourceType: "issue",
  };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- shared/issue.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/issue.ts shared/issue.test.ts
git commit -m "feat: shared issue contract, breadcrumb, and attachment payload builder"
```

---

### Task 4: RPC, settings, and attachment-source contracts

Declarations only — no behavior, so no unit test beyond typecheck. This task is what makes
Tasks 5–15 able to reference exact names.

**Files:**
- Create: `shared/settings.ts`, `shared/rpc.ts`, `shared/attachments.ts`

**Interfaces:**
- Consumes: `shared/issue.ts`, `shared/format.ts`.
- Produces:
  - `linearSettings` (`defineSettings`), `type LinearSettings`
  - RPCs: `searchIssuesRpc`, `getIssueRpc`, `listIssuesRpc`, `verifyRpc`, `startWorkRpc`,
    `commentRpc`, `moveStateRpc`, `assignSelfRpc`, `linkBranchRpc`, `listStatesRpc`
  - `issueAttachments` (`defineAttachmentSource`)

- [ ] **Step 1: Write the settings document**

`shared/settings.ts`:

```ts
import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { DEFAULT_PROMPT_TEMPLATE } from "./format";

export const LinearSettingsSchema = z.object({
  apiKey: z.string().default(""),
  defaultTeamKey: z.string().default(""),
  provider: z.string().default(""),
  baseRef: z.string().default("origin/main"),
  repositoryPath: z.string().default(""),
  promptTemplate: z.string().default(DEFAULT_PROMPT_TEMPLATE),
  moveToStarted: z.boolean().default(true),
  assignToMe: z.boolean().default(false),
});

export type LinearSettings = z.infer<typeof LinearSettingsSchema>;

export const linearSettings = defineSettings({
  id: "linear",
  scope: "host",
  version: 1,
  schema: LinearSettingsSchema,
});
```

- [ ] **Step 2: Write the RPC contracts**

`shared/rpc.ts`:

```ts
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { AttachmentItemSchema, IssueSchema } from "./issue";

const IdentifierInput = z.object({ identifier: z.string() });

export const searchIssuesRpc = defineRpc({
  name: "issues.search",
  input: z.object({ query: z.string() }),
  output: z.object({ items: z.array(AttachmentItemSchema) }),
});

export const getIssueRpc = defineRpc({
  name: "issues.get",
  input: IdentifierInput,
  output: z.object({ issue: IssueSchema.nullable() }),
});

export const listIssuesRpc = defineRpc({
  name: "issues.list",
  input: z.object({ scope: z.enum(["assigned", "cycle", "triage"]) }),
  output: z.object({ issues: z.array(IssueSchema) }),
});

export const verifyRpc = defineRpc({
  name: "linear.verify",
  input: z.object({}),
  output: z.object({ name: z.string(), source: z.enum(["env", "settings"]) }),
});

export const listStatesRpc = defineRpc({
  name: "linear.states",
  input: z.object({ teamId: z.string() }),
  output: z.object({
    states: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })),
  }),
});

export const startWorkRpc = defineRpc({
  name: "linear.startWork",
  input: IdentifierInput,
  output: z.object({ workspaceId: z.string(), agentId: z.string(), branchName: z.string() }),
});

export const commentRpc = defineRpc({
  name: "linear.comment",
  input: z.object({ issueId: z.string(), body: z.string() }),
  output: z.object({ url: z.url() }),
});

export const moveStateRpc = defineRpc({
  name: "linear.moveState",
  input: z.object({ issueId: z.string(), stateId: z.string() }),
  output: z.object({ stateName: z.string() }),
});

export const assignSelfRpc = defineRpc({
  name: "linear.assignSelf",
  input: z.object({ issueId: z.string() }),
  output: z.object({ assigneeName: z.string() }),
});

export const linkBranchRpc = defineRpc({
  name: "linear.linkBranch",
  input: z.object({ issueId: z.string(), url: z.url(), title: z.string() }),
  output: z.object({ linked: z.boolean() }),
});
```

- [ ] **Step 3: Write the attachment source**

`shared/attachments.ts`:

```ts
import { defineAttachmentSource } from "@getpaseo/plugin";
import { searchIssuesRpc } from "./rpc";

export const issueAttachments = defineAttachmentSource({
  id: "issues",
  title: "Linear issue",
  icon: "CircleDot",
  pickerTitle: "Attach Linear issue",
  searchPlaceholder: "Search by identifier or title",
  search: searchIssuesRpc,
});
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If `defineSettings` rejects the `scope` value, confirm it is the string
`"host"` — that is the only supported scope in v0.8.

- [ ] **Step 5: Commit**

```bash
git add shared/settings.ts shared/rpc.ts shared/attachments.ts
git commit -m "feat: RPC, settings, and attachment-source contracts"
```

---

### Task 5: Linear GraphQL transport

The transport and its error mapping, with no queries in it yet. Injectable `endpoint` and
`request` are what make the whole server layer testable without a network.

**Files:**
- Create: `server/linear/client.ts`, `server/linear/client.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class LinearApiError extends Error`
  - `interface LinearTransport { request<T>(query: string, variables: Record<string, unknown>, schema: ZodType<T>): Promise<T> }`
  - `createTransport(options: { apiKey: string; endpoint?: string; fetchImpl?: typeof fetch }): LinearTransport`

- [ ] **Step 1: Write the failing tests**

`server/linear/client.test.ts`:

```ts
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTransport, LinearApiError } from "./client";

interface Captured {
  authorization: string | undefined;
  contentType: string | undefined;
  body: { query: string; variables: Record<string, unknown> };
}

async function withServer<T>(
  respond: (captured: Captured, response: ServerResponse) => void,
  run: (endpoint: string) => Promise<T>,
): Promise<T> {
  const server = createServer((request: IncomingMessage, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      respond(
        {
          authorization: request.headers.authorization,
          contentType: request.headers["content-type"],
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        },
        response,
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${port}/graphql`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function json(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const schema = z.object({ ok: z.boolean() });

describe("createTransport", () => {
  it("sends the raw API key with no Bearer prefix and parses the result", async () => {
    const result = await withServer(
      (captured, response) => {
        expect(captured.authorization).toBe("lin_api_test");
        expect(captured.contentType).toBe("application/json");
        expect(captured.body.variables).toEqual({ id: "ENG-1" });
        json(response, { data: { ok: true } });
      },
      (endpoint) =>
        createTransport({ apiKey: "lin_api_test", endpoint }).request(
          "query Q($id: String!) { ok }",
          { id: "ENG-1" },
          schema,
        ),
    );
    expect(result).toEqual({ ok: true });
  });

  it("treats GraphQL errors under HTTP 200 as a failure", async () => {
    await expect(
      withServer(
        (_captured, response) => json(response, { errors: [{ message: "Token expired" }] }),
        (endpoint) =>
          createTransport({ apiKey: "k", endpoint }).request("query {}", {}, schema),
      ),
    ).rejects.toThrow("Token expired");
  });

  it("joins multiple GraphQL error messages", async () => {
    await expect(
      withServer(
        (_captured, response) =>
          json(response, { errors: [{ message: "a" }, { message: "b" }] }),
        (endpoint) =>
          createTransport({ apiKey: "k", endpoint }).request("query {}", {}, schema),
      ),
    ).rejects.toThrow("a; b");
  });

  it("maps 401 to a credential message", async () => {
    await expect(
      withServer(
        (_captured, response) => json(response, {}, 401),
        (endpoint) =>
          createTransport({ apiKey: "k", endpoint }).request("query {}", {}, schema),
      ),
    ).rejects.toThrow("Linear rejected the API key");
  });

  it("maps 429 to a retryable message", async () => {
    await expect(
      withServer(
        (_captured, response) => json(response, {}, 429),
        (endpoint) =>
          createTransport({ apiKey: "k", endpoint }).request("query {}", {}, schema),
      ),
    ).rejects.toThrow("rate limit");
  });

  it("rejects an empty API key without making a request", () => {
    expect(() => createTransport({ apiKey: "   " })).toThrow(LinearApiError);
  });

  it("fails when data does not match the schema", async () => {
    await expect(
      withServer(
        (_captured, response) => json(response, { data: { ok: "yes" } }),
        (endpoint) =>
          createTransport({ apiKey: "k", endpoint }).request("query {}", {}, schema),
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- server/linear/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 3: Implement**

`server/linear/client.ts`:

```ts
import type { ZodType } from "zod";
import { z } from "zod";

export class LinearApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinearApiError";
  }
}

const EnvelopeSchema = z.object({
  data: z.unknown().nullable().optional(),
  errors: z.array(z.object({ message: z.string() }).loose()).optional(),
});

export interface LinearTransport {
  request<T>(query: string, variables: Record<string, unknown>, schema: ZodType<T>): Promise<T>;
}

export interface LinearTransportOptions {
  apiKey: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

function describeHttpFailure(status: number): string {
  if (status === 401 || status === 403) return "Linear rejected the API key";
  if (status === 429) return "Linear rate limit reached — try again shortly";
  return `Linear API request failed with HTTP ${status}`;
}

export function createTransport(options: LinearTransportOptions): LinearTransport {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new LinearApiError(
      "Add a Linear API key in Settings → Plugins → Linear, or set LINEAR_API_KEY in the daemon environment",
    );
  }
  const endpoint = options.endpoint ?? "https://api.linear.app/graphql";
  const doFetch = options.fetchImpl ?? fetch;

  return {
    async request(query, variables, schema) {
      const response = await doFetch(endpoint, {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (!response.ok) throw new LinearApiError(describeHttpFailure(response.status));
      const envelope = EnvelopeSchema.parse(await response.json());
      if (envelope.errors && envelope.errors.length > 0) {
        throw new LinearApiError(envelope.errors.map((error) => error.message).join("; "));
      }
      if (envelope.data === null || envelope.data === undefined) {
        throw new LinearApiError("Linear returned no data");
      }
      return schema.parse(envelope.data);
    },
  };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- server/linear/client.test.ts`
Expected: PASS, 7 tests. If `z.object(...).loose()` is unavailable in the installed Zod, use
`z.looseObject({ message: z.string() })` — both exist in Zod 4; `.passthrough()` is the
deprecated v3 spelling.

- [ ] **Step 5: Commit**

```bash
git add server/linear/client.ts server/linear/client.test.ts
git commit -m "feat: Linear GraphQL transport with error mapping"
```

---

### Task 6: Issue queries

**Files:**
- Create: `server/linear/queries.ts`, `server/linear/queries.test.ts`

**Interfaces:**
- Consumes: `server/linear/client.ts` (`LinearTransport`), `shared/issue.ts` (`Issue`).
- Produces:
  - `ISSUE_FIELDS: string`
  - `fetchIssue(transport, identifier): Promise<Issue | null>`
  - `searchIssues(transport, query, teamKey): Promise<Issue[]>`
  - `listIssues(transport, scope, teamKey): Promise<Issue[]>`
  - `fetchViewer(transport): Promise<{ id: string; name: string }>`
  - `fetchStates(transport, teamId): Promise<Array<{ id: string; name: string; type: string; position: number }>>`
  - `toIssue(raw: unknown): Issue` — normalizes Linear's nested response into `Issue`

- [ ] **Step 1: Write the failing tests**

`server/linear/queries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import type { LinearTransport } from "./client";
import { fetchIssue, listIssues, searchIssues, toIssue } from "./queries";

const rawIssue = {
  id: "uuid-1",
  identifier: "ENG-14236",
  title: "Randomize the products",
  description: "Shuffle daily.",
  url: "https://linear.app/thecosmos/issue/ENG-14236/randomize",
  branchName: "feature/eng-14236-randomize",
  priorityLabel: "No priority",
  createdAt: "2026-09-09T14:40:17.035Z",
  updatedAt: "2026-09-10T03:00:44.419Z",
  state: { id: "s1", name: "In Progress", type: "started", color: "#f2c94c" },
  team: { id: "t1", key: "ENG", name: "Engineering" },
  assignee: { id: "u1", name: "Stephanos Tsoucas" },
  project: { id: "p1", name: "Shopping", icon: "🎁", color: "#5e6ad2" },
  parent: { identifier: "ENG-14095", title: "Shop Tab", parent: null },
  labels: { nodes: [{ name: "Backend", color: "#bb87fc" }] },
};

function stubTransport(handler: (query: string, variables: Record<string, unknown>) => unknown): {
  transport: LinearTransport;
  calls: Array<{ query: string; variables: Record<string, unknown> }>;
} {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  const transport: LinearTransport = {
    async request<T>(query: string, variables: Record<string, unknown>, schema: ZodType<T>) {
      calls.push({ query, variables });
      return schema.parse(handler(query, variables));
    },
  };
  return { transport, calls };
}

describe("toIssue", () => {
  it("flattens the parent chain into an ordered ancestor list", () => {
    const nested = {
      ...rawIssue,
      parent: { identifier: "B", title: "Child", parent: { identifier: "A", title: "Root", parent: null } },
    };
    expect(toIssue(nested).parents).toEqual([
      { identifier: "A", title: "Root" },
      { identifier: "B", title: "Child" },
    ]);
  });
  it("returns an empty ancestor list when there is no parent", () => {
    expect(toIssue({ ...rawIssue, parent: null }).parents).toEqual([]);
  });
  it("flattens label nodes", () => {
    expect(toIssue(rawIssue).labels).toEqual([{ name: "Backend", color: "#bb87fc" }]);
  });
});

describe("fetchIssue", () => {
  it("queries by identifier and returns the normalized issue", async () => {
    const { transport, calls } = stubTransport(() => ({ issue: rawIssue }));
    const issue = await fetchIssue(transport, "eng-14236");
    expect(calls[0].variables).toEqual({ id: "ENG-14236" });
    expect(issue?.identifier).toBe("ENG-14236");
  });
  it("returns null for an unknown identifier", async () => {
    const { transport } = stubTransport(() => ({ issue: null }));
    expect(await fetchIssue(transport, "ENG-9")).toBeNull();
  });
});

describe("searchIssues", () => {
  it("filters by case-insensitive title when the query is not an identifier", async () => {
    const { transport, calls } = stubTransport(() => ({ issues: { nodes: [rawIssue] } }));
    await searchIssues(transport, " randomize ", "");
    expect(calls[0].variables).toEqual({
      filter: { title: { containsIgnoreCase: "randomize" } },
    });
  });
  it("adds a team filter when a default team key is set", async () => {
    const { transport, calls } = stubTransport(() => ({ issues: { nodes: [] } }));
    await searchIssues(transport, "randomize", "ENG");
    expect(calls[0].variables).toEqual({
      filter: { title: { containsIgnoreCase: "randomize" }, team: { key: { eq: "ENG" } } },
    });
  });
  it("resolves an exact identifier through the single-issue query", async () => {
    const { transport, calls } = stubTransport(() => ({ issue: rawIssue }));
    const issues = await searchIssues(transport, "ENG-14236", "");
    expect(calls[0].variables).toEqual({ id: "ENG-14236" });
    expect(issues).toHaveLength(1);
  });
});

describe("listIssues", () => {
  it("scopes assigned issues to the viewer", async () => {
    const { transport, calls } = stubTransport(() => ({ issues: { nodes: [rawIssue] } }));
    await listIssues(transport, "assigned", "");
    expect(calls[0].variables.filter).toMatchObject({ assignee: { isMe: { eq: true } } });
  });
  it("scopes cycle issues to the active cycle", async () => {
    const { transport, calls } = stubTransport(() => ({ issues: { nodes: [] } }));
    await listIssues(transport, "cycle", "");
    expect(calls[0].variables.filter).toMatchObject({ cycle: { isActive: { eq: true } } });
  });
  it("scopes triage issues to the triage state type", async () => {
    const { transport, calls } = stubTransport(() => ({ issues: { nodes: [] } }));
    await listIssues(transport, "triage", "");
    expect(calls[0].variables.filter).toMatchObject({ state: { type: { eq: "triage" } } });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- server/linear/queries.test.ts`
Expected: FAIL — cannot resolve `./queries`.

- [ ] **Step 3: Implement**

`server/linear/queries.ts`:

```ts
import { z } from "zod";
import { type Issue, IssueSchema } from "../../shared/issue";
import type { LinearTransport } from "./client";

export const ISSUE_FIELDS = `
  id identifier title description url branchName priorityLabel createdAt updatedAt
  state { id name type color }
  team { id key name }
  assignee { id name }
  project { id name icon color }
  parent { identifier title parent { identifier title parent { identifier title } } }
  labels { nodes { name color } }
`;

const ParentSchema: z.ZodType<{ identifier: string; title: string; parent?: unknown } | null> =
  z.lazy(() =>
    z
      .object({ identifier: z.string(), title: z.string(), parent: ParentSchema.optional() })
      .nullable(),
  );

const RawIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  branchName: z.string(),
  priorityLabel: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  state: z.object({ id: z.string(), name: z.string(), type: z.string(), color: z.string() }),
  team: z.object({ id: z.string(), key: z.string(), name: z.string() }),
  assignee: z.object({ id: z.string(), name: z.string() }).nullable(),
  project: z
    .object({
      id: z.string(),
      name: z.string(),
      icon: z.string().nullable(),
      color: z.string().nullable(),
    })
    .nullable(),
  parent: ParentSchema.optional(),
  labels: z.object({ nodes: z.array(z.object({ name: z.string(), color: z.string() })) }),
});

const SingleIssueSchema = z.object({ issue: RawIssueSchema.nullable() });
const IssueListSchema = z.object({ issues: z.object({ nodes: z.array(RawIssueSchema) }) });
const ViewerSchema = z.object({ viewer: z.object({ id: z.string(), name: z.string() }) });
const StatesSchema = z.object({
  team: z.object({
    states: z.object({
      nodes: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          type: z.string(),
          position: z.number(),
        }),
      ),
    }),
  }),
});

const ISSUE_QUERY = `query PaseoLinearIssue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`;
const ISSUES_QUERY = `query PaseoLinearIssues($filter: IssueFilter) {
  issues(first: 25, filter: $filter, orderBy: updatedAt) { nodes { ${ISSUE_FIELDS} } }
}`;
const VIEWER_QUERY = `query PaseoLinearViewer { viewer { id name } }`;
const STATES_QUERY = `query PaseoLinearStates($teamId: String!) {
  team(id: $teamId) { states { nodes { id name type position } } }
}`;

const IDENTIFIER = /^[A-Z][A-Z0-9]*-\d+$/i;

function flattenParents(parent: unknown): Array<{ identifier: string; title: string }> {
  const chain: Array<{ identifier: string; title: string }> = [];
  let node = parent as { identifier: string; title: string; parent?: unknown } | null | undefined;
  while (node) {
    chain.unshift({ identifier: node.identifier, title: node.title });
    node = node.parent as typeof node;
  }
  return chain;
}

export function toIssue(raw: unknown): Issue {
  const parsed = RawIssueSchema.parse(raw);
  return IssueSchema.parse({
    ...parsed,
    parents: flattenParents(parsed.parent),
    labels: parsed.labels.nodes,
  });
}

export async function fetchIssue(
  transport: LinearTransport,
  identifier: string,
): Promise<Issue | null> {
  const data = await transport.request(
    ISSUE_QUERY,
    { id: identifier.trim().toUpperCase() },
    SingleIssueSchema,
  );
  return data.issue ? toIssue(data.issue) : null;
}

function teamFilter(teamKey: string): Record<string, unknown> {
  return teamKey ? { team: { key: { eq: teamKey } } } : {};
}

export async function searchIssues(
  transport: LinearTransport,
  query: string,
  teamKey: string,
): Promise<Issue[]> {
  const normalized = query.trim();
  if (IDENTIFIER.test(normalized)) {
    const issue = await fetchIssue(transport, normalized);
    return issue ? [issue] : [];
  }
  const filter = { title: { containsIgnoreCase: normalized }, ...teamFilter(teamKey) };
  const data = await transport.request(ISSUES_QUERY, { filter }, IssueListSchema);
  return data.issues.nodes.map(toIssue);
}

export type IssueScope = "assigned" | "cycle" | "triage";

const SCOPE_FILTERS: Record<IssueScope, Record<string, unknown>> = {
  assigned: { assignee: { isMe: { eq: true } }, state: { type: { nin: ["completed", "canceled"] } } },
  cycle: { cycle: { isActive: { eq: true } } },
  triage: { state: { type: { eq: "triage" } } },
};

export async function listIssues(
  transport: LinearTransport,
  scope: IssueScope,
  teamKey: string,
): Promise<Issue[]> {
  const filter = { ...SCOPE_FILTERS[scope], ...teamFilter(teamKey) };
  const data = await transport.request(ISSUES_QUERY, { filter }, IssueListSchema);
  return data.issues.nodes.map(toIssue);
}

export async function fetchViewer(
  transport: LinearTransport,
): Promise<{ id: string; name: string }> {
  return (await transport.request(VIEWER_QUERY, {}, ViewerSchema)).viewer;
}

export async function fetchStates(
  transport: LinearTransport,
  teamId: string,
): Promise<Array<{ id: string; name: string; type: string; position: number }>> {
  const data = await transport.request(STATES_QUERY, { teamId }, StatesSchema);
  return [...data.team.states.nodes].sort((a, b) => a.position - b.position);
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- server/linear/queries.test.ts`
Expected: PASS, 11 tests.

If the `assignee: { isMe: { eq: true } }` filter is rejected by the live API later, replace it
with an explicit `assignee: { id: { eq: viewerId } }` using `fetchViewer` — the tests assert
the filter shape, so update them together.

- [ ] **Step 5: Commit**

```bash
git add server/linear/queries.ts server/linear/queries.test.ts
git commit -m "feat: Linear issue queries with parent-chain flattening and scope filters"
```

---

### Task 7: Credential resolution

**Files:**
- Create: `server/credentials.ts`, `server/credentials.test.ts`

**Interfaces:**
- Consumes: `server/linear/client.ts` (`LinearApiError`), `shared/settings.ts` (`LinearSettings`).
- Produces: `resolveApiKey(env: Record<string, string | undefined>, settings: Pick<LinearSettings, "apiKey">): { apiKey: string; source: "env" | "settings" }`

- [ ] **Step 1: Write the failing tests**

`server/credentials.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveApiKey } from "./credentials";

describe("resolveApiKey", () => {
  it("prefers the environment variable", () => {
    expect(resolveApiKey({ LINEAR_API_KEY: "env-key" }, { apiKey: "settings-key" })).toEqual({
      apiKey: "env-key",
      source: "env",
    });
  });
  it("falls back to settings when the variable is absent", () => {
    expect(resolveApiKey({}, { apiKey: "settings-key" })).toEqual({
      apiKey: "settings-key",
      source: "settings",
    });
  });
  it("ignores a whitespace-only environment variable", () => {
    expect(resolveApiKey({ LINEAR_API_KEY: "   " }, { apiKey: "settings-key" }).source).toBe(
      "settings",
    );
  });
  it("throws an actionable error when neither is set", () => {
    expect(() => resolveApiKey({}, { apiKey: "" })).toThrow("Settings → Plugins → Linear");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- server/credentials.test.ts`
Expected: FAIL — cannot resolve `./credentials`.

- [ ] **Step 3: Implement**

`server/credentials.ts`:

```ts
import type { LinearSettings } from "../shared/settings";
import { LinearApiError } from "./linear/client";

export interface ResolvedApiKey {
  apiKey: string;
  source: "env" | "settings";
}

export function resolveApiKey(
  env: Record<string, string | undefined>,
  settings: Pick<LinearSettings, "apiKey">,
): ResolvedApiKey {
  const fromEnv = (env.LINEAR_API_KEY ?? "").trim();
  if (fromEnv) return { apiKey: fromEnv, source: "env" };
  const fromSettings = settings.apiKey.trim();
  if (fromSettings) return { apiKey: fromSettings, source: "settings" };
  throw new LinearApiError(
    "Add a Linear API key in Settings → Plugins → Linear, or set LINEAR_API_KEY in the daemon environment",
  );
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- server/credentials.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/credentials.ts server/credentials.test.ts
git commit -m "feat: credential resolution with env precedence over settings"
```

---

### Task 8: Linear mutations

**Files:**
- Create: `server/linear/mutations.ts`, `server/linear/mutations.test.ts`

**Interfaces:**
- Consumes: `server/linear/client.ts` (`LinearTransport`).
- Produces:
  - `createComment(transport, issueId, body): Promise<{ url: string }>`
  - `moveIssueState(transport, issueId, stateId): Promise<{ stateName: string }>`
  - `assignIssue(transport, issueId, assigneeId): Promise<{ assigneeName: string }>`
  - `linkUrl(transport, issueId, url, title): Promise<{ linked: boolean }>`

- [ ] **Step 1: Write the failing tests**

`server/linear/mutations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import type { LinearTransport } from "./client";
import { assignIssue, createComment, linkUrl, moveIssueState } from "./mutations";

function stub(result: unknown): {
  transport: LinearTransport;
  calls: Array<{ query: string; variables: Record<string, unknown> }>;
} {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  return {
    calls,
    transport: {
      async request<T>(query: string, variables: Record<string, unknown>, schema: ZodType<T>) {
        calls.push({ query, variables });
        return schema.parse(result);
      },
    },
  };
}

describe("createComment", () => {
  it("posts the body against the issue and returns the comment URL", async () => {
    const { transport, calls } = stub({
      commentCreate: { success: true, comment: { url: "https://linear.app/c/1" } },
    });
    expect(await createComment(transport, "issue-1", "hello")).toEqual({
      url: "https://linear.app/c/1",
    });
    expect(calls[0].variables).toEqual({ issueId: "issue-1", body: "hello" });
  });
  it("throws when Linear reports failure", async () => {
    const { transport } = stub({ commentCreate: { success: false, comment: null } });
    await expect(createComment(transport, "issue-1", "hello")).rejects.toThrow("comment");
  });
});

describe("moveIssueState", () => {
  it("updates the state and returns the new state name", async () => {
    const { transport, calls } = stub({
      issueUpdate: { success: true, issue: { state: { name: "In Progress" }, assignee: null } },
    });
    expect(await moveIssueState(transport, "issue-1", "state-2")).toEqual({
      stateName: "In Progress",
    });
    expect(calls[0].variables).toEqual({ id: "issue-1", input: { stateId: "state-2" } });
  });
});

describe("assignIssue", () => {
  it("sets the assignee and returns their name", async () => {
    const { transport, calls } = stub({
      issueUpdate: {
        success: true,
        issue: { state: { name: "Todo" }, assignee: { name: "Scott" } },
      },
    });
    expect(await assignIssue(transport, "issue-1", "user-1")).toEqual({ assigneeName: "Scott" });
    expect(calls[0].variables).toEqual({ id: "issue-1", input: { assigneeId: "user-1" } });
  });
});

describe("linkUrl", () => {
  it("attaches the URL with a title", async () => {
    const { transport, calls } = stub({ attachmentLinkURL: { success: true } });
    expect(await linkUrl(transport, "issue-1", "https://github.com/x/y/pull/1", "PR 1")).toEqual({
      linked: true,
    });
    expect(calls[0].variables).toEqual({
      issueId: "issue-1",
      url: "https://github.com/x/y/pull/1",
      title: "PR 1",
    });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- server/linear/mutations.test.ts`
Expected: FAIL — cannot resolve `./mutations`.

- [ ] **Step 3: Implement**

`server/linear/mutations.ts`:

```ts
import { z } from "zod";
import { LinearApiError } from "./client";
import type { LinearTransport } from "./client";

const CommentSchema = z.object({
  commentCreate: z.object({
    success: z.boolean(),
    comment: z.object({ url: z.string() }).nullable(),
  }),
});

const IssueUpdateSchema = z.object({
  issueUpdate: z.object({
    success: z.boolean(),
    issue: z.object({
      state: z.object({ name: z.string() }),
      assignee: z.object({ name: z.string() }).nullable(),
    }),
  }),
});

const AttachmentSchema = z.object({ attachmentLinkURL: z.object({ success: z.boolean() }) });

const COMMENT_MUTATION = `mutation PaseoLinearComment($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) { success comment { url } }
}`;

const ISSUE_UPDATE_MUTATION = `mutation PaseoLinearIssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success issue { state { name } assignee { name } } }
}`;

const LINK_MUTATION = `mutation PaseoLinearLink($issueId: String!, $url: String!, $title: String!) {
  attachmentLinkURL(issueId: $issueId, url: $url, title: $title) { success }
}`;

export async function createComment(
  transport: LinearTransport,
  issueId: string,
  body: string,
): Promise<{ url: string }> {
  const data = await transport.request(COMMENT_MUTATION, { issueId, body }, CommentSchema);
  if (!data.commentCreate.success || !data.commentCreate.comment) {
    throw new LinearApiError("Linear did not accept the comment");
  }
  return { url: data.commentCreate.comment.url };
}

async function updateIssue(
  transport: LinearTransport,
  id: string,
  input: Record<string, unknown>,
): Promise<z.infer<typeof IssueUpdateSchema>["issueUpdate"]["issue"]> {
  const data = await transport.request(ISSUE_UPDATE_MUTATION, { id, input }, IssueUpdateSchema);
  if (!data.issueUpdate.success) throw new LinearApiError("Linear did not accept the update");
  return data.issueUpdate.issue;
}

export async function moveIssueState(
  transport: LinearTransport,
  issueId: string,
  stateId: string,
): Promise<{ stateName: string }> {
  const issue = await updateIssue(transport, issueId, { stateId });
  return { stateName: issue.state.name };
}

export async function assignIssue(
  transport: LinearTransport,
  issueId: string,
  assigneeId: string,
): Promise<{ assigneeName: string }> {
  const issue = await updateIssue(transport, issueId, { assigneeId });
  return { assigneeName: issue.assignee?.name ?? "" };
}

export async function linkUrl(
  transport: LinearTransport,
  issueId: string,
  url: string,
  title: string,
): Promise<{ linked: boolean }> {
  const data = await transport.request(LINK_MUTATION, { issueId, url, title }, AttachmentSchema);
  if (!data.attachmentLinkURL.success) throw new LinearApiError("Linear did not accept the link");
  return { linked: true };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- server/linear/mutations.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/linear/mutations.ts server/linear/mutations.test.ts
git commit -m "feat: Linear comment, state, assignee, and attachment mutations"
```

---

### Task 9: Issue↔agent binding

**Files:**
- Create: `server/binding.ts`, `server/binding.test.ts`

**Interfaces:**
- Consumes: `shared/format.ts` (`identifierFromBranch`).
- Produces:
  - `ISSUE_LABEL = "linear.issue"`, `ISSUE_ID_LABEL = "linear.issueId"`, `ISSUE_URL_LABEL = "linear.url"`
  - `issueLabels(issue: { identifier: string; id: string; url: string }): Record<string, string>`
  - `bindingFromLabels(labels: Record<string, string> | undefined): Binding | null`
  - `bindingFromBranch(branch: string | null | undefined): Binding | null`
  - `resolveBinding(labels, branch): Binding | null` — labels win
  - `type Binding = { identifier: string; issueId: string | null; url: string | null }`

- [ ] **Step 1: Write the failing tests**

`server/binding.test.ts`:

```ts
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
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- server/binding.test.ts`
Expected: FAIL — cannot resolve `./binding`.

- [ ] **Step 3: Implement**

`server/binding.ts`:

```ts
import { identifierFromBranch } from "../shared/format";

export const ISSUE_LABEL = "linear.issue";
export const ISSUE_ID_LABEL = "linear.issueId";
export const ISSUE_URL_LABEL = "linear.url";

export interface Binding {
  identifier: string;
  issueId: string | null;
  url: string | null;
}

export function issueLabels(issue: {
  identifier: string;
  id: string;
  url: string;
}): Record<string, string> {
  return {
    [ISSUE_LABEL]: issue.identifier,
    [ISSUE_ID_LABEL]: issue.id,
    [ISSUE_URL_LABEL]: issue.url,
  };
}

export function bindingFromLabels(labels: Record<string, string> | undefined): Binding | null {
  const identifier = labels?.[ISSUE_LABEL];
  if (!identifier) return null;
  return {
    identifier,
    issueId: labels?.[ISSUE_ID_LABEL] ?? null,
    url: labels?.[ISSUE_URL_LABEL] ?? null,
  };
}

export function bindingFromBranch(branch: string | null | undefined): Binding | null {
  if (!branch) return null;
  const identifier = identifierFromBranch(branch);
  return identifier ? { identifier, issueId: null, url: null } : null;
}

export function resolveBinding(
  labels: Record<string, string> | undefined,
  branch: string | null | undefined,
): Binding | null {
  return bindingFromLabels(labels) ?? bindingFromBranch(branch);
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- server/binding.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add server/binding.ts server/binding.test.ts
git commit -m "feat: issue-to-agent binding via labels with branch-name fallback"
```

---

### Task 10: Server handlers and entry wiring

Wire everything registered so far into the daemon subprocess. This task's deliverable is a
plugin that installs and reaches `running` with working search, get, list, verify, and states
RPCs.

**Files:**
- Create: `server/context.ts`, `server/handlers.ts`
- Modify: `index.server.ts`

**Interfaces:**
- Consumes: every module from Tasks 4–9.
- Produces:
  - `loadLinearContext(context: PluginHandlerContext): Promise<LinearContext>` where
    `LinearContext = { transport: LinearTransport; settings: LinearSettings; source: "env" | "settings" }`
  - `registerHandlers(server: PluginServerContext): void`

- [ ] **Step 1: Write the context helper**

**Design note — why settings are pushed, not read.** `PluginHandlerContext` exposes only
`paseo`. There is no server-side settings accessor, and the on-disk storage path is
undocumented. The obvious fallback — pass settings as RPC input — dies on the attachment
source: Paseo itself invokes `searchIssuesRpc` with only `{ query }`, so that call can never
carry settings. Therefore the **client pushes** the settings document to the server, which
caches it in memory. `PluginClientContext.rpc(contract, input)` makes this possible outside a
component, and `settingsRpc(id)` returns the daemon-served `read` contract.

First, add the sync contract to `shared/rpc.ts`:

```ts
import { LinearSettingsSchema } from "./settings";

export const syncSettingsRpc = defineRpc({
  name: "linear.syncSettings",
  input: z.object({ values: LinearSettingsSchema }),
  output: z.object({ ok: z.boolean() }),
});
```

`server/context.ts`:

```ts
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { type LinearSettings, LinearSettingsSchema } from "../shared/settings";
import { resolveApiKey } from "./credentials";
import { createTransport, type LinearTransport } from "./linear/client";

let cached: LinearSettings = LinearSettingsSchema.parse({});

/** Replaces the cached settings document. Called only by the syncSettings handler. */
export function cacheSettings(values: LinearSettings): void {
  cached = values;
}

export function currentSettings(): LinearSettings {
  return cached;
}

export interface LinearContext {
  transport: LinearTransport;
  settings: LinearSettings;
  source: "env" | "settings";
}

export function loadLinearContext(_context: PluginHandlerContext): LinearContext {
  const settings = currentSettings();
  const { apiKey, source } = resolveApiKey(process.env, settings);
  return { transport: createTransport({ apiKey }), settings, source };
}
```

`loadLinearContext` is synchronous now; handlers that used `await` on it still work, but drop
the `await` where it reads better.

Update `server/credentials.ts`'s no-key error message to name both fixes, and update its test:

```
"Set LINEAR_API_KEY in the daemon environment, or open Settings → Plugins → Linear and add a key"
```

Register the sync handler in `server/handlers.ts`:

```ts
server.handle(syncSettingsRpc, ({ values }) => {
  cacheSettings(values);
  return { ok: true };
});
```

**Residual risk to document in the README:** a daemon-side path that runs with no Paseo client
ever connected (a lifecycle hook on a headless daemon) sees only schema defaults, so the API
key must come from `LINEAR_API_KEY` there. Every client-reachable path — attachment source,
panel, settings, slash command — runs after `contribute()` has pushed, so it works either way.

- [ ] **Step 2: Write the handlers**

`server/handlers.ts`:

```ts
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
  verifyRpc,
} from "../shared/rpc";
import { loadLinearContext } from "./context";
import { assignIssue, createComment, linkUrl, moveIssueState } from "./linear/mutations";
import { fetchIssue, fetchStates, fetchViewer, listIssues, searchIssues } from "./linear/queries";

export function registerHandlers(server: PluginServerContext): void {
  server.handle(searchIssuesRpc, async ({ query }, context) => {
    const { transport, settings } = await loadLinearContext(context);
    const issues = await searchIssues(transport, query, settings.defaultTeamKey);
    return { items: issues.map(issueAttachmentItem) };
  });

  server.handle(getIssueRpc, async ({ identifier }, context) => {
    const { transport } = await loadLinearContext(context);
    return { issue: await fetchIssue(transport, identifier) };
  });

  server.handle(listIssuesRpc, async ({ scope }, context) => {
    const { transport, settings } = await loadLinearContext(context);
    return { issues: await listIssues(transport, scope, settings.defaultTeamKey) };
  });

  server.handle(verifyRpc, async (_input, context) => {
    const { transport, source } = await loadLinearContext(context);
    const viewer = await fetchViewer(transport);
    return { name: viewer.name, source };
  });

  server.handle(listStatesRpc, async ({ teamId }, context) => {
    const { transport } = await loadLinearContext(context);
    const states = await fetchStates(transport, teamId);
    return { states: states.map(({ id, name, type }) => ({ id, name, type })) };
  });

  server.handle(commentRpc, async ({ issueId, body }, context) => {
    const { transport } = await loadLinearContext(context);
    return createComment(transport, issueId, body);
  });

  server.handle(moveStateRpc, async ({ issueId, stateId }, context) => {
    const { transport } = await loadLinearContext(context);
    return moveIssueState(transport, issueId, stateId);
  });

  server.handle(assignSelfRpc, async ({ issueId }, context) => {
    const { transport } = await loadLinearContext(context);
    const viewer = await fetchViewer(transport);
    return assignIssue(transport, issueId, viewer.id);
  });

  server.handle(linkBranchRpc, async ({ issueId, url, title }, context) => {
    const { transport } = await loadLinearContext(context);
    return linkUrl(transport, issueId, url, title);
  });
}
```

- [ ] **Step 3: Wire the entry**

`index.server.ts`:

```ts
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { linearSettings } from "./shared/settings";
import { registerHandlers } from "./server/handlers";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(linearSettings);
  registerHandlers(server);
  return () => {};
}
```

- [ ] **Step 4: Register the attachment source on the client**

`index.client.tsx`:

```tsx
import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { issueAttachments } from "./shared/attachments";
import { syncSettingsRpc } from "./shared/rpc";
import { LinearSettingsSchema } from "./shared/settings";

const linearSettingsRpc = settingsRpc("linear");

async function pushSettings(client: PluginClientContext): Promise<void> {
  const stored = await client.rpc(linearSettingsRpc.read, {});
  if (stored.status !== "ready") return;
  await client.rpc(syncSettingsRpc, { values: LinearSettingsSchema.parse(stored.values) });
}

export default function contribute(client: PluginClientContext) {
  client.addAttachmentSource(issueAttachments);
  void pushSettings(client).catch(() => {
    // The settings screen pushes again on save; a cold read failure is not fatal.
  });
  return () => {};
}
```

`pushSettings` is exported from `index.client.tsx` for reuse — Task 12's settings screen calls
it again after each successful save so the daemon cache never goes stale.

- [ ] **Step 5: Typecheck, install, and verify it runs**

```bash
npm run typecheck && npm test
paseo plugin install /Users/sholodak/cosmos/paseo-linear
paseo plugin ls
```

Expected: `linear` shows `running` with no error. If it does not, read
`paseo plugin logs linear` before changing anything.

- [ ] **Step 6: Exercise the attachment source manually**

In the Paseo composer, open the attachment menu, choose **Linear issue**, and search
`ENG-14236`. Expected: the issue appears with subtitle `In Progress · <assignee>`. Then search
a word like `randomize`. Expected: title matches. With no API key configured, expected: the
actionable "Add a Linear API key" message, not a stack trace.

- [ ] **Step 7: Commit**

```bash
git add server/context.ts server/handlers.ts index.server.ts index.client.tsx
git commit -m "feat: daemon handlers, settings registration, and attachment source"
```

---

### Task 11: The issue chip and card

The visual contract from spec §5. Client-only; verified by typecheck, the mobile audit, and
manual inspection in both themes and both layouts — there is no RN test renderer in this
project and adding one is not worth it for presentational components.

**Files:**
- Create: `client/web.ts`, `client/chip.tsx`
- Modify: `index.client.tsx`

**Interfaces:**
- Consumes: `shared/issue.ts`, `shared/format.ts`, `shared/rpc.ts`.
- Produces:
  - `openExternal(url: string): Promise<void>` from `client/web.ts`
  - `IssueChip({ issue, theme, layout, onPress })`
  - `IssueCard({ issue, theme, layout })`
  - `IssueChipRow({ issues, theme, layout })`

- [ ] **Step 1: Write `client/web.ts`**

```ts
import { Linking, Platform } from "react-native";

// This plugin typechecks without the DOM library. Declare only what this module uses.
declare const window: { open(url: string, target: string, features: string): unknown };

export async function openExternal(url: string): Promise<void> {
  if (Platform.OS === "web") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await Linking.openURL(url);
}
```

- [ ] **Step 2: Write `client/chip.tsx`**

```tsx
import type { PluginLayout, PluginTheme } from "@getpaseo/plugin/client";
import { Icon, Modal, copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { clampText, relativeTime } from "../shared/format";
import { type Issue, issueBreadcrumb } from "../shared/issue";
import { openExternal } from "./web";

interface ChromeProps {
  theme: PluginTheme;
  layout: PluginLayout;
}

export function IssueChip({
  issue,
  theme,
  onPress,
}: ChromeProps & { issue: Issue; onPress(): void }) {
  const styles = useMemo(
    () => ({
      chip: {
        backgroundColor: theme.colors.raised,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: "flex-start" as const,
      },
      label: { color: theme.colors.foreground, fontSize: 12, fontWeight: "600" as const },
    }),
    [theme],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Linear issue ${issue.identifier}`}
      onPress={onPress}
      style={styles.chip}
    >
      <Text style={styles.label}>{issue.identifier}</Text>
    </Pressable>
  );
}

export function IssueCard({ issue, theme, layout }: ChromeProps & { issue: Issue }) {
  const toast = useToast();
  const now = useMemo(() => new Date(), []);
  const styles = useMemo(
    () => ({
      body: { gap: layout.compact ? 8 : 10 },
      crumbRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, flexWrap: "wrap" as const },
      crumbs: { color: theme.colors.foreground, fontSize: layout.compact ? 15 : 16, fontWeight: "600" as const, flexShrink: 1 },
      row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, flexWrap: "wrap" as const },
      state: { color: issue.state.color, fontSize: 13, fontWeight: "600" as const },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: theme.colors.raised },
      badgeText: { color: theme.colors.foregroundMuted, fontSize: 11 },
      divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 4 },
      description: { color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 19 },
      action: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
      actionText: { color: theme.colors.accent, fontSize: 13 },
    }),
    [theme, layout.compact, issue.state.color],
  );

  async function copy(value: string, label: string) {
    try {
      await copyText(value);
      toast.show(`${label} copied`, { variant: "success" });
    } catch {
      toast.error(`Could not copy the ${label.toLowerCase()}`);
    }
  }

  return (
    <View style={styles.body}>
      <View style={styles.crumbRow}>
        {issue.project?.icon ? (
          <Icon
            name={issue.project.icon}
            size={layout.compact ? 15 : 16}
            color={issue.project.color ?? theme.colors.foregroundMuted}
          />
        ) : null}
        <Text style={styles.crumbs}>{issueBreadcrumb(issue).join(" · ")}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.state}>{issue.state.name}</Text>
        <Text style={styles.muted}>{issue.priorityLabel}</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{issue.team.name}</Text>
        </View>
        {issue.labels.map((label) => (
          <View key={label.name} style={styles.badge}>
            <Text style={[styles.badgeText, { color: label.color }]}>{label.name}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.muted}>
        {`created ${relativeTime(issue.createdAt, now)} · updated ${relativeTime(issue.updatedAt, now)}`}
      </Text>
      <View style={styles.divider} />
      <Text style={styles.description} selectable>
        {clampText(issue.description || "No description.", 12)}
      </Text>
      <View style={styles.divider} />
      <Pressable accessibilityRole="button" onPress={() => void openExternal(issue.url)} style={styles.action}>
        <Icon name="ExternalLink" size={14} color={theme.colors.accent} />
        <Text style={styles.actionText}>Open in Linear</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => void copy(issue.branchName, "Branch name")}
        style={styles.action}
      >
        <Icon name="GitBranch" size={14} color={theme.colors.accent} />
        <Text style={styles.actionText}>Copy branch name</Text>
      </Pressable>
    </View>
  );
}

export function IssueChipRow({ issues, theme, layout }: ChromeProps & { issues: Issue[] }) {
  const [open, setOpen] = useState<Issue | null>(null);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {issues.map((issue) => (
        <IssueChip key={issue.id} issue={issue} theme={theme} layout={layout} onPress={() => setOpen(issue)} />
      ))}
      <Modal
        title={open ? `${open.identifier} · ${open.title}` : ""}
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <Modal.Content>
          {open ? <IssueCard issue={open} theme={theme} layout={layout} /> : null}
        </Modal.Content>
      </Modal>
    </View>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If `PluginTheme` or `PluginLayout` are not exported under those names, read
`node_modules/@getpaseo/plugin/dist/client/contracts.d.ts` and use the real names — the props
are also reachable as `PluginSurfaceProps["theme"]` and `PluginSurfaceProps["layout"]`.

- [ ] **Step 4: Run the mobile audit**

Run: `rg -n "document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=" client/`
Expected: exactly one hit, the `declare const window` line in `client/web.ts`. Any other hit is
a bug — fix it before committing.

- [ ] **Step 5: Commit**

```bash
git add client/web.ts client/chip.tsx
git commit -m "feat: issue chip and rich issue card with external link and copy actions"
```

---

### Task 12: Settings screen

**Files:**
- Create: `client/settings.tsx`
- Modify: `index.client.tsx`

**Interfaces:**
- Consumes: `shared/settings.ts`, `shared/rpc.ts` (`verifyRpc`).
- Produces: `LinearSettingsScreen` component, registered as settings screen id `linear`.

- [ ] **Step 1: Write the screen**

`client/settings.tsx`:

```tsx
import { type PluginSurfaceProps, useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { linearSettings } from "../shared/settings";
import { verifyRpc } from "../shared/rpc";

export function LinearSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(linearSettings);
  const verify = useRpc(verifyRpc);
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string>>({});

  if (settings.status === "loading") {
    return <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>;
  }
  if (settings.status === "error" || settings.status === "invalid") {
    return <Text style={{ color: theme.colors.foreground }}>{String(settings.error)}</Text>;
  }

  const values = settings.values;

  async function save(patch: Record<string, unknown>) {
    const ok = await settings.save({ ...values, ...patch }, settings.revision);
    if (!ok) toast.error("Could not save — reload and try again");
  }

  return (
    <ScrollView>
      <SettingsSection title="Connection">
        <SettingsCard>
          <SettingsInput
            label="API key"
            hint="Stored as plain JSON on this daemon, not in a credential vault. Set LINEAR_API_KEY in the daemon environment to keep it off disk — the environment variable wins when both are set."
            secureTextEntry
            initialValue={values.apiKey}
            placeholder="lin_api_…"
            onChangeText={(text) => setDraft((d) => ({ ...d, apiKey: text }))}
          />
          <SettingsAction
            label="Save API key"
            actionLabel="Save"
            onPress={() => void save({ apiKey: draft.apiKey ?? values.apiKey })}
          />
          <SettingsAction
            label="Test connection"
            actionLabel="Test"
            onPress={async () => {
              try {
                const result = await verify({});
                toast.show(
                  `Connected as ${result.name} (key from ${result.source === "env" ? "environment" : "settings"})`,
                  { variant: "success" },
                );
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Connection failed");
              }
            }}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Defaults">
        <SettingsCard>
          <SettingsInput
            label="Default team key"
            hint="Scopes search and the issue panel. Leave empty for all teams."
            initialValue={values.defaultTeamKey}
            placeholder="ENG"
            onChangeText={(text) => setDraft((d) => ({ ...d, defaultTeamKey: text }))}
          />
          <SettingsInput
            label="Repository path"
            hint="Absolute path to the checkout worktrees are created from."
            initialValue={values.repositoryPath}
            onChangeText={(text) => setDraft((d) => ({ ...d, repositoryPath: text }))}
          />
          <SettingsInput
            label="Base ref"
            hint="Use a remote-tracking ref like origin/main so worktrees start from fetched history, not a stale local branch."
            initialValue={values.baseRef}
            onChangeText={(text) => setDraft((d) => ({ ...d, baseRef: text }))}
          />
          <SettingsInput
            label="Provider"
            hint="provider/model for issue-launched agents. Empty uses the daemon default."
            initialValue={values.provider}
            placeholder="claude-code/claude-opus-5"
            onChangeText={(text) => setDraft((d) => ({ ...d, provider: text }))}
          />
          <SettingsAction
            label="Save defaults"
            actionLabel="Save"
            onPress={() =>
              void save({
                defaultTeamKey: draft.defaultTeamKey ?? values.defaultTeamKey,
                repositoryPath: draft.repositoryPath ?? values.repositoryPath,
                baseRef: draft.baseRef ?? values.baseRef,
                provider: draft.provider ?? values.provider,
              })
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="On starting work">
        <SettingsCard>
          <SettingsSwitch
            label="Offer to move the issue to the first started status"
            value={values.moveToStarted}
            onValueChange={(next) => void save({ moveToStarted: next })}
          />
          <SettingsSwitch
            label="Offer to assign the issue to me"
            value={values.assignToMe}
            onValueChange={(next) => void save({ assignToMe: next })}
          />
          <SettingsRow label="Prompt template" hint="Placeholders: {{identifier}} {{title}} {{url}} {{description}} {{branchName}}">
            <SettingsInput
              label="Template"
              initialValue={values.promptTemplate}
              onChangeText={(text) => setDraft((d) => ({ ...d, promptTemplate: text }))}
            />
          </SettingsRow>
          <SettingsAction
            label="Save template"
            actionLabel="Save"
            onPress={() => void save({ promptTemplate: draft.promptTemplate ?? values.promptTemplate })}
          />
        </SettingsCard>
      </SettingsSection>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Register it**

In `index.client.tsx`, add inside `contribute`:

```tsx
client.addSettingsScreen({
  id: "linear",
  title: "Linear",
  icon: "CircleDot",
  Component: LinearSettingsScreen,
});
```

- [ ] **Step 3: Typecheck, reload, verify**

```bash
npm run typecheck
paseo plugin reload linear && paseo plugin ls
```

Then open Settings → Plugins → Linear. Enter your key, press **Save**, then **Test**. Expected:
a success toast naming you and the key source. Check the same screen in a compact window.

- [ ] **Step 4: Run the mobile audit**

Run: `rg -n "document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=" client/`
Expected: only the `client/web.ts` line.

- [ ] **Step 5: Commit**

```bash
git add client/settings.tsx index.client.tsx
git commit -m "feat: Linear settings screen with connection test and key-source disclosure"
```

---

### Task 13: Start work from an issue

**Files:**
- Create: `server/start-work.ts`, `server/start-work.test.ts`, `client/launch.tsx`
- Modify: `server/handlers.ts`, `index.client.tsx`

**Interfaces:**
- Consumes: `server/linear/queries.ts`, `server/binding.ts`, `shared/format.ts`, `shared/issue.ts`.
- Produces:
  - `buildWorkspaceRequest(issue, settings): PaseoWorkspaceCreateOptions` — pure, testable
  - `startWork(context, identifier): Promise<{ workspaceId; agentId; branchName }>`
  - Command Center item `start-work`, slash command `/linear`

- [ ] **Step 1: Write the failing test for the pure request builder**

`server/start-work.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Issue } from "../shared/issue";
import { DEFAULT_PROMPT_TEMPLATE } from "../shared/format";
import { buildWorkspaceRequest } from "./start-work";

const issue: Issue = {
  id: "uuid-1",
  identifier: "ENG-14236",
  title: "Randomize the products",
  description: "Shuffle daily.",
  url: "https://linear.app/thecosmos/issue/ENG-14236/randomize",
  branchName: "feature/eng-14236-randomize",
  priorityLabel: "No priority",
  createdAt: "2026-09-09T14:40:17.035Z",
  updatedAt: "2026-09-10T03:00:44.419Z",
  state: { id: "s1", name: "In Progress", type: "started", color: "#f2c94c" },
  team: { id: "t1", key: "ENG", name: "Engineering" },
  assignee: null,
  project: null,
  parents: [],
  labels: [],
};

const settings = {
  repositoryPath: "/Users/me/code/app",
  baseRef: "origin/main",
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
};

describe("buildWorkspaceRequest", () => {
  it("uses the verified worktree branch-off shape", () => {
    expect(buildWorkspaceRequest(issue, settings).source).toEqual({
      kind: "worktree",
      cwd: "/Users/me/code/app",
      action: "branch-off",
      branchName: "feature/eng-14236-randomize",
      baseBranch: "origin/main",
    });
  });

  it("titles the workspace with the identifier and title", () => {
    expect(buildWorkspaceRequest(issue, settings).title).toBe("ENG-14236 · Randomize the products");
  });

  it("renders the prompt from the template", () => {
    const prompt = buildWorkspaceRequest(issue, settings).firstAgentContext?.prompt;
    expect(prompt).toContain("ENG-14236: Randomize the products");
    expect(prompt).toContain("Shuffle daily.");
  });

  it("seeds the issue as an external-resource attachment", () => {
    const attachments = buildWorkspaceRequest(issue, settings).firstAgentContext?.attachments;
    expect(attachments?.[0]).toMatchObject({
      type: "text",
      mimeType: "text/plain",
      externalResource: {
        provider: "linear",
        resourceType: "issue",
        identifier: "ENG-14236",
        url: issue.url,
      },
    });
  });

  it("throws a clear error when no repository path is configured", () => {
    expect(() => buildWorkspaceRequest(issue, { ...settings, repositoryPath: "" })).toThrow(
      "repository path",
    );
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- server/start-work.test.ts`
Expected: FAIL — cannot resolve `./start-work`.

- [ ] **Step 3: Implement the builder and the handler**

`server/start-work.ts`:

```ts
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { renderPrompt } from "../shared/format";
import { type Issue, issueAttachmentText } from "../shared/issue";
import { issueLabels } from "./binding";
import { loadLinearContext } from "./context";
import { fetchIssue } from "./linear/queries";

export interface StartWorkSettings {
  repositoryPath: string;
  baseRef: string;
  promptTemplate: string;
}

export function buildWorkspaceRequest(issue: Issue, settings: StartWorkSettings) {
  const cwd = settings.repositoryPath.trim();
  if (!cwd) {
    throw new Error(
      "Set a repository path in Settings → Plugins → Linear before starting work from an issue",
    );
  }
  return {
    title: `${issue.identifier} · ${issue.title}`,
    source: {
      kind: "worktree" as const,
      cwd,
      action: "branch-off" as const,
      branchName: issue.branchName,
      baseBranch: settings.baseRef,
    },
    firstAgentContext: {
      prompt: renderPrompt(settings.promptTemplate, {
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        description: issue.description ?? "",
        branchName: issue.branchName,
      }),
      attachments: [
        {
          type: "text" as const,
          mimeType: "text/plain" as const,
          title: `${issue.identifier} · ${issue.title}`,
          text: issueAttachmentText(issue),
          externalResource: {
            provider: "linear",
            providerLabel: "Linear",
            resourceType: "issue",
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            url: issue.url,
          },
        },
      ],
    },
  };
}

export async function startWork(
  context: PluginHandlerContext,
  identifier: string,
): Promise<{ workspaceId: string; agentId: string; branchName: string }> {
  const { transport, settings } = await loadLinearContext(context);
  const issue = await fetchIssue(transport, identifier);
  if (!issue) throw new Error(`No Linear issue found for ${identifier}`);

  const request = buildWorkspaceRequest(issue, settings);
  const workspace = await context.paseo.workspaces.create(request);
  const agent = await workspace.agents.create({
    config: settings.provider ? { provider: settings.provider } : { provider: "" },
    labels: issueLabels(issue),
    title: `${issue.identifier} · ${issue.title}`,
  });

  return { workspaceId: workspace.id, agentId: agent.id, branchName: issue.branchName };
}
```

> **Verify while implementing:** `config.provider` is required and typed as `string`. If an
> empty string is rejected, read the daemon's default provider through
> `context.paseo.providers` and use that instead of `""`. Do not silently hardcode a provider.

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- server/start-work.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Register the RPC handler**

In `server/handlers.ts`, add the import and:

```ts
server.handle(startWorkRpc, ({ identifier }, context) => startWork(context, identifier));
```

- [ ] **Step 6: Add the Command Center item and slash command**

In `index.client.tsx`:

```tsx
client.addCommandCenterItem({
  id: "start-work",
  title: "Linear: start work on an issue",
  icon: "CirclePlay",
  keywords: ["linear", "issue", "worktree"],
  context: "global",
  onSelect({ openSurface }) {
    openSurface("issues");
  },
});

client.addSlashCommand({
  name: "linear",
  description: "Start work on a Linear issue",
  argumentHint: "<identifier>",
  context: "workspace",
  async onSubmit({ args, rpc }) {
    const identifier = args.trim();
    if (!identifier) throw new Error("Usage: /linear ENG-123");
    await rpc(startWorkRpc, { identifier });
  },
});
```

- [ ] **Step 7: Add the post-launch confirmation sheet**

Spec §8.3 step 4: when `moveToStarted` or `assignToMe` is on, the plugin *offers* the Linear
change and mutates only on press. Nothing here fires automatically.

`client/launch.tsx`:

```tsx
import { type PluginLayout, type PluginTheme, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Issue } from "../shared/issue";
import { assignSelfRpc, listStatesRpc, moveStateRpc } from "../shared/rpc";
import { linearSettings } from "../shared/settings";

export function useLaunchFollowUp() {
  const [pending, setPending] = useState<Issue | null>(null);
  return { pending, offer: setPending, dismiss: () => setPending(null) };
}

export function LaunchFollowUp({
  issue,
  theme,
  layout,
  onDone,
}: {
  issue: Issue | null;
  theme: PluginTheme;
  layout: PluginLayout;
  onDone(): void;
}) {
  const settings = useSettings(linearSettings);
  const listStates = useRpc(listStatesRpc);
  const moveState = useRpc(moveStateRpc);
  const assignSelf = useRpc(assignSelfRpc);
  const toast = useToast();

  if (!issue || settings.status !== "ready") return null;
  const { moveToStarted, assignToMe } = settings.values;
  if (!moveToStarted && !assignToMe) return null;

  async function apply() {
    try {
      if (assignToMe) {
        const result = await assignSelf({ issueId: issue!.id });
        toast.show(`Assigned ${issue!.identifier} to ${result.assigneeName}`, { variant: "success" });
      }
      if (moveToStarted) {
        const { states } = await listStates({ teamId: issue!.team.id });
        const started = states.find((state) => state.type === "started");
        if (started) {
          const result = await moveState({ issueId: issue!.id, stateId: started.id });
          toast.show(`Moved ${issue!.identifier} to ${result.stateName}`, { variant: "success" });
        } else {
          toast.error("This team has no started status");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update Linear");
    } finally {
      onDone();
    }
  }

  const changes = [
    assignToMe ? `Assign ${issue.identifier} to you` : null,
    moveToStarted ? `Move ${issue.identifier} to the first started status` : null,
  ].filter((entry): entry is string => entry !== null);

  return (
    <Modal title="Update Linear?" open onOpenChange={(next) => (next ? undefined : onDone())}>
      <Modal.Content>
        <View style={{ gap: layout.compact ? 8 : 12 }}>
          {changes.map((change) => (
            <Text key={change} style={{ color: theme.colors.foreground, fontSize: 14 }}>
              {`• ${change}`}
            </Text>
          ))}
          <Pressable accessibilityRole="button" onPress={() => void apply()}>
            <Text style={{ color: theme.colors.accent, fontSize: 14 }}>Update Linear</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onDone}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 14 }}>Skip</Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}
```

Wire it into `client/panel.tsx` (Task 14) by calling `offer(issue)` after `startWork` resolves
and rendering `<LaunchFollowUp … />`. Until Task 14 exists, this module only needs to typecheck.

- [ ] **Step 8: Typecheck, reload, and verify end to end**

```bash
npm run typecheck && npm test
paseo plugin reload linear && paseo plugin ls
```

In a workspace composer, run `/linear ENG-14236` against a real issue. Expected: a new
workspace on branch `feature/eng-14236-…` with an agent whose labels carry the identifier, and
the issue attached to its first prompt. Verify with:

```bash
paseo ls --json | grep -i "linear.issue"
```

Then confirm in Linear that the issue's state and assignee are **unchanged** — the slash-command
path has no UI to confirm the follow-up, so it must not mutate anything.

- [ ] **Step 9: Commit**

```bash
git add server/start-work.ts server/start-work.test.ts server/handlers.ts client/launch.tsx index.client.tsx
git commit -m "feat: start work on a Linear issue in a branch-off worktree"
```

---

### Task 14: Issue panel

**Files:**
- Create: `client/panel.tsx`
- Modify: `index.client.tsx`

**Interfaces:**
- Consumes: `client/chip.tsx`, `shared/rpc.ts` (`listIssuesRpc`, `startWorkRpc`).
- Produces: `IssuesPanel` registered as workspace panel id `issues`, plus a surface of the same
  id so the Command Center item from Task 13 resolves.

- [ ] **Step 1: Write the panel**

`client/panel.tsx`:

```tsx
import { type PluginWorkspacePanelProps, useRpc } from "@getpaseo/plugin/client";
import { FlatList, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Issue } from "../shared/issue";
import { listIssuesRpc, startWorkRpc } from "../shared/rpc";
import { IssueCard, IssueChip } from "./chip";

const SCOPES = [
  { id: "assigned", label: "Assigned" },
  { id: "cycle", label: "Cycle" },
  { id: "triage", label: "Triage" },
] as const;

type Scope = (typeof SCOPES)[number]["id"];

export function IssuesPanel({ theme, layout }: PluginWorkspacePanelProps) {
  const [scope, setScope] = useState<Scope>("assigned");
  const [selected, setSelected] = useState<Issue | null>(null);
  const listIssues = useRpc(listIssuesRpc);
  const startWork = useRpc(startWorkRpc);
  const toast = useToast();

  const query = useQuery({
    queryKey: ["linear", "issues", scope],
    queryFn: () => listIssues({ scope }),
  });

  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0, padding: layout.compact ? 12 : 16, gap: 12 },
      tabs: { flexDirection: "row" as const, gap: 8 },
      tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
      tabText: { fontSize: 13 },
      row: { paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
      title: { color: theme.colors.foreground, fontSize: 14 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      start: { color: theme.colors.accent, fontSize: 13, paddingVertical: 8 },
    }),
    [theme, layout.compact],
  );

  async function begin(issue: Issue) {
    try {
      const result = await startWork({ identifier: issue.identifier });
      toast.show(`Started ${issue.identifier} on ${result.branchName}`, { variant: "success" });
      setSelected(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start work");
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {SCOPES.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            onPress={() => setScope(entry.id)}
            style={[
              styles.tab,
              { backgroundColor: scope === entry.id ? theme.colors.raised : "transparent" },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: scope === entry.id ? theme.colors.foreground : theme.colors.foregroundMuted },
              ]}
            >
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {query.isPending ? <Text style={styles.muted}>Loading issues…</Text> : null}
      {query.isError ? (
        <Text style={styles.muted}>{(query.error as Error).message}</Text>
      ) : null}
      {query.data && query.data.issues.length === 0 ? (
        <Text style={styles.muted}>No issues in this view.</Text>
      ) : null}

      <FlatList
        style={{ flex: 1, minHeight: 0 }}
        data={query.data?.issues ?? []}
        keyExtractor={(issue) => issue.id}
        refreshing={query.isFetching}
        onRefresh={() => void query.refetch()}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelected(selected?.id === item.id ? null : item)}
            style={styles.row}
          >
            <IssueChip issue={item} theme={theme} layout={layout} onPress={() => setSelected(item)} />
            <Text style={styles.title}>{item.title}</Text>
            <Text style={[styles.muted, { color: item.state.color }]}>{item.state.name}</Text>
            {selected?.id === item.id ? (
              <View>
                <IssueCard issue={item} theme={theme} layout={layout} />
                <Pressable accessibilityRole="button" onPress={() => void begin(item)}>
                  <Text style={styles.start}>Start work in a new worktree</Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
```

- [ ] **Step 2: Register the panel, surface, and sidebar item**

In `index.client.tsx`:

```tsx
client.addWorkspacePanel({
  id: "issues",
  title: "Linear",
  icon: "CircleDot",
  context: "workspace",
  locations: ["workspace", "explorer"],
  Component: IssuesPanel,
});
client.addSurface("issues", IssuesPanel);
client.addSidebarItem({ id: "issues", title: "Linear", icon: "CircleDot", surface: "issues" });
```

> `IssuesPanel` takes `PluginWorkspacePanelProps`. If `addSurface` requires
> `PluginSurfaceProps` (no `workspaceId`), split the component: keep the rendering in a
> `IssuesList({ theme, layout })` that takes only chrome props, and have both the panel and the
> surface wrap it. Do not cast.

- [ ] **Step 3: Typecheck, reload, verify**

```bash
npm run typecheck
paseo plugin reload linear && paseo plugin ls
```

Open the Linear sidebar item and the workspace panel. Verify all three tabs load, pull-to-refresh
works, the empty state reads correctly, and **Start work** creates a worktree. Check a compact
window and both themes.

- [ ] **Step 4: Mobile audit and commit**

```bash
rg -n "document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=" client/
git add client/panel.tsx index.client.tsx
git commit -m "feat: issue panel with assigned, cycle, and triage scopes"
```

---

### Task 15: Write-back — composer pill, timeline offer, and turn hook

**Files:**
- Create: `client/writeback.tsx`, `server/hooks.ts`
- Modify: `index.client.tsx`, `index.server.ts`

**Interfaces:**
- Consumes: `server/binding.ts`, `shared/rpc.ts` (`commentRpc`, `moveStateRpc`, `listStatesRpc`, `linkBranchRpc`), `client/chip.tsx`.
- Produces:
  - Timeline renderer `kind: "linear-turn"`, `version: 1`, schema `turnSchema`
  - `TurnOffer`, `CommentPopover`, `MoveStatePopover`, `LinkBranchPopover` from `client/writeback.tsx`
  - `registerHooks(server: PluginServerContext): () => void`
  - A menu composer pill registered per bound agent

- [ ] **Step 1: Write the turn-ended hook**

`server/hooks.ts`:

```ts
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { clampText } from "../shared/format";
import { resolveBinding } from "./binding";

export function registerHooks(server: PluginServerContext): () => void {
  const remove = server.on("agent.turn_ended", async ({ agent, outcome, timeline }, { paseo }) => {
    if (outcome.kind !== "completed") return;

    const refreshed = await paseo.agents.ref(agent.id).refresh();
    const binding = resolveBinding(refreshed?.agent.labels, null);
    if (!binding) return;

    const lastAssistantText = [...timeline]
      .reverse()
      .find((item) => item.type === "assistant" && typeof (item as { text?: unknown }).text === "string");
    const summary = clampText(
      String((lastAssistantText as { text?: string } | undefined)?.text ?? ""),
      20,
    ).slice(0, 4000);

    await paseo.agents.ref(agent.id).timeline.append({
      type: "plugin",
      id: `linear-turn-${binding.identifier}`,
      kind: "linear-turn",
      version: 1,
      data: {
        identifier: binding.identifier,
        issueId: binding.issueId,
        url: binding.url,
        summary,
      },
    });
  });

  return () => remove();
}
```

> **Verify while implementing:** the timeline item discriminator for an assistant message is
> not documented as `"assistant"` in the reference — the documented coarse selectors are values
> like `"reasoning"` and `"tool_call"`. Read `AgentTimelineItem` in
> `node_modules/@getpaseo/plugin/dist` and match the real assistant-text variant. If no text
> item is found, still append the row with an empty summary so the offer is present.

- [ ] **Step 2: Write the timeline renderer and pill content**

`client/writeback.tsx`:

```tsx
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { commentRpc, listStatesRpc, moveStateRpc } from "../shared/rpc";

export const turnSchema = z.object({
  identifier: z.string(),
  issueId: z.string().nullable(),
  url: z.string().nullable(),
  summary: z.string(),
});

export function TurnOffer({ item, theme }: PluginTimelineItemProps<z.output<typeof turnSchema>>) {
  const comment = useRpc(commentRpc);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(item.data.summary);
  const { issueId, identifier } = item.data;

  async function post() {
    if (!issueId) {
      toast.error("This agent has no Linear issue id — reopen it from the Linear panel");
      return;
    }
    try {
      await comment({ issueId, body });
      toast.show(`Commented on ${identifier}`, { variant: "success" });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post the comment");
    }
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
      <Icon name="CircleDot" size={14} color={theme.colors.foregroundMuted} />
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
        {`Turn finished on ${identifier}`}
      </Text>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
        <Text style={{ color: theme.colors.accent, fontSize: 13 }}>Comment on issue</Text>
      </Pressable>

      <Modal title={`Comment on ${identifier}`} open={open} onOpenChange={setOpen}>
        <Modal.Content>
          <TextInput
            multiline
            value={body}
            onChangeText={setBody}
            style={{
              color: theme.colors.foreground,
              backgroundColor: theme.colors.surface1,
              borderRadius: 8,
              padding: 12,
              minHeight: 140,
            }}
          />
          <Pressable accessibilityRole="button" onPress={() => void post()}>
            <Text style={{ color: theme.colors.accent, fontSize: 14 }}>Post to Linear</Text>
          </Pressable>
        </Modal.Content>
      </Modal>
    </View>
  );
}
```

- [ ] **Step 3: Register the renderer and the per-agent pill**

In `index.client.tsx`:

```tsx
client.addTimelineRenderer({
  kind: "linear-turn",
  version: 1,
  schema: turnSchema,
  Component: TurnOffer,
});

const pills = new Map<string, () => void>();
const unsubscribe = client.paseo.agents.subscribe((update) => {
  if (update.kind !== "upsert") return;
  const { id: agentId, workspaceId, labels } = update.agent;
  const identifier = labels?.["linear.issue"];
  pills.get(agentId)?.();
  pills.delete(agentId);
  if (!identifier || !workspaceId) return;
  pills.set(
    agentId,
    client.addComposerPill({
      id: "linear",
      workspaceId,
      agentId,
      button: {
        title: `Linear ${identifier}`,
        icon: "CircleDot",
        label: identifier,
        behavior: {
          kind: "menu",
          items: [
            {
              kind: "item",
              id: "view",
              title: "View issue",
              icon: "CircleDot",
              behavior: {
                kind: "action",
                onPress() {
                  client.openPanel("issues", { workspaceId });
                },
              },
            },
            {
              kind: "item",
              id: "open",
              title: "Open in Linear",
              icon: "ExternalLink",
              behavior: {
                kind: "action",
                async onPress() {
                  const url = labels?.["linear.url"];
                  if (url) await openExternal(url);
                },
              },
            },
            { kind: "separator", id: "write-divider" },
            {
              kind: "item",
              id: "comment",
              title: "Comment on issue",
              icon: "MessageSquare",
              behavior: { kind: "popover", Content: CommentPopover },
            },
            {
              kind: "item",
              id: "move",
              title: "Move to…",
              icon: "ArrowRight",
              behavior: { kind: "popover", Content: MoveStatePopover },
            },
            {
              kind: "item",
              id: "link",
              title: "Link this branch",
              icon: "GitBranch",
              behavior: { kind: "popover", Content: LinkBranchPopover },
            },
          ],
        },
      },
    }),
  );
});
```

and return a cleanup that calls `unsubscribe()` and every remover in `pills`.

`CommentPopover`, `MoveStatePopover`, and `LinkBranchPopover` live in `client/writeback.tsx`
alongside `TurnOffer`. Each receives `PluginButtonContentProps` — which carries `theme`, `host`,
`layout`, the `{ context: "agent", workspaceId, agentId }` target, and `close()` — and each may
use `useRpc`, `useAgent`, and `usePaseo`. Read the issue binding with
`useAgent(agentId, (a) => a.labels)`; do not add an RPC to discover it.

- `CommentPopover` — a `TextInput` plus a **Post** press calling `commentRpc`, then `close()`.
- `MoveStatePopover` — `listStatesRpc` for the agent's team, one `Pressable` per state calling
  `moveStateRpc`, then `close()`. Read `teamId` from a `getIssueRpc` call keyed by the
  identifier label, cached with TanStack Query.
- `LinkBranchPopover` — shows the workspace's branch, with a **Link** press calling
  `linkBranchRpc` using the workspace's forge URL if one is known and the branch name otherwise.

Every one of these mutates only inside its press handler.

- [ ] **Step 4: Register hooks on the server**

In `index.server.ts`, add `const removeHooks = registerHooks(server);` and return
`() => { removeHooks(); }`.

- [ ] **Step 5: Typecheck, reload, and watch a real turn**

```bash
npm run typecheck && npm test
paseo plugin reload linear && paseo plugin ls
```

Start work on an issue, send the agent a short prompt, and **watch the turn end live** — not
just the completed history. Expected: the offer row appears once, pressing **Comment on issue**
opens a prefilled editable modal, and the comment only reaches Linear on **Post**. Send a
second prompt: expected, the row is replaced, not duplicated.

- [ ] **Step 6: Commit**

```bash
git add client/writeback.tsx server/hooks.ts index.client.tsx index.server.ts
git commit -m "feat: turn-end offer row, comment write-back, and per-agent composer pill"
```

---

### Task 16: Linear custom coding tool and final verification

**Files:**
- Create: `bin/paseo-linear-open`
- Modify: `README.md`

**Interfaces:**
- Consumes: the `paseo` CLI.
- Produces: an executable a user registers in Linear → Settings → Code & reviews as a custom
  coding tool.

- [ ] **Step 1: Write the launcher**

`bin/paseo-linear-open`:

```bash
#!/bin/bash
# Register this in Linear: Settings → Code & reviews → External tools → custom tool.
# Linear passes the issue identifier as the first argument.
set -euo pipefail

identifier="${1:?usage: paseo-linear-open <ISSUE-IDENTIFIER>}"

exec paseo run \
  --background \
  --title "$identifier" \
  --label "linear.issue=$identifier" \
  "Start work on Linear issue $identifier. Use the Linear plugin's issue context."
```

Make it executable:

```bash
chmod +x bin/paseo-linear-open
```

- [ ] **Step 2: Verify it runs**

Run: `./bin/paseo-linear-open ENG-14236`
Expected: an agent is created with the label set. Confirm with `paseo ls --json`. If your
`paseo` is not on `PATH` for GUI-launched processes, note the absolute path
`/Users/sholodak/.local/bin/paseo` in the README rather than assuming `PATH`.

- [ ] **Step 3: Document setup in the README**

Add a **Launch from Linear** section covering: making the script executable, registering it as
a custom coding tool in Linear → Settings → Code & reviews, that Linear's "on open in coding
tool, move issue to started status" preference handles the state transition, and that
`Cmd Option .` is the shortcut.

Add a **Note on the `paseo://` URL scheme** stating it is registered by the app but its routes
are unverified, so the script is the supported path today.

- [ ] **Step 4: Full verification pass**

```bash
npm run typecheck
npm test
rg -n "document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=" client/
paseo plugin reload linear
paseo plugin ls
paseo plugin logs linear | tail -30
```

Expected: typecheck clean, all tests pass, the audit shows only `client/web.ts`, the plugin is
`running` with no error, and the logs contain no API key.

Then walk every surface once on a wide window and once compact, in a light and a dark theme:
attachment picker, settings screen, sidebar surface, workspace panel, `/linear`, Command Center
item, composer pill, and the turn-end offer row.

- [ ] **Step 5: Commit**

```bash
git add bin/paseo-linear-open README.md
git commit -m "feat: Linear custom coding tool launcher and setup documentation"
```

---

## Notes for the executor

**Where this plan is deliberately uncertain.** Four places carry an inline "Verify while
implementing" note: the settings accessor on `PluginHandlerContext` (Task 10), the required
`config.provider` value (Task 13), the surface-vs-panel prop split (Task 14), and the assistant
timeline item discriminator (Task 15). In each case, read the real type in
`node_modules/@getpaseo/plugin/dist` and follow it. Do not cast, do not `any`, and do not
invent a shape — if the type contradicts this plan, the type wins and the plan is wrong.

**Client components have no unit tests, and that is deliberate.** There is no React Native test
renderer in this project and adding one would cost more than it returns for presentational
code. Client tasks are gated on typecheck, the mobile-audit grep, and the explicit manual
checks listed in their steps. All logic worth testing was pushed into `shared/` and `server/`,
which are covered.

**Every task ends with the plugin still installable.** If a task leaves `paseo plugin ls` in a
failed state, stop and read `paseo plugin logs linear` before starting the next one.
