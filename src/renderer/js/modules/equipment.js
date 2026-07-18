// =============================================
// ÉQUIPEMENT MODULE — Sous-plan G
// Suivi des équipements du cabinet, maintenance, alertes
// =============================================

let equipmentData = [];
let equipmentCategories = [];
let equipmentAlerts = { overdue: [], upcoming: [], inMaintenance: [], unscheduled: [] };
let equipmentTabState = { activeTab: 'list' };
let equipmentSelectedId = null;
let canManageEquipment = false;
let canSeeEquipmentCosts = false;
const EQUIPMENT_PAGE_SIZE = 12;
let equipmentPagination = { page: 1, pageSize: EQUIPMENT_PAGE_SIZE, total: 0, totalPages: 1 };

function checkEquipmentPerms() {
    const isSuperAdmin = typeof currentUserIsSuperAdmin !== 'undefined' ? currentUserIsSuperAdmin : false;
    const isAdmin = typeof currentUserIsAdmin !== 'undefined' ? currentUserIsAdmin : false;
    const role = typeof currentUserRole === 'string' ? currentUserRole.trim().toLowerCase() : '';
    const isPractitioner = ['doctor', 'dentist'].includes(role);
    canManageEquipment = isSuperAdmin || isAdmin || isPractitioner;
    canSeeEquipmentCosts = isSuperAdmin || isAdmin || isPractitioner;
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
    const validTabs = ['list', 'alerts'];
    if (!validTabs.includes(tabName)) return;
    equipmentTabState.activeTab = tabName;
    document.querySelectorAll('#equipment .module-tabs-inline [data-tab]').forEach(btn => {
        const isActive = btn.dataset.tab === tabName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
    });
    document.querySelectorAll('#equipment .equipment-tab-content').forEach(c => c.style.display = 'none');
    const target = document.getElementById('equipment-tab-' + tabName);
    if (target) target.style.display = 'block';

    const addBtn = document.getElementById('equipment-add-btn');
    if (addBtn) addBtn.style.display = tabName === 'list' ? '' : 'none';

    if (tabName === 'list') loadEquipmentList();
    if (tabName === 'alerts') loadEquipmentAlerts();
}

async function loadEquipmentList(page = 1) {
    const tbody = document.getElementById('equipment-list-tbody');
    if (!tbody) return;
    try {
        const category = document.getElementById('equipment-filter-category')?.value || '';
        const status = document.getElementById('equipment-filter-status')?.value || '';
        const search = document.getElementById('equipment-search')?.value.trim() || '';
        const result = await window.api.equipment.getAll({ category, status, search });
        equipmentData = result.success ? result.data : [];
        const totalPages = Math.max(1, Math.ceil(equipmentData.length / EQUIPMENT_PAGE_SIZE));
        equipmentPagination = {
            page: Math.min(Math.max(1, Number(page) || 1), totalPages),
            pageSize: EQUIPMENT_PAGE_SIZE,
            total: equipmentData.length,
            totalPages
        };
        displayEquipmentList();
    } catch (e) { console.error('Error loading equipment list:', e); }
}

