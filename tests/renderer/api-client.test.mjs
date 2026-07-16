import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeApi } from '../../src/renderer/core/api/api-client.js';
import { ApiError } from '../../src/renderer/core/api/api-error.js';

test('API client unwraps success responses', async () => {
  assert.deepEqual(await invokeApi('patients.getAll', async () => ({ success: true, data: [1, 2] })), [1, 2]);
});

test('API client preserves an explicit null data payload', async () => {
  assert.equal(await invokeApi('package.getConfig', async () => ({ success: true, data: null })), null);
});

test('API client preserves backend error codes', async () => {
  await assert.rejects(
    invokeApi('patients.getById', async () => ({ success: false, error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } })),
    (error) => error instanceof ApiError && error.code === 'PATIENT_NOT_FOUND' && error.message === 'Patient not found'
  );
});

test('API client normalizes thrown IPC errors and loading state', async () => {
  const loading = [];
  await assert.rejects(
    invokeApi('patients.create', async () => { throw Object.assign(new Error('IPC unavailable'), { code: 'IPC_DOWN' }); }, {
      onLoadingChange: (value) => loading.push(value)
    }),
    (error) => error.code === 'IPC_DOWN'
  );
  assert.deepEqual(loading, [true, false]);
});
