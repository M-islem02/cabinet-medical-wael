/**
 * Package Configuration Module
 * Inline section for admin users only
 */

console.log('📦 Initializing Package Config module...');

const PKG_PRICES = {
    doctor: 60000,
    assistant: 15000,
    rehabilitation: 12000,
    dentistry: 12000,
    cardiology: 12000,
    medicalImaging: 0,
    waitingRoom: 0,
    inventory: 0,
    afterSalesSupport: 0
};

const PKG_PACKAGES = {
    basic: {
        doctors: 1,
        assistants: 0,
        features: ['inventory', 'medicalImaging']
    },
    standard: {
        doctors: 1,
        assistants: 1,
        features: ['inventory', 'medicalImaging']
    },
    professional: {
        doctors: 1,
        assistants: 1,
        features: ['inventory', 'rehabilitation', 'dentistry', 'cardiology', 'medicalImaging']
    },
    custom: {
        doctors: 1,
        assistants: 0,
        features: ['inventory', 'medicalImaging']
    }
};

let selectedPackageType = 'standard';
let selectedPackageSpecialty = 'general';
let selectedPackageSpecialties = ['general'];
let loadedSpecialtyBasesCache = [];

const PKG_SPECIALTY_LABELS = {
    general: 'Mode généraliste',
    mpr: 'MPR / Rééducation',
    cardiology: 'Cardiologue',
    dentistry: 'Dentiste'
};

async function applySavedPackageConfigState() {
    try {
        const result = await window.api.package.getConfig();
        if (!result.success || !result.data) {
            return;
        }

        window._packageConfig = result.data;

        if (typeof applyPackageRestrictionsFromCache === 'function') {
            applyPackageRestrictionsFromCache(result.data);
        }
        if (typeof applyMprDependencyRestrictions === 'function') {
            applyMprDependencyRestrictions(result.data);
        }
        if (typeof updateUserDisplay === 'function') {
            updateUserDisplay();
        }
        if (typeof currentPage !== 'undefined' && currentPage === 'inventory' && result.data.featureInventory === 0 && typeof showSection === 'function') {
            showSection('dashboard');
        }
    } catch (error) {
        console.error('Error applying saved package config state:', error);
    }
}

function getEnabledPackageSpecialties() {
    const enabled = [];
    if (document.getElementById('pkg-check-specialty-general')?.checked) enabled.push('general');
    if (document.getElementById('pkg-check-rehabilitation')?.checked) enabled.push('mpr');
    if (document.getElementById('pkg-check-cardiology')?.checked) enabled.push('cardiology');
    if (document.getElementById('pkg-check-dentistry')?.checked) enabled.push('dentistry');
    if (!enabled.length) {
        const generalCheckbox = document.getElementById('pkg-check-specialty-general');
        if (generalCheckbox) generalCheckbox.checked = true;
        document.getElementById('pkg-option-specialty-general')?.classList.add('selected');
        return ['general'];
    }
    return enabled;
}

function parseEnabledSpecialtiesFromConfig(config = {}) {
    if (config.enabledSpecialties) {
        try {
            const parsed = Array.isArray(config.enabledSpecialties)
                ? config.enabledSpecialties
                : JSON.parse(config.enabledSpecialties);
            const cleaned = parsed.filter((key) => PKG_SPECIALTY_LABELS[key]);
            if (cleaned.length) return [...new Set(cleaned)];
        } catch (_) {}
    }
    const enabled = ['general'];
    if (config.featureRehabilitation === 1 || config.featureRehabilitation === true || config.featureKineStaff === 1 || config.featureKineStaff === true) enabled.push('mpr');
    if (config.featureCardiology === 1 || config.featureCardiology === true) enabled.push('cardiology');
    if (config.featureDentistry === 1 || config.featureDentistry === true) enabled.push('dentistry');
    return [...new Set(enabled)];
}

