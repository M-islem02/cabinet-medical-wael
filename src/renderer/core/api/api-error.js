export class ApiError extends Error {
  constructor(operation, code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ApiError';
    this.operation = operation;
    this.code = code || 'API_ERROR';
    this.details = options.details;
  }

  static fromResponse(operation, response) {
    const backendError = response?.error;
    return new ApiError(
      operation,
      typeof backendError === 'object' ? backendError.code : 'BACKEND_ERROR',
      (typeof backendError === 'object' ? backendError.message : backendError) || `Operation failed: ${operation}`,
      { details: typeof backendError === 'object' ? backendError.details : undefined }
    );
  }

  static fromUnknown(operation, error) {
    if (error instanceof ApiError) return error;
    return new ApiError(operation, error?.code || 'IPC_ERROR', error?.message || `IPC operation failed: ${operation}`, {
      cause: error
    });
  }
}
