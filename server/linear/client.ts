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
