import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { QueryStructuredContent } from "../types.js";
import { buildLimitedReadSql, MysqlPoolRegistry } from "../core/mysql-pool.js";
import { resolveQueryContext } from "../core/policy.js";
import { buildErrorResult, buildSuccessResult } from "../core/result-builder.js";
import { EnvironmentRegistry } from "../core/registry.js";

const buildMysqlQueryOutputSchema = (hardMaxRows: number) =>
  z.object({
    ok: z.literal(true),
    env: z.string(),
    database: z.string().optional(),
    statementType: z.enum(["select", "show", "describe", "explain"]),
    rowCount: z.number().int().nonnegative(),
    rows: z.array(z.record(z.string(), z.unknown())).max(hardMaxRows),
    columns: z.array(
      z.object({
        name: z.string(),
        mysqlType: z.string().optional(),
      }),
    ),
    truncated: z.boolean(),
    limitApplied: z.number().int().positive().max(hardMaxRows),
    elapsedMs: z.number().int().nonnegative(),
  });

export const mysqlQueryInputSchema = z.object({
  env: z.string().min(1).describe("Environment alias such as dev, stg, or prod_ro."),
  database: z
    .string()
    .min(1)
    .optional()
    .describe("Optional database override allowed by server policy."),
  sql: z.string().min(1).describe("One read-only SQL statement."),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Requested row limit. The server may clamp it."),
  timeoutMs: z
    .number()
    .int()
    .min(100)
    .optional()
    .describe("Requested execution timeout in milliseconds."),
});

export const registerMysqlQueryTool = (
  server: McpServer,
  registry: EnvironmentRegistry,
  pools: MysqlPoolRegistry,
) => {
  const serverConfig = registry.getServerConfig();

  server.registerTool(
    "mysql_query",
    {
      title: "MySQL Query",
      description: "Run one read-only SQL statement on a configured MySQL environment.",
      annotations: {
        title: "MySQL Query",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: mysqlQueryInputSchema,
      outputSchema: buildMysqlQueryOutputSchema(serverConfig.hardMaxRows),
    },
    async (args) => {
      try {
        const context = resolveQueryContext(registry, args);
        const startedAt = Date.now();
        const result = await pools.query(
          context.env,
          buildLimitedReadSql(
            context.statementType,
            context.normalizedSql,
            context.limitApplied,
          ),
          context.database,
          context.timeoutMs,
        );
        const limitedRows = result.rows.slice(0, context.limitApplied);
        const structuredContent: QueryStructuredContent = {
          ok: true,
          env: context.env,
          database: context.database,
          statementType: context.statementType,
          rowCount: limitedRows.length,
          rows: limitedRows,
          columns: result.fields.map((field) => ({
            name: field.name,
            mysqlType: String(field.columnType),
          })),
          truncated: result.rows.length > context.limitApplied,
          limitApplied: context.limitApplied,
          elapsedMs: Date.now() - startedAt,
        };

        return buildSuccessResult(
          `Returned ${structuredContent.rowCount} row(s) from ${context.env}${context.database ? `.${context.database}` : ""} in ${structuredContent.elapsedMs}ms.`,
          structuredContent,
        );
      } catch (error) {
        return buildErrorResult(error, args.env);
      }
    },
  );
};
