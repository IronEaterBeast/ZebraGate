import type { ZebraGateErrorCode } from "@zebragate/shared";

export class ZebraGateApiError extends Error {
  public readonly code: ZebraGateErrorCode;
  public readonly statusCode: number;

  constructor(code: ZebraGateErrorCode, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function isZebraGateApiError(error: unknown): error is ZebraGateApiError {
  return error instanceof ZebraGateApiError;
}
