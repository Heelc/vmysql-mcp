import mysql, {
  type FieldPacket,
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

import { createError } from "./errors.js";
import { EnvironmentRegistry } from "./registry.js";

interface QueryExecutionResult {
  rows: Record<string, unknown>[];
  fields: FieldPacket[];
}

interface ExecExecutionResult {
  affectedRows: number;
  insertId?: number;
  warnings?: number;
}

export class MysqlPoolRegistry {
  private readonly pools = new Map<string, Pool>();

  public constructor(private readonly registry: EnvironmentRegistry) {}

  public async query(
    env: string,
    sql: string,
    database: string | undefined,
    timeoutMs: number,
  ): Promise<QueryExecutionResult> {
    const pool = this.getPool(env);
    const connection = await pool.getConnection();
    try {
      if (database) {
        await connection.changeUser({ database });
      }
      const [rows, fields] = await connection.query<RowDataPacket[]>({
        sql,
        timeout: timeoutMs,
      });
      return {
        rows: rows.map((row) => ({ ...row })),
        fields,
      };
    } catch (error) {
      throw this.mapMysqlError(error);
    } finally {
      connection.release();
    }
  }

  public async exec(
    env: string,
    sql: string,
    database: string | undefined,
    timeoutMs: number,
  ): Promise<ExecExecutionResult> {
    const pool = this.getPool(env);
    const connection = await pool.getConnection();
    try {
      if (database) {
        await connection.changeUser({ database });
      }
      const [result] = await connection.query<ResultSetHeader>({
        sql,
        timeout: timeoutMs,
      });
      return {
        affectedRows: result.affectedRows,
        insertId: result.insertId === 0 ? undefined : result.insertId,
        warnings: result.warningStatus,
      };
    } catch (error) {
      throw this.mapMysqlError(error);
    } finally {
      connection.release();
    }
  }

  private getPool(env: string): Pool {
    const existing = this.pools.get(env);
    if (existing) {
      return existing;
    }

    const dsn = this.registry.getDsn(env);
    const serverConfig = this.registry.getServerConfig();
    const pool = mysql.createPool({
      uri: dsn,
      connectionLimit: serverConfig.maxConnectionsPerEnv,
      waitForConnections: true,
      queueLimit: 0,
      multipleStatements: false,
      namedPlaceholders: false,
    });

    this.pools.set(env, pool);
    return pool;
  }

  private mapMysqlError(error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = String(error.code);
      if (code === "ER_ACCESS_DENIED_ERROR") {
        return createError("MYSQL_AUTH_FAILED", "MySQL authentication failed.", false);
      }
      if (code === "PROTOCOL_CONNECTION_LOST" || code === "ECONNREFUSED") {
        return createError("MYSQL_CONNECTION_FAILED", "MySQL connection failed.", true);
      }
      return createError(
        "MYSQL_EXECUTION_FAILED",
        `MySQL error: ${code}`,
        false,
      );
    }

    return createError("MYSQL_EXECUTION_FAILED", "MySQL execution failed.", false);
  }
}

export const buildLimitedReadSql = (
  statementType: "select" | "show" | "describe" | "explain",
  sql: string,
  limitApplied: number,
): string => {
  if (statementType === "select") {
    return `SELECT * FROM (${sql}) AS _vmysql_subquery LIMIT ${limitApplied + 1}`;
  }

  if (statementType === "show") {
    return `${sql} LIMIT ${limitApplied + 1}`;
  }

  return sql;
};
