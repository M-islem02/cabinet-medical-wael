import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePackageConfig } from '../../src/renderer/core/package/package-config-service.js';

test('normalizes all enabled specialties and aliases', () => {
  const config = normalizePackageConfig({ enabledSpecialties: ['general', 'mpr', 'dentistry', 'cardiology'], activeSpecialty: 'mpr' });
  assert.deepEqual(config.enabledSpecialties, ['general', 'rehabilitation', 'dentistry', 'cardiology']);
  assert.equal(config.activeSpecialty, 'rehabilitation');
});

test('supports an explicitly empty specialty package', () => {
  const config = normalizePackageConfig({ enabledSpecialties: [], activeSpecialty: 'cardiology' });
  assert.deepEqual(config.enabledSpecialties, []);
  assert.equal(config.activeSpecialty, null);
});

test('preserves all-enabled defaults when old configuration is missing fields', () => {
  const config = normalizePackageConfig({});
  assert(config.enabledSpecialties.includes('rehabilitation'));
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
  const legacy = normalizePackageConfig({ featureRehabilitation: 1, featureDentistry: 0, featureCardiology: 0, activeSpecialty: 'dentistry' });
  assert.deepEqual(legacy.enabledSpecialties, ['general', 'rehabilitation']);
  assert.equal(legacy.activeSpecialty, 'general');
  assert.equal(normalizePackageConfig({ enabledSpecialties: ['cardiology'], activeSpecialty: 'unknown' }).activeSpecialty, 'cardiology');
});
