import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

test('kine-staff.js script is included in index.html and passes syntax check', () => {
  const indexHtml = fs.readFileSync(path.resolve('src/renderer/index.html'), 'utf8');
  assert.ok(indexHtml.includes('<script src="js/modules/kine-staff.js"></script>'), 'kine-staff.js must be included in index.html');
  assert.doesNotThrow(() => {
    execSync('node --check src/renderer/js/modules/kine-staff.js', { stdio: 'pipe' });
  }, 'kine-staff.js must pass node syntax check');
});

test('cardiology and rehabilitation sections have 3-state navigation views in index.html', () => {
  const indexHtml = fs.readFileSync(path.resolve('src/renderer/index.html'), 'utf8');

  // Cardiology 3-state views
  assert.ok(indexHtml.includes('id="cardio-empty-view"'), 'cardio-empty-view must exist');
  assert.ok(indexHtml.includes('id="cardio-history-view"'), 'cardio-history-view must exist');
  assert.ok(indexHtml.includes('id="cardio-workspace-view"'), 'cardio-workspace-view must exist');
  assert.ok(indexHtml.includes('id="cardio-history-list"'), 'cardio-history-list container must exist');

  // Rehabilitation 3-state views
  assert.ok(indexHtml.includes('id="rehab-empty-view"'), 'rehab-empty-view must exist');
  assert.ok(indexHtml.includes('id="rehab-history-view"'), 'rehab-history-view must exist');
  assert.ok(indexHtml.includes('id="rehab-workspace-view"'), 'rehab-workspace-view must exist');
  assert.ok(indexHtml.includes('id="rehab-history-list"'), 'rehab-history-list container must exist');

  // Workspaces initially hidden until patient is selected and report is created or edited
  assert.ok(indexHtml.includes('id="cardio-workspace-view" class="orl-workspace-layout cardio-workspace-layout orl-view-hidden"'), 'cardio-workspace-view must be hidden by default');
  assert.ok(indexHtml.includes('id="rehab-workspace-view" class="orl-workspace-layout rehab-workspace-layout orl-view-hidden"'), 'rehab-workspace-view must be hidden by default');
});

test('cardiology.js exports 3-state view functions and deselect button logic', () => {
  assert.doesNotThrow(() => {
    execSync('node --check src/renderer/js/modules/cardiology.js', { stdio: 'pipe' });
  }, 'cardiology.js must pass node syntax check');

  const cardioCode = fs.readFileSync(path.resolve('src/renderer/js/modules/cardiology.js'), 'utf8');
  assert.ok(cardioCode.includes('export function showCardioEmptyView()'), 'showCardioEmptyView must be exported');
  assert.ok(cardioCode.includes('export function showCardioHistoryView()'), 'showCardioHistoryView must be exported');
  assert.ok(cardioCode.includes('export function showCardioWorkspaceView()'), 'showCardioWorkspaceView must be exported');
  assert.ok(cardioCode.includes('export function deselectCardioPatient('), 'deselectCardioPatient must be exported');
  assert.ok(cardioCode.includes('export function renderCardioHistoryList()'), 'renderCardioHistoryList must be exported');
  assert.ok(cardioCode.includes('window.showCardioEmptyView = showCardioEmptyView;'), 'showCardioEmptyView attached to window');
  assert.ok(cardioCode.includes('window.showCardioHistoryView = showCardioHistoryView;'), 'showCardioHistoryView attached to window');
  assert.ok(cardioCode.includes('export function updateCardioToolbar()'), 'updateCardioToolbar must be exported');
  assert.ok(cardioCode.includes('window.updateCardioToolbar = updateCardioToolbar;'), 'updateCardioToolbar attached to window');
});

test('rehabilitation.js exports 3-state view functions and deselect button logic', () => {
  assert.doesNotThrow(() => {
    execSync('node --check src/renderer/js/modules/rehabilitation.js', { stdio: 'pipe' });
  }, 'rehabilitation.js must pass node syntax check');

  const rehabCode = fs.readFileSync(path.resolve('src/renderer/js/modules/rehabilitation.js'), 'utf8');
  assert.ok(rehabCode.includes('export function showRehabEmptyView()'), 'showRehabEmptyView must be exported');
  assert.ok(rehabCode.includes('export function showRehabHistoryView()'), 'showRehabHistoryView must be exported');
  assert.ok(rehabCode.includes('export function showRehabWorkspaceView()'), 'showRehabWorkspaceView must be exported');
  assert.ok(rehabCode.includes('export function deselectRehabPatient('), 'deselectRehabPatient must be exported');
  assert.ok(rehabCode.includes('export function renderRehabHistoryList()'), 'renderRehabHistoryList must be exported');
  assert.ok(rehabCode.includes('window.showRehabEmptyView = showRehabEmptyView;'), 'showRehabEmptyView attached to window');
  assert.ok(rehabCode.includes('window.showRehabHistoryView = showRehabHistoryView;'), 'showRehabHistoryView attached to window');
  assert.ok(rehabCode.includes('window.showRehabWorkspaceView = showRehabWorkspaceView;'), 'showRehabWorkspaceView attached to window');
  assert.ok(rehabCode.includes('export function updateRehabToolbar()'), 'updateRehabToolbar must be exported');
  assert.ok(rehabCode.includes('window.updateRehabToolbar = updateRehabToolbar;'), 'updateRehabToolbar attached to window');
});
