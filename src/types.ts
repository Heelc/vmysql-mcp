export type LogLevel = "debug" | "info" | "warn" | "error";

export type StatementType =
  | "select"
  | "show"
  | "describe"
  | "explain"
  | "insert"
  | "update"
  | "delete"
  | "replace"
  | "ddl"
  | "unknown";

export interface EnvironmentConfig {
  dsnEnv: string;
  defaultDatabase?: string;
  allowedDatabases: string[];
  readOnly: boolean;
  allowWrite: boolean;
  allowDDL: boolean;
  maxRows: number;
  defaultTimeoutMs?: number;
}

export interface ServerConfig {
  name: string;
  version: string;
  defaultQueryLimit: number;
  hardMaxRows: number;
  defaultTimeoutMs: number;
  hardTimeoutMs: number;
  maxConnectionsPerEnv: number;
  logLevel: LogLevel;
}

export interface AppConfig {
  server: ServerConfig;
  environments: Record<string, EnvironmentConfig>;
}

export interface QueryArgs {
  env: string;
  database?: string;
  sql: string;
  limit?: number;
  timeoutMs?: number;
}

export interface ExecArgs {
  env: string;
  database?: string;
  sql: string;
  timeoutMs?: number;
}

export interface QueryRowColumn {
  name: string;
  mysqlType?: string;
}

export interface QueryStructuredContent extends Record<string, unknown> {
  ok: true;
  env: string;
  database?: string;
  statementType: "select" | "show" | "describe" | "explain";
  rowCount: number;
  rows: Record<string, unknown>[];
  columns: QueryRowColumn[];
  truncated: boolean;
  limitApplied: number;
  elapsedMs: number;
}

export interface ExecStructuredContent extends Record<string, unknown> {
  ok: true;
  env: string;
  database?: string;
  statementType: "insert" | "update" | "delete" | "replace" | "ddl";
  affectedRows: number;
  insertId?: number;
  warnings?: number;
  elapsedMs: number;
}

export interface ErrorStructuredContent extends Record<string, unknown> {
  ok: false;
  env?: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface SqlInspection {
  normalizedSql: string;
  firstKeyword: string;
  mainKeyword?: string;
  statementType: StatementType;
  hasMultipleStatements: boolean;
  hasLeadingWithClause: boolean;
}

export interface ResolvedExecutionContext {
  env: string;
  database?: string;
  environment: EnvironmentConfig;
  timeoutMs: number;
}
