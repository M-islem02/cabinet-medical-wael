const debugEnabled = !globalThis.window?.location?.protocol?.startsWith('file');

export const logger = Object.freeze({
  debug(message, metadata) { if (debugEnabled) console.debug(message, metadata || ''); },
  info(message, metadata) { console.info(message, metadata || ''); },
  warn(message, metadata) { console.warn(message, metadata || ''); },
  error(message, metadata = {}) {
    const safeMetadata = metadata?.code ? { code: metadata.code } : {};
    console.error(message, safeMetadata);
  }
});
