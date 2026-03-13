import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

import type { AppConfig } from "../types.js";
import { createError } from "./errors.js";

const environmentSchema = z.object({
  dsnEnv: z.string().min(1),
  defaultDatabase: z.string().min(1).optional(),
  allowedDatabases: z.array(z.string().min(1)).min(1),
  readOnly: z.boolean(),
  allowWrite: z.boolean(),
  allowDDL: z.boolean(),
  maxRows: z.number().int().positive(),
  defaultTimeoutMs: z.number().int().positive().optional(),
});

const configSchema = z.object({
  server: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    defaultQueryLimit: z.number().int().positive(),
    hardMaxRows: z.number().int().positive(),
    defaultTimeoutMs: z.number().int().positive(),
    hardTimeoutMs: z.number().int().positive(),
    maxConnectionsPerEnv: z.number().int().positive(),
    logLevel: z.enum(["debug", "info", "warn", "error"]),
  }),
  environments: z.record(z.string().min(1), environmentSchema).refine(
    (value) => Object.keys(value).length > 0,
    "At least one environment is required",
  ),
});

export const loadConfig = async (
  configPath = process.env.VMYSQL_CONFIG_PATH ?? "vmysql.config.json",
): Promise<AppConfig> => {
  const absolutePath = resolve(process.cwd(), configPath);

  let raw: string;
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch {
    throw createError(
      "CONFIG_NOT_FOUND",
      `Config file not found: ${absolutePath}`,
      false,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw createError(
      "CONFIG_INVALID_JSON",
      `Config file is not valid JSON: ${absolutePath}`,
      false,
    );
  }

  const parsed = configSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw createError(
      "CONFIG_INVALID",
      parsed.error.issues.map((issue) => issue.message).join("; "),
      false,
    );
  }

  return parsed.data;
};
