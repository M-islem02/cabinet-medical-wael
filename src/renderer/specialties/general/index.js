let initialized = false;
export async function initialize() { if (!initialized) initialized = true; }
export function destroy() { initialized = false; }
