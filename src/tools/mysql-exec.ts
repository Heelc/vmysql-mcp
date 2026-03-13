import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ExecStructuredContent } from "../types.js";
import { MysqlPoolRegistry } from "../core/mysql-pool.js";
import { resolveExecContext } from "../core/policy.js";
import { buildErrorResult, buildSuccessResult } from "../core/result-builder.js";
import { EnvironmentRegistry } from "../core/registry.js";

const buildMysqlExecOutputSchema = () =>
  z.object({
    ok: z.literal(true),
    env: z.string(),
    database: z.string().optional(),
    statementType: z.enum(["insert", "update", "delete", "replace", "ddl"]),
    affectedRows: z.number().int().nonnegative(),
    insertId: z.number().int().nonnegative().optional(),
    warnings: z.number().int().nonnegative().optional(),
    elapsedMs: z.number().int().nonnegative(),
  });

export const mysqlExecInputSchema = z.object({
  env: z.string().min(1).describe("Environment alias such as dev or stg."),
  database: z
    .string()
    .min(1)
    .optional()
    .describe("Optional database override allowed by server policy."),
  sql: z.string().min(1).describe("One SQL statement allowed by server policy."),
  timeoutMs: z
    .number()
    .int()
    .min(100)
    .optional()
    .describe("Requested execution timeout in milliseconds."),
});

export const registerMysqlExecTool = (
  server: McpServer,
  registry: EnvironmentRegistry,
  pools: MysqlPoolRegistry,
) => {
  server.registerTool(
    "mysql_exec",
    {
      title: "MySQL Exec",
      description: "Run one write-capable SQL statement on a configured MySQL environment if policy allows.",
      annotations: {
        title: "MySQL Exec",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: mysqlExecInputSchema,
      outputSchema: buildMysqlExecOutputSchema(),
    },
    async (args) => {
      try {
        const context = resolveExecContext(registry, args);
        const startedAt = Date.now();
        const result = await pools.exec(
          context.env,
          context.normalizedSql,
          context.database,
          context.timeoutMs,
        );
        const structuredContent: ExecStructuredContent = {
          ok: true,
          env: context.env,
          database: context.database,
          statementType: context.statementType,
          affectedRows: result.affectedRows,
          insertId: result.insertId,
          warnings: result.warnings,
          elapsedMs: Date.now() - startedAt,
        };

        return buildSuccessResult(
          `Affected ${structuredContent.affectedRows} row(s) in ${context.env}${context.database ? `.${context.database}` : ""} in ${structuredContent.elapsedMs}ms.`,
          structuredContent,
        );
      } catch (error) {
        return buildErrorResult(error, args.env);
      }
    },
  );
};
