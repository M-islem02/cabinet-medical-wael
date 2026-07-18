import { ApiError } from './api-error.js';

function withTimeout(promise, timeoutMs, operationName) {
  if (!timeoutMs) return promise;
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ApiError(operationName, 'API_TIMEOUT', `Operation timed out: ${operationName}`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

export async function invokeApi(operationName, operation, options = {}) {
  const { timeoutMs = 0, onLoadingChange, unwrap = true } = options;
  onLoadingChange?.(true);
  try {
    const response = await withTimeout(Promise.resolve().then(operation), timeoutMs, operationName);
    if (response?.success === false) throw ApiError.fromResponse(operationName, response);
    return unwrap && response && Object.hasOwn(response, 'data') ? response.data : response;
  } catch (error) {
    throw ApiError.fromUnknown(operationName, error);
  } finally {
    onLoadingChange?.(false);
  }
}

// Temporary adapter for migrated controllers that still render legacy envelopes.
export async function invokeLegacyApi(operationName, operation, options = {}) {
  const { onLoadingChange, timeoutMs = 0 } = options;
  onLoadingChange?.(true);
  try {
    return await withTimeout(Promise.resolve().then(operation), timeoutMs, operationName);
  } catch (error) {
    throw ApiError.fromUnknown(operationName, error);
  } finally {
    onLoadingChange?.(false);
  }
}
