import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MysqlPoolRegistry } from "../core/mysql-pool.js";
import { EnvironmentRegistry } from "../core/registry.js";
import { registerMysqlExecTool } from "../tools/mysql-exec.js";
import { registerMysqlQueryTool } from "../tools/mysql-query.js";

export const registerTools = (
  server: McpServer,
  registry: EnvironmentRegistry,
  pools: MysqlPoolRegistry,
) => {
  registerMysqlQueryTool(server, registry, pools);
  registerMysqlExecTool(server, registry, pools);
};
