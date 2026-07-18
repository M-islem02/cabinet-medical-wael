import { inventoryApi } from '../../features/inventory/inventory-api.js';
import { renderInventoryPaginationView } from '../../features/inventory/inventory-pagination.js';
import { registerLegacyGlobals } from '../../core/legacy/legacy-bridge.js';

// =============================================
// INVENTORY / STOCK MANAGEMENT MODULE — Sous-plan F
// Articles, Fournisseurs, Lots FEFO, Commandes, Historique, Point de Vente
// =============================================

const INVENTORY_PAGE_SIZE = 12;

let inventoryData = [];
let inventoryInitialized = false;
let inventoryPagination = { page: 1, pageSize: INVENTORY_PAGE_SIZE, total: 0, totalPages: 1 };
let inventoryFilters = { category: '', lowStock: false, expiring: false, search: '' };
let suppliersData = [];
let lotsData = [];
let purchaseHistoryData = [];
let purchaseOrdersData = [];
let posCart = [];
let posSalesData = [];
let inventoryTabState = { activeTab: 'articles' };
let posSearchDebounce = null;
let canSeeInventoryPrices = false;
let canManageSuppliersFlag = false;
let canManageLotsFlag = false;

const DENTAL_CATEGORIES = [
    'Consommables dentaires',
    'Anesthésie',
    'Matériaux d\'empreinte',
    'Endodontie',
    'Prothèse',
    'Orthodontie',
    'Stérilisation'
];

const DEFAULT_INVENTORY_CATEGORIES = [
    'Consommables médicaux',
    'Équipements de rééducation',
    'Matériel de bureau',
    'Produits d\'hygiène',
    'Médicaments locaux',
    'Accessoires orthopédiques',
    'Électrothérapie',
    'Mobilier médical',
    'Fournitures générales',
    ...DENTAL_CATEGORIES,
    'Autre'
];

function checkInventoryPermissions() {
    const role = typeof currentUserRole !== 'undefined' ? currentUserRole : '';
    const isSuperAdmin = typeof currentUserIsSuperAdmin !== 'undefined' ? currentUserIsSuperAdmin : false;
    const isAdmin = typeof currentUserIsAdmin !== 'undefined' ? currentUserIsAdmin : false;
    canSeeInventoryPrices = isSuperAdmin || isAdmin;
    canManageSuppliersFlag = isSuperAdmin || isAdmin;
    canManageLotsFlag = isSuperAdmin || isAdmin || role === 'doctor' || role === 'dentist';
}

function refreshInventoryModule() {
    loadInventoryStats();
    if (inventoryTabState.activeTab === 'articles') loadInventory();
    if (inventoryTabState.activeTab === 'suppliers') loadSuppliers();
    if (inventoryTabState.activeTab === 'lots') loadLots();
    if (inventoryTabState.activeTab === 'history') loadPurchaseHistory();
    if (inventoryTabState.activeTab === 'orders') loadPurchaseOrders();
    if (inventoryTabState.activeTab === 'pos') loadPOSData();
}

async function initInventory() {
    checkInventoryPermissions();
    if (!inventoryInitialized) {
        await loadInventoryCategories();
        await loadSupplierSelects();
        await loadPatientSelectForPOS();
        resetInventoryFilters(false);
        setupInventoryEventListeners();
        inventoryInitialized = true;
    }
    switchInventoryTab('articles');
    await loadInventoryStats();
}

async function loadInventoryCategories() {
    const select = document.getElementById('inventory-category');
    if (select) {
        let datalist = document.getElementById('inventory-categories-list');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'inventory-categories-list';
            document.body.appendChild(datalist);
            select.setAttribute('list', 'inventory-categories-list');
        }
        datalist.innerHTML = DEFAULT_INVENTORY_CATEGORIES.map(cat => `<option value="${cat}">`).join('');
    }

    const filter = document.getElementById('inventory-category-filter');
    const historyFilter = document.getElementById('history-category-filter');
    if (filter) {
        filter.innerHTML = '<option value="">Toutes catégories</option>' +
            DEFAULT_INVENTORY_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    }
    if (historyFilter) {
        historyFilter.innerHTML = '<option value="">Toutes catégories</option>' +
            DEFAULT_INVENTORY_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    }
}

async function loadSupplierSelects() {
    try {
        const result = await inventoryApi.getSuppliers({ isActive: true });
        suppliersData = (result && result.success) ? result.data : [];
        const selects = [
            'inventory-supplier-id',
            'inventory-lot-supplier',
            'purchase-order-supplier',
            'history-supplier-filter'
        ];
        selects.forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const base = id === 'history-supplier-filter' ? '<option value="">Tous fournisseurs</option>' : '<option value="">-- Aucun --</option>';
            sel.innerHTML = base + suppliersData.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        });
    } catch (e) { console.error('Error loading supplier selects:', e); }
}

async function loadPatientSelectForPOS() {
    try {
        const result = await inventoryApi.getPatients();
        const sel = document.getElementById('pos-patient-select');
        if (!sel || !result.success) return;
        sel.innerHTML = '<option value="">-- Aucun --</option>' +
            (result.data || []).map(p => `<option value="${p.id}">${p.lastName} ${p.firstName}</option>`).join('');
    } catch (e) { console.error('Error loading POS patient select:', e); }
}

function switchInventoryTab(tabName) {
    const validTabs = ['articles', 'suppliers', 'lots', 'history', 'orders', 'pos'];
    if (!validTabs.includes(tabName)) return;
    inventoryTabState.activeTab = tabName;
    document.querySelectorAll('#inventory .module-tabs-inline [data-tab]').forEach(btn => {
        const isActive = btn.dataset.tab === tabName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
    });
    document.querySelectorAll('#inventory .inventory-tab-content').forEach(c => c.style.display = 'none');
    const target = document.getElementById('inventory-tab-' + tabName);
    if (target) target.style.display = 'block';

    document.querySelectorAll('#inventory .inventory-action-btn-tab').forEach(btn => {
        btn.style.display = btn.dataset.action === tabName ? 'inline-flex' : 'none';
    });

    if (tabName === 'articles') loadInventory();
    if (tabName === 'suppliers') loadSuppliers();
    if (tabName === 'lots') loadLots();
    if (tabName === 'history') loadPurchaseHistory();
    if (tabName === 'orders') loadPurchaseOrders();
    if (tabName === 'pos') loadPOSData();

    document.querySelectorAll('#inventory .inventory-price-col').forEach(el => {
        el.style.display = canSeeInventoryPrices ? '' : 'none';
    });
}

// ─── STATS ───────────────────────────────────────────────────────────────────