function syncPackageSpecialtyButtons(preferredSpecialty = selectedPackageSpecialty) {
    const enabled = getEnabledPackageSpecialties();
    selectedPackageSpecialties = enabled;
    const specialtyButtons = document.querySelectorAll('[data-pkg-specialty]');

    specialtyButtons.forEach((button) => {
        const specialtyKey = button.dataset.pkgSpecialty;
        const isAvailable = true;
        const isSelected = enabled.includes(specialtyKey);

        button.classList.toggle('btn-primary', isSelected);
        button.classList.toggle('btn-outline', !isSelected);
        button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });

    const safeSpecialty = enabled.includes(preferredSpecialty) ? preferredSpecialty : enabled[0] || 'general';
    selectedPackageSpecialty = safeSpecialty;

    const activeLabel = document.getElementById('pkg-active-specialty-label');
    if (activeLabel) {
        activeLabel.textContent = enabled.map((key) => PKG_SPECIALTY_LABELS[key] || key).join(', ');
    }
}

function setPackageActiveSpecialty(specialtyKey = 'general') {
    const normalized = String(specialtyKey || 'general').trim().toLowerCase();
    const checkboxMap = {
        general: 'pkg-check-specialty-general',
        mpr: 'pkg-check-rehabilitation',
        cardiology: 'pkg-check-cardiology',
        dentistry: 'pkg-check-dentistry'
    };
    const checkbox = document.getElementById(checkboxMap[normalized]);
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        const row = checkbox.closest('.pkg-option-row') || document.getElementById(`pkg-option-${normalized === 'mpr' ? 'rehabilitation' : normalized}`);
        if (row) row.classList.toggle('selected', checkbox.checked);
    }
    syncPackageSpecialtyButtons(selectedPackageSpecialty);
    updatePackageSummary();
}

function initializePackageConfig() {
    console.log('Setting up package config event listeners...');
    
    // Set current date automatically
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('pkg-configDate');
    if (dateInput) {
        dateInput.value = today;
    }
    
    // Load existing config
    loadExistingPackageConfig();
    
    // Package card selection
    document.querySelectorAll('.package-card-inline').forEach(card => {
        card.addEventListener('click', () => {
            selectPackageType(card.dataset.package);
        });
    });
    
    // Quantity changes
    document.getElementById('pkg-qty-doctor')?.addEventListener('change', () => {
        updateDoctorPrice();
        updatePackageSummary();
    });
    
    document.getElementById('pkg-qty-assistant')?.addEventListener('change', (e) => {
        const qty = parseInt(e.target.value) || 0;
        document.getElementById('pkg-check-assistant').checked = qty > 0;
        updateAssistantPrice();
        updatePackageSummary();
    });
    
    document.getElementById('pkg-check-assistant')?.addEventListener('change', (e) => {
        if (e.target.checked) {
            document.getElementById('pkg-qty-assistant').value = 1;
        } else {
            document.getElementById('pkg-qty-assistant').value = 0;
        }
        updateAssistantPrice();
        updatePackageSummary();
    });
    
    // Feature checkboxes
    ['inventory', 'rehabilitation', 'dentistry', 'cardiology', 'medicalImaging', 'specialty-general'].forEach(feature => {
        const checkbox = document.getElementById(`pkg-check-${feature}`);
        if (checkbox) {
            checkbox.addEventListener('change', () => {
                const row = document.getElementById(`pkg-option-${feature}`);
                if (row) {
                    row.classList.toggle('selected', checkbox.checked);
                }
                syncPackageSpecialtyButtons(selectedPackageSpecialty);
                updatePackageSummary();
            });
        }
    });

    document.querySelectorAll('[data-pkg-specialty]').forEach((button) => {
        if (button.dataset.specialtyBound) return;
        button.addEventListener('click', () => {
            setPackageActiveSpecialty(button.dataset.pkgSpecialty || 'general');
        });
        button.dataset.specialtyBound = '1';
    });
    
    syncPackageSpecialtyButtons(selectedPackageSpecialty);
    updatePackageSummary();
    loadPackageSpecialtyBasesSummary();
    console.log('✅ Package Config module initialized');
}

