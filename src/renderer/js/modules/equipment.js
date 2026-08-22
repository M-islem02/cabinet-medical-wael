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
        if (!equipmentData.length && !category && !status && !search) {
            equipmentData = [
                { id: 'eq-dent-001', name: 'Fauteuil Dentaire Ergonomique Pro', category: 'dental_chair', brand: 'Castellini', model: 'Skema 6', assignedRoom: 'Cabinet 1 (Soins Dentaires)', status: 'available', nextMaintenanceDate: '2026-12-10' },
                { id: 'eq-dent-002', name: 'Autoclave Stérilisateur Classe B 24L', category: 'sterilization', brand: 'Euronda', model: 'E10 24L', assignedRoom: 'Salle de Stérilisation', status: 'available', nextMaintenanceDate: '2027-01-01' },
                { id: 'eq-dent-003', name: 'Détartreur Ultrasonique Piézoélectrique', category: 'ultrasonic', brand: 'EMS Dental', model: 'Piezon Master 700', assignedRoom: 'Cabinet 1 (Soins Dentaires)', status: 'available', nextMaintenanceDate: '2026-11-15' },
                { id: 'eq-dent-004', name: 'Capteur Radiologique Intra-oral Numérique HD', category: 'imaging', brand: 'Carestream Dental', model: 'RVG 6200 Taille 2', assignedRoom: 'Cabinet 1 (Radiologie Dentaire)', status: 'available', nextMaintenanceDate: '2027-03-01' },
                { id: 'eq-dent-005', name: "Moteur d'Endodontie avec Localisateur d'Apex", category: 'endo_motor', brand: 'Dentsply Sirona', model: 'X-Smart Plus & Propex II', assignedRoom: 'Cabinet 1 (Soins Dentaires)', status: 'available', nextMaintenanceDate: '2026-10-12' },
                { id: 'eq-dent-006', name: 'Lampe à Photopolymériser LED Haute Puissance', category: 'curing_lamp', brand: 'Ivoclar Vivadent', model: 'Bluephase PowerCure', assignedRoom: 'Cabinet 1 (Soins Dentaires)', status: 'available', nextMaintenanceDate: '2026-11-05' },
                { id: 'eq-dent-007', name: 'Compresseur Dentaire Silencieux Sans Huile 50L', category: 'compressor', brand: 'Cattani', model: 'AC 200 avec Dessiccateur', assignedRoom: 'Local Technique', status: 'available', nextMaintenanceDate: '2026-12-20' },
                { id: 'eq-dent-008', name: 'Aéropolisseur Prophylactique Sub/Supragingival', category: 'air_polisher', brand: 'EMS Dental', model: 'AIRFLOW One', assignedRoom: 'Cabinet 1 (Soins Dentaires)', status: 'available', nextMaintenanceDate: '2026-12-01' },
                { id: 'eq-dent-009', name: "Moteur Chirurgical et d'Implantologie Dentaire", category: 'surgical_motor', brand: 'Bien-Air', model: 'Chiropro Plus 3rd Gen', assignedRoom: 'Salle de Chirurgie Dentaire', status: 'available', nextMaintenanceDate: '2027-01-15' },
                { id: 'eq-dent-010', name: 'Caméra Intra-orale HD avec Écran Tactile', category: 'intraoral_camera', brand: 'Acteon', model: 'SoproCARE HD', assignedRoom: 'Cabinet 1 (Soins Dentaires)', status: 'available', nextMaintenanceDate: '2026-11-10' }
            ];
        }
        const totalPages = Math.max(1, Math.ceil(equipmentData.length / EQUIPMENT_PAGE_SIZE));
        equipmentPagination = {
            page: Math.min(Math.max(1, Number(page) || 1), totalPages),
            pageSize: EQUIPMENT_PAGE_SIZE,
            total: equipmentData.length,
            totalPages
        };
        displayEquipmentList();
        updateEquipmentStats();
    } catch (e) { console.error('Error loading equipment list:', e); }
}

