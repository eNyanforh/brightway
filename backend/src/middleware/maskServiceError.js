/**
 * Preserve public API error boundaries while exposing minimal, non-sensitive
 * information about unexpected database/adapter failures in local development.
 *
 * Do not log err.message, stack, meta, SQL, URLs or request data: PostgreSQL
 * errors may include credentials, personal data or query parameters.
 */
const diagnostic = value => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(value) ? value : undefined;
const code = value => typeof value === "string" && /^[A-Z0-9_]{2,20}$/.test(value) ? value : undefined;

export function maskUnexpectedServiceError(error, publicMessage, operation, {
  development = process.env.NODE_ENV === "development",
  logger = console.error,
} = {}) {
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599) return error;
  if (development) {
    logger("Unexpected backend service failure:", {
      operation,
      originalName: diagnostic(error?.name),
      prismaCode: code(error?.code),
      causeCode: code(error?.cause?.code),
      adapterKind: diagnostic(error?.meta?.driverAdapterError?.cause?.kind),
    });
  }
  return Object.assign(new Error(publicMessage), { status: 503 });
}
