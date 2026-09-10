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
