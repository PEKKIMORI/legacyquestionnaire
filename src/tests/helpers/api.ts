import type { NextApiHandler } from "next";
import { createMocks, type RequestMethod } from "node-mocks-http";

/**
 * Call a Next.js API handler with mock request/response objects.
 * Returns the status code and response data.
 */
export async function callApiHandler(
  handler: NextApiHandler,
  options: {
    method?: RequestMethod;
    body?: Record<string, unknown>;
    query?: Record<string, string>;
  } = {},
): Promise<{ status: number; data: unknown; headers: Record<string, unknown> }> {
  const { method = "GET", body, query } = options;

  const { req, res } = createMocks({
    method,
    body,
    query,
  });

  await handler(req as any, res as any);

  return {
    status: res._getStatusCode(),
    data: (() => {
      const raw = res._getData();
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      }
      return raw;
    })(),
    headers: Object.fromEntries(
      Object.entries(res._getHeaders()).map(([k, v]) => [k.toLowerCase(), v]),
    ),
  };
}
