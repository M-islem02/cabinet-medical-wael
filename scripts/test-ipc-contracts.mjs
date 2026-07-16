import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  ipcError,
  registerContractHandlers,
  registerValidatedContractHandler
} from '../src/main/ipc/contract-handler.js';

const require = createRequire(import.meta.url);
const { IPC_CONTRACTS, buildPreloadModules, validateContractArgs } = require('../src/shared/ipc-contracts.cjs');
const root = path.resolve(import.meta.dirname, '..');

function readJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readJavaScriptFiles(fullPath);
    return /\.(?:c?js|mjs)$/.test(entry.name) ? [fs.readFileSync(fullPath, 'utf8')] : [];
  });
}

function matches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function contractChannels() {
  return Object.values(IPC_CONTRACTS).flatMap((methods) =>
    Object.values(methods).map((definition) => definition.channel)
  );
}

function registeredContractChannels(source) {
  const starts = [...source.matchAll(/registerContractHandlers\(ipcMain,\s*'([^']+)',\s*\{/g)];
  const channels = [];
  for (let index = 0; index < starts.length; index += 1) {
    const namespace = starts[index][1];
    const end = starts[index + 1]?.index ?? source.length;
    const block = source.slice(starts[index].index, end);
    for (const method of matches(block, /^\s{4}async\s+(\w+)\s*\(/gm)) {
      const definition = IPC_CONTRACTS[namespace]?.[method];
      assert.ok(definition, `Unknown registered contract method: ${namespace}.${method}`);
      channels.push(definition.channel);
    }
  }
  return channels;
}

function registeredValidatedChannels(source) {
  return [...source.matchAll(
    /registerValidatedContractHandler\(ipcMain,\s*'([^']+)',\s*'([^']+)'/g
  )].map((match) => {
    const definition = IPC_CONTRACTS[match[1]]?.[match[2]];
    assert.ok(definition, `Unknown validated contract method: ${match[1]}.${match[2]}`);
    return definition.channel;
  });
}

const preloadSource = fs.readFileSync(path.join(root, 'src/preload/preload.cjs'), 'utf8');
const bundledPreloadSource = fs.readFileSync(path.join(root, 'src/preload/preload-bundled.cjs'), 'utf8');
const mainSources = readJavaScriptFiles(path.join(root, 'src/main')).join('\n');
const contractHandlerSource = fs.readFileSync(
  path.join(root, 'src/main/handlers/clinical-rehabilitation-ipc-handler.js'),
  'utf8'
);

const exposed = new Set([
  ...matches(preloadSource, /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g),
  ...contractChannels()
]);
const registered = new Set([
  ...matches(mainSources, /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g),
  ...registeredValidatedChannels(mainSources),
  ...registeredContractChannels(contractHandlerSource)
]);
const missing = [...exposed].filter((channel) => !registered.has(channel)).sort();
assert.deepEqual(missing, [], `Preload channels without a main handler:\n${missing.join('\n')}`);
assert.equal(
  bundledPreloadSource.includes("require('../shared/ipc-contracts.cjs')"),
  false,
  'Sandboxed preload must not require local modules at runtime'
);
assert.match(bundledPreloadSource, /contextBridge\.exposeInMainWorld\('api'/);

const invoked = [];
const generated = buildPreloadModules({
  invoke(channel, ...args) {
    invoked.push({ channel, args });
    return Promise.resolve({ success: true, data: {} });
  }
});
await generated.clinicalExam.getById('exam-1');
assert.deepEqual(invoked[0], { channel: 'clinicalExam:getById', args: ['exam-1'] });
await generated.statistics.getAdvancedOverview({ period: 'month' });
assert.deepEqual(invoked[1], {
  channel: 'statistics:getAdvancedOverview',
  args: [{ period: 'month' }]
});

const invalidDefinition = IPC_CONTRACTS.patientEquipment.create;
assert.equal(validateContractArgs(invalidDefinition, [{}]).valid, false);
const invalidResponse = await generated.patientEquipment.create({});
assert.equal(invalidResponse.success, false);
assert.equal(invalidResponse.error.code, 'INVALID_ARGUMENT');
assert.equal(invoked.length, 2, 'Invalid preload arguments must not reach ipcRenderer.invoke');

const handlers = new Map();
const ipcMainMock = { handle(channel, handler) { handlers.set(channel, handler); } };
let databaseCalls = 0;
registerContractHandlers(ipcMainMock, 'clinicalExam', {
  async getById(id) {
    databaseCalls += 1;
    if (id === 'missing') ipcError('CLINICAL_EXAM_NOT_FOUND', 'Clinical examination not found');
    return { id };
  }
});
const contractedHandler = handlers.get('clinicalExam:getById');
assert.deepEqual(await contractedHandler({}, ''), {
  success: false,
  error: { code: 'INVALID_ARGUMENT', message: 'Invalid argument: id', field: 'id' }
});
assert.equal(databaseCalls, 0, 'Invalid main-process arguments must not reach the implementation');
assert.deepEqual(await contractedHandler({}, 'exam-1'), { success: true, data: { id: 'exam-1' } });
assert.deepEqual(await contractedHandler({}, 'missing'), {
  success: false,
  error: { code: 'CLINICAL_EXAM_NOT_FOUND', message: 'Clinical examination not found' }
});

registerValidatedContractHandler(ipcMainMock, 'plans', 'getById', async (_event, id) => ({ success: true, id }));
const compatibleHandler = handlers.get('plans:getById');
assert.equal((await compatibleHandler({}, '')).error.code, 'INVALID_ARGUMENT');
assert.deepEqual(await compatibleHandler({}, 'plan-1'), { success: true, id: 'plan-1' });

assert.equal(
  /\btreatmentPlan\s*:|\btreatmentSession\s*:/.test(preloadSource),
  false,
  'Obsolete treatmentPlan/treatmentSession preload APIs must stay removed'
);
assert.equal(
  [...registered].some((channel) => /^(?:treatmentPlan|treatmentSession):/.test(channel)),
  false,
  'Obsolete treatmentPlan/treatmentSession main handlers must stay removed'
);

console.log(`PASS IPC contract parity (${exposed.size} exposed channels, ${registered.size} registered handlers)`);
console.log('PASS generated preload routing and argument validation');
console.log('PASS standardized contract responses and main-process validation');
