import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePackageConfig } from '../../src/renderer/core/package/package-config-service.js';

test('normalizes all enabled specialties and aliases', () => {
  const config = normalizePackageConfig({ enabledSpecialties: ['general', 'dentist'], activeSpecialty: 'dentist' });
  assert.deepEqual(config.enabledSpecialties, ['general', 'dentistry']);
  assert.equal(config.activeSpecialty, 'dentistry');
});

test('supports an explicitly empty specialty package', () => {
  const config = normalizePackageConfig({ enabledSpecialties: [], activeSpecialty: 'dentistry' });
  assert.deepEqual(config.enabledSpecialties, []);
  assert.equal(config.activeSpecialty, null);
});

test('preserves all-enabled defaults when old configuration is missing fields', () => {
  const config = normalizePackageConfig({});
  assert(config.enabledSpecialties.includes('dentistry'));
  assert.equal(config.features.inventory, true);
  assert.equal(config.features.calendar, true);
});

test('preserves null raw configuration for the legacy navigation compatibility path', () => {
  const config = normalizePackageConfig(null);
  assert.equal(config.raw, null);
  assert.equal(config.features.inventory, true);
  assert.equal(config.features.calendar, true);
});

test('maps old feature flags and repairs a disabled or invalid active specialty', () => {
  const legacy = normalizePackageConfig({ featureDentistry: 0, activeSpecialty: 'dentistry' });
  assert.deepEqual(legacy.enabledSpecialties, ['general']);
  assert.equal(legacy.activeSpecialty, 'general');
  assert.equal(normalizePackageConfig({ enabledSpecialties: ['dentistry'], activeSpecialty: 'unknown' }).activeSpecialty, 'dentistry');
});
