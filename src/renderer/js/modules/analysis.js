// ========== ANALYSIS MODAL MANAGEMENT ==========

let analysisTypesCache = [];
let analysisItemCounter = 0;

function buildAnalysisTypeOptions(selectedValue = '') {
  const options = ['<option value="">Selectionner...</option>'];

  analysisTypesCache.forEach((item) => {
    const selected = String(item.name || '') === String(selectedValue || '') ? ' selected' : '';
    const category = item.category ? ` (${item.category})` : '';
    options.push(`<option value="${escapeHTML(item.name || '')}"${selected}>${escapeHTML(item.name || '')}${escapeHTML(category)}</option>`);
  });

  return options.join('');
}

async function loadAnalysisTypes() {
  try {
    const result = await window.api.analysisType.getAll();
    const rows = result?.success && Array.isArray(result.data) ? result.data : [];
    analysisTypesCache = rows
      .map((row) => ({ name: row.name || '', category: row.category || '' }))
      .filter((row) => row.name)
      .sort((a, b) => {
        if (a.category === b.category) return a.name.localeCompare(b.name, 'fr');
        return String(a.category || '').localeCompare(String(b.category || ''), 'fr');
      });
  } catch (error) {
    console.error('Error loading analysis types:', error);
    analysisTypesCache = [];
  }
}

function addAnalysisItemField(defaultValue = '') {
  const list = document.getElementById('analysis-items-list');
  if (!list) return;

  analysisItemCounter += 1;
  const itemId = `analysis-item-${analysisItemCounter}`;

  const row = document.createElement('div');
  row.className = 'analysis-item-row';
  row.id = itemId;
  row.innerHTML = `
    <select class="form-control analysis-type-select" required>
      ${buildAnalysisTypeOptions(defaultValue)}
    </select>
    <button type="button" class="btn btn-danger btn-small" onclick="removeAnalysisItemField('${itemId}')">Supprimer</button>
  `;

  list.appendChild(row);
}

function removeAnalysisItemField(itemId) {
  const list = document.getElementById('analysis-items-list');
  if (!list) return;

  const row = document.getElementById(itemId);
  row?.remove();

  if (!list.querySelector('.analysis-item-row')) {
    addAnalysisItemField();
  }
}

async function resetAnalysisForm() {
  const form = document.getElementById('analysis-form');
  const list = document.getElementById('analysis-items-list');

  if (!form || !list) return;

  await loadAnalysisTypes();

  list.innerHTML = '';
  analysisItemCounter = 0;
  addAnalysisItemField();

  const dateField = document.getElementById('analysis-request-date');
  if (dateField) {
    dateField.value = new Date().toISOString().split('T')[0];
  }

  const labField = document.getElementById('analysis-laboratory');
  if (labField) labField.value = '';

  const notesField = document.getElementById('analysis-notes');
  if (notesField) notesField.value = '';
}

async function openAnalysisModal(patientId = null, consultationId = null) {
  const resolvedPatientId = patientId || (typeof currentPatientId !== 'undefined' ? currentPatientId : null);
  const resolvedConsultationId = consultationId || (typeof currentConsultationId !== 'undefined' ? currentConsultationId : null);

  if (!resolvedPatientId) {
    showNotification('Veuillez selectionner un patient avant de prescrire des analyses', 'warning');
    return;
  }

  const patientInput = document.getElementById('analysis-patient-id');
  const consultationInput = document.getElementById('analysis-consultation-id');

  if (patientInput) patientInput.value = resolvedPatientId;
  if (consultationInput) consultationInput.value = resolvedConsultationId || '';

  await resetAnalysisForm();
  showModal('modal-analysis');
}

async function saveAnalysis(event) {
  event?.preventDefault();

  const patientId = document.getElementById('analysis-patient-id')?.value || (typeof currentPatientId !== 'undefined' ? currentPatientId : '');
  const consultationId = document.getElementById('analysis-consultation-id')?.value || null;
  const laboratory = document.getElementById('analysis-laboratory')?.value.trim() || '';
  const notes = document.getElementById('analysis-notes')?.value.trim() || '';
  const requestDate = document.getElementById('analysis-request-date')?.value || new Date().toISOString().split('T')[0];

  if (!patientId) {
    showNotification('Patient manquant pour la demande d\'analyse', 'error');
    return;
  }

  const selectedTypes = Array.from(document.querySelectorAll('#analysis-items-list .analysis-type-select'))
    .map((select) => select.value.trim())
    .filter(Boolean);

  if (!selectedTypes.length) {
    showNotification('Ajoutez au moins un type d\'analyse', 'error');
    return;
  }

  try {
    const payloads = selectedTypes.map((analysisType) => ({
      patientId,
      consultationId,
      analysisDate: requestDate,
      analysisType,
      laboratory,
      notes,
      status: 'pending'
    }));

    const results = await Promise.all(payloads.map((payload) => window.api.analysis.create(payload)));
    const failed = results.filter((result) => !result?.success);

    if (failed.length) {
      showNotification(`Erreur: ${failed[0]?.error || 'certaines analyses n\'ont pas ete enregistrees'}`, 'error');
      return;
    }

    showNotification(`✅ ${payloads.length} analyse(s) enregistree(s)`, 'success');
    closeModal('modal-analysis');
  } catch (error) {
    console.error('Error saving analysis:', error);
    showNotification('Erreur lors de la sauvegarde des analyses', 'error');
  }
}

window.addAnalysisItemField = addAnalysisItemField;
window.removeAnalysisItemField = removeAnalysisItemField;
window.openAnalysisModal = openAnalysisModal;
window.saveAnalysis = saveAnalysis;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('analysis-form')) {
      resetAnalysisForm();
    }
  });
} else if (document.getElementById('analysis-form')) {
  resetAnalysisForm();
}
