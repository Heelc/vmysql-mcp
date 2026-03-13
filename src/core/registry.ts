import type { AppConfig, EnvironmentConfig } from "../types.js";
import { createError } from "./errors.js";

export class EnvironmentRegistry {
  public constructor(private readonly config: AppConfig) {}

  public getServerConfig() {
    return this.config.server;
  }

  public getEnvironment(env: string): EnvironmentConfig {
    const environment = this.config.environments[env];
    if (!environment) {
      throw createError(
        "ENV_NOT_FOUND",
        `Unknown environment '${env}'. Check vmysql.config.json.`,
        false,
      );
    }

    return environment;
  }

  public getDsn(env: string): string {
    const environment = this.getEnvironment(env);
    const dsn = process.env[environment.dsnEnv];
    if (!dsn) {
      throw createError(
        "ENV_DSN_MISSING",
        `Missing DSN for environment '${env}'. Set ${environment.dsnEnv}.`,
        false,
      );
    }

    return dsn;
  }
}
