/*
 * electron-builder afterPack hook. It changes only the staged app.asar, never
 * the repository source. Keeping the scope to licensing/integrity avoids UI
 * performance regressions and makes supportable builds possible.
 */
const asar = require('@electron/asar');
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const SENSITIVE_FILES = [
  'src/main/license-manager.js',
  'src/main/security/integrity-service.js'
];

module.exports = async function obfuscateSecurityModules(context) {
  const asarPath = path.join(context.appOutDir, 'resources', 'app.asar');
  try {
    await fs.access(asarPath);
  } catch (_) {
    console.warn('[security] app.asar not found; sensitive modules were not obfuscated');
    return;
  }

  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'medcareso-asar-'));
  try {
    asar.extractAll(asarPath, temporaryDir);
    for (const relativePath of SENSITIVE_FILES) {
      const target = path.join(temporaryDir, relativePath);
      const source = await fs.readFile(target, 'utf8');
      const obfuscated = JavaScriptObfuscator.obfuscate(source, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.55,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.12,
        stringArray: true,
        stringArrayRotate: true,
        stringArrayThreshold: 0.8,
        selfDefending: true,
        disableConsoleOutput: true,
        sourceMap: false,
        target: 'node',
        identifierNamesGenerator: 'hexadecimal'
      }).getObfuscatedCode();
      await fs.writeFile(target, obfuscated, 'utf8');
    }
    const replacement = `${asarPath}.secured`;
    await asar.createPackage(temporaryDir, replacement);
    await fs.rename(replacement, asarPath);
    console.log('[security] Sensitive licence modules obfuscated in app.asar');
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
};