async function loadInventoryStats() {
    try {
        const statsResult = await inventoryApi.getFullStats();
        const stats = (statsResult && statsResult.success) ? statsResult.data : {};

        const totalItemsEl = document.getElementById('stat-total-items');
        const lowStockEl = document.getElementById('stat-low-stock');
        const expiringEl = document.getElementById('inventory-expiring');
        const totalValueEl = document.getElementById('stat-stock-value');

        if (totalItemsEl) totalItemsEl.textContent = stats.totalItems || 0;
        if (lowStockEl) lowStockEl.textContent = stats.lowStockCount || 0;
        if (expiringEl) expiringEl.textContent = stats.expiringCount || 0;
        if (totalValueEl) totalValueEl.textContent = formatCurrency(stats.totalValue || 0);
    } catch (error) {
        console.error('Error loading inventory stats:', error);
    }
}

// ─── ARTICLES ─────────────────────────────────────────────────────────────────

function updateInventoryPagination(pagination = null) {
    if (!pagination) {
        inventoryPagination = { page: 1, pageSize: INVENTORY_PAGE_SIZE, total: Array.isArray(inventoryData) ? inventoryData.length : 0, totalPages: 1 };
        return;
    }
    inventoryPagination = {
        page: Number(pagination.page || 1),
        pageSize: Number(pagination.pageSize || INVENTORY_PAGE_SIZE),
        total: Number(pagination.total || 0),
        totalPages: Math.max(1, Number(pagination.totalPages || 1))
    };
}

function renderInventoryPagination() {
    const container = document.getElementById('inventory-main-pagination');
    if (!container) return;
    renderInventoryPaginationView({ container, pagination: inventoryPagination, onPageChange: changeInventoryPage });
}

async function changeInventoryPage(direction) {
    const nextPage = Math.min(Math.max(1, inventoryPagination.page + direction), Math.max(1, inventoryPagination.totalPages));
    if (nextPage === inventoryPagination.page) return;
    await loadInventory(nextPage);
}

async function loadInventory(page = 1) {
    const tbody = document.getElementById('inventory-tbody');
    try {
        if (tbody && !inventoryData.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 40px; color: #94a3b8;">Chargement...</td></tr>`;
        }
        const result = await inventoryApi.getAll({
            ...inventoryFilters,
            page,
            pageSize: INVENTORY_PAGE_SIZE,
            paginated: true
        });
        inventoryData = (result && result.success && Array.isArray(result.data)) ? result.data : [];
        updateInventoryPagination(result?.pagination);
        displayInventory();
    } catch (error) {
        console.error('Error loading inventory:', error);
        showNotification('Erreur lors du chargement de l\'inventaire', 'error');
    }
}

function displayInventory() {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) return;
    const rows = Array.isArray(inventoryData) ? inventoryData : [];
    if (rows.length === 0) {
        const hasActiveFilters = Boolean(inventoryFilters.category || inventoryFilters.lowStock || inventoryFilters.search);
        tbody.innerHTML = `
            <tr><td colspan="8" class="module-empty-cell">
                <div class="module-empty-state">
                    <span class="module-empty-state-icon" aria-hidden="true">+</span>
                    <strong>Aucun article trouvé</strong>
                    <p>${hasActiveFilters ? 'Aucun article ne correspond aux filtres sélectionnés.' : 'Ajoutez le premier article à votre inventaire.'}</p>
                    ${hasActiveFilters
                        ? '<button class="btn btn-secondary btn-sm" onclick="resetInventoryFilters()">Réinitialiser les filtres</button>'
                        : '<button class="btn btn-primary btn-sm" onclick="openInventoryModal()">+ Ajouter un article</button>'}
                </div>
            </td></tr>`;
        renderInventoryPagination();
        return;
    }

    tbody.innerHTML = rows.map(item => {
        const minQty = item.minQuantity || item.min_quantity || 0;
        const purchasePrice = item.purchasePrice || item.purchase_price;
        const sellingPrice = item.sellingPrice || item.selling_price;
        const isLowStock = Number(item.quantity || 0) <= Number(minQty || 0);
        const supplier = item.supplierName || item.supplier || '-';
        const priceDisplay = canSeeInventoryPrices ? (purchasePrice ? formatCurrency(purchasePrice) : '-') : '<span style="color:#94a3b8">—</span>';
        return `
        <tr class="inventory-row" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <td style="padding: 16px;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <strong style="color: #1e293b; font-size: 15px;">${item.name}</strong>
                    ${isLowStock ? '<span style="background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; width: fit-content;">Stock bas</span>' : ''}
                </div>
            </td>
            <td style="padding: 16px;"><span style="background: #f1f5f9; padding: 4px 10px; border-radius: 8px; font-size: 13px; color: #64748b;">${item.category || 'Non classé'}</span></td>
            <td style="padding: 16px;"><span style="font-weight: 700; font-size: 18px; color: ${isLowStock ? '#dc2626' : '#059669'};">${item.quantity}</span> <span style="color: #94a3b8; font-size: 13px;">${item.unit || 'unité(s)'}</span></td>
            <td style="padding: 16px; color: #64748b;">${minQty}</td>
            <td class="inventory-price-col" style="padding: 16px; font-weight: 500; color: #1e293b;">${priceDisplay}</td>
            <td style="padding: 16px; color: #64748b;">${sellingPrice ? formatCurrency(sellingPrice) : '-'}</td>
            <td style="padding: 16px; color: #64748b;">${supplier}</td>
            <td style="padding: 16px;">
                <div class="inventory-actions">
                    <button onclick="openStockAdjustModal('${item.id}')" title="Ajuster stock" class="inventory-action-btn inventory-action-btn-stock">Stock</button>
                    <button onclick="openInventoryLotModalForItem('${item.id}')" title="Ajouter lot" class="inventory-action-btn inventory-action-btn-edit">Lot</button>
                    <button onclick="editInventoryItem('${item.id}')" title="Modifier" class="inventory-action-btn inventory-action-btn-edit">Modifier</button>
                    <button onclick="deleteInventoryItem('${item.id}')" title="Supprimer" class="inventory-action-btn inventory-action-btn-delete">Supprimer</button>
                </div>
            </td>
        </tr>`;
    }).join('');
    renderInventoryPagination();
}

function isExpiringSoon(dateStr) {
    if (!dateStr) return false;
    const expDate = new Date(dateStr);
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    return expDate <= thirtyDays;
}

async function filterInventory() {
    const searchInput = document.getElementById('inventory-search');
    const categoryFilter = document.getElementById('inventory-category-filter');
    const lowStockCheckbox = document.getElementById('inventory-low-only');
    inventoryFilters.search = searchInput ? searchInput.value.trim() : '';
    inventoryFilters.category = categoryFilter ? categoryFilter.value : '';
    inventoryFilters.lowStock = lowStockCheckbox ? lowStockCheckbox.checked : false;
    await loadInventory(1);
}

function resetInventoryFilters(reload = true) {
    inventoryFilters = { category: '', lowStock: false, expiring: false, search: '' };
    const categoryFilter = document.getElementById('inventory-category-filter');
    const searchInput = document.getElementById('inventory-search');
    const lowStockCheckbox = document.getElementById('inventory-low-only');
    if (categoryFilter) categoryFilter.value = '';
    if (searchInput) searchInput.value = '';
    if (lowStockCheckbox) lowStockCheckbox.checked = false;
    if (reload && inventoryTabState.activeTab === 'articles') loadInventory(1);
}

