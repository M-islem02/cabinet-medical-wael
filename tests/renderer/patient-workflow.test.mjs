import test from 'node:test';
import assert from 'node:assert/strict';
import { determinePatientWorkflow } from '../../src/main/patient-workflow.js';

test('patient workflow keeps a doctor-only practice simple', () => {
  const workflow = determinePatientWorkflow({
    configuredDoctors: 1,
    configuredAssistants: 0,
    activeDoctors: 1,
    activeAssistants: 0
  });

  assert.equal(workflow.workflowMode, 'doctor_solo');
  assert.equal(workflow.globalDirectoryEnabled, false);
  assert.equal(workflow.assistantDoctorSelectorEnabled, false);
});

test('patient workflow keeps one doctor and assistants in one shared list', () => {
  const workflow = determinePatientWorkflow({
    configuredDoctors: 1,
    configuredAssistants: 1,
    activeDoctors: 1,
    activeAssistants: 1
  });

  assert.equal(workflow.workflowMode, 'doctor_assistant');
  assert.equal(workflow.globalDirectoryEnabled, false);
  assert.equal(workflow.assistantDoctorSelectorEnabled, false);
});

test('patient workflow enables separation and global directory only for a cabinet', () => {
  const workflow = determinePatientWorkflow({
    configuredDoctors: 3,
    configuredAssistants: 2,
    activeDoctors: 3,
    activeAssistants: 2
  });

  assert.equal(workflow.workflowMode, 'cabinet');
  assert.equal(workflow.globalDirectoryEnabled, true);
  assert.equal(workflow.assistantDoctorSelectorEnabled, true);
});

test('configured cabinet stays separated when one doctor is temporarily inactive', () => {
  const workflow = determinePatientWorkflow({
    configuredDoctors: 2,
    configuredAssistants: 1,
    activeDoctors: 1,
    activeAssistants: 1
  });

  assert.equal(workflow.workflowMode, 'cabinet');
  assert.equal(workflow.globalDirectoryEnabled, true);
  assert.equal(workflow.assistantDoctorSelectorEnabled, false);
});

test('cabinetType single enforces single shared patient list even with multiple accounts', () => {
  const workflow = determinePatientWorkflow({
    cabinetType: 'single',
    configuredDoctors: 3,
    configuredAssistants: 2,
    activeDoctors: 2,
    activeAssistants: 1
  });

  assert.equal(workflow.cabinetMode, false);
  assert.equal(workflow.workflowMode, 'doctor_assistant');
  assert.equal(workflow.globalDirectoryEnabled, false);
  assert.equal(workflow.assistantDoctorSelectorEnabled, false);
});

test('canonical column name map includes cabinetType for PostgreSQL compatibility', async () => {
  const { getCanonicalColumnNameMap } = await import('../../src/main/database-column-map.js');
  const map = getCanonicalColumnNameMap();
  assert.equal(map.get('cabinettype'), 'cabinetType');
});

test('index.html patient-form defines onsubmit handler preventing default browser page reload', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const html = fs.readFileSync(path.resolve('src/renderer/index.html'), 'utf-8');
  assert.match(html, /<form\s+id="patient-form"[^>]*\bonsubmit="[^"]*preventDefault/);
});

