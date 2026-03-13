import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./core/load-config.js";
import { MysqlPoolRegistry } from "./core/mysql-pool.js";
import { EnvironmentRegistry } from "./core/registry.js";
import { registerTools } from "./server/register-tools.js";

export interface VmysqlRuntime {
  config: Awaited<ReturnType<typeof loadConfig>>;
  registry: EnvironmentRegistry;
  pools: MysqlPoolRegistry;
  server: McpServer;
}

export const createRuntime = async (): Promise<VmysqlRuntime> => {
  const config = await loadConfig();
  const registry = new EnvironmentRegistry(config);
  const pools = new MysqlPoolRegistry(registry);

  const server = new McpServer(
    {
      name: config.server.name,
      version: config.server.version,
    },
    {
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
    },
  );

  registerTools(server, registry, pools);

  return {
    config,
    registry,
    pools,
    server,
  };
};

export const startServer = async (): Promise<VmysqlRuntime> => {
  const runtime = await createRuntime();
  const transport = new StdioServerTransport();
  await runtime.server.connect(transport);
  return runtime;
};

export const runCli = async (): Promise<void> => {
  await startServer();
};
