import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type {
  ErrorStructuredContent,
  ExecStructuredContent,
  QueryStructuredContent,
} from "../types.js";
import { VmysqlError, toErrorMessage } from "./errors.js";

export const buildSuccessResult = (
  text: string,
  structuredContent: QueryStructuredContent | ExecStructuredContent,
): CallToolResult => ({
  content: [{ type: "text", text }],
  structuredContent: { ...structuredContent },
});

export const buildErrorResult = (
  error: unknown,
  env?: string,
): CallToolResult => {
  const structuredContent: ErrorStructuredContent =
    error instanceof VmysqlError
      ? {
          ok: false,
          env,
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
          },
        }
      : {
          ok: false,
          env,
          error: {
            code: "INTERNAL_ERROR",
            message: toErrorMessage(error),
            retryable: false,
          },
        };

  return {
    isError: true,
    content: [{ type: "text", text: structuredContent.error.message }],
    structuredContent: { ...structuredContent },
  };
};
