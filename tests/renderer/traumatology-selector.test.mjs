import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

test('traumatology module defines interactive skeletal selector and renders anatomical regions', () => {
  assert.doesNotThrow(() => {
    execSync('node --check src/renderer/js/modules/traumatology.js', { stdio: 'pipe' });
  }, 'traumatology.js must pass node syntax check');
  const traumatoCode = fs.readFileSync(path.resolve('src/renderer/js/modules/traumatology.js'), 'utf8');

  // Verify renderUpperBoneQuickSelectorHTML is defined
  assert.ok(traumatoCode.includes('function renderUpperBoneQuickSelectorHTML()'), 'renderUpperBoneQuickSelectorHTML must be defined');

  // Verify it is inserted into the traumato workspace DOM
  assert.ok(traumatoCode.includes('id="traumato-upper-quick-bar"'), 'traumato-upper-quick-bar container must be present in chart main');

  // Verify anatomical regions exist in the quick selector
  assert.ok(traumatoCode.includes('upper_limb') && traumatoCode.includes('lower_limb') && traumatoCode.includes('spine'), 'All major anatomical regions must be rendered');

  // Verify lesion styling and clickability
  assert.ok(traumatoCode.includes('has-lesion'), 'has-lesion class must be provided for affected bones');
  assert.ok(traumatoCode.includes('onclick="selectTraumatoBone('), 'Each bone button must have onclick selectTraumatoBone');
});

test('traumatology module handles interactive anterior and posterior views', () => {
  const traumatoCode = fs.readFileSync(path.resolve('src/renderer/js/modules/traumatology.js'), 'utf8');

  // Verify view toggling exists
  assert.ok(traumatoCode.includes('function setTraumatoView('), 'setTraumatoView must be defined');
  assert.ok(traumatoCode.includes('id="traumato-svg-anterior"'), 'SVG anterior view must be present');
  assert.ok(traumatoCode.includes('id="traumato-svg-posterior"'), 'SVG posterior view must be present');

  // Verify medical lesion statuses
  assert.ok(traumatoCode.includes('fracture_closed:'), 'LESION_STATUSES must define fracture_closed');
  assert.ok(traumatoCode.includes('fracture_open:'), 'LESION_STATUSES must define fracture_open');
  assert.ok(traumatoCode.includes('sprain:'), 'LESION_STATUSES must define sprain');
  assert.ok(traumatoCode.includes('dislocation:'), 'LESION_STATUSES must define dislocation');
  assert.ok(traumatoCode.includes('cast:'), 'LESION_STATUSES must define cast');
  assert.ok(traumatoCode.includes('osteosynthesis:'), 'LESION_STATUSES must define osteosynthesis');
});

test('traumatology module handles trauma clinical evaluation with EVA, Cauchoix, and immobilization', () => {
  const traumatoCode = fs.readFileSync(path.resolve('src/renderer/js/modules/traumatology.js'), 'utf8');

  // Verify clinical exam methods
  assert.ok(traumatoCode.includes('function updateEvaDisplay('), 'updateEvaDisplay must be defined');
  assert.ok(traumatoCode.includes('function saveTraumatoClinicalRecord()'), 'saveTraumatoClinicalRecord must be defined');
  assert.ok(traumatoCode.includes('function printTraumatoReport()'), 'printTraumatoReport must be defined');

  // Verify clinical form elements
  assert.ok(traumatoCode.includes('trauma-eva-slider'), 'EVA slider must be present in form');
  assert.ok(traumatoCode.includes('trauma-cauchoix'), 'Cauchoix-Duparc selector must be present');
  assert.ok(traumatoCode.includes('trauma-neuro-vasc'), 'Neuro-vascular evaluation input must be present');
  assert.ok(traumatoCode.includes('trauma-loges'), 'Compartment syndrome evaluation must be present');
});

test('navbar includes traumatology and clinical modules in cabinet', () => {
  const indexHtml = fs.readFileSync(path.resolve('src/renderer/index.html'), 'utf8');

  // Verify traumatology and clinical sections are present in navbar
  assert.ok(indexHtml.includes('data-section="traumatology"'), 'Navbar must include traumatology');
  assert.ok(indexHtml.includes('data-section="cardiology"'), 'Navbar must include cardiology');
  assert.ok(indexHtml.includes('data-section="orl"'), 'Navbar must include orl');
  assert.ok(indexHtml.includes('data-section="rehabilitation"'), 'Navbar must include rehabilitation');
  assert.ok(indexHtml.includes('data-section="dentistry"'), 'Navbar must include dentistry');
  assert.ok(indexHtml.includes('data-section="operations"'), 'Navbar must include operations');
  assert.ok(indexHtml.includes('data-section="consultations"'), 'Navbar must include consultations');

  // Verify treatment-plans is not duplicated
  const treatmentPlanMatches = indexHtml.match(/data-section="treatment-plans"/g);
  assert.equal(treatmentPlanMatches ? treatmentPlanMatches.length : 0, 1, 'Navbar must only have one treatment-plans link');
});

test('traumato dossier has character-by-character search bar with 10 results', () => {
  const indexHtml = fs.readFileSync(path.resolve('src/renderer/index.html'), 'utf8');
  const traumatoCode = fs.readFileSync(path.resolve('src/renderer/js/modules/traumatology.js'), 'utf8');

  // Verify traumato patient picker has search bar with dropdown and synced selector
  assert.ok(indexHtml.includes('id="traumato-patient-search-bar"'), 'traumato-patient-search-bar must be in HTML');
  assert.ok(indexHtml.includes('id="traumato-patient-search-dropdown"'), 'traumato-patient-search-dropdown must be in HTML');
  assert.ok(indexHtml.includes('id="traumato-patient-selector"'), 'traumato-patient-selector must be present');

  // Verify traumatology.js handles character-by-character search and caps results to 10
  assert.ok(traumatoCode.includes('handleTraumatoPatientSearchInput'), 'handleTraumatoPatientSearchInput must be defined');
  assert.ok(traumatoCode.includes('performTraumatoPatientSearch'), 'performTraumatoPatientSearch must be defined');
  assert.ok(traumatoCode.includes('matches.slice(0, 10)') || traumatoCode.includes('patients.slice(0, 10)'), 'Results must be capped to 10 per search');
  assert.ok(traumatoCode.includes('stripTraumatoSearchAccents'), 'traumatology.js must strip accents for character search');
});