async function loadPackageSpecialtyBasesSummary() {
    if (!window.api?.package?.getLoadedBases) return;
    try {
        const result = await window.api.package.getLoadedBases();
        loadedSpecialtyBasesCache = result.success && Array.isArray(result.data) ? result.data : [];
        updatePackageSummary();
    } catch (error) {
        console.error('Error loading specialty bases summary:', error);
    }
}

async function loadExistingPackageConfig() {
    try {
        const result = await window.api.package.getConfig();
        if (result.success && result.data && result.data.clientName !== 'Client Non Configuré') {
            const config = result.data;
            document.getElementById('pkg-clientName').value = config.clientName || '';
            
            if (config.packageType) {
                selectPackageType(config.packageType);
            }
            
            document.getElementById('pkg-qty-doctor').value = config.maxDoctors || 1;
            document.getElementById('pkg-qty-assistant').value = config.maxAssistants || 0;
            document.getElementById('pkg-check-assistant').checked = config.maxAssistants > 0;
            
            // Load features
            const enabledSpecialties = parseEnabledSpecialtiesFromConfig(config);
            document.getElementById('pkg-check-specialty-general').checked = enabledSpecialties.includes('general');
            document.getElementById('pkg-check-inventory').checked = config.featureInventory !== 0;
            document.getElementById('pkg-check-rehabilitation').checked = enabledSpecialties.includes('mpr');
            document.getElementById('pkg-check-dentistry').checked = enabledSpecialties.includes('dentistry');
            document.getElementById('pkg-check-cardiology').checked = enabledSpecialties.includes('cardiology');
            document.getElementById('pkg-check-medicalImaging').checked = config.featureMedicalImaging !== 0;
            // Update UI
            ['inventory', 'rehabilitation', 'dentistry', 'cardiology', 'medicalImaging', 'specialty-general'].forEach(feature => {
                const checkbox = document.getElementById(`pkg-check-${feature}`);
                const row = document.getElementById(`pkg-option-${feature}`);
                if (checkbox && row) {
                    row.classList.toggle('selected', checkbox.checked);
                }
            });

            selectedPackageSpecialties = enabledSpecialties;
            selectedPackageSpecialty = enabledSpecialties.includes(config.activeSpecialty) ? config.activeSpecialty : enabledSpecialties[0] || 'general';
            syncPackageSpecialtyButtons(selectedPackageSpecialty);
            
            updateDoctorPrice();
            updateAssistantPrice();
            updatePackageSummary();
        }
    } catch (e) {
        console.log('No existing config to load');
    }
}

function selectPackageType(packageId) {
    selectedPackageType = packageId;
    
    // Update UI
    document.querySelectorAll('.package-card-inline').forEach(card => {
        card.classList.remove('selected');
        if (card.dataset.package === packageId) {
            card.classList.add('selected');
        }
    });
    
    // Apply package preset
    const preset = PKG_PACKAGES[packageId];
    if (preset) {
        document.getElementById('pkg-qty-doctor').value = preset.doctors;
        document.getElementById('pkg-qty-assistant').value = preset.assistants;
        document.getElementById('pkg-check-assistant').checked = preset.assistants > 0;
        
        // Reset optional features
        ['inventory', 'rehabilitation', 'dentistry', 'cardiology', 'medicalImaging'].forEach(feature => {
            const checkbox = document.getElementById(`pkg-check-${feature}`);
            const row = document.getElementById(`pkg-option-${feature}`);
            if (checkbox && row) {
                const isEnabled = preset.features.includes(feature);
                checkbox.checked = isEnabled;
                row.classList.toggle('selected', isEnabled);
            }
        });

        const presetSpecialty = preset.features.includes('rehabilitation')
            ? 'mpr'
            : preset.features.includes('cardiology')
                ? 'cardiology'
                : preset.features.includes('dentistry')
                    ? 'dentistry'
                    : 'general';
        const generalCheckbox = document.getElementById('pkg-check-specialty-general');
        if (generalCheckbox) {
            generalCheckbox.checked = !preset.features.some((feature) => ['rehabilitation', 'cardiology', 'dentistry'].includes(feature));
            document.getElementById('pkg-option-specialty-general')?.classList.toggle('selected', generalCheckbox.checked);
        }
        syncPackageSpecialtyButtons(presetSpecialty);
        
        updateDoctorPrice();
        updateAssistantPrice();
        updatePackageSummary();
    }
}