function displayEquipmentList() {
    const tbody = document.getElementById('equipment-list-tbody');
    if (!tbody) return;
    if (!equipmentData.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="module-empty-cell">
            <div class="module-empty-state">
                <span class="module-empty-state-icon" aria-hidden="true">+</span>
                <strong>Aucun équipement enregistré</strong>
                <p>Ajoutez le premier appareil du cabinet ou modifiez les filtres.</p>
                ${canManageEquipment ? '<button class="btn btn-primary btn-sm" onclick="openEquipmentModal()">+ Ajouter un équipement</button>' : ''}
            </div>
        </td></tr>`;
        renderEquipmentPagination();
        return;
    }
    const startIndex = (equipmentPagination.page - 1) * equipmentPagination.pageSize;
    const pageRows = equipmentData.slice(startIndex, startIndex + equipmentPagination.pageSize);
    tbody.innerHTML = pageRows.map(e => {
        const sc = EQUIPMENT_STATUS_COLORS[e.status] || EQUIPMENT_STATUS_COLORS.available;
        const catLabel = equipmentCategories.find(c => c.value === e.category)?.label || e.category;
        return `
        <tr style="cursor:pointer" onclick="showEquipmentDetail('${e.id}')">
            <td style="padding: 14px 16px;"><strong>${e.name}</strong></td>
            <td style="padding: 14px 16px; color: #64748b;">${catLabel}</td>
            <td style="padding: 14px 16px; color: #64748b;">${[e.brand, e.model].filter(Boolean).join(' / ') || '-'}</td>
            <td style="padding: 14px 16px; color: #64748b;">${e.assignedRoom || '-'}</td>
            <td style="padding: 14px 16px;"><span style="background:${sc.bg};color:${sc.color};padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600">${EQUIPMENT_STATUS_LABELS[e.status] || e.status}</span></td>
            <td style="padding: 14px 16px; color: #64748b;">${e.nextMaintenanceDate ? formatEquipmentDate(e.nextMaintenanceDate) : '-'}</td>
            <td class="equipment-row-actions" onclick="event.stopPropagation()">
                <button onclick="showEquipmentDetail('${e.id}')" class="inventory-action-btn inventory-action-btn-view">Fiche</button>
                ${canManageEquipment ? `<button onclick="editEquipment('${e.id}')" class="inventory-action-btn inventory-action-btn-edit">Modifier</button>` : ''}
                ${canManageEquipment ? `<button onclick="openAddMaintenanceModal('${e.id}')" class="inventory-action-btn inventory-action-btn-stock">Maintenance</button>` : ''}
                ${e.status === 'maintenance'
                    ? `<button onclick="clearEquipmentMaintenance('${e.id}')" class="inventory-action-btn equipment-action-resolve">Remettre en service</button>`
                    : `<button onclick="requestEquipmentMaintenance('${e.id}')" class="inventory-action-btn equipment-action-report">Signaler un problème</button>`}
                ${canManageEquipment ? `<button onclick="deleteEquipment('${e.id}')" class="inventory-action-btn equipment-action-delete">Supprimer</button>` : ''}
            </td>
        </tr>`;
    }).join('');
    renderEquipmentPagination();
}

function renderEquipmentPagination() {
    const container = document.getElementById('equipment-pagination');
    if (!container) return;
    const { page, pageSize, total, totalPages } = equipmentPagination;
    container.style.display = 'inline-flex';
    container.innerHTML = `
        <span class="equipment-pagination-count">${total ? `${page} / ${totalPages}` : '0 / 0'}</span>
        <button class="equipment-pagination-btn" title="Page précédente" aria-label="Page précédente" ${page <= 1 ? 'disabled' : ''} onclick="changeEquipmentPage(-1)">‹</button>
        <button class="equipment-pagination-btn" title="Page suivante" aria-label="Page suivante" ${page >= totalPages ? 'disabled' : ''} onclick="changeEquipmentPage(1)">›</button>`;
}

function changeEquipmentPage(direction) {
    const nextPage = Math.min(
        Math.max(1, equipmentPagination.page + Number(direction || 0)),
        equipmentPagination.totalPages
    );
    if (nextPage === equipmentPagination.page) return;
    equipmentPagination.page = nextPage;
    displayEquipmentList();
}

async function showEquipmentDetail(id) {
    equipmentSelectedId = id;
    const container = document.getElementById('equipment-detail-content');
    if (!container) return;
    container.innerHTML = '<div class="module-empty-state"><strong>Chargement de la fiche...</strong></div>';
    showModal('modal-equipment-detail');
    try {
        const result = await window.api.equipment.getById(id);
        if (!result.success) throw new Error(result.error || 'Équipement introuvable');
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
                    <strong>${formatEquipmentDate(m.maintenanceDate)} — ${MAINTENANCE_TYPE_LABELS[m.maintenanceType] || m.maintenanceType}</strong>
                    ${canSeeEquipmentCosts ? `<span>${formatEquipmentCurrency(m.cost)}</span>` : ''}
                </div>
                <div style="font-size:13px;color:#64748b">${m.technician || m.supplierName || ''}</div>
                ${m.notes ? `<div style="font-size:12px;color:#94a3b8">${m.notes}</div>` : ''}
            </div>`).join('')
            : '<div style="font-size:13px;color:#94a3b8">Aucune maintenance enregistrée</div>';

        const planUsageHtml = (e.planUsage || []).length
            ? e.planUsage.map(p => `<div style="font-size:13px;padding:4px 0">${p.planTitle || 'Plan'} — ${p.lastName || ''} ${p.firstName || ''} (${formatEquipmentDate(p.usageDate)})</div>`).join('')
            : '<div style="font-size:13px;color:#94a3b8">Aucune utilisation enregistrée</div>';

        const title = document.getElementById('equipment-detail-modal-title');
        if (title) title.textContent = e.name;
        container.innerHTML = `
        <div class="equipment-detail-layout">
            <section class="equipment-detail-summary">
                <p class="equipment-detail-category">${catLabel}</p>
                <span style="background:${sc.bg};color:${sc.color};padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600">${EQUIPMENT_STATUS_LABELS[e.status]}</span>
                <table class="equipment-detail-table">
                    <tr><td>Marque</td><td><strong>${e.brand || '-'}</strong></td></tr>
                    <tr><td>Modèle</td><td><strong>${e.model || '-'}</strong></td></tr>
                    <tr><td>N° de série</td><td><strong>${e.serialNumber || '-'}</strong></td></tr>
                    <tr><td>Salle</td><td><strong>${e.assignedRoom || '-'}</strong></td></tr>
                    <tr><td>Date d'achat</td><td>${formatEquipmentDate(e.purchaseDate)}</td></tr>
                    <tr><td>Fin de garantie</td><td>${formatEquipmentDate(e.warrantyEnd)}</td></tr>
                    <tr><td>Dernière maintenance</td><td>${formatEquipmentDate(e.lastMaintenanceDate)}</td></tr>
                    <tr><td>Prochaine maintenance</td><td><strong>${formatEquipmentDate(e.nextMaintenanceDate) || 'Non définie'}</strong></td></tr>
                </table>
                ${specificHtml}
                ${e.notes ? `<div style="margin-top:12px;font-size:13px;color:#64748b"><strong>Notes:</strong> ${e.notes.replace(/\n/g, '<br>')}</div>` : ''}
            </section>
            <section class="equipment-detail-history">
                <div class="equipment-detail-section-heading"><h3>Historique de maintenance</h3><span>${(e.maintenance || []).length} intervention(s)</span></div>
                <div class="equipment-maintenance-history">${maintenanceHtml}</div>
                <h3 class="equipment-detail-usage-title">Utilisation dans les plans</h3>
                ${planUsageHtml}
                ${canManageEquipment ? `<div style="margin-top:20px;display:flex;gap:8px">
                    <button onclick="editEquipment('${e.id}')" class="btn btn-secondary btn-small">Modifier</button>
                    <button onclick="openAddMaintenanceModal('${e.id}')" class="btn btn-primary btn-small">+ Maintenance</button>
                    <button onclick="deleteEquipment('${e.id}')" class="btn btn-danger btn-small">Supprimer</button>
                </div>` : ''}
                <div class="equipment-detail-actions-secondary">
                  ${e.status === 'maintenance'
                    ? `<button onclick="clearEquipmentMaintenance('${e.id}')" class="btn btn-secondary btn-small">Remettre en service</button>`
                    : `<button onclick="requestEquipmentMaintenance('${e.id}')" class="btn btn-secondary btn-small">Signaler un problème</button>`}
                </div>
            </section>
        </div>`;
    } catch (e) {
        console.error('Error loading equipment detail:', e);
        container.innerHTML = `<div class="module-empty-state"><strong>Impossible de charger la fiche</strong><p>${String(e.message || 'Erreur inconnue')}</p></div>`;
        showNotification('Erreur: ' + (e.message || 'Impossible de charger la fiche'), 'error');
    }
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
    const renderCards = (items, containerId, kind) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!items.length) { container.innerHTML = '<div style="font-size:13px;color:#94a3b8;padding:12px">Aucun équipement</div>'; return; }
        container.innerHTML = items.map(e => {
            const sc = EQUIPMENT_STATUS_COLORS[e.status] || EQUIPMENT_STATUS_COLORS.available;
            const catLabel = equipmentCategories.find(c => c.value === e.category)?.label || e.category;
            const maintenanceDate = e.nextMaintenanceDate ? new Date(`${String(e.nextMaintenanceDate).slice(0, 10)}T00:00:00`) : null;
            const dayDistance = maintenanceDate && !Number.isNaN(maintenanceDate.getTime())
                ? Math.ceil((maintenanceDate.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
                : null;
            const timing = kind === 'overdue' && dayDistance !== null
                ? `${Math.abs(dayDistance)} jour(s) de retard`
                : kind === 'upcoming' && dayDistance !== null
                    ? `Dans ${dayDistance} jour(s)`
                    : kind === 'unscheduled' ? 'Aucune date définie' : 'Intervention nécessaire';
            return `
            <div class="equipment-alert-card equipment-alert-${kind}" onclick="showEquipmentDetail('${e.id}')">
                <div class="equipment-alert-main">
                    <strong>${e.name}</strong>
                    <div>${catLabel}${e.assignedRoom ? ` · ${e.assignedRoom}` : ''}</div>
                    <small>Dernière maintenance : ${formatEquipmentDate(e.lastMaintenanceDate)} · Prochaine : ${formatEquipmentDate(e.nextMaintenanceDate)}</small>
                </div>
                <div class="equipment-alert-actions" onclick="event.stopPropagation()">
                    <span class="equipment-alert-timing">${timing}</span>
                    <span style="background:${sc.bg};color:${sc.color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">${EQUIPMENT_STATUS_LABELS[e.status]}</span>
                    <button onclick="showEquipmentDetail('${e.id}')" class="btn btn-secondary btn-small">Voir la fiche</button>
                    ${kind === 'inMaintenance'
                        ? `<button onclick="clearEquipmentMaintenance('${e.id}')" class="btn btn-secondary btn-small">Remettre en service</button>`
                        : `<button onclick="openAddMaintenanceModal('${e.id}')" class="btn btn-primary btn-small">Planifier / enregistrer</button>`}
                </div>
            </div>`;
        }).join('');
    };
    renderCards(equipmentAlerts.overdue, 'equipment-alerts-overdue-list', 'overdue');
    renderCards(equipmentAlerts.upcoming, 'equipment-alerts-upcoming-list', 'upcoming');
    renderCards(equipmentAlerts.inMaintenance, 'equipment-alerts-inmai-list', 'inMaintenance');
    renderCards(equipmentAlerts.unscheduled || [], 'equipment-alerts-unscheduled-list', 'unscheduled');
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

async function filterEquipment() { await loadEquipmentList(1); }

async function resetEquipmentFilters() {
    const category = document.getElementById('equipment-filter-category');
    const status = document.getElementById('equipment-filter-status');
    const search = document.getElementById('equipment-search');
    if (category) category.value = '';
    if (status) status.value = '';
    if (search) search.value = '';
    await loadEquipmentList(1);
}

function openEquipmentModal(id = null) {
    const title = document.getElementById('equipment-modal-title');
    document.getElementById('equipment-form').reset();
    document.getElementById('equipment-id').value = '';
    document.getElementById('equipment-specific-fields').innerHTML = '';
    title.textContent = 'Nouvel équipement';

    if (id) {
        const eq = equipmentData.find(e => e.id === id);
        if (eq) {
            title.textContent = 'Modifier l’équipement';
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

function editEquipment(id) {
    closeModal('modal-equipment-detail');
    openEquipmentModal(id);
}

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
        <h3>Ajouter un équipement</h3>
        <p>Cliquez sur le bouton ci-dessous pour ouvrir le formulaire.</p>
        <button class="btn btn-primary" onclick="openEquipmentModal()">+ Nouvel équipement</button>
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
        const result = await window.api.equipment.requestMaintenance(id, reason);
        if (!result?.success) throw new Error(result?.error || 'Signalement impossible');
        showNotification('Demande de maintenance envoyée', 'success');
        await loadEquipmentList();
        await loadEquipmentAlerts();
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
}

async function clearEquipmentMaintenance(id) {
    if (!confirm('Confirmer que cet équipement est de nouveau disponible ?')) return;
    try {
        const result = await window.api.equipment.clearMaintenanceRequest(id);
        if (!result?.success) throw new Error(result?.error || 'Mise à jour impossible');
        showNotification('Équipement remis en service', 'success');
        await loadEquipmentList();
        await loadEquipmentAlerts();
        if (equipmentSelectedId === id) await showEquipmentDetail(id);
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
}

async function deleteEquipment(id) {
    if (!confirm('Supprimer cet équipement ? Il sera retiré de la liste mais son historique restera conservé.')) return;
    try {
        const result = await window.api.equipment.delete(id);
        if (!result?.success) throw new Error(result?.error || 'Suppression impossible');
        closeModal('modal-equipment-detail');
        equipmentSelectedId = null;
        showNotification('Équipement supprimé', 'success');
        await loadEquipmentList();
        await loadEquipmentAlerts();
        await updateEquipmentStats();
    } catch (e) { showNotification('Erreur', 'error'); }
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function formatEquipmentCurrency(amount) {
    return new Intl.NumberFormat('fr-DZ', { style: 'decimal', minimumFractionDigits: 2 }).format(amount) + ' DZD';
}

function formatEquipmentDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('fr-FR');
}

// ─── GLOBAL EXPORTS ──────────────────────────────────────────────────────────
window.initEquipment = initEquipment;
window.clearEquipmentMaintenance = clearEquipmentMaintenance;
window.switchEquipmentTab = switchEquipmentTab;
window.refreshEquipment = refreshEquipment;
window.filterEquipment = filterEquipment;
window.resetEquipmentFilters = resetEquipmentFilters;
window.changeEquipmentPage = changeEquipmentPage;
window.openEquipmentModal = openEquipmentModal;
window.editEquipment = editEquipment;
window.saveEquipment = saveEquipment;
window.onEquipmentCategoryChange = onEquipmentCategoryChange;
window.showEquipmentDetail = showEquipmentDetail;
window.openAddMaintenanceModal = openAddMaintenanceModal;
window.saveMaintenance = saveMaintenance;
window.requestEquipmentMaintenance = requestEquipmentMaintenance;
window.deleteEquipment = deleteEquipment;
