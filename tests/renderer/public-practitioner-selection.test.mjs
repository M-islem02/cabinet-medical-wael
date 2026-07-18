import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePublicPractitioner } from '../../src/main/services/public-practitioner-selection.js';

const doctorA = { id: 'doctor-a', name: 'Dr A' };
const doctorB = { id: 'doctor-b', name: 'Dr B' };

test('public portal selects the only doctor automatically', () => {
  const result = resolvePublicPractitioner([doctorA]);

  assert.equal(result.selectedPractitioner, doctorA);
  assert.equal(result.selectionRequired, false);
});

test('public portal requires the patient to choose when several doctors are available', () => {
  const result = resolvePublicPractitioner([doctorA, doctorB]);

  assert.equal(result.selectedPractitioner, null);
  assert.equal(result.selectionRequired, true);
});

test('public portal accepts a valid doctor selected by the patient', () => {
  const result = resolvePublicPractitioner([doctorA, doctorB], doctorB.id);

  assert.equal(result.selectedPractitioner, doctorB);
  assert.equal(result.selectionRequired, false);
});
