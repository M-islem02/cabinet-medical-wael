import test from 'node:test';
import assert from 'node:assert/strict';

test('core renderer modules import without undeclared browser globals', async () => {
  const modules = await Promise.all([
    import('../../src/renderer/core/api/api-client.js'),
    import('../../src/renderer/core/package/package-config-service.js'),
    import('../../src/renderer/core/specialty/specialty-loader.js'),
    import('../../src/renderer/core/state/app-state.js'),
    import('../../src/renderer/features/patients/patient-search.js'),
    import('../../src/renderer/features/appointments/appointment-state.js'),
    import('../../src/renderer/features/inventory/inventory-pagination.js')
  ]);
  assert.equal(modules.length, 7);
});