function openInventoryModal(id = null) {
    const modal = document.getElementById('modal-inventory');
    const form = document.getElementById('inventory-form');
    const title = document.getElementById('inventory-modal-title');
    form.reset();
    document.getElementById('inventory-id').value = '';
    document.getElementById('inventory-quantity').value = '0';
    document.getElementById('inventory-min-quantity').value = '5';
    document.getElementById('inventory-unit').value = 'unité';
    title.textContent = '📦 Nouvel Article';

    if (id) {
        const item = inventoryData.find(i => i.id === id);
        if (item) {
            title.textContent = '📦 Modifier Article';
            document.getElementById('inventory-id').value = item.id;
            document.getElementById('inventory-name').value = item.name || '';
            document.getElementById('inventory-category').value = item.category || '';
            document.getElementById('inventory-unit').value = item.unit || 'unité';
            document.getElementById('inventory-quantity').value = item.quantity || 0;
            document.getElementById('inventory-min-quantity').value = item.minQuantity || item.min_quantity || 5;
            document.getElementById('inventory-purchase-price').value = item.purchasePrice || item.purchase_price || '';
            document.getElementById('inventory-selling-price').value = item.sellingPrice || item.selling_price || '';
            document.getElementById('inventory-supplier-id').value = item.supplierId || '';
            document.getElementById('inventory-location').value = item.location || '';
            document.getElementById('inventory-notes').value = item.notes || '';
        }
    }
    showModal('modal-inventory');
}

async function saveInventoryItem(event) {
    event.preventDefault();
    const id = document.getElementById('inventory-id').value;
    const data = {
        name: document.getElementById('inventory-name').value.trim(),
        category: document.getElementById('inventory-category').value.trim(),
        unit: document.getElementById('inventory-unit').value.trim() || 'unité',
        quantity: parseInt(document.getElementById('inventory-quantity').value, 10) || 0,
        minQuantity: parseInt(document.getElementById('inventory-min-quantity').value, 10) || 5,
        purchasePrice: parseFloat(document.getElementById('inventory-purchase-price').value) || null,
        sellingPrice: parseFloat(document.getElementById('inventory-selling-price').value) || null,
        supplierId: document.getElementById('inventory-supplier-id').value || null,
        location: document.getElementById('inventory-location').value.trim(),
        notes: document.getElementById('inventory-notes').value.trim()
    };

    try {
        let result;
        if (id) {
            result = await inventoryApi.update(id, data);
            showNotification('Article modifié avec succès', 'success');
        } else {
            result = await inventoryApi.create(data);
            showNotification('Article ajouté avec succès', 'success');
        }
        if (result && !result.success) throw new Error(result.error || 'Erreur inconnue');
        closeModal('modal-inventory');
        await loadInventory(inventoryPagination.page);
        await loadInventoryStats();
        await loadSupplierSelects();
    } catch (error) {
        console.error('Error saving inventory item:', error);
        showNotification('Erreur lors de l\'enregistrement: ' + error.message, 'error');
    }
}

function editInventoryItem(id) { openInventoryModal(id); }

async function deleteInventoryItem(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet article ?')) return;
    try {
        await inventoryApi.delete(id);
        showNotification('Article supprimé', 'success');
        await loadInventory(inventoryPagination.page);
        await loadInventoryStats();
    } catch (error) {
        showNotification('Erreur lors de la suppression', 'error');
    }
}

function openStockAdjustModal(id) {
    const item = inventoryData.find(i => i.id === id);
    if (!item) return;
    document.getElementById('stock-adjust-id').value = item.id;
    document.getElementById('stock-adjust-name').textContent = item.name;
    document.getElementById('stock-adjust-current').textContent = `${item.quantity} ${item.unit || 'unité(s)'}`;
    document.getElementById('stock-adjust-type').value = 'in';
    document.getElementById('stock-adjust-quantity').value = '';
    document.getElementById('stock-adjust-reason').value = '';
    showModal('modal-stock-adjust');
}

async function adjustStock(event) {
    event.preventDefault();
    const id = document.getElementById('stock-adjust-id').value;
    const type = document.getElementById('stock-adjust-type').value;
    const quantity = parseInt(document.getElementById('stock-adjust-quantity').value, 10);
    const reason = document.getElementById('stock-adjust-reason').value.trim();
    if (quantity <= 0) { showNotification('La quantité doit être supérieure à 0', 'warning'); return; }
    try {
        const result = await inventoryApi.adjustStock(id, quantity, type, reason);
        if (result && result.success) {
            showNotification(`Stock ${type === 'in' ? 'augmenté' : 'diminué'} avec succès`, 'success');
            closeModal('modal-stock-adjust');
            await loadInventory(inventoryPagination.page);
            await loadInventoryStats();
        } else {
            showNotification(result?.error || 'Erreur lors de l\'ajustement', 'error');
        }
    } catch (error) {
        showNotification(error.message || 'Erreur lors de l\'ajustement', 'error');
    }
}

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────

function buildInventoryEmptyRow(colspan, title, description) {
    return `<tr><td colspan="${colspan}" class="module-empty-cell">
        <div class="module-empty-state">
            <strong>${title}</strong>
            <p>${description}</p>
        </div>
    </td></tr>`;
}

