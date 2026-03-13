# vmysql-mcp

轻量级多环境 MySQL MCP Server。  
A lightweight multi-environment MySQL MCP server.

## 简介 Overview

`vmysql-mcp` 是一个基于 stdio 的 MySQL MCP Server，目标不是做一个“大而全”的数据库平台，而是提供一个足够轻、足够稳、足够可控的数据库工具入口。

它当前只暴露两个工具：

- `mysql_query`：只读查询工具 / read-only query tool
- `mysql_exec`：受策略约束的执行工具 / policy-gated execution tool

核心设计原则：

- 多环境通过 `env` 路由，而不是为每个环境暴露一套工具。
- 默认安全收口，尤其是生产环境建议只暴露只读别名。
- 配置文件只保存非敏感策略，连接串通过环境变量注入。
- 尽量减少 MCP tool surface，降低 Agent 加载 token 成本。

## 功能特性 Features

- 使用 `stdio` 传输 / uses stdio transport
- 仅暴露两个工具：`mysql_query`、`mysql_exec`
- 通过环境别名访问多个 MySQL 环境，例如 `dev`、`stg`、`prod_ro`
- 具备服务端策略控制：读写限制、DDL 限制、超时、行数限制、数据库白名单
- 返回简短文本摘要和结构化 JSON 结果 / short text + structured JSON output
- `mysql_query` 支持顶层 `WITH ... SELECT`
- `mysql_exec` 继续拒绝顶层 `WITH` 语句

## 运行要求 Requirements

- Node.js 20+
- 推荐 MySQL 8.0+
- 如果你使用已发布 npm 包，不需要自己准备 `dist` 目录
- 如果你使用源码方式接入，需要先执行 `npm run build`

## 安装与使用 Installation and Usage

如果你只是使用这个 MCP 给 Agent 自动拉起，推荐走 npm 包模式，而不是先手动 `npm run start`。

If you only want an MCP client or agent to auto-start this server, prefer the npm package flow instead of manually running `npm run start`.

### 方式一：使用已发布 npm 包 Recommended for Agents

发布到 npm 后，推荐通过下面任一方式使用。

前提条件：

- 你的运行环境已经提供 `VMYSQL_CONFIG_PATH`
- 你的运行环境已经提供对应环境的 `MYSQL_*_DSN`

否则，`vmysql-mcp` 会因为缺少配置文件或连接串而启动失败。

After publishing to npm, this is the recommended path for agent-managed auto-start.

Prerequisites:

- `VMYSQL_CONFIG_PATH` must point to a valid config file, or the current working directory must already contain `vmysql.config.json`
- Required `MYSQL_*_DSN` environment variables must already be available

```bash
npx -y vmysql-mcp
```

或者全局安装：

```bash
npm install -g vmysql-mcp
vmysql-mcp
```

这类模式最适合 `OpenCode`、`Codex`、`Claude Code` 这类会自动拉起本地 stdio MCP 进程的 Agent。

### 方式二：本地源码开发 Local Source Development

```bash
npm install
npm run build
```

## 服务端配置 Server Configuration

`vmysql-mcp` 的运行配置来自一个 JSON 文件，默认读取当前工作目录下的 `vmysql.config.json`。如果你想指定其他路径，可以通过环境变量 `VMYSQL_CONFIG_PATH` 覆盖。

`vmysql-mcp` reads runtime config from a JSON file. By default it uses `vmysql.config.json` in the current working directory. Override it with `VMYSQL_CONFIG_PATH` if needed.

示例 `vmysql.config.json`：

```json
{
  "server": {
    "name": "vmysql-mcp",
    "version": "0.1.0",
    "defaultQueryLimit": 200,
    "hardMaxRows": 1000,
    "defaultTimeoutMs": 10000,
    "hardTimeoutMs": 30000,
    "maxConnectionsPerEnv": 2,
    "logLevel": "info"
  },
  "environments": {
    "dev": {
      "dsnEnv": "MYSQL_DEV_DSN",
      "defaultDatabase": "app_dev",
      "allowedDatabases": ["app_dev"],
      "readOnly": false,
      "allowWrite": true,
      "allowDDL": false,
      "maxRows": 500,
      "defaultTimeoutMs": 10000
    },
    "prod_ro": {
      "dsnEnv": "MYSQL_PROD_RO_DSN",
      "defaultDatabase": "app",
      "allowedDatabases": ["app"],
      "readOnly": true,
      "allowWrite": false,
      "allowDDL": false,
      "maxRows": 200,
      "defaultTimeoutMs": 8000
    }
  }
}
```

