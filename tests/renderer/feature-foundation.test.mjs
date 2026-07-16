import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatestPatientSearch } from '../../src/renderer/features/patients/patient-search.js';
import { appointmentState } from '../../src/renderer/features/appointments/appointment-state.js';
import { inventoryState } from '../../src/renderer/features/inventory/inventory-state.js';

test('patient search ignores stale responses', async () => {
  const resolvers = new Map();
  const search = createLatestPatientSearch((term) => new Promise((resolve) => resolvers.set(term, resolve)));
  const first = search('A');
  const second = search('Ahmed');
  resolvers.get('Ahmed')(['Ahmed']);
  assert.deepEqual(await second, { current: true, result: ['Ahmed'] });
  resolvers.get('A')(['Ali']);
  assert.deepEqual(await first, { current: false, result: null });
});

test('appointment and inventory lifecycle initialize only once', () => {
  appointmentState.reset();
  inventoryState.reset();
  assert.equal(appointmentState.initialize(), true);
  assert.equal(appointmentState.initialize(), false);
  assert.equal(inventoryState.initialize(), true);
  assert.equal(inventoryState.initialize(), false);
});