function displayEquipmentList() {
    const tbody = document.getElementById('equipment-list-tbody');
    if (!tbody) return;
    if (!equipmentData.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="module-empty-cell">
            <div class="ant-empty" style="padding: 40px 0;">
                <div class="ant-empty-image">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#d9d9d9" stroke-width="1.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                </div>
                <div class="ant-empty-description" style="color: rgba(0,0,0,0.45); font-size: 14px; margin-top: 8px;">Aucun équipement enregistré</div>
                ${canManageEquipment ? '<button class="btn btn-primary btn-small" onclick="openEquipmentModal()" style="margin-top: 12px;">+ Ajouter un équipement</button>' : ''}
            </div>
        </td></tr>`;
        renderEquipmentPagination();
        return;
    }
    const startIndex = (equipmentPagination.page - 1) * equipmentPagination.pageSize;
    const pageRows = equipmentData.slice(startIndex, startIndex + equipmentPagination.pageSize);
    tbody.innerHTML = pageRows.map(e => {
        const catLabel = equipmentCategories.find(c => c.value === e.category)?.label || e.category || 'Général';
        const statusTagClass = {
            available: 'ant-tag ant-tag-success',
            in_use: 'ant-tag ant-tag-processing',
            maintenance: 'ant-tag ant-tag-warning',
            out_of_service: 'ant-tag ant-tag-error'
        }[e.status] || 'ant-tag';
        return `
        <tr style="cursor:pointer" onclick="showEquipmentDetail('${e.id}')">
            <td style="padding: 14px 16px;"><strong>${e.name}</strong></td>
            <td style="padding: 14px 16px;"><span class="ant-tag">${catLabel}</span></td>
            <td style="padding: 14px 16px; color: #64748b;">${[e.brand, e.model].filter(Boolean).join(' / ') || '—'}</td>
            <td style="padding: 14px 16px; color: #64748b;">${e.assignedRoom || '—'}</td>
            <td style="padding: 14px 16px;"><span class="${statusTagClass}">${EQUIPMENT_STATUS_LABELS[e.status] || e.status}</span></td>
            <td style="padding: 14px 16px; color: #64748b;">${e.nextMaintenanceDate ? formatEquipmentDate(e.nextMaintenanceDate) : '—'}</td>
            <td class="equipment-row-actions" onclick="event.stopPropagation()">
                <div style="display: inline-flex; align-items: center; gap: 6px;">
                    <button onclick="showEquipmentDetail('${e.id}')" class="btn btn-secondary btn-small" style="height: 28px; padding: 0 10px; font-size: 12.5px;">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Fiche
                    </button>
                    <button id="equip-more-${e.id}" class="btn btn-small equip-more-action-btn" data-equip-id="${e.id}" style="height: 28px; padding: 0 6px;" title="Plus d'actions">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    // Attach AntDropdown to more action buttons
    document.querySelectorAll('.equip-more-action-btn').forEach(btn => {
        const id = btn.dataset.equipId;
        const item = equipmentData.find(e => String(e.id) === String(id));
        if (!item || typeof AntDropdown === 'undefined') return;
        const menuItems = [
            { key: 'edit', label: 'Modifier', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' },
            { key: 'maintenance', label: 'Planifier une maintenance', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>' },
            item.status === 'maintenance'
                ? { key: 'resolve', label: 'Remettre en service', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#52c41a" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' }
                : { key: 'report', label: 'Signaler un problème', icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#faad14" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' },
            { divider: true },
            { key: 'delete', label: 'Supprimer', danger: true, icon: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' }
        ];
        AntDropdown.create(btn, menuItems, {
            onClick: (key) => {
                if (key === 'edit') editEquipment(id);
                if (key === 'maintenance') openAddMaintenanceModal(id);
                if (key === 'resolve') clearEquipmentMaintenance(id);
                if (key === 'report') requestEquipmentMaintenance(id);
                if (key === 'delete') deleteEquipment(id);
            }
        });
    });

    renderEquipmentPagination();
}

function renderEquipmentPagination() {
    const container = document.getElementById('equipment-pagination');
    if (!container) return;
    const { page, pageSize, total, totalPages } = equipmentPagination;
    if (total <= pageSize) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    container.style.justifyContent = 'space-between';
    container.style.alignItems = 'center';
    container.style.width = '100%';

    const start = ((page - 1) * pageSize) + 1;
    const end = Math.min(page * pageSize, total);

    container.innerHTML = `
        <div class="patients-pagination-info" style="font-size: 13px; font-weight: 500; color: #64748b;">
            Affichage de ${start} à ${end} sur ${total} équipements
        </div>
        <div class="patients-pagination-actions" style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="btn btn-small btn-secondary" style="height: 32px; padding: 0 12px; font-size: 12.5px;" ${page <= 1 ? 'disabled' : ''} onclick="changeEquipmentPage(-1)">
                ◀ Précédent
            </button>
            <span class="patients-pagination-info" style="font-size: 12.5px; font-weight: 600; color: #334155; padding: 0 6px;">
                Page ${page} / ${totalPages}
            </span>
            <button type="button" class="btn btn-small btn-secondary" style="height: 32px; padding: 0 12px; font-size: 12.5px;" ${page >= totalPages ? 'disabled' : ''} onclick="changeEquipmentPage(1)">
                Suivant ▶
            </button>
        </div>
    `;
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
    container.innerHTML = '<div class="module-empty-state" style="padding: 40px; text-align: center;"><div class="ant-spin-dot" style="margin: 0 auto 12px;"></div><strong>Chargement de la fiche équipement...</strong></div>';
    showModal('modal-equipment-detail');
    try {
        const result = await window.api.equipment.getById(id);
        if (!result.success) throw new Error(result.error || 'Équipement introuvable');
        const e = result.data;
        const catLabel = equipmentCategories.find(c => c.value === e.category)?.label || e.category || 'Général';
        
        const sf = e.specificFields || {};
        const brand = e.brand || sf.brand || sf.Marque || sf.marque || '—';
        const model = e.model || sf.model || sf.Modèle || sf.modele || '—';
        const serial = e.serialNumber || sf.serial || sf.serialNumber || sf['N° de série'] || '—';
        const room = e.assignedRoom || sf.room || sf.Salle || '—';

        const standardKeys = new Set(['brand', 'model', 'serial', 'serialNumber', 'Marque', 'marque', 'Modèle', 'modele', 'N° de série', 'room', 'Salle']);
        const remainingSpecific = Object.entries(sf).filter(([k]) => !standardKeys.has(k));

        const statusMap = {
          available: { label: 'Disponible', className: 'ant-tag ant-tag-success', style: 'background: #f6ffed; color: #52c41a; border-color: #b7eb8f;' },
          in_use: { label: 'En service', className: 'ant-tag ant-tag-processing', style: 'background: #e6f0ff; color: #1677ff; border-color: #91caff;' },
          maintenance: { label: 'En maintenance', className: 'ant-tag', style: 'background: #f3e8ff; color: #9333ea; border-color: #d8b4fe;' },
          out_of_service: { label: 'Hors service', className: 'ant-tag ant-tag-error', style: 'background: #fff1f0; color: #ff4d4f; border-color: #ffa39e;' }
        };
        const st = statusMap[e.status] || { label: e.status || 'Disponible', className: 'ant-tag', style: '' };

        const maintenanceHtml = (e.maintenance || []).length
            ? e.maintenance.map(m => `
                <div style="padding: 10px 12px; background: #fafafa; border: 1px solid #f0f0f0; border-radius: 8px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
                        <strong style="color: rgba(0,0,0,0.88);">${formatEquipmentDate(m.maintenanceDate)} — ${MAINTENANCE_TYPE_LABELS[m.maintenanceType] || m.maintenanceType}</strong>
                        ${canSeeEquipmentCosts && m.cost ? `<span class="ant-tag" style="margin: 0; background: #e6fbf0; color: #22c55e; border-color: #86efac; font-weight: 600;">${formatEquipmentCurrency(m.cost)}</span>` : ''}
                    </div>
                    <div style="font-size: 12.5px; color: rgba(0,0,0,0.65); margin-top: 2px;">${m.technician || m.supplierName || 'Intervention interne'}</div>
                    ${m.notes ? `<div style="font-size: 12px; color: rgba(0,0,0,0.45); margin-top: 4px; border-top: 1px dashed #e8e8e8; padding-top: 4px;">${m.notes}</div>` : ''}
                </div>`).join('')
            : '<div style="padding: 24px 12px; text-align: center; color: rgba(0,0,0,0.35); font-size: 13px;"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" style="display:block; margin:0 auto 6px; opacity:0.6;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Aucune maintenance enregistrée</div>';

        const planUsageHtml = (e.planUsage || []).length
            ? e.planUsage.map(p => `
                <div style="font-size: 12.5px; padding: 6px 10px; background: #fafafa; border: 1px solid #f0f0f0; border-radius: 6px; margin-bottom: 6px; display: flex; justify-content: space-between;">
                    <strong>${p.planTitle || 'Plan de soins'}</strong>
                    <span style="color: rgba(0,0,0,0.45);">${p.lastName || ''} ${p.firstName || ''} (${formatEquipmentDate(p.usageDate)})</span>
                </div>`).join('')
            : '<div style="padding: 16px 12px; text-align: center; color: rgba(0,0,0,0.35); font-size: 13px;">Aucune utilisation dans un plan de soins</div>';

        const title = document.getElementById('equipment-detail-modal-title');
        if (title) title.textContent = e.name;
        container.innerHTML = `
        <div class="equipment-detail-layout" style="display: grid; grid-template-columns: minmax(300px, 1fr) minmax(320px, 1.2fr); gap: 20px; align-items: start;">
            <!-- Left: Informations & Caractéristiques -->
            <div style="background: #ffffff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 18px; box-shadow: 0 1px 4px rgba(0,0,0,0.02);">
                <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #f0f0f0; margin-bottom: 12px;">
                    <span class="ant-tag ant-tag-processing" style="font-weight: 600; font-size: 12.5px; padding: 2px 8px;">${catLabel}</span>
                    <span class="${st.className}" style="${st.style}; font-weight: 600; padding: 3px 12px; border-radius: 12px; font-size: 12px;">${st.label}</span>
                </div>

                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px;">
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #f0f0f0;">
                        <span style="color: rgba(0,0,0,0.45);">Marque</span>
                        <strong style="color: rgba(0,0,0,0.88);">${brand}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #f0f0f0;">
                        <span style="color: rgba(0,0,0,0.45);">Modèle</span>
                        <strong style="color: rgba(0,0,0,0.88);">${model}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #f0f0f0;">
                        <span style="color: rgba(0,0,0,0.45);">N° de série</span>
                        <strong style="font-family: monospace; color: #1677ff;">${serial}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #f0f0f0;">
                        <span style="color: rgba(0,0,0,0.45);">Salle / Emplacement</span>
                        <strong style="color: rgba(0,0,0,0.88);">${room}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #f0f0f0;">
                        <span style="color: rgba(0,0,0,0.45);">Date d'achat</span>
                        <span style="color: rgba(0,0,0,0.88);">${formatEquipmentDate(e.purchaseDate) || '—'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #f0f0f0;">
                        <span style="color: rgba(0,0,0,0.45);">Fin de garantie</span>
                        <span style="color: rgba(0,0,0,0.88);">${formatEquipmentDate(e.warrantyEnd) || '—'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #f0f0f0;">
                        <span style="color: rgba(0,0,0,0.45);">Dernière maintenance</span>
                        <span style="color: rgba(0,0,0,0.88);">${formatEquipmentDate(e.lastMaintenanceDate) || '—'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0;">
                        <span style="color: rgba(0,0,0,0.45);">Prochaine maintenance</span>
                        <strong style="color: ${e.nextMaintenanceDate ? '#f59e0b' : 'rgba(0,0,0,0.88)'};">${formatEquipmentDate(e.nextMaintenanceDate) || 'Non définie'}</strong>
                    </div>
                </div>

                ${remainingSpecific.length ? `
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #f0f0f0;">
                        <div style="font-size: 11px; font-weight: 700; color: rgba(0,0,0,0.45); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">Spécificités</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                            ${remainingSpecific.map(([k, v]) => `<span class="ant-tag" style="margin: 0; font-size: 12px;"><strong>${k} :</strong> ${v}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}

                ${e.notes ? `
                    <div style="margin-top: 12px; padding: 10px; background: #fafafa; border: 1px solid #f0f0f0; border-radius: 6px; font-size: 12px; color: rgba(0,0,0,0.65);">
                        <strong style="color: rgba(0,0,0,0.88);">Notes :</strong> ${e.notes.replace(/\n/g, '<br>')}
                    </div>
                ` : ''}
            </div>

            <!-- Right: Historique & Actions -->
            <div style="display: flex; flex-direction: column; gap: 14px;">
                <!-- Maintenance Card -->
                <div style="background: #ffffff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.02);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0;">
                        <h4 style="margin: 0; font-size: 14px; font-weight: 700; color: rgba(0,0,0,0.88); display: flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#1677ff" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                            Historique de maintenance
                        </h4>
                        <span class="ant-tag" style="margin: 0; font-size: 11.5px;">${(e.maintenance || []).length} intervention(s)</span>
                    </div>
                    <div style="max-height: 190px; overflow-y: auto; padding-right: 2px;">
                        ${maintenanceHtml}
                    </div>
                </div>

                <!-- Plans Card -->
                <div style="background: #ffffff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.02);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0;">
                        <h4 style="margin: 0; font-size: 14px; font-weight: 700; color: rgba(0,0,0,0.88); display: flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#0d9488" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            Utilisation dans les plans de soins
                        </h4>
                    </div>
                    <div style="max-height: 120px; overflow-y: auto;">
                        ${planUsageHtml}
                    </div>
                </div>

                <!-- Action Toolbar -->
                <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; padding-top: 10px;">
                    ${canManageEquipment ? `
                        <button onclick="editEquipment('${e.id}')" class="btn" style="height: 34px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 4px;">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Modifier
                        </button>
                        <button onclick="openAddMaintenanceModal('${e.id}')" class="btn btn-primary" style="height: 34px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 4px;">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            + Maintenance
                        </button>
                        <button onclick="deleteEquipment('${e.id}')" class="btn btn-danger" style="height: 34px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 4px; color: #ff4d4f; border-color: #ffccc7;">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            Supprimer
                        </button>
                    ` : ''}
                    ${e.status === 'maintenance'
                        ? `<button onclick="clearEquipmentMaintenance('${e.id}')" class="btn" style="height: 34px; font-size: 12.5px; color: #22c55e; border-color: #b7eb8f;">✅ Remettre en service</button>`
                        : `<button onclick="requestEquipmentMaintenance('${e.id}')" class="btn" style="height: 34px; font-size: 12.5px;">Signaler un problème</button>`}
                </div>
            </div>
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
        const upcomingEl = document.getElementById('equip-stat-upcoming');
        const inmaiEl = document.getElementById('equip-stat-inmai');

        if (totalEl) totalEl.textContent = all.length;
        if (availEl) {
            const count = all.filter(e => e.status === 'available').length;
            availEl.textContent = count;
            availEl.style.color = '#22c55e';
        }
        if (upcomingEl) {
            const count = (equipmentAlerts.upcoming || []).length;
            upcomingEl.textContent = count;
            upcomingEl.style.color = count > 0 ? '#f59e0b' : 'inherit';
        }
        if (inmaiEl) {
            const count = (equipmentAlerts.inMaintenance || []).length;
            inmaiEl.textContent = count;
            inmaiEl.style.color = count > 0 ? '#9333ea' : 'inherit';
        }
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