function updateDoctorPrice() {
    const qty = parseInt(document.getElementById('pkg-qty-doctor').value) || 1;
    document.getElementById('pkg-price-doctor').textContent = qty > 1 ? `${qty} postes` : 'Poste principal';
}

function updateAssistantPrice() {
    const qty = parseInt(document.getElementById('pkg-qty-assistant').value) || 0;
    document.getElementById('pkg-price-assistant').textContent = qty > 0 ? `${qty} poste(s)` : 'Optionnel';
}

function formatPrice(price) {
    return price.toLocaleString('fr-FR') + ' DZD';
}

function updatePackageSummary() {
    const summaryEl = document.getElementById('pkg-summary-items');
    let html = '';
    
    // Doctors
    const qtyDoctors = parseInt(document.getElementById('pkg-qty-doctor').value) || 1;
    html += `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #dee2e6;">
        <span>👨‍⚕️ Médecin x${qtyDoctors}</span>
        <span>${qtyDoctors > 1 ? `${qtyDoctors} postes` : '1 poste'}</span>
    </div>`;
    
    // Assistants
    const qtyAssistants = parseInt(document.getElementById('pkg-qty-assistant').value) || 0;
    if (qtyAssistants > 0) {
        html += `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #dee2e6;">
            <span>👩‍💼 Assistante x${qtyAssistants}</span>
            <span>${qtyAssistants} poste(s)</span>
        </div>`;
    }
    
    // Optional Features
    const optionalFeatures = [
        { id: 'inventory', label: 'Stock / inventaire' },
        { id: 'rehabilitation', label: '♿ Module Rééducation MPR' },
        { id: 'dentistry', label: '🦷 Module Dentiste' },
        { id: 'cardiology', label: '💓 Module Cardiologue' },
        { id: 'medicalImaging', label: '🩻 Imagerie médicale', includedWhenChecked: true }
    ];
    
    optionalFeatures.forEach(feature => {
        const checkbox = document.getElementById(`pkg-check-${feature.id}`);
        if (checkbox && checkbox.checked) {
            html += `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #dee2e6;">
                <span>${feature.label}</span>
                <span>Activé</span>
            </div>`;
        }
    });
    
    const enabledSpecialties = getEnabledPackageSpecialties();
    html += `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #dee2e6;">
        <span>🩺 Spécialités activées</span>
        <span style="color: #145da0; font-weight: 700;">${enabledSpecialties.map((key) => PKG_SPECIALTY_LABELS[key] || key).join(', ')}</span>
    </div>`;

    const loadedRows = loadedSpecialtyBasesCache
        .filter((base) => enabledSpecialties.includes(base.key))
        .map((base) => `<div style="display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <span>${base.label}</span>
            <span>${base.logoExists ? 'Logo OK' : 'Logo app'} · ${base.medicationJsonLoaded ? base.medicationCount : 0} méd. · ${base.examsCount} examens · ${base.imagingFamiliesCount} imagerie · ${base.equipmentCategoriesCount} équip.</span>
        </div>`)
        .join('');
    if (loadedRows) {
        html += loadedRows;
    }
    
    summaryEl.innerHTML = html;
    document.getElementById('pkg-total-price').textContent = 'Prête à enregistrer';
}

