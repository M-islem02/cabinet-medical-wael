// =============================================
// ÉQUIPEMENT MODULE — Sous-plan G
// Suivi des équipements du cabinet, maintenance, alertes
// =============================================

let equipmentData = [];
let equipmentCategories = [];
let equipmentAlerts = { overdue: [], upcoming: [], inMaintenance: [] };
let equipmentCurrentTab = 'list';
let equipmentSelectedId = null;
let canManageEquipment = false;
let canSeeEquipmentCosts = false;

function checkEquipmentPerms() {
    const isSuperAdmin = typeof currentUserIsSuperAdmin !== 'undefined' ? currentUserIsSuperAdmin : false;
    const isAdmin = typeof currentUserIsAdmin !== 'undefined' ? currentUserIsAdmin : false;
    canManageEquipment = isSuperAdmin || isAdmin;
    canSeeEquipmentCosts = isSuperAdmin || isAdmin;
}

const EQUIPMENT_STATUS_LABELS = {
    available: 'Disponible',
    in_use: 'En cours d\'utilisation',
    maintenance: 'En maintenance',
    out_of_service: 'Hors service'
};

const EQUIPMENT_STATUS_COLORS = {
    available: { bg: '#dcfce7', color: '#16a34a' },
    in_use: { bg: '#dbeafe', color: '#2563eb' },
    maintenance: { bg: '#fef3c7', color: '#d97706' },
    out_of_service: { bg: '#fee2e2', color: '#dc2626' }
};

const MAINTENANCE_TYPE_LABELS = {
    preventive: 'Préventive',
    corrective: 'Corrective',
    calibration: 'Calibration',
    inspection: 'Inspection',
    repair: 'Réparation',
    other: 'Autre'
};

async function initEquipment() {
    checkEquipmentPerms();
    await loadEquipmentCategories();
    await switchEquipmentTab('list');
}

async function loadEquipmentCategories() {
    try {
        const result = await window.api.equipment.getCategories();
        equipmentCategories = result.success ? result.data : [];
        const filter = document.getElementById('equipment-filter-category');
        const ctg = document.getElementById('equipment-category');
        if (filter) filter.innerHTML = '<option value="">Toutes catégories</option>' +
            equipmentCategories.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
        if (ctg) ctg.innerHTML = '<option value="">-- Choisir --</option>' +
            equipmentCategories.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
    } catch (e) { console.error('Error loading equipment categories:', e); }
}

async function refreshEquipment() {
    await loadEquipmentList();
    await loadEquipmentAlerts();
}

function switchEquipmentTab(tabName) {
    equipmentCurrentTab = tabName;
    document.querySelectorAll('.equipment-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.equipment-tab-content').forEach(c => c.style.display = 'none');
    const target = document.getElementById('equipment-tab-' + tabName);
    if (target) target.style.display = 'block';

    const addBtn = document.getElementById('equipment-add-btn');
    if (addBtn) addBtn.style.display = ['list', 'add'].includes(tabName) ? '' : 'none';

    if (tabName === 'list') loadEquipmentList();
    if (tabName === 'detail') { /* Handled by click on listing */ }
    if (tabName === 'alerts') loadEquipmentAlerts();
    if (tabName === 'add') renderEquipmentAddForm();
}

async function loadEquipmentList() {
    const tbody = document.getElementById('equipment-list-tbody');
    if (!tbody) return;
    try {
        const category = document.getElementById('equipment-filter-category')?.value || '';
        const status = document.getElementById('equipment-filter-status')?.value || '';
        const search = document.getElementById('equipment-search')?.value.trim() || '';
        const result = await window.api.equipment.getAll({ category, status, search });
        equipmentData = result.success ? result.data : [];
        displayEquipmentList();
    } catch (e) { console.error('Error loading equipment list:', e); }
}