示例环境变量：

```bash
export MYSQL_DEV_DSN='mysql://user:password@127.0.0.1:3306/app_dev'
export MYSQL_PROD_RO_DSN='mysql://readonly:password@127.0.0.1:3306/app'
```

注意：

- 不要把密码直接提交到 `vmysql.config.json`。
- 配置文件里应该只保留 `dsnEnv` 这样的引用名。
- 如果密码包含 `@`、`:`、`/` 等字符，请先做 URL 编码再拼接 DSN。

Do not commit secrets into `vmysql.config.json`. Store only secret references such as `dsnEnv` names.

如果你是在本地开发这个项目，或者想手动调试进程启动行为，可以再执行：

If you are developing this project locally or want to debug the server process manually, you can then run:

## 本地手动启动 Run Locally

```bash
npm run start
```

## 工具说明 Tools

### `mysql_query`

执行单条只读 SQL。  
Run one read-only SQL statement.

支持范围：

- `SELECT`
- `SHOW`
- `DESCRIBE`
- `EXPLAIN`
- 顶层 `WITH ... SELECT`

行为约束：

- 拒绝多语句 SQL / rejects multi-statement SQL
- 应用服务端行数限制和超时 / applies server-side row limits and timeout
- 按环境策略限制数据库访问范围 / enforces database allowlist per environment

### `mysql_exec`

在环境策略允许的前提下执行单条写操作 SQL。  
Run one write-capable SQL statement when environment policy allows it.

支持范围：

- `INSERT`
- `UPDATE`
- `DELETE`
- `REPLACE`
- 可选 `DDL`，前提是环境显式允许

行为约束：

- 拒绝顶层 `WITH` 语句 / rejects top-level `WITH`
- 对只读环境直接拒绝写入 / rejects writes against read-only environments such as `prod_ro`

## 主流 Agent 安装与配置 Agent Setup

下面分成两类：

- 已发布 npm 包接入方式 / published npm package flow
- 本地源码调试方式 / local source debugging flow

如果你是正常接入 Agent，优先用 npm 包方式；只有在本地开发或排障时，才需要用 `node dist/index.js` 这种源码路径方式。

For normal agent integration, prefer the npm package flow. Use direct `node dist/index.js` only for local development or debugging.

下面的例子统一假设：

- 项目目录 / project path: `/absolute/path/to/vmysql-mcp`
- 构建后 CLI 入口 / built CLI entry: `/absolute/path/to/vmysql-mcp/dist/cli.js`
- 配置文件路径 / config path: `/absolute/path/to/vmysql-mcp/vmysql.config.json`

请使用绝对路径。相对路径是最容易制造“我这里能跑、别人那里不行”假象的坑。

Use absolute paths. Relative paths are a common source of fake “works on my machine” setups.

### OpenCode

OpenCode 使用 `opencode.json` 或 `opencode.jsonc`。

推荐配置（npm 包方式）/ recommended package-based example:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "vmysql": {
      "type": "local",
      "enabled": true,
      "command": [
        "npx",
        "-y",
        "vmysql-mcp"
      ],
      "environment": {
        "VMYSQL_CONFIG_PATH": "/absolute/path/to/vmysql-mcp/vmysql.config.json",
        "MYSQL_DEV_DSN": "mysql://user:password@127.0.0.1:3306/app_dev",
        "MYSQL_PROD_RO_DSN": "mysql://readonly:password@127.0.0.1:3306/app"
      },
      "timeout": 10000
    }
  }
}
```

本地源码调试示例 / local source debugging example:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "vmysql": {
      "type": "local",
      "enabled": true,
      "command": [
        "node",
        "/absolute/path/to/vmysql-mcp/dist/cli.js"
      ],
      "environment": {
        "VMYSQL_CONFIG_PATH": "/absolute/path/to/vmysql-mcp/vmysql.config.json",
        "MYSQL_DEV_DSN": "mysql://user:password@127.0.0.1:3306/app_dev",
        "MYSQL_PROD_RO_DSN": "mysql://readonly:password@127.0.0.1:3306/app"
      },
      "timeout": 10000
    }
  }
}
```

建议：

