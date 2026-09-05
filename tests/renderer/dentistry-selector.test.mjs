import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

test('dentistry module defines upper tooth quick selector and renders all 32 teeth', () => {
  assert.doesNotThrow(() => {
    execSync('node --check src/renderer/js/modules/dentistry.js', { stdio: 'pipe' });
  }, 'dentistry.js must pass node syntax check');
  const dentistryCode = fs.readFileSync(path.resolve('src/renderer/js/modules/dentistry.js'), 'utf8');

  // Verify renderUpperToothQuickSelectorHTML is defined
  assert.ok(dentistryCode.includes('function renderUpperToothQuickSelectorHTML()'), 'renderUpperToothQuickSelectorHTML must be defined');

  // Verify it is inserted into the dental workspace DOM
  assert.ok(dentistryCode.includes('id="dental-upper-tooth-bar"'), 'dental-upper-tooth-bar container must be present in chart main');

  // Verify FDI quadrants exist in the quick selector
  assert.ok(dentistryCode.includes('q1') && dentistryCode.includes('q2') && dentistryCode.includes('q3') && dentistryCode.includes('q4'), 'All 4 quadrants must be rendered');

  // Verify absent tooth styling and clickability
  assert.ok(dentistryCode.includes('is-absent'), 'is-absent class must be provided for missing/extracted teeth');
  assert.ok(dentistryCode.includes('onclick="selectDentalTooth('), 'Each tooth button must have onclick selectDentalTooth');
});

test('dental-3d keeps absent and extracted teeth visible as translucent ghost meshes for selection', () => {
  const dental3dCode = fs.readFileSync(path.resolve('src/renderer/js/modules/dental-3d.js'), 'utf8');

  // Verify absent teeth are not hidden with visible = false
  assert.ok(!dental3dCode.includes("mesh.visible = false;\n    return;"), 'mesh.visible = false must not be used to hide absent teeth');

  // Verify transparent ghost material styling exists for missing & extraction
  assert.ok(dental3dCode.includes('missing: {'), 'CLINICAL_STATUS_STYLES must define missing');
  assert.ok(dental3dCode.includes('extraction: {'), 'CLINICAL_STATUS_STYLES must define extraction');
  assert.ok(dental3dCode.includes('mesh.material.transparent = isAbsent'), 'Transparency must be toggled for absent teeth');
  assert.ok(dental3dCode.includes('mesh.visible = true'), 'Meshes must remain visible for raycasting');
});

test('dentistry module handles historical consultation mode directly in 3D and 2D without modal popup', () => {
  const dentistryCode = fs.readFileSync(path.resolve('src/renderer/js/modules/dentistry.js'), 'utf8');

  // Verify renderHistoricalBannerHTML exists and offers returning to current schema
  assert.ok(dentistryCode.includes('function renderHistoricalBannerHTML()'), 'renderHistoricalBannerHTML must be defined');
  assert.ok(dentistryCode.includes('onclick="showCurrentDentalSchema()"'), 'Banner must allow returning to live schema');

  // Verify showDentalHistoricalSchema updates chart directly in-place with historical teeth data
  assert.ok(dentistryCode.includes('updateDental3DData(activeTeethData'), '3D WebGL data must receive activeTeethData');
  assert.ok(dentistryCode.includes('showCurrentDentalSchema'), 'showCurrentDentalSchema must be defined to reset historical mode');

  // Verify no modal popup is created in showDentalHistoricalSchema
  assert.ok(!dentistryCode.includes('id="dental-historical-modal"'), 'showDentalHistoricalSchema must not inject blocking modal into body');
});

test('navbar excludes consultations, prescriptions, sick-leaves, expenses, and duplicate treatment-plans', () => {
  const indexHtml = fs.readFileSync(path.resolve('src/renderer/index.html'), 'utf8');

  // Verify removed nav items are not present
  assert.ok(!indexHtml.includes('data-section="consultations"'), 'Navbar must not include consultations');
  assert.ok(!indexHtml.includes('data-section="prescriptions"'), 'Navbar must not include prescriptions');
  assert.ok(!indexHtml.includes('data-section="sick-leaves"'), 'Navbar must not include sick-leaves');
  assert.ok(!indexHtml.includes('data-section="expenses"'), 'Navbar must not include expenses');

  // Verify treatment-plans is not duplicated
  const treatmentPlanMatches = indexHtml.match(/data-section="treatment-plans"/g);
  assert.equal(treatmentPlanMatches ? treatmentPlanMatches.length : 0, 1, 'Navbar must only have one treatment-plans link');
});

test('globals logo resolution checks both app and cabinet logos and refreshes logo', () => {
  const globalsCode = fs.readFileSync(path.resolve('src/renderer/js/modules/globals.js'), 'utf8');

  assert.ok(globalsCode.includes('cachedSettings.cabinetLogoDataUrl'), 'Logo getter must check cabinetLogoDataUrl');
  assert.ok(globalsCode.includes('cachedSettings.appLogoDataUrl'), 'Logo getter must check appLogoDataUrl');
  assert.ok(globalsCode.includes('refreshAppBrandLogo();'), 'ensureSettingsLoaded must refresh app brand logo');
  assert.ok(globalsCode.includes('function toggleDentalFdiGuide()'), 'globals must define toggleDentalFdiGuide');
});

test('sidebar brand does not contain text title and dental dossier has character-by-character search bar with 10 results', () => {
  const indexHtml = fs.readFileSync(path.resolve('src/renderer/index.html'), 'utf8');
  const dentistryCode = fs.readFileSync(path.resolve('src/renderer/js/modules/dentistry.js'), 'utf8');
  const patientHandlerCode = fs.readFileSync(path.resolve('src/main/handlers/patient-handler.js'), 'utf8');

  // Verify sidebar-brand-wrapper has no h2 title
  const brandWrapperMatch = indexHtml.match(/<div class="sidebar-brand-wrapper logo">([\s\S]*?)<\/div>/);
  assert.ok(brandWrapperMatch, 'sidebar-brand-wrapper must be present');
  assert.ok(!brandWrapperMatch[1].includes('<h2>'), 'sidebar-brand-wrapper must not have h2 title');

  // Verify dental patient picker has single search bar with dropdown and synced selector
  assert.ok(indexHtml.includes('id="dental-patient-search-bar"'), 'dental-patient-search-bar must be in HTML');
  assert.ok(indexHtml.includes('id="dental-patient-search-dropdown"'), 'dental-patient-search-dropdown must be in HTML');
  assert.ok(indexHtml.includes('id="dental-patient-selector"'), 'dental-patient-selector must be present');

  // Verify dentistry.js handles character-by-character search and caps results to 10
  assert.ok(dentistryCode.includes('handleDentalPatientSearchInput'), 'handleDentalPatientSearchInput must be defined');
  assert.ok(dentistryCode.includes('performDentalPatientSearch'), 'performDentalPatientSearch must be defined');
  assert.ok(dentistryCode.includes('matches.slice(0, 10)') || dentistryCode.includes('patients.slice(0, 10)'), 'Results must be capped to 10 per search');
  assert.ok(dentistryCode.includes('stripDentalSearchAccents'), 'dentistry.js must strip accents for character search');

  // Verify patient handler does not generate translate(lower(?)) which causes PostgreSQL type inference errors
  assert.ok(!patientHandlerCode.includes("accentInsensitiveSql('?')"), 'patient-handler must not wrap parameters in translate(lower(?))');
  assert.ok(patientHandlerCode.includes('stripSearchAccents'), 'patient-handler must normalize search parameters with stripSearchAccents');
});



