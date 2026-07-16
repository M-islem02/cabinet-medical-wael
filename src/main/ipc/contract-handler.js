import contractModule from '../../shared/ipc-contracts.cjs';

const { getContract, validateContractArgs } = contractModule;

export class IpcContractError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'IpcContractError';
    this.code = code;
    this.details = details;
  }
}

export function ipcError(code, message, details) {
  throw new IpcContractError(code, message, details);
}

export function ipcSuccess(data = {}) {
  return { success: true, data: data ?? {} };
}

function normalizeSuccess(result) {
  if (result && result.success === true && Object.hasOwn(result, 'data')) return result;
  return ipcSuccess(result ?? {});
}

function normalizeFailure(error) {
  const code = error?.code && typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR';
  const normalized = {
    code,
    message: error?.message || 'Unexpected IPC error'
  };
  if (error?.details !== undefined) normalized.details = error.details;
  return { success: false, error: normalized };
}

/**
 * Register handlers by namespace/method from the shared preload contract.
 * Arguments are validated before the implementation can touch the database.
 */
export function registerContractHandlers(ipcMain, namespace, implementations) {
  for (const [methodName, implementation] of Object.entries(implementations)) {
    const definition = getContract(namespace, methodName);
    if (!definition) throw new Error(`Unknown IPC contract: ${namespace}.${methodName}`);
    if (typeof implementation !== 'function') throw new TypeError(`Invalid IPC implementation: ${namespace}.${methodName}`);

    ipcMain.handle(definition.channel, async (_event, ...args) => {
      const validation = validateContractArgs(definition, args);
      if (!validation.valid) return { success: false, error: validation.error };
      try {
        return normalizeSuccess(await implementation(...args));
      } catch (error) {
        console.error(`[IPC ${definition.channel}] ${error?.message || error}`);
        return normalizeFailure(error);
      }
    });
  }
}

/**
 * Contract-backed registration for existing handlers whose legacy success shape
 * is still consumed by the current renderer. Invalid arguments always use the
 * standard error envelope and never reach the implementation.
 */
export function registerValidatedContractHandler(ipcMain, namespace, methodName, implementation) {
  const definition = getContract(namespace, methodName);
  if (!definition) throw new Error(`Unknown IPC contract: ${namespace}.${methodName}`);
  if (typeof implementation !== 'function') throw new TypeError(`Invalid IPC implementation: ${namespace}.${methodName}`);

  ipcMain.handle(definition.channel, async (event, ...args) => {
    const validation = validateContractArgs(definition, args);
    if (!validation.valid) return { success: false, error: validation.error };
    return implementation(event, ...args);
  });
}
