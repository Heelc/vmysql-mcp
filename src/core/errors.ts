export class VmysqlError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  public constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "VmysqlError";
    this.code = code;
    this.retryable = retryable;
  }
}

export const createError = (
  code: string,
  message: string,
  retryable = false,
): VmysqlError => new VmysqlError(code, message, retryable);

export const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};