async function loadSuppliers() {
    try {
        const search = document.getElementById('supplier-search')?.value.trim() || '';
        const result = await inventoryApi.getSuppliers({ search });
        suppliersData = (result && result.success) ? result.data : [];
        displaySuppliers();
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

function displaySuppliers() {
    const tbody = document.getElementById('suppliers-tbody');
    if (!tbody) return;
    if (!suppliersData.length) {
        tbody.innerHTML = buildInventoryEmptyRow(5, 'Aucun fournisseur', 'Ajoutez un fournisseur pour commencer.');
        return;
    }
    tbody.innerHTML = suppliersData.map(s => {
        const totalSpentDisplay = canSeeInventoryPrices ? formatCurrency(s.totalSpent || 0) : '<span style="color:#94a3b8">—</span>';
        return `
        <tr>
            <td style="padding: 14px 16px;"><strong>${s.name}</strong>${s.contactName ? `<div style="font-size:12px;color:#64748b">${s.contactName}</div>` : ''}</td>
            <td style="padding: 14px 16px; color: #64748b;">${[s.phone, s.email].filter(Boolean).join('<br>') || '-'}</td>
            <td style="padding: 14px 16px; color: #64748b;">${s.specialty || '-'}</td>
            <td class="inventory-price-col" style="padding: 14px 16px;">${totalSpentDisplay}</td>
            <td style="padding: 14px 16px;">
                <div class="inventory-actions">
                    <button onclick="viewSupplier('${s.id}')" class="inventory-action-btn inventory-action-btn-edit">Détails</button>
                    ${canManageSuppliersFlag ? `<button onclick="editSupplier('${s.id}')" class="inventory-action-btn inventory-action-btn-edit">Modifier</button>` : ''}
                    ${canManageSuppliersFlag ? `<button onclick="deleteSupplier('${s.id}')" class="inventory-action-btn inventory-action-btn-delete">Supprimer</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

async function filterSuppliers() { await loadSuppliers(); }

function openSupplierModal(id = null) {
    const form = document.getElementById('supplier-form');
    const title = document.getElementById('supplier-modal-title');
    form.reset();
    document.getElementById('supplier-id').value = '';
    title.textContent = '🏢 Nouveau Fournisseur';
    if (id) {
        const s = suppliersData.find(x => x.id === id);
        if (s) {
            title.textContent = '🏢 Modifier Fournisseur';
            document.getElementById('supplier-id').value = s.id;
            document.getElementById('supplier-name').value = s.name || '';
            document.getElementById('supplier-contact-name').value = s.contactName || '';
            document.getElementById('supplier-phone').value = s.phone || '';
            document.getElementById('supplier-email').value = s.email || '';
            document.getElementById('supplier-address').value = s.address || '';
            document.getElementById('supplier-specialty').value = s.specialty || '';
            document.getElementById('supplier-notes').value = s.notes || '';
        }
    }
    showModal('modal-supplier');
}

async function saveSupplier(event) {
    event.preventDefault();
    const id = document.getElementById('supplier-id').value;
    const data = {
        name: document.getElementById('supplier-name').value.trim(),
        contactName: document.getElementById('supplier-contact-name').value.trim(),
        phone: document.getElementById('supplier-phone').value.trim(),
        email: document.getElementById('supplier-email').value.trim(),
        address: document.getElementById('supplier-address').value.trim(),
        specialty: document.getElementById('supplier-specialty').value.trim(),
        notes: document.getElementById('supplier-notes').value.trim()
    };
    try {
        const result = id
            ? await inventoryApi.updateSupplier(id, data)
            : await inventoryApi.createSupplier(data);
        if (!result.success) throw new Error(result.error);
        closeModal('modal-supplier');
        showNotification(id ? 'Fournisseur modifié' : 'Fournisseur créé', 'success');
        await loadSuppliers();
        await loadSupplierSelects();
    } catch (error) {
        showNotification('Erreur: ' + error.message, 'error');
    }
}

function editSupplier(id) { openSupplierModal(id); }

async function deleteSupplier(id) {
    if (!confirm('Supprimer ce fournisseur ?')) return;
    try {
        await inventoryApi.deleteSupplier(id);
        showNotification('Fournisseur supprimé', 'success');
        await loadSuppliers();
        await loadSupplierSelects();
    } catch (error) { showNotification('Erreur', 'error'); }
}

async function viewSupplier(id) {
    try {
        const result = await inventoryApi.getSupplier(id);
        if (!result.success) return;
        const s = result.data;
        const purchasesRows = (s.purchases || []).map(p => `
            <tr><td>${formatDate(p.purchaseDate)}</td><td>${p.itemName}</td><td>${p.initialQuantity}</td><td>${canSeeInventoryPrices ? formatCurrency(p.unitPrice) : '—'}</td><td>${canSeeInventoryPrices ? formatCurrency(p.initialQuantity * p.unitPrice) : '—'}</td></tr>
        `).join('');
        const html = `
            <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px">
                <div style="background:#fff;border-radius:16px;padding:28px;width:100%;max-width:700px;max-height:90vh;overflow-y:auto;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                        <h3 style="margin:0">${s.name}</h3>
                        <button onclick="this.closest('.modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">×</button>
                    </div>
                    <p style="color:#64748b">${[s.phone, s.email, s.address].filter(Boolean).join(' · ') || 'Aucun contact'}</p>
                    <h4 style="margin:20px 0 10px 0">Historique des achats (${canSeeInventoryPrices ? formatCurrency(s.totalSpent) : '—'})</h4>
                    <table class="table"><thead><tr><th>Date</th><th>Article</th><th>Qté</th><th>Prix U.</th><th>Total</th></tr></thead><tbody>${purchasesRows || '<tr><td colspan="5" class="text-center">Aucun achat</td></tr>'}</tbody></table>
                </div>
            </div>`;
        const div = document.createElement('div');
        div.className = 'modal';
        div.innerHTML = html;
        document.body.appendChild(div);
    } catch (e) { showNotification('Erreur', 'error'); }
}

// ─── LOTS ─────────────────────────────────────────────────────────────────────

async function loadLots() {
    try {
        const articleFilter = document.getElementById('lots-article-filter')?.value || '';
        const search = document.getElementById('lots-search')?.value.trim() || '';
        let allLots = [];
        if (articleFilter) {
            const result = await inventoryApi.getLots(articleFilter);
            allLots = result.success ? result.data : [];
        } else {
            const articles = await inventoryApi.getAll({ paginated: false });
            if (articles.success) {
                for (const art of articles.data || []) {
                    const result = await inventoryApi.getLots(art.id);
                    if (result.success) allLots.push(...(result.data || []));
                }
            }
        }
        if (search) {
            const lower = search.toLowerCase();
            allLots = allLots.filter(l =>
                (l.itemName || '').toLowerCase().includes(lower) ||
                (l.lotNumber || '').toLowerCase().includes(lower) ||
                (l.supplierName || '').toLowerCase().includes(lower)
            );
        }
        lotsData = allLots;
        displayLots();
    } catch (error) { console.error('Error loading lots:', error); }
}

function displayLots() {
    const tbody = document.getElementById('lots-tbody');
    if (!tbody) return;
    if (!lotsData.length) {
        tbody.innerHTML = buildInventoryEmptyRow(8, 'Aucun lot', 'Ajoutez un lot ou modifiez les filtres.');
        return;
    }
    const today = new Date().toISOString().slice(0, 10);
    tbody.innerHTML = lotsData.map(l => {
        const isExpiring = l.expirationDate && l.expirationDate <= today ? ' style="background:#fee2e2"' : (isExpiringSoon(l.expirationDate) ? ' style="background:#fef3c7"' : '');
        const priceDisplay = canSeeInventoryPrices ? formatCurrency(l.unitPrice) : '—';
        return `
        <tr${isExpiring}>
            <td style="padding: 14px 16px;">${l.itemName || l.inventoryId}</td>
            <td style="padding: 14px 16px; color: #64748b;">${l.lotNumber || '-'}</td>
            <td style="padding: 14px 16px; color: #64748b;">${l.supplierName || '-'}</td>
            <td style="padding: 14px 16px; color: #64748b;">${formatDate(l.purchaseDate)}</td>
            <td style="padding: 14px 16px; color: ${l.expirationDate && l.expirationDate <= today ? '#dc2626' : '#64748b'};">${formatDate(l.expirationDate) || '-'}</td>
            <td style="padding: 14px 16px;"><strong>${l.remainingQuantity}</strong> / ${l.initialQuantity}</td>
            <td class="inventory-price-col" style="padding: 14px 16px;">${priceDisplay}</td>
            <td style="padding: 14px 16px;">
                ${canManageLotsFlag ? `<button onclick="openInventoryLotAdjustModal('${l.id}')" class="inventory-action-btn inventory-action-btn-edit">Ajuster</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

async function filterLots() {
    const articleFilter = document.getElementById('lots-article-filter');
    if (articleFilter && !articleFilter.options.length) {
        const arts = await inventoryApi.getAll({ paginated: false });
        articleFilter.innerHTML = '<option value="">Tous les articles</option>' +
            (arts.success ? arts.data : []).map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    }
    await loadLots();
}

function openInventoryLotModal(id = null) {
    const form = document.getElementById('inventory-lot-form');
    const title = document.getElementById('inventory-lot-modal-title');
    form.reset();
    document.getElementById('inventory-lot-id').value = '';
    document.getElementById('inventory-lot-purchase-date').value = new Date().toISOString().slice(0, 10);
    title.textContent = '📋 Nouveau Lot';
    populateLotArticleSelect();
    if (id) {
        const lot = lotsData.find(l => l.id === id);
        if (lot) {
            title.textContent = '📋 Modifier Lot';
            document.getElementById('inventory-lot-id').value = lot.id;
            document.getElementById('inventory-lot-article').value = lot.inventoryId;
            document.getElementById('inventory-lot-number').value = lot.lotNumber || '';
            document.getElementById('inventory-lot-supplier').value = lot.supplierId || '';
            document.getElementById('inventory-lot-purchase-date').value = lot.purchaseDate || '';
            document.getElementById('inventory-lot-expiration').value = lot.expirationDate || '';
            document.getElementById('inventory-lot-quantity').value = lot.remainingQuantity || 0;
            document.getElementById('inventory-lot-unit-price').value = lot.unitPrice || '';
            document.getElementById('inventory-lot-notes').value = lot.notes || '';
        }
    }
    showModal('modal-inventory-lot');
}

async function openInventoryLotModalForItem(inventoryId) {
    await openInventoryLotModal();
    document.getElementById('inventory-lot-article').value = inventoryId;
}

async function populateLotArticleSelect() {
    const sel = document.getElementById('inventory-lot-article');
    if (!sel || sel.options.length > 1) return;
    const result = await inventoryApi.getAll({ paginated: false });
    sel.innerHTML = '<option value="">-- Sélectionner --</option>' +
        (result.success ? result.data : []).map(a => `<option value="${a.id}">${a.name}</option>`).join('');
}

async function saveInventoryLot(event) {
    event.preventDefault();
    const data = {
        inventoryId: document.getElementById('inventory-lot-article').value,
        supplierId: document.getElementById('inventory-lot-supplier').value || null,
        lotNumber: document.getElementById('inventory-lot-number').value.trim(),
        purchaseDate: document.getElementById('inventory-lot-purchase-date').value,
        expirationDate: document.getElementById('inventory-lot-expiration').value || null,
        initialQuantity: parseInt(document.getElementById('inventory-lot-quantity').value, 10) || 0,
        unitPrice: parseFloat(document.getElementById('inventory-lot-unit-price').value) || null,
        notes: document.getElementById('inventory-lot-notes').value.trim()
    };
    if (!data.inventoryId) { showNotification('Sélectionnez un article', 'warning'); return; }
    try {
        const result = await inventoryApi.createLot(data);
        if (!result.success) throw new Error(result.error);
        closeModal('modal-inventory-lot');
        showNotification('Lot enregistré', 'success');
        await loadLots();
        await loadInventoryStats();
        if (inventoryTabState.activeTab === 'articles') await loadInventory();
    } catch (error) { showNotification('Erreur: ' + error.message, 'error'); }
}

function openInventoryLotAdjustModal(id) {
    const lot = lotsData.find(l => l.id === id);
    if (!lot) return;
    const qty = prompt(`Ajustement du lot ${lot.lotNumber || id}\nQuantité restante actuelle: ${lot.remainingQuantity}\nNouvelle quantité:`, lot.remainingQuantity);
    if (qty === null) return;
    const newQty = parseInt(qty, 10);
    if (isNaN(newQty) || newQty < 0) { showNotification('Quantité invalide', 'warning'); return; }
    inventoryApi.adjustLot(id, { remainingQuantity: newQty, reason: 'Ajustement manuel' })
        .then(async (result) => {
            if (result.success) {
                showNotification('Lot ajusté', 'success');
                await loadLots();
                await loadInventoryStats();
            } else showNotification(result.error, 'error');
        })
        .catch(e => showNotification('Erreur', 'error'));
}

// ─── PURCHASE HISTORY ─────────────────────────────────────────────────────────

async function loadPurchaseHistory() {
    try {
        const supplierId = document.getElementById('history-supplier-filter')?.value || '';
        const category = document.getElementById('history-category-filter')?.value || '';
        const start = document.getElementById('history-start')?.value || '';
        const end = document.getElementById('history-end')?.value || '';
        const result = await inventoryApi.getPurchaseHistory({ supplierId, category, startDate: start, endDate: end });
        purchaseHistoryData = (result && result.success) ? result.data : [];
        displayPurchaseHistory();
        await loadPurchaseReports({ startDate: start, endDate: end });
    } catch (error) { console.error('Error loading purchase history:', error); }
}

function displayPurchaseHistory() {
    const tbody = document.getElementById('purchase-history-tbody');
    if (!tbody) return;
    if (!purchaseHistoryData.length) {
        tbody.innerHTML = buildInventoryEmptyRow(7, 'Aucun historique', 'Aucun achat ne correspond à cette période.');
        return;
    }
    tbody.innerHTML = purchaseHistoryData.map(p => `
        <tr>
            <td style="padding: 14px 16px;">${formatDate(p.purchaseDate)}</td>
            <td style="padding: 14px 16px;">${p.itemName}</td>
            <td style="padding: 14px 16px;">${p.category || '-'}</td>
            <td style="padding: 14px 16px;">${p.supplierName || '-'}</td>
            <td style="padding: 14px 16px;">${p.initialQuantity} ${p.unit || ''}</td>
            <td class="inventory-price-col" style="padding: 14px 16px;">${canSeeInventoryPrices ? formatCurrency(p.unitPrice) : '—'}</td>
            <td class="inventory-price-col" style="padding: 14px 16px;">${canSeeInventoryPrices ? formatCurrency(p.initialQuantity * p.unitPrice) : '—'}</td>
        </tr>
    `).join('');
}

async function filterPurchaseHistory() { await loadPurchaseHistory(); }

async function loadPurchaseReports(filters) {
    try {
        const result = await inventoryApi.getPurchaseReports(filters);
        const container = document.getElementById('purchase-reports-content');
        if (!container) return;
        if (!result.success) { container.innerHTML = '<div>Accès refusé</div>'; return; }
        const renderList = (title, items) => `
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px">
                <h5 style="margin:0 0 10px 0;font-size:14px;color:#64748b">${title}</h5>
                ${items.length ? items.map(i => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9"><span>${i.label || 'Non défini'}</span><strong>${formatCurrency(i.total)}</strong></div>`).join('') : '<div style="font-size:13px;color:#94a3b8">Aucune donnée</div>'}
            </div>`;
        container.innerHTML =
            renderList('Par fournisseur', result.data.bySupplier) +
            renderList('Par catégorie', result.data.byCategory) +
            renderList('Par mois', result.data.byMonth);
    } catch (e) { console.error('Error loading purchase reports:', e); }
}

// ─── PURCHASE ORDERS ──────────────────────────────────────────────────────────

async function loadPurchaseOrders() {
    try {
        const status = document.getElementById('orders-status-filter')?.value || '';
        const result = await inventoryApi.getPurchaseOrders({ status });
        purchaseOrdersData = (result && result.success) ? result.data : [];
        displayPurchaseOrders();
    } catch (error) { console.error('Error loading purchase orders:', error); }
}

function displayPurchaseOrders() {
    const container = document.getElementById('orders-list');
    if (!container) return;
    if (!purchaseOrdersData.length) {
        container.innerHTML = '<div class="module-empty-state inventory-panel-empty"><strong>Aucune commande</strong><p>Créez une commande pour commencer.</p></div>';
        return;
    }
    const statusLabels = { draft: 'Brouillon', partial: 'Partiel', received: 'Reçu' };
    container.innerHTML = purchaseOrdersData.map(po => {
        const itemsHtml = (po.items || []).map(it => `
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid #f1f5f9">
                <span>${it.itemName} × ${it.orderedQuantity}</span>
                <span style="color:${(it.receivedQuantity || 0) >= it.orderedQuantity ? '#16a34a' : '#f59e0b'}">${it.receivedQuantity || 0} reçu</span>
            </div>`).join('');
        return `
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
                <div>
                    <strong style="font-size:15px">Commande du ${formatDate(po.orderDate)}</strong>
                    <div style="font-size:13px;color:#64748b">${po.supplierName || 'Fournisseur non défini'}</div>
                </div>
                <span style="background:${po.status === 'received' ? '#dcfce7' : (po.status === 'partial' ? '#fef3c7' : '#f1f5f9')};color:${po.status === 'received' ? '#16a34a' : (po.status === 'partial' ? '#d97706' : '#64748b')};padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600">${statusLabels[po.status] || po.status}</span>
            </div>
            <div style="margin-bottom:12px">${itemsHtml}</div>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                ${po.status !== 'received' ? `<button onclick="openReceiveOrderModal('${po.id}')" class="btn btn-primary btn-small">📥 Réception</button>` : ''}
                ${canManageSuppliersFlag ? `<button onclick="deletePurchaseOrder('${po.id}')" class="btn btn-secondary btn-small">Supprimer</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

async function filterPurchaseOrders() { await loadPurchaseOrders(); }

function openPurchaseOrderModal() {
    document.getElementById('purchase-order-form').reset();
    document.getElementById('purchase-order-id').value = '';
    document.getElementById('purchase-order-items').innerHTML = '';
    document.getElementById('purchase-order-modal-title').textContent = '📄 Nouvelle Commande';
    addPurchaseOrderItemRow();
    showModal('modal-purchase-order');
}

async function addPurchaseOrderItemRow() {
    const container = document.getElementById('purchase-order-items');
    const result = await inventoryApi.getAll({ paginated: false });
    const articles = result.success ? result.data : [];
    const div = document.createElement('div');
    div.className = 'purchase-order-item-row';
    div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:10px;align-items:end';
    div.innerHTML = `
        <select class="form-control po-item-article" required><option value="">-- Article --</option>${articles.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}</select>
        <input type="number" class="form-control po-item-qty" placeholder="Qté" min="1" value="1" required>
        <input type="number" class="form-control po-item-price" placeholder="Prix U." step="0.01" min="0">
        <button type="button" class="btn btn-secondary btn-small" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(div);
}

async function savePurchaseOrder(event) {
    event.preventDefault();
    const rows = document.querySelectorAll('.purchase-order-item-row');
    const items = [];
    rows.forEach(row => {
        const inventoryId = row.querySelector('.po-item-article').value;
        const orderedQuantity = parseInt(row.querySelector('.po-item-qty').value, 10) || 0;
        const unitPrice = parseFloat(row.querySelector('.po-item-price').value) || 0;
        if (inventoryId && orderedQuantity > 0) items.push({ inventoryId, orderedQuantity, unitPrice });
    });
    const data = {
        supplierId: document.getElementById('purchase-order-supplier').value || null,
        expectedDeliveryDate: document.getElementById('purchase-order-expected-date').value || null,
        notes: document.getElementById('purchase-order-notes').value.trim(),
        items
    };
    try {
        const result = await inventoryApi.createPurchaseOrder(data);
        if (!result.success) throw new Error(result.error);
        closeModal('modal-purchase-order');
        showNotification('Commande créée', 'success');
        await loadPurchaseOrders();
    } catch (error) { showNotification('Erreur: ' + error.message, 'error'); }
}

async function openReceiveOrderModal(id) {
    const po = purchaseOrdersData.find(p => p.id === id);
    if (!po) return;
    document.getElementById('receive-order-id').value = id;
    document.getElementById('receive-order-invoice').value = po.invoiceNumber || '';
    document.getElementById('receive-order-invoice-amount').value = po.invoiceAmount || '';
    const container = document.getElementById('receive-order-items');
    container.innerHTML = (po.items || []).map(it => `
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:10px;align-items:center;background:#f8fafc;padding:10px;border-radius:8px">
            <span>${it.itemName}</span>
            <span>Commandé: ${it.orderedQuantity}</span>
            <input type="number" class="form-control receive-qty" data-id="${it.id}" value="${it.orderedQuantity - (it.receivedQuantity || 0)}" min="0" max="${it.orderedQuantity}">
            <input type="date" class="form-control receive-expiry" data-id="${it.id}" placeholder="Expiration">
        </div>
    `).join('');
    showModal('modal-receive-order');
}

async function submitReceiveOrder(event) {
    event.preventDefault();
    const id = document.getElementById('receive-order-id').value;
    const items = [];
    document.querySelectorAll('.receive-qty').forEach(input => {
        const itemId = input.dataset.id;
        const expiry = document.querySelector(`.receive-expiry[data-id="${itemId}"]`)?.value || null;
        items.push({ id: itemId, receivedQuantity: parseInt(input.value, 10) || 0, expirationDate: expiry });
    });
    const data = {
        items,
        invoiceNumber: document.getElementById('receive-order-invoice').value.trim(),
        invoiceAmount: parseFloat(document.getElementById('receive-order-invoice-amount').value) || null
    };
    try {
        const result = await inventoryApi.receivePurchaseOrder(id, data);
        if (!result.success) throw new Error(result.error);
        closeModal('modal-receive-order');
        showNotification('Réception enregistrée', 'success');
        await loadPurchaseOrders();
        await loadLots();
        await loadInventoryStats();
    } catch (error) { showNotification('Erreur: ' + error.message, 'error'); }
}

async function deletePurchaseOrder(id) {
    if (!confirm('Supprimer cette commande ?')) return;
    try {
        await inventoryApi.deletePurchaseOrder(id);
        showNotification('Commande supprimée', 'success');
        await loadPurchaseOrders();
    } catch (error) { showNotification('Erreur', 'error'); }
}

// ─── POINT OF SALE ───────────────────────────────────────────────────────────

async function loadPOSData() {
    try {
        await loadPatientSelectForPOS();
        await loadPOSSales();
    } catch (e) { console.error('Error loading POS data:', e); }
}

async function searchPOSArticles(term) {
    if (!term || term.length < 1) return [];
    const result = await inventoryApi.getAll({ search: term, paginated: false });
    return (result.success ? result.data : []).filter(a => (a.quantity || 0) > 0);
}

function setupPOSArticleSearch() {
    const input = document.getElementById('pos-article-search');
    const dropdown = document.getElementById('pos-article-dropdown');
    if (!input || !dropdown) return;
    if (input.dataset.boundPosSearch) return;
    input.addEventListener('input', () => {
        clearTimeout(posSearchDebounce);
        const term = input.value.trim();
        if (!term) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; return; }
        posSearchDebounce = setTimeout(async () => {
            const articles = await searchPOSArticles(term);
            if (!articles.length) { dropdown.style.display = 'none'; return; }
            dropdown.innerHTML = articles.map(a => `
                <div class="pos-article-option" data-id="${a.id}" data-name="${a.name}" data-price="${a.sellingPrice || 0}" data-unit="${a.unit || 'unité'}" data-stock="${a.quantity || 0}"
                    style="padding:10px 12px;cursor:pointer;font-size:14px;border-bottom:1px solid #f1f5f9"
                    onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                    <strong>${a.name}</strong> <span style="color:#64748b">(${a.quantity || 0} ${a.unit || 'unité'})</span>
                    <div style="font-size:12px;color:#64748b">${formatCurrency(a.sellingPrice || 0)}</div>
                </div>`).join('');
            dropdown.style.display = 'block';
            dropdown.querySelectorAll('.pos-article-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    addToPOSCart(opt.dataset.id, opt.dataset.name, parseFloat(opt.dataset.price) || 0, opt.dataset.unit, parseInt(opt.dataset.stock, 10));
                    input.value = '';
                    dropdown.style.display = 'none';
                });
            });
        }, 250);
    });
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
    });
    input.dataset.boundPosSearch = '1';
}

function addToPOSCart(inventoryId, name, price, unit, stock) {
    const existing = posCart.find(i => i.inventoryId === inventoryId);
    if (existing) {
        if (existing.quantity + 1 > stock) { showNotification('Stock insuffisant', 'warning'); return; }
        existing.quantity += 1;
    } else {
        posCart.push({ inventoryId, name, unitPrice: price, unit, stock, quantity: 1 });
    }
    renderPOSCart();
}

function updatePOSCartQty(index, qty) {
    const item = posCart[index];
    const newQty = parseInt(qty, 10) || 0;
    if (newQty <= 0) { posCart.splice(index, 1); }
    else if (newQty > item.stock) { showNotification('Stock insuffisant', 'warning'); item.quantity = item.stock; }
    else { item.quantity = newQty; }
    renderPOSCart();
}

function updatePOSCartPrice(index, price) {
    if (posCart[index]) posCart[index].unitPrice = parseFloat(price) || 0;
    renderPOSCart();
}

function removePOSCartItem(index) {
    posCart.splice(index, 1);
    renderPOSCart();
}

function renderPOSCart() {
    const tbody = document.getElementById('pos-cart-tbody');
    if (!tbody) return;
    if (!posCart.length) {
        tbody.innerHTML = buildInventoryEmptyRow(5, 'Panier vide', 'Recherchez un article pour l’ajouter à la vente.');
    } else {
        tbody.innerHTML = posCart.map((item, idx) => `
            <tr>
                <td style="padding: 12px 14px;"><strong>${item.name}</strong><div style="font-size:12px;color:#64748b">Stock: ${item.stock} ${item.unit}</div></td>
                <td style="padding: 12px 14px; text-align:center;"><input type="number" class="form-control" value="${item.quantity}" min="1" max="${item.stock}" onchange="updatePOSCartQty(${idx}, this.value)" style="width:70px;text-align:center"></td>
                <td style="padding: 12px 14px; text-align:right;"><input type="number" class="form-control" value="${item.unitPrice}" min="0" step="0.01" onchange="updatePOSCartPrice(${idx}, this.value)" style="width:100px;text-align:right"></td>
                <td style="padding: 12px 14px; text-align:right; font-weight:600;">${formatCurrency(item.quantity * item.unitPrice)}</td>
                <td style="padding: 12px 14px;"><button type="button" class="btn btn-secondary btn-small" onclick="removePOSCartItem(${idx})">✕</button></td>
            </tr>`).join('');
    }
    recalculatePOS();
}

function recalculatePOS() {
    const subtotal = posCart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountPercent = parseFloat(document.getElementById('pos-discount-percent')?.value) || 0;
    const discountAmount = parseFloat(document.getElementById('pos-discount-amount')?.value) || 0;
    let discountTotal = (subtotal * discountPercent / 100) + discountAmount;
    let final = subtotal - discountTotal;
    if (final < 0) final = 0;
    const subtotalEl = document.getElementById('pos-subtotal');
    const discountEl = document.getElementById('pos-discount-total');
    const finalEl = document.getElementById('pos-final-total');
    if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
    if (discountEl) discountEl.textContent = formatCurrency(discountTotal);
    if (finalEl) finalEl.textContent = formatCurrency(final);
}

async function submitPOSSale() {
    if (!posCart.length) { showNotification('Panier vide', 'warning'); return; }
    const patientSelect = document.getElementById('pos-patient-select');
    const patientId = patientSelect ? patientSelect.value : '';
    const data = {
        patientId: patientId || null,
        customerName: document.getElementById('pos-customer-name')?.value.trim() || null,
        discountPercent: parseFloat(document.getElementById('pos-discount-percent')?.value) || 0,
        discountAmount: parseFloat(document.getElementById('pos-discount-amount')?.value) || 0,
        paymentMethod: document.getElementById('pos-payment-method')?.value || 'Espèces',
        notes: '',
        items: posCart.map(i => ({ inventoryId: i.inventoryId, quantity: i.quantity, unitPrice: i.unitPrice }))
    };
    try {
        const result = await inventoryApi.createSale(data);
        if (!result.success) throw new Error(result.error);
        showNotification(`Vente enregistrée: ${formatCurrency(result.finalAmount)}`, 'success');
        posCart = [];
        document.getElementById('pos-customer-name').value = '';
        if (patientSelect) patientSelect.value = '';
        document.getElementById('pos-discount-percent').value = '0';
        document.getElementById('pos-discount-amount').value = '0';
        renderPOSCart();
        await loadPOSSales();
        await loadInventoryStats();
        if (inventoryTabState.activeTab === 'articles') await loadInventory();
        if (inventoryTabState.activeTab === 'lots') await loadLots();
    } catch (error) { showNotification('Erreur: ' + error.message, 'error'); }
}

async function loadPOSSales() {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const result = await inventoryApi.getSales({ startDate: today, endDate: today });
        posSalesData = (result && result.success) ? result.data : [];
        displayPOSSales();
    } catch (e) { console.error('Error loading POS sales:', e); }
}

function displayPOSSales() {
    const tbody = document.getElementById('pos-sales-tbody');
    if (!tbody) return;
    if (!posSalesData.length) {
        tbody.innerHTML = buildInventoryEmptyRow(5, 'Aucune vente', 'Aucune vente enregistrée aujourd’hui.');
        return;
    }
    tbody.innerHTML = posSalesData.map(s => {
        const customer = s.patientId
            ? `${s.lastName || ''} ${s.firstName || ''}`.trim()
            : (s.customerName || 'Client de passage');
        const itemsSummary = (s.items || []).map(i => `${i.itemName} ×${i.quantity}`).join(', ');
        return `
        <tr>
            <td style="padding: 12px 14px;">${formatDateTime(s.saleDate)}</td>
            <td style="padding: 12px 14px;">${customer}</td>
            <td style="padding: 12px 14px; font-size:13px; color:#64748b">${itemsSummary}</td>
            <td style="padding: 12px 14px; text-align:right; font-weight:600;">${formatCurrency(s.finalAmount)}</td>
            <td style="padding: 12px 14px;">
                <span style="background:#f1f5f9;padding:4px 10px;border-radius:20px;font-size:12px">${s.paymentMethod}</span>
                <button type="button" class="btn btn-secondary btn-small" onclick="printPOSReceipt('${s.id}')" style="margin-left:8px">🖨️ Ticket</button>
            </td>
        </tr>`;
    }).join('');
}

async function printPOSReceipt(saleId) {
    try {
        const result = await inventoryApi.getSale(saleId);
        if (!result.success) return;
        const s = result.data;
        const customer = s.patientId
            ? `${s.lastName || ''} ${s.firstName || ''}`.trim()
            : (s.customerName || 'Client de passage');
        const itemsRows = (s.items || []).map(i => `
            <tr>
                <td style="padding:6px 0;border-bottom:1px dashed #cbd5e1">${i.itemName} × ${i.quantity}</td>
                <td style="padding:6px 0;text-align:right;border-bottom:1px dashed #cbd5e1">${formatCurrency(i.totalPrice)}</td>
            </tr>`).join('');
        const content = `
            <div style="font-family:'Inter',sans-serif;max-width:320px;margin:0 auto;padding:20px;font-size:14px">
                <div style="text-align:center;border-bottom:2px solid #e2e8f0;padding-bottom:12px;margin-bottom:16px">
                    <h2 style="margin:0;font-size:18px">TICKET DE VENTE</h2>
                    <div style="color:#64748b;font-size:12px;margin-top:4px">${formatDateTime(s.saleDate)}</div>
                </div>
                <div style="margin-bottom:12px;font-size:13px">
                    <strong>Client:</strong> ${customer}
                </div>
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
                    <tbody>${itemsRows}</tbody>
                </table>
                <div style="border-top:2px solid #e2e8f0;padding-top:12px">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Sous-total</span><span>${formatCurrency(s.totalAmount)}</span></div>
                    ${s.discountAmount > 0 || s.discountPercent > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#64748b"><span>Remise</span><span>${formatCurrency((s.totalAmount || 0) - (s.finalAmount || 0))}</span></div>` : ''}
                    <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700;margin-top:8px">
                        <span>TOTAL</span><span>${formatCurrency(s.finalAmount)}</span>
                    </div>
                    <div style="margin-top:8px;font-size:13px;color:#64748b">Paiement: ${s.paymentMethod}</div>
                </div>
                <div style="text-align:center;margin-top:24px;font-size:12px;color:#94a3b8">
                    Merci de votre confiance
                </div>
            </div>`;
        try {
            await inventoryApi.printHtml({ content, title: `Ticket_Vente_${saleId.slice(-6)}` });
        } catch (_) {
            const w = window.open('', '_blank');
            if (w) {
                w.document.write('<html><body>' + content + '</body></html>');
                w.document.close();
                w.print();
            }
        }
    } catch (e) { showNotification('Erreur impression ticket', 'error'); }
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────

function setupInventoryEventListeners() {
    const searchInput = document.getElementById('inventory-search');
    if (searchInput && !searchInput.dataset.boundInventorySearch) {
        searchInput.addEventListener('input', async () => { inventoryFilters.search = searchInput.value.trim(); await loadInventory(1); });
        searchInput.dataset.boundInventorySearch = '1';
    }
    const lowStockCheckbox = document.getElementById('inventory-low-only');
    if (lowStockCheckbox && !lowStockCheckbox.dataset.boundInventoryLowStock) {
        lowStockCheckbox.addEventListener('change', async () => { inventoryFilters.lowStock = lowStockCheckbox.checked; await loadInventory(1); });
        lowStockCheckbox.dataset.boundInventoryLowStock = '1';
    }
    setupPOSArticleSearch();
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function formatCurrency(amount) {
    if (typeof window.formatCurrency === 'function') return window.formatCurrency(amount);
    return new Intl.NumberFormat('fr-DZ', { style: 'decimal', minimumFractionDigits: 2 }).format(amount) + ' DZD';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('fr-FR');
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── GLOBAL EXPORTS ───────────────────────────────────────────────────────────

registerLegacyGlobals('inventory', {
    addPurchaseOrderItemRow,
    addToPOSCart,
    adjustStock,
    changeInventoryPage,
    deleteInventoryItem,
    deletePurchaseOrder,
    deleteSupplier,
    editInventoryItem,
    editSupplier,
    filterInventory,
    filterLots,
    filterPurchaseHistory,
    filterPurchaseOrders,
    filterSuppliers,
    initInventory,
    loadInventory,
    openInventoryLotAdjustModal,
    openInventoryLotModal,
    openInventoryLotModalForItem,
    openInventoryModal,
    openPurchaseOrderModal,
    openReceiveOrderModal,
    openStockAdjustModal,
    openSupplierModal,
    printPOSReceipt,
    recalculatePOS,
    refreshInventoryModule,
    removePOSCartItem,
    resetInventoryFilters,
    saveInventoryItem,
    saveInventoryLot,
    savePurchaseOrder,
    saveSupplier,
    submitPOSSale,
    submitReceiveOrder,
    switchInventoryTab,
    updatePOSCartPrice,
    updatePOSCartQty,
  viewSupplier
});
