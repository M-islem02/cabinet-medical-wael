// ========== ORDONNANCE/PRESCRIPTION MANAGEMENT ==========

const prescriptionsScope = typeof window !== 'undefined' ? window : globalThis;
let currentConsultationId = null;
let medicationCounter = 0;
let editingPrescriptionId = null;
const DEFAULT_ORDONNANCE_ROWS = 1;
let medicationHistoryCache = null;
let medicationHistoryLoaded = false;
let medicationAutocompleteOutsideBound = false;
let activeMedicationAutocomplete = null;
let medicationSearchRequestId = 0;
let medicationAutocompleteRepositionBound = false;
const medicationRemoteSearchCache = new Map();
const MEDICATION_REMOTE_SEARCH_CACHE_LIMIT = 60;
const MEDICATION_REMOTE_SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
let specialtyMedicationBasesCache = null;

function resetMedicationSuggestionsInlineStyles(suggestionsDiv) {
  if (!suggestionsDiv) return;
  suggestionsDiv.style.position = '';
  suggestionsDiv.style.top = '';
  suggestionsDiv.style.left = '';
  suggestionsDiv.style.right = '';
  suggestionsDiv.style.bottom = '';
  suggestionsDiv.style.width = '';
  suggestionsDiv.style.maxHeight = '';
  suggestionsDiv.style.zIndex = '';
}

function restoreMedicationSuggestionsContainer(instance) {
  if (!instance?.suggestionsDiv) return;

  const { suggestionsDiv, originalParent, originalNextSibling, portaled } = instance;
  if (portaled && originalParent) {
    try {
      if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent.insertBefore(suggestionsDiv, originalNextSibling);
      } else {
        originalParent.appendChild(suggestionsDiv);
      }
    } catch (_) {
      // Ignore restore failures.
    }
  }

  suggestionsDiv.dataset.portaled = '';
  resetMedicationSuggestionsInlineStyles(suggestionsDiv);
}

function closeMedicationAutocompleteInstance(instance) {
  if (!instance?.suggestionsDiv) return;
  instance.suggestionsDiv.innerHTML = '';
  instance.suggestionsDiv.style.display = 'none';
  instance.row?.classList?.remove('autocomplete-open');
  restoreMedicationSuggestionsContainer(instance);
  if (activeMedicationAutocomplete === instance) {
    activeMedicationAutocomplete = null;
  }
}

function positionPortaledMedicationSuggestions(instance) {
  if (!instance?.input || !instance?.suggestionsDiv) return;

  const { input, suggestionsDiv } = instance;
  if (!document.body.contains(suggestionsDiv) || !document.body.contains(input)) {
    return;
  }

  const rect = input.getBoundingClientRect();
  const viewportPadding = 10;
  const gap = 4;
  const maxDropdownHeight = 260;

  const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
  const availableAbove = rect.top - viewportPadding;
  const openUp = availableBelow < 170 && availableAbove > availableBelow;

  const width = Math.min(rect.width, window.innerWidth - (viewportPadding * 2));
  const left = Math.min(
    Math.max(viewportPadding, rect.left),
    window.innerWidth - width - viewportPadding
  );

  suggestionsDiv.style.position = 'fixed';
  suggestionsDiv.style.left = `${left}px`;
  suggestionsDiv.style.right = 'auto';
  suggestionsDiv.style.width = `${width}px`;
  suggestionsDiv.style.zIndex = '1000000';

  const usableHeight = Math.max(
    120,
    Math.min(maxDropdownHeight, (openUp ? availableAbove : availableBelow) - gap)
  );
  suggestionsDiv.style.maxHeight = `${usableHeight}px`;

  if (openUp) {
    suggestionsDiv.style.top = 'auto';
    suggestionsDiv.style.bottom = `${window.innerHeight - rect.top + gap}px`;
  } else {
    suggestionsDiv.style.bottom = 'auto';
    suggestionsDiv.style.top = `${rect.bottom + gap}px`;
  }
}

function closeActiveMedicationAutocomplete() {
  if (!activeMedicationAutocomplete) return;
  closeMedicationAutocompleteInstance(activeMedicationAutocomplete);
}

function getCachedRemoteMedicationSearch(term) {
  const key = String(term || '').trim().toLowerCase();
  if (!key) {
    return null;
  }

  const cached = medicationRemoteSearchCache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.at > MEDICATION_REMOTE_SEARCH_CACHE_TTL_MS) {
    medicationRemoteSearchCache.delete(key);
    return null;
  }

  // Refresh LRU order.
  medicationRemoteSearchCache.delete(key);
  medicationRemoteSearchCache.set(key, cached);
  return cached.data;
}

function setCachedRemoteMedicationSearch(term, data) {
  const key = String(term || '').trim().toLowerCase();
  if (!key) {
    return;
  }

  if (medicationRemoteSearchCache.size >= MEDICATION_REMOTE_SEARCH_CACHE_LIMIT) {
    const oldestKey = medicationRemoteSearchCache.keys().next().value;
    if (oldestKey) {
      medicationRemoteSearchCache.delete(oldestKey);
    }
  }

  medicationRemoteSearchCache.set(key, { at: Date.now(), data });
}

