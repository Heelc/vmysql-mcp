#!/usr/bin/env node

import { runCli } from "./index.js";

runCli().catch((error) => {
  console.error("Fatal error starting vmysql-mcp:", error);
  process.exit(1);
});