function displayEquipmentList() {
    const tbody = document.getElementById('equipment-list-tbody');
    if (!tbody) return;
    if (!equipmentData.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 40px;">Aucun équipement</td></tr>`;
        return;
    }
    tbody.innerHTML = equipmentData.map(e => {
        const sc = EQUIPMENT_STATUS_COLORS[e.status] || EQUIPMENT_STATUS_COLORS.available;
        const catLabel = equipmentCategories.find(c => c.value === e.category)?.label || e.category;
        return `
        <tr style="cursor:pointer" onclick="showEquipmentDetail('${e.id}')">
            <td style="padding: 14px 16px;"><strong>${e.name}</strong></td>
            <td style="padding: 14px 16px; color: #64748b;">${catLabel}</td>
            <td style="padding: 14px 16px; color: #64748b;">${[e.brand, e.model].filter(Boolean).join(' / ') || '-'}</td>
            <td style="padding: 14px 16px; color: #64748b;">${e.assignedRoom || '-'}</td>
            <td style="padding: 14px 16px;"><span style="background:${sc.bg};color:${sc.color};padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600">${EQUIPMENT_STATUS_LABELS[e.status] || e.status}</span></td>
            <td style="padding: 14px 16px; color: #64748b;">${e.nextMaintenanceDate ? formatDate(e.nextMaintenanceDate) : '-'}</td>
            <td style="padding: 14px 16px;" onclick="event.stopPropagation()">
                ${canManageEquipment ? `<button onclick="editEquipment('${e.id}')" class="inventory-action-btn inventory-action-btn-edit">Modifier</button>` : ''}
                ${canManageEquipment ? `<button onclick="openAddMaintenanceModal('${e.id}')" class="inventory-action-btn inventory-action-btn-stock">Maintenance</button>` : ''}
                ${!canManageEquipment ? `<button onclick="requestEquipmentMaintenance('${e.id}')" class="inventory-action-btn inventory-action-btn-edit">🚩 Signaler</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

async function showEquipmentDetail(id) {
    equipmentSelectedId = id;
    switchEquipmentTab('detail');
    try {
        const result = await window.api.equipment.getById(id);
        if (!result.success) return;
        const e = result.data;
        const sc = EQUIPMENT_STATUS_COLORS[e.status] || EQUIPMENT_STATUS_COLORS.available;
        const catLabel = equipmentCategories.find(c => c.value === e.category)?.label || e.category;
        const sf = e.specificFields || {};
        const specificHtml = Object.entries(sf).length
            ? `<div style="margin-bottom:16px"><h4 style="font-size:14px;margin-bottom:6px">Champs spécifiques</h4>${Object.entries(sf).map(([k, v]) => `<div style="font-size:13px;padding:4px 0"><strong>${k}:</strong> ${v}</div>`).join('')}</div>`
            : '';
        const maintenanceHtml = (e.maintenance || []).length
            ? e.maintenance.map(m => `<div style="padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;font-size:13px">
                    <strong>${formatDate(m.maintenanceDate)} — ${MAINTENANCE_TYPE_LABELS[m.maintenanceType] || m.maintenanceType}</strong>
                    ${canSeeEquipmentCosts ? `<span>${formatCurrency(m.cost)}</span>` : ''}
                </div>
                <div style="font-size:13px;color:#64748b">${m.technician || m.supplierName || ''}</div>
                ${m.notes ? `<div style="font-size:12px;color:#94a3b8">${m.notes}</div>` : ''}
            </div>`).join('')
            : '<div style="font-size:13px;color:#94a3b8">Aucune maintenance enregistrée</div>';

        const planUsageHtml = (e.planUsage || []).length
            ? e.planUsage.map(p => `<div style="font-size:13px;padding:4px 0">${p.planTitle || 'Plan'} — ${p.lastName || ''} ${p.firstName || ''} (${formatDate(p.usageDate)})</div>`).join('')
            : '<div style="font-size:13px;color:#94a3b8">Aucune utilisation enregistrée</div>';

        const container = document.getElementById('equipment-detail-content');
        if (!container) return;
        container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
            <div>
                <h3 style="margin:0 0 8px 0;font-size:20px">${e.name}</h3>
                <p style="color:#64748b;margin:0 0 16px 0">${catLabel}</p>
                <span style="background:${sc.bg};color:${sc.color};padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600">${EQUIPMENT_STATUS_LABELS[e.status]}</span>
                <table style="width:100%;margin-top:16px;font-size:14px">
                    <tr><td style="padding:6px 0;color:#64748b">Marque:</td><td><strong>${e.brand || '-'}</strong></td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">Modèle:</td><td><strong>${e.model || '-'}</strong></td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">N° Série:</td><td><strong>${e.serialNumber || '-'}</strong></td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">Salle:</td><td><strong>${e.assignedRoom || '-'}</strong></td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">Achat:</td><td>${formatDate(e.purchaseDate)}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">Garantie:</td><td>${formatDate(e.warrantyEnd)}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">Dernière maintenance:</td><td>${formatDate(e.lastMaintenanceDate)}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b">Prochaine maintenance:</td><td><strong>${formatDate(e.nextMaintenanceDate) || 'Non définie'}</strong></td></tr>
                </table>
                ${specificHtml}
                ${e.notes ? `<div style="margin-top:12px;font-size:13px;color:#64748b"><strong>Notes:</strong> ${e.notes.replace(/\n/g, '<br>')}</div>` : ''}
            </div>
            <div>
                <h4 style="margin:0 0 12px 0">Historique de maintenance</h4>
                <div style="max-height:300px;overflow-y:auto;margin-bottom:24px">${maintenanceHtml}</div>
                <h4 style="margin:0 0 8px 0">Utilisation dans les plans</h4>
                ${planUsageHtml}
                ${canManageEquipment ? `<div style="margin-top:20px;display:flex;gap:8px">
                    <button onclick="editEquipment('${e.id}')" class="btn btn-secondary btn-small">Modifier</button>
                    <button onclick="openAddMaintenanceModal('${e.id}')" class="btn btn-primary btn-small">+ Maintenance</button>
                </div>` : ''}
                ${!canManageEquipment ? `<button onclick="requestEquipmentMaintenance('${e.id}')" class="btn btn-small" style="margin-top:20px;background:#fef3c7;border:1px solid #fcd34d;color:#92400e">🚩 Signaler un besoin de maintenance</button>` : ''}
            </div>
        </div>`;
    } catch (e) { console.error('Error loading equipment detail:', e); }
}

async function loadEquipmentAlerts() {
    try {
        const result = await window.api.equipment.getAlerts(15);
        if (result.success) equipmentAlerts = result.data;
        displayEquipmentAlerts();
        updateEquipmentStats();
    } catch (e) { console.error('Error loading equipment alerts:', e); }
}

function displayEquipmentAlerts() {
    const renderCards = (items, containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!items.length) { container.innerHTML = '<div style="font-size:13px;color:#94a3b8;padding:12px">Aucun équipement</div>'; return; }
        container.innerHTML = items.map(e => {
            const sc = EQUIPMENT_STATUS_COLORS[e.status] || EQUIPMENT_STATUS_COLORS.available;
            const catLabel = equipmentCategories.find(c => c.value === e.category)?.label || e.category;
            return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;cursor:pointer" onclick="showEquipmentDetail('${e.id}')">
                <div>
                    <strong>${e.name}</strong>
                    <div style="font-size:12px;color:#64748b">${catLabel} · Prochaine: ${formatDate(e.nextMaintenanceDate)}</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                    <span style="background:${sc.bg};color:${sc.color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">${EQUIPMENT_STATUS_LABELS[e.status]}</span>
                    ${canManageEquipment ? `<button onclick="event.stopPropagation();openAddMaintenanceModal('${e.id}')" class="btn btn-primary btn-small">Maintenance</button>` : ''}
                </div>
            </div>`;
        }).join('');
    };
    renderCards(equipmentAlerts.overdue, 'equipment-alerts-overdue-list');
    renderCards(equipmentAlerts.upcoming, 'equipment-alerts-upcoming-list');
    renderCards(equipmentAlerts.inMaintenance, 'equipment-alerts-inmai-list');
}

async function updateEquipmentStats() {
    try {
        const result = await window.api.equipment.getAll({});
        const all = result.success ? result.data : [];
        const totalEl = document.getElementById('equip-stat-total');
        const availEl = document.getElementById('equip-stat-avail');
        if (totalEl) totalEl.textContent = all.length;
        if (availEl) availEl.textContent = all.filter(e => e.status === 'available').length;
        const upcomingEl = document.getElementById('equip-stat-upcoming');
        const inmaiEl = document.getElementById('equip-stat-inmai');
        if (upcomingEl) upcomingEl.textContent = (equipmentAlerts.upcoming || []).length;
        if (inmaiEl) inmaiEl.textContent = (equipmentAlerts.inMaintenance || []).length;
    } catch (e) { }
}

async function filterEquipment() { await loadEquipmentList(); }

function openEquipmentModal(id = null) {
    const title = document.getElementById('equipment-modal-title');
    document.getElementById('equipment-form').reset();
    document.getElementById('equipment-id').value = '';
    document.getElementById('equipment-specific-fields').innerHTML = '';
    title.textContent = '🔧 Nouvel Équipement';

    if (id) {
        const eq = equipmentData.find(e => e.id === id);
        if (eq) {
            title.textContent = '🔧 Modifier Équipement';
            document.getElementById('equipment-id').value = eq.id;
            document.getElementById('equipment-name').value = eq.name || '';
            document.getElementById('equipment-category').value = eq.category || '';
            document.getElementById('equipment-status').value = eq.status || 'available';
            document.getElementById('equipment-brand').value = eq.brand || '';
            document.getElementById('equipment-model').value = eq.model || '';
            document.getElementById('equipment-serial').value = eq.serialNumber || '';
            document.getElementById('equipment-room').value = eq.assignedRoom || '';
            document.getElementById('equipment-purchase-date').value = eq.purchaseDate || '';
            document.getElementById('equipment-warranty-end').value = eq.warrantyEnd || '';
            document.getElementById('equipment-last-maintenance').value = eq.lastMaintenanceDate || '';
            document.getElementById('equipment-next-maintenance').value = eq.nextMaintenanceDate || '';
            document.getElementById('equipment-notes').value = eq.notes || '';
            onEquipmentCategoryChange();
            setTimeout(() => fillSpecificFields(eq.specificFields || {}), 100);
        }
    } else {
        onEquipmentCategoryChange();
    }
    showModal('modal-equipment');
}

function editEquipment(id) { openEquipmentModal(id); }

async function saveEquipment(event) {
    event.preventDefault();
    const id = document.getElementById('equipment-id').value;
    const specificFields = {};
    document.querySelectorAll('#equipment-specific-fields input, #equipment-specific-fields textarea').forEach(el => {
        if (el.name && el.value) specificFields[el.name] = el.value;
    });
    const data = {
        name: document.getElementById('equipment-name').value.trim(),
        category: document.getElementById('equipment-category').value,
        status: document.getElementById('equipment-status').value,
        brand: document.getElementById('equipment-brand').value.trim(),
        model: document.getElementById('equipment-model').value.trim(),
        serialNumber: document.getElementById('equipment-serial').value.trim(),
        assignedRoom: document.getElementById('equipment-room').value.trim(),
        purchaseDate: document.getElementById('equipment-purchase-date').value || null,
        warrantyEnd: document.getElementById('equipment-warranty-end').value || null,
        lastMaintenanceDate: document.getElementById('equipment-last-maintenance').value || null,
        nextMaintenanceDate: document.getElementById('equipment-next-maintenance').value || null,
        notes: document.getElementById('equipment-notes').value.trim(),
        specificFields
    };
    try {
        const result = id
            ? await window.api.equipment.update(id, data)
            : await window.api.equipment.create(data);
        if (!result.success) throw new Error(result.error);
        closeModal('modal-equipment');
        showNotification(id ? 'Équipement modifié' : 'Équipement créé', 'success');
        await loadEquipmentList();
        await updateEquipmentStats();
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
}

function onEquipmentCategoryChange() {
    const catValue = document.getElementById('equipment-category').value;
    const container = document.getElementById('equipment-specific-fields');
    const cat = equipmentCategories.find(c => c.value === catValue);
    if (!cat || !cat.specificFields || !cat.specificFields.length) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = '<h4 style="margin:8px 0;font-size:14px">Champs spécifiques</h4>' +
        cat.specificFields.map(f => `<div class="form-group">
            <label>${f}</label>
            <input type="text" name="${f}" class="form-control" placeholder="${f}">
        </div>`).join('');
}

function fillSpecificFields(sf) {
    Object.entries(sf || {}).forEach(([k, v]) => {
        const el = document.querySelector(`#equipment-specific-fields [name="${k}"]`);
        if (el) el.value = v;
    });
}

function renderEquipmentAddForm() {
    const container = document.getElementById('equipment-add-form-container');
    if (!container) return;
    container.innerHTML = `
        <h3 style="margin:0 0 16px 0">➕ Ajouter un équipement</h3>
        <p style="color:#64748b;margin-bottom:16px">Cliquez sur le bouton ci-dessous pour ouvrir le formulaire.</p>
        <button class="btn btn-primary" onclick="openEquipmentModal()">➕ Nouvel Équipement</button>
    `;
}

async function openAddMaintenanceModal(equipmentId) {
    const eq = equipmentData.find(e => e.id === equipmentId);
    if (!eq) {
        const result = await window.api.equipment.getById(equipmentId);
        if (result.success) window._tempEquipment = result.data;
    }
    const name = eq ? eq.name : (window._tempEquipment ? window._tempEquipment.name : '');
    document.getElementById('maintenance-form').reset();
    document.getElementById('maintenance-equipment-id').value = equipmentId;
    document.getElementById('maintenance-equipment-name').textContent = 'Équipement: ' + name;
    document.getElementById('maintenance-date').value = new Date().toISOString().slice(0, 10);

    const supplierSelect = document.getElementById('maintenance-supplier');
    if (supplierSelect && supplierSelect.options.length <= 1) {
        try {
            const res = await window.api.supplier.getAll({});
            if (res.success) {
                supplierSelect.innerHTML = '<option value="">-- Aucun --</option>' +
                    res.data.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            }
        } catch (e) { }
    }
    showModal('modal-maintenance');
}

async function saveMaintenance(event) {
    event.preventDefault();
    const data = {
        equipmentId: document.getElementById('maintenance-equipment-id').value,
        maintenanceDate: document.getElementById('maintenance-date').value,
        maintenanceType: document.getElementById('maintenance-type').value,
        cost: parseFloat(document.getElementById('maintenance-cost').value) || 0,
        technician: document.getElementById('maintenance-technician').value.trim(),
        supplierId: document.getElementById('maintenance-supplier').value || null,
        notes: document.getElementById('maintenance-notes').value.trim(),
        nextMaintenanceDate: document.getElementById('maintenance-next-date').value || null
    };
    try {
        const result = await window.api.equipment.addMaintenance(data);
        if (!result.success) throw new Error(result.error);
        closeModal('modal-maintenance');
        showNotification('Maintenance enregistrée', 'success');
        await loadEquipmentList();
        await loadEquipmentAlerts();
        if (equipmentSelectedId) await showEquipmentDetail(equipmentSelectedId);
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
}

async function requestEquipmentMaintenance(id) {
    const reason = prompt('Décrivez le besoin de maintenance:');
    if (!reason) return;
    try {
        await window.api.equipment.requestMaintenance(id, reason);
        showNotification('Demande de maintenance envoyée', 'success');
        await loadEquipmentList();
        await loadEquipmentAlerts();
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
}

async function deleteEquipment(id) {
    if (!confirm('Supprimer cet équipement ?')) return;
    try {
        await window.api.equipment.delete(id);
        showNotification('Équipement supprimé', 'success');
        await loadEquipmentList();
    } catch (e) { showNotification('Erreur', 'error'); }
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function formatCurrency(amount) {
    if (typeof window.formatCurrency === 'function') return window.formatCurrency(amount);
    return new Intl.NumberFormat('fr-DZ', { style: 'decimal', minimumFractionDigits: 2 }).format(amount) + ' DZD';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR');
}

// ─── GLOBAL EXPORTS ──────────────────────────────────────────────────────────
window.initEquipment = initEquipment;
window.switchEquipmentTab = switchEquipmentTab;
window.refreshEquipment = refreshEquipment;
window.filterEquipment = filterEquipment;
window.openEquipmentModal = openEquipmentModal;
window.editEquipment = editEquipment;
window.saveEquipment = saveEquipment;
window.onEquipmentCategoryChange = onEquipmentCategoryChange;
window.showEquipmentDetail = showEquipmentDetail;
window.openAddMaintenanceModal = openAddMaintenanceModal;
window.saveMaintenance = saveMaintenance;
window.requestEquipmentMaintenance = requestEquipmentMaintenance;
window.deleteEquipment = deleteEquipment;