function repairPrescriptionMojibakeText(value) {
  const text = String(value ?? '');
  if (!text) {
    return '';
  }

  return text
    .replace(/\u00C3\u20AC/g, 'A')
    .replace(/\u00C3\u00A0/g, 'a')
    .replace(/\u00C3\u00A1/g, 'a')
    .replace(/\u00C3\u00A2/g, 'a')
    .replace(/\u00C3\u00A4/g, 'a')
    .replace(/\u00C3\u00A7/g, 'c')
    .replace(/\u00C3\u00A8/g, 'e')
    .replace(/\u00C3\u00A9/g, 'e')
    .replace(/\u00C3\u00AA/g, 'e')
    .replace(/\u00C3\u00AB/g, 'e')
    .replace(/\u00C3\u00AE/g, 'i')
    .replace(/\u00C3\u00AF/g, 'i')
    .replace(/\u00C3\u00B4/g, 'o')
    .replace(/\u00C3\u00B6/g, 'o')
    .replace(/\u00C3\u00B9/g, 'u')
    .replace(/\u00C3\u00BB/g, 'u')
    .replace(/\u00C3\u00BC/g, 'u')
    .replace(/\u00C5\u201C/g, 'oe')
    .replace(/\u00E2\u20AC\u00A2/g, '-')
    .replace(/\u00E2\u20AC\u201C/g, '-')
    .replace(/\u00E2\u20AC\u201D/g, '-')
    .replace(/\u00F0\u0178\u201D\u2018/g, 'Supprimer')
    .replace(/\u00F0\u0178\u2019\u0160/g, '')
    .replace(/\u00F0\u0178\u00AA\u00AA/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeMedicationRecord(medication = {}) {
  return {
    ...medication,
    name: repairPrescriptionMojibakeText(medication.name || ''),
    dosage: repairPrescriptionMojibakeText(medication.dosage || ''),
    intake: repairPrescriptionMojibakeText(medication.intake || medication.dose || ''),
    duration: repairPrescriptionMojibakeText(medication.duration || ''),
    boxes: repairPrescriptionMojibakeText(medication.boxes || ''),
    instructions: repairPrescriptionMojibakeText(medication.instructions || medication.notes || '')
  };
}

// Default common medications for Algeria
const DEFAULT_MEDICATIONS = [
  { name: 'PARACETAMOL 1G', dosage: '1g', intake: '3x/jour', duration: '5 jours', boxes: '1 bt', instructions: 'A prendre apres les repas' },
  { name: 'PARACETAMOL 500MG', dosage: '500mg', intake: '3x/jour', duration: '5 jours', boxes: '1 bt', instructions: 'A prendre apres les repas' },
  { name: 'IBUPROFENE 400MG', dosage: '400mg', intake: '2x/jour', duration: '5 jours', boxes: '1 bt', instructions: 'A prendre pendant les repas' },
  { name: 'AMOXICILLINE 1G', dosage: '1g', intake: '2x/jour', duration: '7 jours', boxes: '2 bts', instructions: 'A prendre a heures fixes' },
  { name: 'AMOXICILLINE 500MG', dosage: '500mg', intake: '3x/jour', duration: '7 jours', boxes: '2 bts', instructions: 'A prendre a heures fixes' },
  { name: 'OMEPRAZOLE 20MG', dosage: '20mg', intake: '1x/jour', duration: '14 jours', boxes: '1 bt', instructions: 'A prendre le matin a jeun' },
  { name: 'METFORMINE 850MG', dosage: '850mg', intake: '2x/jour', duration: '30 jours', boxes: '2 bts', instructions: 'A prendre pendant les repas' },
  { name: 'AMLODIPINE 5MG', dosage: '5mg', intake: '1x/jour', duration: '30 jours', boxes: '1 bt', instructions: 'A prendre le matin' },
  { name: 'ATORVASTATINE 20MG', dosage: '20mg', intake: '1x/jour', duration: '30 jours', boxes: '1 bt', instructions: 'A prendre le soir' },
  { name: 'DICLOFENAC 50MG', dosage: '50mg', intake: '2x/jour', duration: '5 jours', boxes: '1 bt', instructions: 'A prendre pendant les repas' },
  { name: 'TRAMADOL 50MG', dosage: '50mg', intake: '2x/jour', duration: '5 jours', boxes: '1 bt', instructions: 'En cas de douleur intense' },
  { name: 'PREDNISOLONE 20MG', dosage: '20mg', intake: '1x/jour', duration: '5 jours', boxes: '1 bt', instructions: 'A prendre le matin avec petit-dejeuner' },
  { name: 'VITAMINE D3 200000UI', dosage: '200000UI', intake: '1 ampoule/mois', duration: '3 mois', boxes: '3 amp', instructions: 'A prendre avec un repas gras' },
  { name: 'VITAMINE B12 1000MCG', dosage: '1000mcg', intake: '1x/jour', duration: '30 jours', boxes: '1 bt', instructions: 'A prendre le matin' },
  { name: 'FER + ACIDE FOLIQUE', dosage: '1cp', intake: '1x/jour', duration: '30 jours', boxes: '1 bt', instructions: 'A prendre a jeun' },
  { name: 'PANTOPRAZOLE 40MG', dosage: '40mg', intake: '1x/jour', duration: '14 jours', boxes: '1 bt', instructions: 'A prendre le matin a jeun' },
  { name: 'AZITHROMYCINE 500MG', dosage: '500mg', intake: '1x/jour', duration: '3 jours', boxes: '1 bt', instructions: 'A prendre a heures fixes' },
  { name: 'CIPROFLOXACINE 500MG', dosage: '500mg', intake: '2x/jour', duration: '7 jours', boxes: '1 bt', instructions: 'A prendre avec un grand verre d\'eau' },
  { name: 'LORATADINE 10MG', dosage: '10mg', intake: '1x/jour', duration: '7 jours', boxes: '1 bt', instructions: 'A prendre le soir' },
  { name: 'CETIRIZINE 10MG', dosage: '10mg', intake: '1x/jour', duration: '7 jours', boxes: '1 bt', instructions: 'A prendre le soir' },
  { name: 'SALBUTAMOL SPRAY', dosage: '100mcg', intake: '2 bouffees si besoin', duration: '', boxes: '1 flacon', instructions: 'En cas de crise' },
  { name: 'DOLIPRANE 1000MG', dosage: '1000mg', intake: '3x/jour', duration: '5 jours', boxes: '1 bt', instructions: 'A prendre apres les repas' },
  { name: 'SPASFON', dosage: '1cp', intake: '3x/jour', duration: '5 jours', boxes: '1 bt', instructions: 'En cas de douleurs abdominales' },
  { name: 'GAVISCON', dosage: '1 sachet', intake: '3x/jour', duration: '7 jours', boxes: '1 bt', instructions: 'A prendre apres les repas' },
  { name: 'SMECTA', dosage: '1 sachet', intake: '3x/jour', duration: '3 jours', boxes: '1 bt', instructions: 'A prendre entre les repas' }
];

// Initialize default medications on first use
function initializeDefaultMedications() {
  const history = localStorage.getItem('medicationHistory');
  if (!history || JSON.parse(history).length === 0) {
    const initialMeds = DEFAULT_MEDICATIONS.map((med, index) => ({
      ...normalizeMedicationRecord(med),
      usageCount: 25 - index, // Higher count for more common ones
      lastUsed: new Date().toISOString()
    }));
    medicationHistoryCache = initialMeds;
    localStorage.setItem('medicationHistory', JSON.stringify(initialMeds));
    console.log('Medicaments par defaut initialises:', initialMeds.length);
    return;
  }

  try {
    const parsedHistory = JSON.parse(history);
    if (!Array.isArray(parsedHistory)) {
      return;
    }

    const normalizedHistory = parsedHistory.map((entry) => ({
      ...entry,
      ...normalizeMedicationRecord(entry)
    }));

    if (JSON.stringify(parsedHistory) !== JSON.stringify(normalizedHistory)) {
      localStorage.setItem('medicationHistory', JSON.stringify(normalizedHistory));
    }
    medicationHistoryCache = normalizedHistory;
  } catch (error) {
    console.error('Impossible de normaliser l\'historique des medicaments:', error);
  }
}

function getMedicationHistoryCache() {
  initializeDefaultMedications();

  if (Array.isArray(medicationHistoryCache)) {
    return medicationHistoryCache;
  }

  try {
    const parsed = JSON.parse(localStorage.getItem('medicationHistory') || '[]');
    medicationHistoryCache = Array.isArray(parsed)
      ? parsed.map((entry) => ({ ...entry, ...normalizeMedicationRecord(entry) }))
      : [];
  } catch (error) {
    medicationHistoryCache = [];
  }

  return medicationHistoryCache;
}

function updateMedicationHistoryCache(nextHistory = []) {
  medicationHistoryCache = Array.isArray(nextHistory) ? nextHistory : [];
  localStorage.setItem('medicationHistory', JSON.stringify(medicationHistoryCache));
}

function mapMedicationSearchResult(entry = {}) {
  return {
    ...normalizeMedicationRecord({
      name: entry.name || '',
      genericName: entry.genericName || '',
      dosage: entry.defaultDosage || entry.dosage || '',
      intake: entry.defaultIntake || entry.intake || entry.dose || '',
      duration: entry.defaultDuration || entry.duration || '',
      boxes: entry.defaultBoxes || entry.boxes || '',
      instructions: entry.instructions || entry.notes || ''
    }),
    usageCount: entry.usageCount || 0,
    lastUsed: entry.updatedAt || entry.lastUsed || null
  };
}

function mapSpecialtyMedicationSearchResult(entry = {}) {
  return {
    ...normalizeMedicationRecord({
      name: entry.nom_medicament || entry.name || '',
      dosage: entry.dosage_posologie || entry.defaultDosage || entry.dosage || '',
      intake: entry.prise || entry.defaultIntake || entry.intake || '',
      duration: entry.duree || entry.defaultDuration || entry.duration || '',
      boxes: entry.boites ?? entry.defaultBoxes ?? entry.boxes ?? '',
      instructions: entry.instructions_observations || entry.instructions || entry.notes || ''
    }),
    usageCount: 0,
    lastUsed: null
  };
}

function mergeMedicationSuggestions(...groups) {
  const merged = new Map();

  groups.flat().forEach((entry) => {
    const normalized = {
      ...normalizeMedicationRecord(entry),
      usageCount: entry?.usageCount || 0,
      lastUsed: entry?.lastUsed || null
    };
    const key = `${normalizeMedicationName(normalized.name)}|${normalizeMedicationName(normalized.dosage)}`;
    if (!key || merged.has(key)) {
      return;
    }
    merged.set(key, normalized);
  });

  return Array.from(merged.values());
}

async function getSpecialtyMedicationMatches(normalizedQuery) {
  if (!normalizedQuery) {
    return [];
  }

  const specialtyKey = typeof resolveActivePracticeSpecialty === 'function'
    ? resolveActivePracticeSpecialty(window._packageConfig)
    : (currentUserSpecialty || 'general');

  if (window.api?.medication?.searchSpecialtyJson) {
    try {
      const result = await window.api.medication.searchSpecialtyJson({
        specialtyKey,
        term: normalizedQuery,
        limit: 8
      });
      if (result.success && Array.isArray(result.data)) {
        return result.data.map(mapSpecialtyMedicationSearchResult).slice(0, 8);
      }
    } catch (error) {
      console.error('Impossible de rechercher dans la base medicaments de specialite:', error);
    }
  }

  if (!window.api?.package?.getLoadedBases) {
    return [];
  }

  try {
    if (!specialtyMedicationBasesCache) {
      const result = await window.api.package.getLoadedBases();
      specialtyMedicationBasesCache = result.success && Array.isArray(result.data) ? result.data : [];
    }

    const specialtyBase = specialtyMedicationBasesCache.find((base) => base.key === specialtyKey)
      || specialtyMedicationBasesCache.find((base) => base.key === 'general');

    return (specialtyBase?.medications || [])
      .map(mapSpecialtyMedicationSearchResult)
      .filter((med) => (med.name || '').toLowerCase().startsWith(normalizedQuery))
      .slice(0, 8);
  } catch (error) {
    console.error('Impossible de charger la base medicaments de specialite:', error);
    return [];
  }
}

async function searchMedicationSuggestions(query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const localMatches = getMedicationHistoryCache()
    .filter((med) => {
      const lowerName = (med.name || '').toLowerCase();
      return lowerName.startsWith(normalizedQuery);
    })
    .sort((a, b) => {
      const aStarts = (a.name || '').toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      const bStarts = (b.name || '').toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
      if (aStarts !== bStarts) {
        return aStarts - bStarts;
      }
      if ((b.usageCount || 0) !== (a.usageCount || 0)) {
        return (b.usageCount || 0) - (a.usageCount || 0);
      }
      return (b.lastUsed || '').localeCompare(a.lastUsed || '');
    })
    .slice(0, 8);
  const specialtyJsonMatches = await getSpecialtyMedicationMatches(normalizedQuery);

  // Only hit the database after 2 chars to keep typing snappy on large datasets.
  if (normalizedQuery.length < 2 || !window.api?.medication?.search) {
    return mergeMedicationSuggestions(specialtyJsonMatches, localMatches).slice(0, 8);
  }

  try {
    const cachedRemote = getCachedRemoteMedicationSearch(normalizedQuery);
    if (cachedRemote) {
      return mergeMedicationSuggestions(cachedRemote, specialtyJsonMatches, localMatches).slice(0, 8);
    }

    const result = await window.api.medication.search(normalizedQuery);
    const fetchedRemoteMatches = result.success && Array.isArray(result.data)
      ? result.data.map(mapMedicationSearchResult)
      : [];

    setCachedRemoteMedicationSearch(normalizedQuery, fetchedRemoteMatches);
    return mergeMedicationSuggestions(fetchedRemoteMatches, specialtyJsonMatches, localMatches).slice(0, 8);
  } catch (error) {
    console.error('Impossible de rechercher les medicaments:', error);
    return localMatches;
  }
}

function calculatePatientAge(dateString) {
  if (!dateString) return null;
  const dob = new Date(dateString);
  if (Number.isNaN(dob.getTime())) return null;
  const diff = Date.now() - dob.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function updateOrdonnanceHeader(dateValue = new Date()) {
  if (!currentPatientData) {
    showNotification('Veuillez selectionner un patient avant de creer une ordonnance', 'error');
    return false;
  }

  const age = calculatePatientAge(currentPatientData.dateOfBirth);
  if (age === null) {
    showNotification('La date de naissance du patient est requise pour generer une ordonnance', 'error');
    return false;
  }

  const patientLastName = currentPatientData.lastName || '';
  const patientFirstName = currentPatientData.firstName || '';

  const dateEl = document.getElementById('ordonnance-date');
  const lastNameEl = document.getElementById('ordonnance-patient-lastname');
  const firstNameEl = document.getElementById('ordonnance-patient-firstname');
  const ageEl = document.getElementById('ordonnance-patient-age');
  const doctorNameEl = document.querySelector('#modal-add-prescription .doctor-name');
  const doctorSpecialtyEl = document.querySelector('#modal-add-prescription .doctor-specialty');
  const doctorOrderEl = document.querySelector('#modal-add-prescription .doctor-order');
  const doctorName = String(cachedSettings?.doctorName || '').trim();
  const doctorSpecialty = String(cachedSettings?.doctorSpecialty || '').trim();
  const doctorOrder = String(cachedSettings?.doctorRPPS || '').trim();

  if (dateEl) dateEl.textContent = new Date(dateValue).toLocaleDateString('fr-FR');
  if (lastNameEl) lastNameEl.textContent = patientLastName.toUpperCase();
  if (firstNameEl) firstNameEl.textContent = patientFirstName;
  if (ageEl) ageEl.textContent = `${age} ans`;
  if (doctorNameEl) doctorNameEl.textContent = `DR. ${(doctorName || 'Docteur').toUpperCase()}`;
  if (doctorSpecialtyEl) doctorSpecialtyEl.textContent = (doctorSpecialty || 'Specialite non renseignee').toUpperCase();
  if (doctorOrderEl) doctorOrderEl.textContent = `Numero d'ordre: ${doctorOrder || '-'}`;

  return true;
}

function prepareOrdonnanceModal({ resetFields = true } = {}) {
  if (!updateOrdonnanceHeader()) {
    return false;
  }

  if (resetFields) {
    resetPrescriptionForm();
  }

  return true;
}

function cancelPrescriptionCreation() {
  closeActiveMedicationAutocomplete();
  pendingConsultationData = null;
  resetPrescriptionForm();
  closeModal('modal-add-prescription');
}

function cancelConsultationFromPrescription() {
  closeActiveMedicationAutocomplete();
  pendingConsultationData = null;
  resetPrescriptionForm();
  closeModal('modal-add-prescription');
  closeModal('modal-consultation');
  document.getElementById('consultation-form')?.reset();
}

// Function to add prescription from consultation creation form
function addPrescriptionToNewConsultation() {
  const consultationForm = document.getElementById('consultation-form');
  if (!consultationForm?.reportValidity()) {
    return;
  }

  // Store the current form data
  pendingConsultationData = {
    date: document.getElementById('consultation-date').value,
    type: document.getElementById('consultation-type').value,
    reason: document.getElementById('consultation-reason').value,
    weight: document.getElementById('consultation-weight').value,
    height: document.getElementById('consultation-height').value,
    bloodPressure: document.getElementById('consultation-bloodPressure').value,
    temperature: document.getElementById('consultation-temperature').value,
    clinicalExamination: document.getElementById('consultation-clinicalExamination').value,
    diagnosis: document.getElementById('consultation-diagnosis').value
  };

  if (!prepareOrdonnanceModal()) {
    pendingConsultationData = null;
    return;
  }

  showModal('modal-add-prescription');
}

function openAddPrescriptionFromConsultation() {
  if (!currentConsultationId) {
    showNotification('Erreur: Consultation non selectionnee', 'error');
    return;
  }
  pendingConsultationData = null;
  if (!prepareOrdonnanceModal()) {
    return;
  }
  showModal('modal-add-prescription');
}

function openPatientPrescriptionModal() {
  if (!currentPatientId) {
    showNotification('Veuillez selectionner un patient avant de creer une ordonnance', 'warning');
    return;
  }
  pendingConsultationData = null;
  currentConsultationId = null;
  if (!prepareOrdonnanceModal()) {
    return;
  }
  showModal('modal-add-prescription');
}

function resetPrescriptionForm() {
  populateMedicationsForm([]);
  editingPrescriptionId = null;
  const generalNotes = document.getElementById('prescription-general-notes');
  if (generalNotes) {
    generalNotes.value = '';
  }
}

function populateMedicationsForm(medications = []) {
  const medicationsList = document.getElementById('medications-list');
  if (!medicationsList) return;
  medicationsList.innerHTML = '';
  medicationCounter = 0;
  const safeMedications = Array.isArray(medications) ? medications : [];
  if (!safeMedications.length) {
    for (let index = 0; index < DEFAULT_ORDONNANCE_ROWS; index += 1) {
      addMedicationField();
    }
  } else {
    safeMedications.forEach((med) => addMedicationField(med));
    for (let index = safeMedications.length; index < DEFAULT_ORDONNANCE_ROWS; index += 1) {
      addMedicationField();
    }
  }
  renumberMedicationRows();
  validateMedications();
}

function normalizeMedicationName(value) {
  return String(value || '').trim().toLowerCase();
}

function renumberMedicationRows() {
  const rows = document.querySelectorAll('#medications-list > .medication-row');
  rows.forEach((row, index) => {
    const nameValue = row.querySelector('.medication-name')?.value?.trim() || '';
    const indexBadge = row.querySelector('.medication-row-index');
    if (indexBadge) {
      indexBadge.textContent = String(index + 1);
    }
    row.dataset.medicationLabel = nameValue ? `Medicament #${index + 1} - ${nameValue}` : `Medicament #${index + 1}`;
    const removeButton = row.querySelector('.medication-remove-btn');
    if (removeButton) {
      removeButton.title = nameValue ? `Supprimer ${nameValue}` : `Supprimer le medicament ${index + 1}`;
    }
  });
}

function hasDuplicateMedicationName(input) {
  const normalized = normalizeMedicationName(input?.value);
  if (!normalized) {
    return false;
  }

  return Array.from(document.querySelectorAll('#medications-list .medication-name'))
    .filter((field) => field && field !== input)
    .some((field) => normalizeMedicationName(field.value) === normalized);
}

function enforceUniqueMedicationName(input, { notify = false } = {}) {
  if (!input) {
    return true;
  }

  if (!hasDuplicateMedicationName(input)) {
    input.setCustomValidity('');
    return true;
  }

  input.value = '';
  input.setCustomValidity('Ce medicament est deja ajoute.');
  if (notify) {
    showNotification('Le meme medicament ne peut pas etre ajoute deux fois.', 'warning');
  }
  renumberMedicationRows();
  validateMedications();
  return false;
}

function addMedicationField(defaultValues = null) {
  const medicationsList = document.getElementById('medications-list');
  if (!medicationsList) return;

  medicationCounter++;
  const medicationId = `medication-${medicationCounter}`;
  const displayIndex = medicationsList.querySelectorAll('.medication-row').length + 1;
  const medicationBox = document.createElement('div');
  medicationBox.id = medicationId;
  medicationBox.className = 'medication-row';
  
  medicationBox.innerHTML = `
    <div class="medication-row-index">${displayIndex}</div>

    <div class="form-group medication-field-wrapper medication-table-cell">
      <span class="medication-cell-label">Nom du medicament *</span>
      <input type="text" class="form-control medication-name" placeholder="Ex: DAFALGAN" required autocomplete="off">
      <div class="medication-suggestions" style="display: none;"></div>
    </div>

    <div class="form-group medication-table-cell">
      <span class="medication-cell-label">Dosage / Posologie *</span>
      <input type="text" class="form-control medication-dosage" placeholder="Ex: 500mg" required>
    </div>

    <div class="form-group medication-table-cell">
      <span class="medication-cell-label">Prise</span>
      <input type="text" class="form-control medication-intake" placeholder="Ex: 3x/jour">
    </div>

    <div class="form-group medication-table-cell">
      <span class="medication-cell-label">Duree</span>
      <input type="text" class="form-control medication-duration" placeholder="Ex: 7 jours">
    </div>

    <div class="form-group medication-table-cell">
      <span class="medication-cell-label">Boites</span>
      <input type="text" class="form-control medication-boxes" placeholder="Ex: 2 bts">
    </div>

    <div class="form-group medication-notes-group medication-table-cell">
      <span class="medication-cell-label">Instructions / Observations</span>
      <input type="text" class="form-control medication-notes" placeholder="Ex: A prendre apres le repas">
    </div>

    <div class="medication-actions-cell">
      <button type="button" class="btn btn-danger btn-small medication-remove-btn" onclick="removeMedicationField('${medicationId}')" title="Supprimer ce medicament">Supprimer</button>
    </div>
  `;

  medicationsList.appendChild(medicationBox);

  const totalRows = medicationsList.querySelectorAll('.medication-row').length;
  if (totalRows > 4) {
    requestAnimationFrame(() => {
      medicationBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  const fields = medicationBox.querySelectorAll('input, textarea');
  fields.forEach(field => {
    field.addEventListener('input', validateMedications);
    field.addEventListener('change', validateMedications);
  });

  // Setup autocomplete for medication name
  const nameInput = medicationBox.querySelector('.medication-name');
  const suggestionsDiv = medicationBox.querySelector('.medication-suggestions');
  const dosageInput = medicationBox.querySelector('.medication-dosage');
  const intakeInput = medicationBox.querySelector('.medication-intake');
  const durationInput = medicationBox.querySelector('.medication-duration');
  const boxesInput = medicationBox.querySelector('.medication-boxes');
  const notesInput = medicationBox.querySelector('.medication-notes');
  
  if (defaultValues) {
    const normalizedDefaults = normalizeMedicationRecord(defaultValues);
    if (nameInput) nameInput.value = normalizedDefaults.name || '';
    if (dosageInput) dosageInput.value = normalizedDefaults.dosage || '';
    if (intakeInput) intakeInput.value = normalizedDefaults.intake || '';
    if (durationInput) durationInput.value = normalizedDefaults.duration || '';
    if (boxesInput) boxesInput.value = normalizedDefaults.boxes || '';
    if (notesInput) notesInput.value = normalizedDefaults.instructions || '';
  }
  
  if (nameInput && suggestionsDiv) {
    setupMedicationAutocomplete(nameInput, suggestionsDiv);
    nameInput.addEventListener('change', () => enforceUniqueMedicationName(nameInput, { notify: true }));
    nameInput.addEventListener('blur', () => enforceUniqueMedicationName(nameInput, { notify: true }));
    nameInput.focus();
  }

  renumberMedicationRows();
  validateMedications();
}

async function initializeMedicationHistory() {
  if (medicationHistoryLoaded) {
    return;
  }

  // Initialize default medications if none exist
  initializeDefaultMedications();
  medicationHistoryLoaded = true;
  
  if (!window.api?.prescription?.getMedicationsHistory) {
    return;
  }

  try {
    const result = await window.api.prescription.getMedicationsHistory();
    if (result.success && Array.isArray(result.data)) {
      const existing = getMedicationHistoryCache();
      const merged = mergeMedicationHistories(existing, result.data);
      updateMedicationHistoryCache(merged.slice(0, 200));
    }
  } catch (error) {
    console.error('Impossible de charger l\'historique des medicaments:', error);
  }
}

function setupMedicationAutocomplete(input, suggestionsDiv) {
  if (!input || !suggestionsDiv) {
    return;
  }

  let renderTimer = null;
  const hostRow = input.closest('.medication-row');

  const closeActiveAutocomplete = () => {
    closeActiveMedicationAutocomplete();
  };

  const closeSuggestions = () => {
    if (activeMedicationAutocomplete?.input === input) {
      closeMedicationAutocompleteInstance(activeMedicationAutocomplete);
      return;
    }
    suggestionsDiv.innerHTML = '';
    suggestionsDiv.style.display = 'none';
    hostRow?.classList?.remove('autocomplete-open');
    resetMedicationSuggestionsInlineStyles(suggestionsDiv);
  };

  const renderSuggestions = async (rawQuery = '') => {
    const query = rawQuery.trim().toLowerCase();
    const requestId = ++medicationSearchRequestId;
    const savedMeds = await searchMedicationSuggestions(query);
    if (requestId !== medicationSearchRequestId) {
      return;
    }
    if (!savedMeds.length) {
      closeSuggestions();
      return;
    }

    let matches = savedMeds
      .map((med) => {
        if (!query) {
          return { ...med, suggestionScore: 0 };
        }
        const lowerName = (med.name || '').toLowerCase();
        const lowerGeneric = (med.genericName || '').toLowerCase();
        let score = 4;
        if (lowerName.startsWith(query)) score = 0;
        else if (lowerGeneric.startsWith(query)) score = 1;
        else if (lowerName.includes(query)) score = 2;
        else if (lowerGeneric.includes(query)) score = 3;
        return { ...med, suggestionScore: score };
      })
      .filter((med) => !query || med.suggestionScore < 4)
      .sort((a, b) => {
        if (a.suggestionScore !== b.suggestionScore) {
          return a.suggestionScore - b.suggestionScore;
        }
        if ((b.usageCount || 0) !== (a.usageCount || 0)) {
          return (b.usageCount || 0) - (a.usageCount || 0);
        }
        return (b.lastUsed || '').localeCompare(a.lastUsed || '');
      })
      .slice(0, 6);

    if (!matches.length && query) {
      matches = savedMeds.slice(0, 6).map((med) => ({ ...med, suggestionScore: 5 }));
    }

    if (matches.length === 0) {
      closeSuggestions();
      return;
    }

    if (activeMedicationAutocomplete && activeMedicationAutocomplete.input !== input) {
      closeActiveAutocomplete();
    }

    suggestionsDiv.innerHTML = matches.map(med => {
      const highlighted = query ? highlightMedicationMatch(med.name, query) : escapePrescriptionHtml(med.name);
      const metaParts = [med.dosage, med.intake, med.duration, med.boxes].filter(Boolean);
      const metaText = metaParts.length ? metaParts.join(' - ') : '';
      const usageBadge = med.usageCount ? `<span style="background:#e3f2fd;color:#0d47a1;font-size:11px;padding:2px 6px;border-radius:10px;">${med.usageCount}x</span>` : '';
      const lastUsed = med.lastUsed ? `<small style="color:#999;">${new Date(med.lastUsed).toLocaleDateString('fr-FR')}</small>` : '';
      const genericName = String(med.genericName || '').trim();
      const genericLabel = genericName ? `<div style="color:#6b7280;font-size:12px;">${escapePrescriptionHtml(genericName)}</div>` : '';
      return `
        <div class="suggestion-item" 
             data-name="${escapeHtmlAttribute(med.name)}" 
             data-generic-name="${escapeHtmlAttribute(genericName)}"
             data-dosage="${escapeHtmlAttribute(med.dosage || '')}"
             data-intake="${escapeHtmlAttribute(med.intake || '')}" 
             data-duration="${escapeHtmlAttribute(med.duration || '')}" 
             data-boxes="${escapeHtmlAttribute(med.boxes || '')}"
             data-notes="${escapeHtmlAttribute(med.instructions || '')}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <strong>${highlighted}</strong>
            ${usageBadge}
          </div>
          ${genericLabel}
          ${metaText ? `<div style="color:#666;font-size:13px;">${metaText}</div>` : ''}
          ${lastUsed}
        </div>
      `;
    }).join('');

    let instance = activeMedicationAutocomplete?.input === input ? activeMedicationAutocomplete : null;
    if (!instance) {
      const originalParent = suggestionsDiv.parentNode;
      const originalNextSibling = suggestionsDiv.nextSibling;
      try {
        document.body.appendChild(suggestionsDiv);
        suggestionsDiv.dataset.portaled = '1';
      } catch (_) {
        // Ignore portal failures (fallback to in-place rendering).
      }

      instance = {
        input,
        suggestionsDiv,
        row: hostRow,
        originalParent,
        originalNextSibling,
        portaled: suggestionsDiv.dataset.portaled === '1'
      };

      hostRow?.classList?.add('autocomplete-open');
      activeMedicationAutocomplete = instance;
    } else {
      instance.row = hostRow;
    }

    suggestionsDiv.style.display = 'block';
    positionPortaledMedicationSuggestions(instance);
  };

  const scheduleRender = () => {
    if (renderTimer) {
      clearTimeout(renderTimer);
    }
    renderTimer = setTimeout(() => {
      void renderSuggestions(input.value);
    }, 120);
  };

  input.addEventListener('input', scheduleRender);
  input.addEventListener('focus', scheduleRender);

  // Delegate clicks (avoid attaching listeners on each re-render).
  suggestionsDiv.addEventListener('click', (event) => {
    const target = event.target?.closest?.('.suggestion-item');
    if (!target) {
      return;
    }

    const medRow = input.closest('.medication-row');
    if (!medRow) {
      closeSuggestions();
      return;
    }

    const nameField = medRow.querySelector('.medication-name');
    if (!nameField) {
      closeSuggestions();
      return;
    }

    nameField.value = repairPrescriptionMojibakeText(target.dataset.name);
    if (!enforceUniqueMedicationName(nameField, { notify: true })) {
      closeSuggestions();
      return;
    }

    const dosageField = medRow.querySelector('.medication-dosage');
    if (dosageField) dosageField.value = repairPrescriptionMojibakeText(target.dataset.dosage || '');
    medRow.querySelector('.medication-intake').value = repairPrescriptionMojibakeText(target.dataset.intake || '');
    medRow.querySelector('.medication-duration').value = repairPrescriptionMojibakeText(target.dataset.duration || '');
    medRow.querySelector('.medication-boxes').value = repairPrescriptionMojibakeText(target.dataset.boxes || '');
    const notesField = medRow.querySelector('.medication-notes');
    if (notesField && target.dataset.notes) {
      notesField.value = repairPrescriptionMojibakeText(target.dataset.notes);
    }

    closeSuggestions();
    renumberMedicationRows();
    validateMedications();
  });

  if (!medicationAutocompleteRepositionBound) {
    const scheduleReposition = () => {
      if (!activeMedicationAutocomplete) return;
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => positionPortaledMedicationSuggestions(activeMedicationAutocomplete));
      } else {
        positionPortaledMedicationSuggestions(activeMedicationAutocomplete);
      }
    };

    window.addEventListener('resize', scheduleReposition);
    document.addEventListener('scroll', scheduleReposition, true);
    medicationAutocompleteRepositionBound = true;
  }

  if (!medicationAutocompleteOutsideBound) {
    document.addEventListener('click', (event) => {
      if (!activeMedicationAutocomplete) {
        return;
      }
      const { input: activeInput, suggestionsDiv: activeSuggestions } = activeMedicationAutocomplete;
      const inputContains = activeInput && typeof activeInput.contains === 'function' && activeInput.contains(event.target);
      const suggestionsContain = activeSuggestions && typeof activeSuggestions.contains === 'function' && activeSuggestions.contains(event.target);
      if (inputContains || suggestionsContain) {
        return;
      }
      closeMedicationAutocompleteInstance(activeMedicationAutocomplete);
    });
    medicationAutocompleteOutsideBound = true;
  }
}

function saveMedicationToHistory(medication) {
  const sanitized = sanitizeMedicationForHistory(medication);
  if (!sanitized) {
    return;
  }

  sanitized.lastUsed = new Date().toISOString();
  sanitized.usageCount = sanitized.usageCount || 1;

  const history = getMedicationHistoryCache();
  const merged = mergeMedicationHistories(history, [sanitized]);
  updateMedicationHistoryCache(merged.slice(0, 200));
}

function mergeMedicationHistories(existingHistory = [], incomingHistory = []) {
  const map = new Map();

  const addEntries = (entries, isExisting = false) => {
    entries.forEach(entry => {
      const sanitized = sanitizeMedicationForHistory(entry, isExisting ? entry.lastUsed : null);
      if (!sanitized) {
        return;
      }

      const key = sanitized.name.toLowerCase();
      const stored = map.get(key);

      if (stored) {
        stored.usageCount = (stored.usageCount || 0) + (sanitized.usageCount || 0);
        if (!stored.dosage && sanitized.dosage) stored.dosage = sanitized.dosage;
        if (!stored.intake && sanitized.intake) stored.intake = sanitized.intake;
        if (!stored.duration && sanitized.duration) stored.duration = sanitized.duration;
        if (!stored.boxes && sanitized.boxes) stored.boxes = sanitized.boxes;
        if (!stored.instructions && sanitized.instructions) stored.instructions = sanitized.instructions;
        if (sanitized.lastUsed && (!stored.lastUsed || sanitized.lastUsed > stored.lastUsed)) {
          stored.lastUsed = sanitized.lastUsed;
        }
      } else {
        map.set(key, { ...sanitized });
      }
    });
  };

  addEntries(existingHistory, true);
  addEntries(incomingHistory, false);

  return Array.from(map.values()).sort((a, b) => {
    if ((b.usageCount || 0) === (a.usageCount || 0)) {
      return (b.lastUsed || '').localeCompare(a.lastUsed || '');
    }
    return (b.usageCount || 0) - (a.usageCount || 0);
  });
}

function sanitizeMedicationForHistory(medication, fallbackLastUsed = null) {
  if (!medication || !medication.name) {
    return null;
  }

  const normalized = normalizeMedicationRecord(medication);

  return {
    name: normalized.name.trim(),
    dosage: normalized.dosage.trim(),
    intake: normalized.intake.trim(),
    duration: normalized.duration.trim(),
    boxes: normalized.boxes.trim(),
    instructions: normalized.instructions.trim(),
    usageCount: Number(medication.usageCount || 1),
    lastUsed: medication.lastUsed || fallbackLastUsed || null
  };
}

function highlightMedicationMatch(text, query) {
  const safeText = escapePrescriptionHtml(text);
  if (!query) {
    return safeText;
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'i');
  return safeText.replace(regex, '<mark>$1</mark>');
}

function escapeHtmlAttribute(value) {
  if (!value) {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapePrescriptionHtml(value) {
  if (!value) {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function removeMedicationField(medicationId) {
  document.getElementById(medicationId)?.remove();
  renumberMedicationRows();
  validateMedications();
}

function validateMedications({ notify = false } = {}) {
  renumberMedicationRows();
  const rows = document.querySelectorAll('#medications-list > .medication-row');
  const nameInputs = Array.from(rows)
    .map(row => row.querySelector('.medication-name'))
    .filter(Boolean);
  const counts = new Map();

  nameInputs.forEach((input) => {
    const normalized = normalizeMedicationName(input.value);
    if (!normalized) return;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });

  let hasDuplicate = false;
  nameInputs.forEach((input) => {
    const normalized = normalizeMedicationName(input.value);
    const isDuplicate = normalized && counts.get(normalized) > 1;
    if (isDuplicate) {
      hasDuplicate = true;
      input.setCustomValidity('Ce medicament est deja ajoute.');
    } else {
      input.setCustomValidity('');
    }
  });

  if (hasDuplicate && notify) {
    showNotification('Le meme medicament ne peut pas etre ajoute deux fois.', 'warning');
  }

  return !hasDuplicate;
}

function getMedicationsFromForm() {
  const medications = [];
  document.querySelectorAll('#medications-list > .medication-row').forEach(box => {
    const name = repairPrescriptionMojibakeText(box.querySelector('.medication-name')?.value.trim());
    const dosage = repairPrescriptionMojibakeText(box.querySelector('.medication-dosage')?.value.trim());
    const intake = repairPrescriptionMojibakeText(box.querySelector('.medication-intake')?.value.trim());
    const duration = repairPrescriptionMojibakeText(box.querySelector('.medication-duration')?.value.trim());
    const boxesValue = repairPrescriptionMojibakeText(box.querySelector('.medication-boxes')?.value.trim());
    const notes = repairPrescriptionMojibakeText(box.querySelector('.medication-notes')?.value.trim());
    
    if (name && dosage) {
      medications.push({
        name,
        dosage,
        intake,
        duration,
        boxes: boxesValue,
        instructions: notes
      });
    }
  });
  return medications;
}

async function savePrescription() {
  if (!validateMedications({ notify: true })) {
    return;
  }
  
  const medications = getMedicationsFromForm();
  
  if (medications.length === 0) {
    showNotification('Erreur: Ajoutez au moins un medicament', 'error');
    return;
  }

  // Save medications to history for autocomplete
  medications.forEach(med => {
    saveMedicationToHistory(med);
  });

  const generalNotes = document.getElementById('prescription-general-notes')?.value.trim() || '';
  
  try {
    // Check if we're editing an existing prescription
    if (editingPrescriptionId) {
      const prescriptionData = {
        medications,
        notes: generalNotes
      };
      
      const result = await window.api.prescription.update(editingPrescriptionId, prescriptionData);
      
      if (result.success) {
        showNotification('Ordonnance modifiee', 'success');
    closeModal('modal-add-prescription');
  prescriptionsScope.currentPrescriptionId = editingPrescriptionId;
        await printPrescriptionDetails(editingPrescriptionId);
        loadPatientPrescriptions(currentPatientId);

        resetPrescriptionForm();
        editingPrescriptionId = null;

        const modalTitle = document.querySelector('#modal-add-prescription .modal-header h2');
        if (modalTitle) {
          modalTitle.textContent = 'Nouvelle Ordonnance';
        }
      } else {
        showNotification('Erreur: ' + result.error, 'error');
      }
      return;
    }
    
    // Check if this is from a new consultation (before saving)
    if (pendingConsultationData) {
      let consultationId = currentConsultationId;
      let patientId = document.getElementById('consultation-patientId')?.value || currentPatientId;

      if (typeof persistConsultationDraft === 'function') {
        const consultResult = await persistConsultationDraft({ keepModalOpen: true });
        if (!consultResult?.success) {
          showNotification('Erreur: Impossible de sauvegarder la consultation', 'error');
          return;
        }
        consultationId = consultResult.consultationId || currentConsultationId;
        patientId = document.getElementById('consultation-patientId')?.value || patientId;
      } else {
        const consultationData = {
          patientId,
          ...pendingConsultationData
        };

        if (!consultationData.patientId) {
          consultationData.patientId = currentPatientId;
        }

        if (!consultationData.date) {
          consultationData.date = new Date().toISOString();
        }

        const consultResult = await window.api.consultation.create(consultationData);
        if (!consultResult.success) {
          showNotification('Erreur: Impossible de creer la consultation', 'error');
          return;
        }

        consultationId = consultResult.id;
        currentConsultationId = consultationId;
        patientId = consultationData.patientId;

        const consultationForm = document.getElementById('consultation-form');
        if (consultationForm) {
          consultationForm.dataset.editId = consultationId;
        }
        if (typeof setConsultationEditorMode === 'function') {
          setConsultationEditorMode(true);
        }
      }

      if (!consultationId || !patientId) {
        showNotification('Erreur: Consultation introuvable pour l\'ordonnance', 'error');
        return;
      }

      const prescriptionData = {
        patientId,
        consultationId,
        medications,
        prescriptionDate: new Date().toISOString().split('T')[0],
        notes: generalNotes
      };

      const result = await window.api.prescription.create(prescriptionData);

      if (result.success) {
        showNotification('Ordonnance creee avec succes', 'success');
        closeModal('modal-add-prescription');
        pendingConsultationData = null;
        resetPrescriptionForm();

        prescriptionsScope.currentPrescriptionId = result.id;
        await printPrescriptionDetails(result.id);

        loadPatientConsultations(patientId);
        loadPatientPrescriptions(patientId);
      } else {
        showNotification('Erreur: ' + (result.error || 'Impossible de creer l\'ordonnance'), 'error');
      }
    } else {
      // This is from an existing consultation
      const prescriptionData = {
        patientId: currentPatientId,
        consultationId: currentConsultationId,
        medications: medications,
        prescriptionDate: new Date().toISOString().split('T')[0],
        notes: generalNotes
      };
      
      const result = await window.api.prescription.create(prescriptionData);
      
      if (result.success) {
        showNotification('Ordonnance creee avec succes', 'success');
        closeModal('modal-add-prescription');
        
  // Open print window immediately
  prescriptionsScope.currentPrescriptionId = result.id;
  await printPrescriptionDetails(result.id);

        // Refresh consultation view
        if (currentConsultationId) {
          const consultations = await window.api.consultation.getByPatient(currentPatientId);
          if (consultations && consultations.data) {
            const consultation = consultations.data.find(c => c.id === currentConsultationId);
            if (consultation) {
              viewConsultationDetails(consultation.id);
            }
          }
        }
      } else {
        showNotification('Erreur: ' + (result.error || 'Impossible de creer l\'ordonnance'), 'error');
      }
    }
  } catch (error) {
    console.error('Error saving prescription:', error);
    showNotification('Erreur lors de la sauvegarde', 'error');
  }
}

async function saveSickLeave(e) {
  e?.preventDefault();

  const form = document.getElementById('sickleave-form');
  const documentKind = form?.dataset?.documentKind === 'workstop' ? 'workstop' : 'certificate';
  const documentLabel = documentKind === 'workstop' ? 'Arrêt de travail' : 'Certificat medical';
  const editId = form?.dataset.editId;
  const startDate = document.getElementById('sickleave-start-date')?.value;
  const endDate = document.getElementById('sickleave-end-date')?.value;
  const templateFields = getSickLeaveTemplateFieldsFromInputs();
  const patientId = document.getElementById('sickleave-patient-id')?.value || currentPatientId;
  const storedConsultationId = form?.dataset.consultationId;
  const consultationId = storedConsultationId || currentConsultationId || null;
  const allowedOutings = document.getElementById('sickleave-allowed-outings')?.checked || false;

  if (!patientId) {
  showNotification(`Veuillez selectionner un patient avant de creer un ${documentLabel.toLowerCase()}`, 'error');
    showSection('patients');
    return;
  }
  
  if (!startDate || !endDate) {
    showNotification('Erreur: Les dates sont requises', 'error');
    return;
  }
  
  if (new Date(startDate) > new Date(endDate)) {
    showNotification('Erreur: La date de debut doit etre avant la date de fin', 'error');
    return;
  }

  if (!templateFields.careText) {
    showNotification('Erreur: Le contexte medical est requis', 'error');
    return;
  }
  
  try {
    const numberOfDays = Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1);
    const diagnosis = buildSickLeaveDiagnosisText(templateFields);

    const sickLeaveData = {
      patientId,
      consultationId,
      startDate: startDate,
      endDate: endDate,
      diagnosis,
      numberOfDays,
      allowedOutings,
      cim10Code: JSON.stringify(templateFields)
    };
    
    let result;
    if (editId) {
      // Update existing sick leave
      result = await window.api.sickleave.update(editId, sickLeaveData);
      if (result.success) {
        showNotification(`${documentLabel} mis a jour`, 'success');
        delete form.dataset.editId;
        delete form.dataset.consultationId;
        const modalTitle = document.querySelector('#modal-add-sickleave .modal-header h2');
  if (modalTitle) modalTitle.textContent = documentKind === 'workstop' ? '🪪 Arrêt de travail' : '🪪 Certificat médical';
      }
    } else {
      // Create new sick leave
      result = await window.api.sickleave.create(sickLeaveData);
      if (result.success) {
        showNotification(`${documentLabel} enregistre`, 'success');
      }
    }
    
    if (result.success) {
      const savedSickLeaveId = editId || result.id;
      closeModal('modal-add-sickleave');
      await printSickLeaveDetails(savedSickLeaveId);
      
      // Refresh sick leaves list
      if (currentPatientId) {
        await loadPatientSickLeaves(currentPatientId);
      }
      
      // Refresh consultation view
      if (currentConsultationId) {
        const consultations = await window.api.consultation.getByPatient(currentPatientId);
        if (consultations && consultations.data) {
          const consultation = consultations.data.find(c => c.id === currentConsultationId);
          if (consultation) {
            viewConsultationDetails(consultation.id);
          }
        }
      }
    } else {
  showNotification('Erreur: ' + (result.error || 'Impossible de sauvegarder le certificat'), 'error');
    }
  } catch (error) {
    console.error('Error saving sick leave:', error);
    showNotification('Erreur lors de la sauvegarde', 'error');
  }
}