- 如果这是项目专用数据库工具，优先写项目配置。
- 如果 OpenCode 支持 secret reference，优先用 secret reference，不要把密码明文塞进去。
- 配好之后可用 `opencode mcp list` 验证。

### Codex

Codex CLI 使用 `~/.codex/config.toml`。

推荐配置（npm 包方式）：

```toml
[mcp_servers.vmysql]
command = "npx"
args = ["-y", "vmysql-mcp"]

[mcp_servers.vmysql.env]
VMYSQL_CONFIG_PATH = "/absolute/path/to/vmysql-mcp/vmysql.config.json"
MYSQL_DEV_DSN = "mysql://user:password@127.0.0.1:3306/app_dev"
MYSQL_PROD_RO_DSN = "mysql://readonly:password@127.0.0.1:3306/app"
```

本地源码调试示例：

```toml
[mcp_servers.vmysql]
command = "node"
args = ["/absolute/path/to/vmysql-mcp/dist/cli.js"]

[mcp_servers.vmysql.env]
VMYSQL_CONFIG_PATH = "/absolute/path/to/vmysql-mcp/vmysql.config.json"
MYSQL_DEV_DSN = "mysql://user:password@127.0.0.1:3306/app_dev"
MYSQL_PROD_RO_DSN = "mysql://readonly:password@127.0.0.1:3306/app"
```

如果包已经发布，也可以先用命令注册，再手动补环境变量：

```bash
codex mcp add vmysql --command npx --args -y vmysql-mcp
```

建议：

- 修改 `~/.codex/config.toml` 后重启 Codex。
- 入口路径和配置路径都用绝对路径。
- 如果这是共享环境，不要把生产凭据写进共享 dotfile。

### Claude Code

Claude Code 支持命令行注册，也支持配置文件方式。

CLI 示例（npm 包方式）：

```bash
claude mcp add vmysql -- npx -y vmysql-mcp
```

项目级 `.mcp.json` 示例（npm 包方式）：

```json
{
  "mcpServers": {
    "vmysql": {
      "command": "npx",
      "args": [
        "-y",
        "vmysql-mcp"
      ],
      "env": {
        "VMYSQL_CONFIG_PATH": "/absolute/path/to/vmysql-mcp/vmysql.config.json",
        "MYSQL_DEV_DSN": "mysql://user:password@127.0.0.1:3306/app_dev",
        "MYSQL_PROD_RO_DSN": "mysql://readonly:password@127.0.0.1:3306/app"
      }
    }
  }
}
```

本地源码调试 CLI 示例：

```bash
claude mcp add vmysql -- node /absolute/path/to/vmysql-mcp/dist/cli.js
```

本地源码调试 `.mcp.json` 示例：

```json
{
  "mcpServers": {
    "vmysql": {
      "command": "node",
      "args": [
        "/absolute/path/to/vmysql-mcp/dist/cli.js"
      ],
      "env": {
        "VMYSQL_CONFIG_PATH": "/absolute/path/to/vmysql-mcp/vmysql.config.json",
        "MYSQL_DEV_DSN": "mysql://user:password@127.0.0.1:3306/app_dev",
        "MYSQL_PROD_RO_DSN": "mysql://readonly:password@127.0.0.1:3306/app"
      }
    }
  }
}
```

建议：

- `.mcp.json` 适合项目共享。
- `~/.claude.json` 适合个人全局配置。
- `.claude/settings.local.json` 适合本地私有配置，不应提交到 Git。
- 手动改完配置后重启 Claude Code。
- 不要把 Claude Code 配置和 Claude Desktop 配置混为一谈，它们不是同一套东西。

## 安全建议 Recommended Security Practices

- 生产环境优先使用只读别名，例如 `prod_ro`
- 不要把 DSN、密码、token 提交到仓库
- 写环境和读环境分开配置
- 除非确实需要，否则保持 `allowDDL = false`
- 如果凭据曾经出现在聊天、日志、截图或错误配置里，请直接轮换，不要自我安慰说“应该没人看见”

## 自检与冒烟测试 Smoke Test

在 MCP 客户端接入完成后，建议先跑一条最简单的只读查询：

```sql
SELECT DATABASE() AS db, 1 AS ok
```

再跑一条只读 CTE，确认 `WITH ... SELECT` 支持正常：

```sql
WITH cte AS (SELECT DATABASE() AS db, 1 AS ok)
SELECT * FROM cte
```

如果你还想验证策略边界，可以尝试对只读环境发起写操作，确认它被拒绝。
