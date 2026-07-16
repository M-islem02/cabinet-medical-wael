import test from 'node:test';
import assert from 'node:assert/strict';
import {
  destroyLoadedSpecialties,
  getLoadedSpecialtyIds,
  loadEnabledSpecialties,
  reconcileSpecialties
} from '../../src/renderer/core/specialty/specialty-loader.js';

test('specialty loader imports enabled modules once and never imports disabled modules', async () => {
  await destroyLoadedSpecialties();
  let enabledLoads = 0;
  let enabledInitializes = 0;
  let disabledLoads = 0;
  let destroys = 0;
  const availability = [];
  const registry = {
    testEnabled: {
      packageKey: 'testEnabled', navigationSectionIds: ['enabled-section'],
      loader: async () => ({ initialize: async () => { enabledInitializes += 1; }, destroy: async () => { destroys += 1; } })
    },
    testDisabled: {
      packageKey: 'testDisabled', navigationSectionIds: ['disabled-section'],
      loader: async () => { disabledLoads += 1; return {}; }
    }
  };
  registry.testEnabled.loader = async () => {
    enabledLoads += 1;
    return { initialize: async () => { enabledInitializes += 1; }, destroy: async () => { destroys += 1; } };
  };
  const options = { registry, setAvailability: (id, value) => availability.push([id, value]) };
  const config = { specialties: { testEnabled: true, testDisabled: false }, activeSpecialty: 'testEnabled' };
  await loadEnabledSpecialties(config, options);
  await loadEnabledSpecialties(config, options);
  assert.equal(enabledLoads, 1);
  assert.equal(enabledInitializes, 1);
  assert.equal(disabledLoads, 0);
  assert(availability.some(([id, value]) => id === 'disabled-section' && value === false));
  assert.deepEqual(getLoadedSpecialtyIds(), ['testEnabled']);

  await reconcileSpecialties({ specialties: { testEnabled: false, testDisabled: false } }, options);
  assert.equal(destroys, 1);
  assert.deepEqual(getLoadedSpecialtyIds(), []);
});

test('specialty loader reports active-specialty import failures', async () => {
  const registry = {
    broken: { packageKey: 'broken', navigationSectionIds: ['broken-section'], loader: async () => { throw new Error('broken import'); } }
  };
  await assert.rejects(
    loadEnabledSpecialties({ specialties: { broken: true }, activeSpecialty: 'broken' }, { registry, setAvailability() {} }),
    /broken import/
  );
});