async function savePackageConfig() {
    const clientName = document.getElementById('pkg-clientName').value.trim();
    if (!clientName) {
        showPackageMessage('Veuillez entrer le nom du client', 'error');
        return;
    }

    const inventoryEnabled = document.getElementById('pkg-check-inventory').checked;
    const mprEnabled = document.getElementById('pkg-check-rehabilitation').checked;
    const dentistryEnabled = document.getElementById('pkg-check-dentistry').checked;
    const cardiologyEnabled = document.getElementById('pkg-check-cardiology').checked;
    const medicalImagingEnabled = document.getElementById('pkg-check-medicalImaging').checked;
    syncPackageSpecialtyButtons(selectedPackageSpecialty);
    const safeActiveSpecialty = selectedPackageSpecialty;
    const enabledSpecialties = getEnabledPackageSpecialties();
    
    const config = {
        clientName,
        packageType: selectedPackageType,
        maxDoctors: parseInt(document.getElementById('pkg-qty-doctor').value) || 1,
        maxAssistants: parseInt(document.getElementById('pkg-qty-assistant').value) || 0,
        // Always included features
        featurePrescriptions: true,
        featureWaitingRoom: true,
        featureDailySummary: mprEnabled,
        featureStatistics: true,
        featureInventory: inventoryEnabled,
        featureDebts: true,
        featureCalendar: true,
        featureDocuments: true,
        featureSickLeaves: true,
        featureAfterSalesSupport: true,
        // Optional features
        featureKineStaff: mprEnabled,
        featureRehabilitation: mprEnabled,
        featureDentistry: dentistryEnabled,
        featureCardiology: cardiologyEnabled,
        featureMedicalImaging: medicalImagingEnabled,
        activeSpecialty: safeActiveSpecialty,
        enabledSpecialties,
        featureMultiPC: false,
        featureAiReports: false,
        featureAiChatbot: false,
        totalPrice: calculatePackageTotal()
    };
    
    try {
        const result = await window.api.package.saveConfig(config);
        if (result.success) {
            showPackageMessage('✅ Configuration enregistrée avec succès!', 'success');
            await applySavedPackageConfigState();
        } else {
            showPackageMessage('❌ Erreur: ' + result.error, 'error');
        }
    } catch (error) {
        showPackageMessage('❌ Erreur: ' + error.message, 'error');
    }
}

async function skipPackageConfig() {
    const config = {
        clientName: 'Client par défaut',
        packageType: 'basic',
        maxDoctors: 1,
        maxAssistants: 0,
        featurePrescriptions: true,
        featureWaitingRoom: true,
        featureDailySummary: false,
        featureStatistics: true,
        featureInventory: true,
        featureKineStaff: false,
        featureRehabilitation: false,
        featureDentistry: false,
        featureCardiology: false,
        featureMedicalImaging: true,
        activeSpecialty: 'general',
        enabledSpecialties: ['general'],
        featureMultiPC: false,
        featureAiReports: false,
        featureAiChatbot: false,
        featureDebts: true,
        featureCalendar: true,
        featureDocuments: true,
        featureSickLeaves: true,
        featureAfterSalesSupport: true,
        totalPrice: 60000
    };
    
    try {
        await window.api.package.saveConfig(config);
        showPackageMessage('Configuration par défaut enregistrée', 'success');
        await applySavedPackageConfigState();
    } catch (error) {
        console.error('Error skipping config:', error);
    }
}

function calculatePackageTotal() {
    let total = 0;
    const qtyDoctors = parseInt(document.getElementById('pkg-qty-doctor').value) || 1;
    const qtyAssistants = parseInt(document.getElementById('pkg-qty-assistant').value) || 0;
    
    total += qtyDoctors * PKG_PRICES.doctor;
    total += qtyAssistants * PKG_PRICES.assistant;
    
    const features = ['inventory', 'rehabilitation', 'dentistry', 'cardiology', 'medicalImaging'];
    features.forEach(feature => {
        const checkbox = document.getElementById(`pkg-check-${feature}`);
        if (checkbox && checkbox.checked && PKG_PRICES[feature] > 0) {
            total += PKG_PRICES[feature];
        }
    });
    
    return total;
}

function showPackageMessage(text, type) {
    const msgEl = document.getElementById('pkg-message');
    msgEl.textContent = text;
    msgEl.className = type;
    msgEl.style.display = 'block';
}

// Export functions to global scope
window.savePackageConfig = savePackageConfig;
window.skipPackageConfig = skipPackageConfig;
window.initializePackageConfig = initializePackageConfig;
window.setPackageActiveSpecialty = setPackageActiveSpecialty;
