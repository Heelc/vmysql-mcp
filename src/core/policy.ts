import type {
  EnvironmentConfig,
  ExecArgs,
  QueryArgs,
  ResolvedExecutionContext,
  StatementType,
} from "../types.js";
import { createError } from "./errors.js";
import { EnvironmentRegistry } from "./registry.js";
import { extractReferencedDatabases, inspectSql } from "./sql-classifier.js";

const READ_ONLY_TYPES: StatementType[] = ["select", "show", "describe", "explain"];
const WRITE_TYPES: StatementType[] = ["insert", "update", "delete", "replace"];

const isReadOnlyType = (
  statementType: StatementType,
): statementType is "select" | "show" | "describe" | "explain" =>
  READ_ONLY_TYPES.includes(statementType);

const isWriteType = (
  statementType: StatementType,
): statementType is "insert" | "update" | "delete" | "replace" =>
  WRITE_TYPES.includes(statementType);

const assertAllowedDatabase = (
  environment: EnvironmentConfig,
  database: string | undefined,
) => {
  if (!database) {
    return;
  }

  if (!environment.allowedDatabases.includes(database)) {
    throw createError(
      "DATABASE_NOT_ALLOWED",
      `Database '${database}' is not allowed for this environment.`,
      false,
    );
  }
};

const assertReferencedDatabasesAllowed = (
  environment: EnvironmentConfig,
  normalizedSql: string,
) => {
  const referencedDatabases = extractReferencedDatabases(normalizedSql);

  for (const referencedDatabase of referencedDatabases) {
    if (!environment.allowedDatabases.includes(referencedDatabase)) {
      throw createError(
        "DATABASE_NOT_ALLOWED",
        `Database '${referencedDatabase}' is not allowed for this environment.`,
        false,
      );
    }
  }
};

const resolveTimeout = (
  requestedTimeoutMs: number | undefined,
  envTimeoutMs: number | undefined,
  hardTimeoutMs: number,
  defaultTimeoutMs: number,
): number => {
  const base = requestedTimeoutMs ?? envTimeoutMs ?? defaultTimeoutMs;
  return Math.max(100, Math.min(base, hardTimeoutMs));
};

export const resolveQueryContext = (
  registry: EnvironmentRegistry,
  args: QueryArgs,
): ResolvedExecutionContext & {
  normalizedSql: string;
  statementType: "select" | "show" | "describe" | "explain";
  limitApplied: number;
} => {
  const environment = registry.getEnvironment(args.env);
  const inspection = inspectSql(args.sql);

  if (!inspection.normalizedSql) {
    throw createError("SQL_EMPTY", "SQL cannot be empty.", false);
  }
  if (inspection.hasMultipleStatements) {
    throw createError(
      "SQL_MULTI_STATEMENT",
      "Only one SQL statement is allowed per call.",
      false,
    );
  }
  if (inspection.hasLeadingWithClause && inspection.statementType !== "select") {
    throw createError(
      "SQL_NOT_READ_ONLY",
      "Only top-level WITH ... SELECT statements are allowed in mysql_query.",
      false,
    );
  }
  if (!isReadOnlyType(inspection.statementType)) {
    throw createError(
      "SQL_NOT_READ_ONLY",
      `Statement type '${inspection.mainKeyword || inspection.firstKeyword || "unknown"}' is not allowed in mysql_query.`,
      false,
    );
  }

  const database = args.database ?? environment.defaultDatabase;
  assertAllowedDatabase(environment, database);
  assertReferencedDatabasesAllowed(environment, inspection.normalizedSql);

  const serverConfig = registry.getServerConfig();
  const envMaxRows = Math.min(environment.maxRows, serverConfig.hardMaxRows);
  const requestedLimit = args.limit ?? serverConfig.defaultQueryLimit;
  const limitApplied = Math.max(1, Math.min(requestedLimit, envMaxRows));

  return {
    env: args.env,
    database,
    environment,
    timeoutMs: resolveTimeout(
      args.timeoutMs,
      environment.defaultTimeoutMs,
      serverConfig.hardTimeoutMs,
      serverConfig.defaultTimeoutMs,
    ),
    normalizedSql: inspection.normalizedSql,
    statementType: inspection.statementType,
    limitApplied,
  };
};

export const resolveExecContext = (
  registry: EnvironmentRegistry,
  args: ExecArgs,
): ResolvedExecutionContext & {
  normalizedSql: string;
  statementType: "insert" | "update" | "delete" | "replace" | "ddl";
} => {
  const environment = registry.getEnvironment(args.env);
  const inspection = inspectSql(args.sql);

  if (!inspection.normalizedSql) {
    throw createError("SQL_EMPTY", "SQL cannot be empty.", false);
  }
  if (inspection.hasMultipleStatements) {
    throw createError(
      "SQL_MULTI_STATEMENT",
      "Only one SQL statement is allowed per call.",
      false,
    );
  }

  if (inspection.hasLeadingWithClause) {
    throw createError(
      "SQL_NOT_ALLOWED",
      "Top-level WITH statements are not allowed in mysql_exec.",
      false,
    );
  }

  if (environment.readOnly || !environment.allowWrite) {
    throw createError(
      "WRITE_DISABLED",
      `Write statements are not allowed for environment '${args.env}'.`,
      false,
    );
  }

  if (!isWriteType(inspection.statementType) && inspection.statementType !== "ddl") {
    throw createError(
      "SQL_NOT_ALLOWED",
      `Statement type '${inspection.mainKeyword || inspection.firstKeyword || "unknown"}' is not allowed in mysql_exec.`,
      false,
    );
  }

  if (inspection.statementType === "ddl" && !environment.allowDDL) {
    throw createError(
      "DDL_DISABLED",
      `DDL statements are not allowed for environment '${args.env}'.`,
      false,
    );
  }

  const database = args.database ?? environment.defaultDatabase;
  assertAllowedDatabase(environment, database);
  assertReferencedDatabasesAllowed(environment, inspection.normalizedSql);

  const serverConfig = registry.getServerConfig();
  return {
    env: args.env,
    database,
    environment,
    timeoutMs: resolveTimeout(
      args.timeoutMs,
      environment.defaultTimeoutMs,
      serverConfig.hardTimeoutMs,
      serverConfig.defaultTimeoutMs,
    ),
    normalizedSql: inspection.normalizedSql,
    statementType: inspection.statementType,
  };
};
