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
let editingPOSSaleId = '';
let inventoryTabState = { activeTab: 'articles' };
let posSearchDebounce = null;
let canSeeInventoryPrices = false;
let canManageSuppliersFlag = false;
let canManageLotsFlag = false;

function isAssistantInventoryUser() {
    return typeof currentUserRole !== 'undefined' && currentUserRole === 'assistant';
}

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
    const isPractitioner = role === 'doctor' || role === 'dentist';
    canSeeInventoryPrices = isSuperAdmin || isAdmin || isPractitioner;
    canManageSuppliersFlag = isSuperAdmin || isAdmin || isPractitioner;
    canManageLotsFlag = isSuperAdmin || isAdmin || role === 'doctor' || role === 'dentist';
}

function refreshInventoryModule() {
    if (!isAssistantInventoryUser()) loadInventoryStats();
    if (inventoryTabState.activeTab === 'articles') loadInventory();
    if (inventoryTabState.activeTab === 'suppliers') loadSuppliers();
    if (inventoryTabState.activeTab === 'lots') loadLots();
    if (inventoryTabState.activeTab === 'history') loadPurchaseHistory();
    if (inventoryTabState.activeTab === 'orders') loadPurchaseOrders();
    if (inventoryTabState.activeTab === 'pos') loadPOSData();
    if (inventoryTabState.activeTab === 'sales') loadPOSSales();
}

async function initInventory() {
    checkInventoryPermissions();
    if (!inventoryInitialized) {
        if (!isAssistantInventoryUser()) {
            await loadInventoryCategories();
            await loadSupplierSelects();
        }
        await loadPatientSelectForPOS();
        resetInventoryFilters(false);
        setupInventoryEventListeners();
        inventoryInitialized = true;
    }
    if (isAssistantInventoryUser()) {
        document.querySelectorAll('#inventory .inventory-tab-btn').forEach((button) => {
            button.style.display = ['pos', 'sales'].includes(button.dataset.tab) ? '' : 'none';
        });
        document.querySelector('#inventory .inventory-stats-grid')?.setAttribute('hidden', '');
        document.querySelectorAll('#inventory .inventory-action-btn-tab').forEach((button) => {
            button.style.display = 'none';
        });
        switchInventoryTab('pos');
        return;
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
        let result = null;
        if (window.api?.patient?.getAll) {
            result = await inventoryApi.getPatients({ page: 1, pageSize: 100, paginated: true });
        }
        if (!result?.success && window.api?.patient?.getDirectory) {
            result = await inventoryApi.getPatientDirectory({ page: 1, pageSize: 100, paginated: true });
        }
        const sel = document.getElementById('pos-patient-select');
        if (!sel) return;
        if (!result?.success) {
            sel.innerHTML = '<option value="">-- Aucun patient --</option>';
            return;
        }
        sel.innerHTML = '<option value="">-- Aucun --</option>' +
            (result.data || []).map(p => `<option value="${p.id}">${p.lastName} ${p.firstName}</option>`).join('');
        if (typeof currentPatientId !== 'undefined' && currentPatientId && (result.data || []).some((patient) => String(patient.id) === String(currentPatientId))) {
            sel.value = currentPatientId;
        }
    } catch (e) { console.error('Error loading POS patient select:', e); }
}

function switchInventoryTab(tabName) {
    const validTabs = ['articles', 'suppliers', 'lots', 'history', 'orders', 'pos', 'sales'];
    if (!validTabs.includes(tabName)) return;
    if (isAssistantInventoryUser() && !['pos', 'sales'].includes(tabName)) {
        tabName = 'pos';
    }
    inventoryTabState.activeTab = tabName;
    document.querySelectorAll('#inventory .inventory-tab-btn, #inventory [data-tab]').forEach(btn => {
        const isActive = btn.dataset.tab === tabName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
    });
    document.querySelectorAll('#inventory .inventory-tab-content').forEach(c => c.style.display = 'none');
    const target = document.getElementById('inventory-tab-' + (tabName === 'sales' ? 'pos' : tabName));
    if (target) target.style.display = 'block';

    const sectionMeta = {
        articles: { title: 'Articles & Stocks', subtitle: 'Catalogue complet des consommables, médicaments et dispositifs' },
        suppliers: { title: 'Fournisseurs', subtitle: 'Gestion des coordonnées, contacts et conditions fournisseurs' },
        lots: { title: 'Lots & Traçabilité', subtitle: 'Suivi des numéros de lot, dates de péremption et alertes' },
        history: { title: 'Historique des Approvisionnements & Mouvements', subtitle: 'Journal détaillé des entrées, sorties et réajustements de stock' },
        orders: { title: 'Bons de Commande & Réceptions', subtitle: 'Création, validation et suivi de livraison des commandes' },
        pos: { title: 'Point de Vente (Vente directe)', subtitle: 'Comptoir de vente directe et facturation immédiate' },
        sales: { title: 'Historique des Ventes & Encaissements', subtitle: 'Revue des tickets de caisse, ventes et règlements' }
    };

    const titleEl = document.getElementById('inventory-active-section-title');
    const subEl = document.getElementById('inventory-active-section-subtitle');
    if (titleEl && sectionMeta[tabName]) titleEl.textContent = sectionMeta[tabName].title;
    if (subEl && sectionMeta[tabName]) subEl.textContent = sectionMeta[tabName].subtitle;

    const checkoutPanel = document.getElementById('pos-checkout-panel');
    const salesHistory = document.getElementById('pos-sales-history');
    if (checkoutPanel) checkoutPanel.style.display = tabName === 'pos' ? 'grid' : 'none';
    if (salesHistory) salesHistory.style.display = tabName === 'sales' ? 'block' : 'none';

    document.querySelectorAll('#inventory .inventory-action-btn-tab').forEach(btn => {
        btn.style.display = !isAssistantInventoryUser() && btn.dataset.action === tabName ? 'inline-flex' : 'none';
    });

    if (tabName === 'articles') loadInventory();
    if (tabName === 'suppliers') loadSuppliers();
    if (tabName === 'lots') loadLots();
    if (tabName === 'history') loadPurchaseHistory();
    if (tabName === 'orders') loadPurchaseOrders();
    if (tabName === 'pos') loadPOSData();
    if (tabName === 'sales') loadPOSSales();

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

        const lowCount = Number(stats.lowStockCount || 0);
        const expCount = Number(stats.expiringCount || 0);

        if (totalItemsEl) totalItemsEl.textContent = stats.totalItems || 0;
        if (lowStockEl) {
            lowStockEl.textContent = lowCount;
            lowStockEl.style.color = lowCount > 0 ? '#ef4444' : 'inherit';
        }
        if (expiringEl) {
            expiringEl.textContent = expCount;
            expiringEl.style.color = expCount > 0 ? '#ef4444' : 'inherit';
        }
        if (totalValueEl) {
            totalValueEl.textContent = formatCurrency(stats.totalValue || 0);
            totalValueEl.style.color = '#22c55e';
        }
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
        const actionBtn = hasActiveFilters
            ? '<button type="button" class="btn btn-secondary" onclick="resetInventoryFilters()" style="height: 36px; padding: 0 16px;">Réinitialiser les filtres</button>'
            : '<button type="button" class="btn btn-primary" onclick="openInventoryModal()" style="height: 36px; padding: 0 16px; display: inline-flex; align-items: center; gap: 6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Ajouter un article</button>';
        tbody.innerHTML = buildInventoryEmptyRow(8, 'Aucun article en stock', hasActiveFilters ? 'Aucun article ne correspond aux critères de recherche sélectionnés.' : 'Ajoutez votre premier article ou médicament pour initialiser votre stock.', actionBtn);
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
        <tr class="inventory-row" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background='transparent'">
            <td style="padding: 14px 16px;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <strong style="color: #1e293b; font-size: 14px;">${item.name}</strong>
                    ${isLowStock ? '<span class="ant-tag ant-tag-error" style="width: fit-content;">Stock bas</span>' : ''}
                </div>
            </td>
            <td style="padding: 14px 16px;"><span class="ant-tag">${item.category || 'Non classé'}</span></td>
            <td style="padding: 14px 16px;"><span style="font-weight: 700; font-size: 15px; color: ${isLowStock ? '#ef4444' : '#22c55e'};">${item.quantity}</span> <span style="color: #94a3b8; font-size: 12.5px;">${item.unit || 'unité(s)'}</span></td>
            <td style="padding: 14px 16px; color: #64748b;">${minQty}</td>
            <td class="inventory-price-col" style="padding: 14px 16px; font-weight: 500; color: #1e293b;">${priceDisplay}</td>
            <td style="padding: 14px 16px; color: #64748b;">${sellingPrice ? formatCurrency(sellingPrice) : '—'}</td>
            <td style="padding: 14px 16px; color: #64748b;">${supplier}</td>
            <td style="padding: 14px 16px;">
                <div style="display: inline-flex; align-items: center; gap: 6px;">
                    <button onclick="openInventoryArticleDetails('${item.id}')" class="btn btn-secondary btn-small" style="height: 28px; padding: 0 10px; font-size: 12.5px;" title="Détails de l'article">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        Détails
                    </button>
                    <button onclick="deleteInventoryItem('${item.id}')" class="btn btn-danger btn-small" style="height: 28px; padding: 0 8px; font-size: 12.5px;" title="Supprimer l'article">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
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

function escapeInventoryHtml(value) {
    if (typeof escapeHTML === 'function') return escapeHTML(value == null ? '' : String(value));
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function toggleInventoryPerishableFields() {
    const checkbox = document.getElementById('inventory-is-perishable');
    const group = document.getElementById('inventory-initial-expiration-group');
    const expiration = document.getElementById('inventory-expiration-date');
    const quantity = Number(document.getElementById('inventory-quantity')?.value || 0);
    if (group) group.hidden = !checkbox?.checked;
    if (expiration) expiration.required = Boolean(checkbox?.checked && quantity > 0);
}

async function openInventoryModal(id = null) {
    await loadSupplierSelects();
    const modal = document.getElementById('modal-inventory');
    const form = document.getElementById('inventory-form');
    const title = document.getElementById('inventory-modal-title');
    form.reset();
    document.getElementById('inventory-id').value = '';
    document.getElementById('inventory-quantity').value = '0';
    document.getElementById('inventory-quantity').disabled = Boolean(id);
    document.getElementById('inventory-min-quantity').value = '5';
    document.getElementById('inventory-unit').value = 'unité';
    document.getElementById('inventory-is-perishable').checked = false;
    document.getElementById('inventory-expiration-date').value = '';
    modal.dataset.currentPhoto = '';
    title.textContent = 'Nouvel Article';

    if (id) {
        const item = inventoryData.find(i => i.id === id);
        if (item) {
            title.textContent = 'Modifier Article';
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
            document.getElementById('inventory-is-perishable').checked = item.isPerishable === true;
            document.getElementById('inventory-expiration-date').value = item.expirationDate ? String(item.expirationDate).slice(0, 10) : '';
            modal.dataset.currentPhoto = item.photoPath || '';
        }
    }
    toggleInventoryPerishableFields();
    showModal('modal-inventory');
}

async function readInventoryPhotoDataUrl() {
    const file = document.getElementById('inventory-photo')?.files?.[0];
    if (!file) return document.getElementById('modal-inventory')?.dataset.currentPhoto || null;
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Photo illisible'));
        reader.readAsDataURL(file);
    });
}

async function saveInventoryItem(event) {
    event.preventDefault();
    const id = document.getElementById('inventory-id').value;
    const quantity = Number(document.getElementById('inventory-quantity').value || 0);
    const minQuantity = Number(document.getElementById('inventory-min-quantity').value || 0);
    const purchasePriceValue = document.getElementById('inventory-purchase-price').value;
    const sellingPriceValue = document.getElementById('inventory-selling-price').value;
    const isPerishable = document.getElementById('inventory-is-perishable').checked;
    const expirationDate = document.getElementById('inventory-expiration-date').value || null;
    const data = {
        name: document.getElementById('inventory-name').value.trim(),
        category: document.getElementById('inventory-category').value.trim(),
        unit: document.getElementById('inventory-unit').value.trim() || 'unité',
        quantity,
        minQuantity,
        purchasePrice: purchasePriceValue === '' ? null : Number(purchasePriceValue),
        sellingPrice: sellingPriceValue === '' ? null : Number(sellingPriceValue),
        supplierId: document.getElementById('inventory-supplier-id').value || null,
        location: document.getElementById('inventory-location').value.trim(),
        notes: document.getElementById('inventory-notes').value.trim(),
        isPerishable,
        expirationDate,
        photoPath: await readInventoryPhotoDataUrl()
    };

    if (!data.name) { showNotification('Le nom de l’article est obligatoire', 'warning'); return; }
    if (quantity < 0 || minQuantity < 0 || (data.purchasePrice !== null && data.purchasePrice < 0) || (data.sellingPrice !== null && data.sellingPrice < 0)) {
        showNotification('Les quantités, seuils et prix doivent être positifs', 'warning'); return;
    }
    if (isPerishable && !id && quantity > 0 && !expirationDate) {
        showNotification('Indiquez la date d’expiration du stock initial', 'warning'); return;
    }

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
        const result = await inventoryApi.delete(id);
        if (!result?.success) throw new Error(result?.error || 'Suppression impossible');
        document.getElementById('inventory-article-detail-modal')?.remove();
        showNotification('Article supprimé', 'success');
        await loadInventory(inventoryPagination.page);
        await loadInventoryStats();
    } catch (error) {
        showNotification('Erreur: ' + (error.message || 'Suppression impossible'), 'error');
    }
}

async function openInventoryArticleDetails(id) {
    let item = inventoryData.find(entry => String(entry.id) === String(id));
    if (!item) {
        const result = await inventoryApi.getById(id);
        item = result?.success ? result.data : null;
    }
    if (!item) return;
    document.getElementById('inventory-article-detail-modal')?.remove();
    const photo = item.photoPath
        ? `<img src="${escapeInventoryHtml(item.photoPath)}" alt="" class="inventory-detail-photo">`
        : '<div class="inventory-detail-photo inventory-detail-photo-empty">Aucune photo</div>';
    const supplierOptions = '<option value="">-- Aucun --</option>' + suppliersData.map(s =>
        `<option value="${escapeInventoryHtml(s.id)}" ${s.id === item.supplierId ? 'selected' : ''}>${escapeInventoryHtml(s.name)}</option>`
    ).join('');
    const html = `
      <div id="inventory-article-detail-modal" class="inventory-detail-overlay">
        <div class="inventory-detail-dialog">
          <div class="inventory-detail-header"><div><span class="inventory-detail-kicker">Fiche article</span><h2>${escapeInventoryHtml(item.name)}</h2></div><button type="button" class="close-btn" onclick="document.getElementById('inventory-article-detail-modal').remove()">&times;</button></div>
          <div class="inventory-detail-body">
            <div class="inventory-detail-summary">${photo}<div class="inventory-detail-grid">
              <div><span>Catégorie</span><strong>${escapeInventoryHtml(item.category || '—')}</strong></div><div><span>Stock actuel</span><strong>${Number(item.quantity || 0)} ${escapeInventoryHtml(item.unit || '')}</strong></div>
              <div><span>Seuil minimum</span><strong>${Number(item.minQuantity || 0)}</strong></div><div><span>Suivi</span><strong>${item.isPerishable ? 'Périssable / lots' : 'Stock simple'}</strong></div>
              <div><span>Prix d'achat</span><strong>${formatCurrency(item.purchasePrice || 0)}</strong></div><div><span>Prix de vente</span><strong>${formatCurrency(item.sellingPrice || 0)}</strong></div>
              <div><span>Fournisseur</span><strong>${escapeInventoryHtml(item.supplierName || '—')}</strong></div><div><span>Emplacement</span><strong>${escapeInventoryHtml(item.location || '—')}</strong></div>
              <div class="wide"><span>Notes</span><strong>${escapeInventoryHtml(item.notes || 'Aucune note')}</strong></div>
            </div></div>
            <form class="inventory-quick-stock" onsubmit="adjustStockFromArticleDetails(event, '${escapeInventoryHtml(item.id)}')">
              <h3>Ajuster le stock</h3>
              <div class="inventory-quick-stock-grid">
                <select class="form-control" name="movementType"><option value="in">Ajouter du stock</option><option value="out">Retirer du stock</option></select>
                <input class="form-control" name="quantity" type="number" min="1" required placeholder="Quantité">
                <select class="form-control" name="supplierId">${supplierOptions}</select>
                <input class="form-control" name="unitPrice" type="number" min="0" step="0.01" placeholder="Prix d'achat">
                ${item.isPerishable ? '<input class="form-control" name="expirationDate" type="date" required aria-label="Date expiration">' : ''}
                <input class="form-control" name="reason" placeholder="Motif / référence">
              </div>
              <button type="submit" class="btn btn-primary">Confirmer l'ajustement</button>
            </form>
          </div>
          <div class="inventory-detail-footer"><button class="btn btn-danger" onclick="deleteInventoryItem('${escapeInventoryHtml(item.id)}')">Supprimer</button><button class="btn btn-primary" onclick="document.getElementById('inventory-article-detail-modal').remove();editInventoryItem('${escapeInventoryHtml(item.id)}')">Modifier</button></div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

async function adjustStockFromArticleDetails(event, id) {
    event.preventDefault();
    let item = inventoryData.find(entry => String(entry.id) === String(id));
    if (!item) {
        const result = await inventoryApi.getById(id);
        item = result?.success ? result.data : null;
    }
    if (!item) return;
    const form = event.currentTarget;
    const type = form.elements.movementType.value;
    const quantity = Number(form.elements.quantity.value || 0);
    if (quantity <= 0) return showNotification('Quantité invalide', 'warning');
    try {
        let result;
        if (type === 'in' && item.isPerishable) {
            result = await inventoryApi.createLot({
                inventoryId: id,
                supplierId: form.elements.supplierId.value || null,
                lotNumber: `LOT-${Date.now().toString().slice(-6)}`,
                purchaseDate: new Date().toISOString().slice(0, 10),
                expirationDate: form.elements.expirationDate.value,
                initialQuantity: quantity,
                unitPrice: Number(form.elements.unitPrice.value || item.purchasePrice || 0),
                notes: form.elements.reason.value || 'Ajout depuis la fiche article'
            });
        } else {
            result = await inventoryApi.adjustStock(id, quantity, type, form.elements.reason.value || 'Ajustement depuis la fiche article');
        }
        if (!result?.success) throw new Error(result?.error || 'Ajustement impossible');
        showNotification(type === 'in' ? 'Stock ajouté' : 'Stock retiré', 'success');
        document.getElementById('inventory-article-detail-modal')?.remove();
        await loadInventory(inventoryPagination.page);
        await loadInventoryStats();
        openInventoryArticleDetails(id);
    } catch (error) { showNotification('Erreur: ' + error.message, 'error'); }
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

function buildInventoryEmptyRow(colspan, title, description, buttonHtml = '') {
    return `<tr><td colspan="${colspan}" class="module-empty-cell" style="padding: 48px 24px !important; text-align: center;">
        <div class="ant-empty" style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="ant-empty-image" style="margin-bottom: 16px;">
                <svg viewBox="0 0 64 64" width="60" height="60" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 18h48v36a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V18z" fill="#f8fafc"/>
                    <path d="M8 18l6-10h36l6 10H8z" fill="#f1f5f9"/>
                    <line x1="26" y1="34" x2="38" y2="34"/>
                </svg>
            </div>
            <div style="font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 6px;">${title}</div>
            <div style="font-size: 13.5px; color: #64748b; max-width: 420px; line-height: 1.5; margin-bottom: ${buttonHtml ? '16px' : '0'};">${description}</div>
            ${buttonHtml}
        </div>
    </td></tr>`;
}

function buildInventoryEmptyPanel(title, description, buttonHtml = '') {
    return `
        <div class="ant-empty" style="padding: 48px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="ant-empty-image" style="margin-bottom: 16px;">
                <svg viewBox="0 0 64 64" width="60" height="60" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 6h24l12 12v38a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z" fill="#f8fafc"/>
                    <polyline points="40 6 40 18 52 18"/>
                    <line x1="22" y1="28" x2="42" y2="28"/>
                    <line x1="22" y1="36" x2="42" y2="36"/>
                    <line x1="22" y1="44" x2="34" y2="44"/>
                </svg>
            </div>
            <div style="font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 6px;">${title}</div>
            <div style="font-size: 13.5px; color: #64748b; max-width: 420px; line-height: 1.5; margin-bottom: ${buttonHtml ? '16px' : '0'};">${description}</div>
            ${buttonHtml}
        </div>
    `;
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
        const search = document.getElementById('supplier-search')?.value.trim() || '';
        const actionBtn = search
            ? '<button type="button" class="btn btn-secondary" onclick="document.getElementById(\'supplier-search\').value=\'\'; filterSuppliers();" style="height: 36px; padding: 0 16px;">Effacer la recherche</button>'
            : '<button type="button" class="btn btn-primary" onclick="openSupplierModal()" style="height: 36px; padding: 0 16px; display: inline-flex; align-items: center; gap: 6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Ajouter un fournisseur</button>';
        tbody.innerHTML = buildInventoryEmptyRow(5, 'Aucun fournisseur enregistré', search ? 'Aucun fournisseur ne correspond à votre recherche.' : 'Ajoutez vos fournisseurs et laboratoires partenaires pour organiser vos réapprovisionnements.', actionBtn);
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
        const result = await inventoryApi.deleteSupplier(id);
        if (!result?.success) throw new Error(result?.error || 'Suppression impossible');
        document.getElementById('inventory-supplier-detail-modal')?.remove();
        showNotification('Fournisseur supprimé', 'success');
        await loadSuppliers();
        await loadSupplierSelects();
    } catch (error) { showNotification('Erreur: ' + error.message, 'error'); }
}

async function viewSupplier(id) {
    try {
        const result = await inventoryApi.getSupplier(id);
        if (!result.success) return;
        const s = result.data;
        const linkedRows = (s.linkedArticles || []).map(article => `
            <tr><td><button class="inventory-link-button" onclick="document.getElementById('inventory-supplier-detail-modal').remove();openInventoryArticleDetails('${escapeInventoryHtml(article.id)}')">${escapeInventoryHtml(article.name)}</button></td><td>${escapeInventoryHtml(article.category || '—')}</td><td>${Number(article.quantity || 0)} ${escapeInventoryHtml(article.unit || '')}</td><td>${formatCurrency(article.sellingPrice || 0)}</td></tr>
        `).join('');
        const html = `
            <div id="inventory-supplier-detail-modal" class="inventory-detail-overlay">
                <div class="inventory-detail-dialog">
                    <div class="inventory-detail-header"><div><span class="inventory-detail-kicker">Fiche fournisseur</span><h2>${escapeInventoryHtml(s.name)}</h2></div><button class="close-btn" onclick="document.getElementById('inventory-supplier-detail-modal').remove()">×</button></div>
                    <div class="inventory-detail-body">
                      <div class="inventory-detail-grid">
                        <div><span>Contact</span><strong>${escapeInventoryHtml(s.contactName || '—')}</strong></div><div><span>Spécialité</span><strong>${escapeInventoryHtml(s.specialty || '—')}</strong></div>
                        <div><span>Téléphone</span><strong>${escapeInventoryHtml(s.phone || '—')}</strong></div><div><span>Email</span><strong>${escapeInventoryHtml(s.email || '—')}</strong></div>
                        <div class="wide"><span>Adresse</span><strong>${escapeInventoryHtml(s.address || '—')}</strong></div><div class="wide"><span>Notes</span><strong>${escapeInventoryHtml(s.notes || 'Aucune note')}</strong></div>
                      </div>
                      <h3>Articles rattachés</h3>
                      <div class="inventory-detail-table"><table class="table"><thead><tr><th>Article</th><th>Catégorie</th><th>Stock</th><th>Prix vente</th></tr></thead><tbody>${linkedRows || '<tr><td colspan="4" class="text-center">Aucun article rattaché</td></tr>'}</tbody></table></div>
                    </div>
                    <div class="inventory-detail-footer"><button class="btn btn-danger" onclick="deleteSupplier('${escapeInventoryHtml(s.id)}')">Supprimer</button><button class="btn btn-primary" onclick="document.getElementById('inventory-supplier-detail-modal').remove();editSupplier('${escapeInventoryHtml(s.id)}')">Modifier</button></div>
                </div>
            </div>`;
        document.getElementById('inventory-supplier-detail-modal')?.remove();
        document.body.insertAdjacentHTML('beforeend', html);
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
                for (const art of (articles.data || []).filter(item => item.isPerishable === true)) {
                    const result = await inventoryApi.getLots(art.id);
                    if (result.success) allLots.push(...(result.data || []).filter(lot => Boolean(lot.expirationDate)));
                }
            }
        }
        // The lots screen is reserved for dated/perishable batches. Historical
        // undated rows must not make a simple article appear as perishable.
        allLots = allLots.filter(lot => Boolean(lot.expirationDate));
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
        const actionBtn = '<button type="button" class="btn btn-primary" onclick="openInventoryLotModal()" style="height: 36px; padding: 0 16px; display: inline-flex; align-items: center; gap: 6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Nouveau lot</button>';
        tbody.innerHTML = buildInventoryEmptyRow(8, 'Aucun lot enregistré', 'Gérez la traçabilité de vos articles périssables, numéros de lot et dates d\'expiration.', actionBtn);
        return;
    }
    const today = new Date().toISOString().slice(0, 10);
    tbody.innerHTML = lotsData.map(l => {
        const isExpiring = l.expirationDate && l.expirationDate <= today ? ' style="background:#fee2e2"' : (isExpiringSoon(l.expirationDate) ? ' style="background:#fef3c7"' : '');
        const priceDisplay = canSeeInventoryPrices ? formatCurrency(l.unitPrice) : '—';
        return `
        <tr${isExpiring}>
            <td style="padding: 14px 16px;">${escapeInventoryHtml(l.itemName || 'Article introuvable')}</td>
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
            (arts.success ? arts.data : []).filter(a => a.isPerishable === true).map(a => `<option value="${a.id}">${a.name}</option>`).join('');
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
        (result.success ? result.data : []).filter(a => a.isPerishable === true).map(a => `<option value="${a.id}">${a.name}</option>`).join('');
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
        tbody.innerHTML = buildInventoryEmptyRow(7, 'Aucun historique d\'achats', 'Les réceptions de commandes et achats de stock apparaîtront automatiquement ici.');
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
        const actionBtn = '<button type="button" class="btn btn-primary" onclick="openPurchaseOrderModal()" style="height: 36px; padding: 0 16px; display: inline-flex; align-items: center; gap: 6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Nouveau bon de commande</button>';
        container.innerHTML = buildInventoryEmptyPanel('Aucun bon de commande', 'Créez un bon de commande pour suivre vos demandes de réapprovisionnement auprès des fournisseurs.', actionBtn);
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
    if (isAssistantInventoryUser()) return;
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
        tbody.innerHTML = buildInventoryEmptyRow(5, 'Panier vide', 'Recherchez un article ci-dessus pour l’ajouter à la vente en cours.');
    } else {
        tbody.innerHTML = posCart.map((item, idx) => `
            <tr>
                <td style="padding: 12px 14px;"><strong>${item.name}</strong><div style="font-size:12px;color:#64748b">Stock: ${item.stock} ${item.unit}</div></td>
                <td style="padding: 12px 14px; text-align:center;"><input type="number" class="form-control" value="${item.quantity}" min="1" max="${item.stock}" onchange="updatePOSCartQty(${idx}, this.value)" style="width:70px;text-align:center"></td>
                <td style="padding: 12px 14px; text-align:right;"><input type="number" class="form-control" value="${item.unitPrice}" min="0" step="0.01" ${isAssistantInventoryUser() ? 'readonly' : `onchange="updatePOSCartPrice(${idx}, this.value)"`} style="width:100px;text-align:right"></td>
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
        const result = editingPOSSaleId
            ? await inventoryApi.updateSale(editingPOSSaleId, data)
            : await inventoryApi.createSale(data);
        if (!result.success) throw new Error(result.error);
        showNotification(`${editingPOSSaleId ? 'Vente modifiée' : 'Vente enregistrée'}: ${formatCurrency(result.finalAmount)}`, 'success');
        editingPOSSaleId = '';
        posCart = [];
        document.getElementById('pos-customer-name').value = '';
        if (patientSelect) patientSelect.value = '';
        document.getElementById('pos-discount-percent').value = '0';
        document.getElementById('pos-discount-amount').value = '0';
        const submitButton = document.getElementById('pos-submit-button');
        if (submitButton) submitButton.textContent = 'Valider la vente';
        renderPOSCart();
        await loadPOSSales();
        if (!isAssistantInventoryUser()) await loadInventoryStats();
        if (inventoryTabState.activeTab === 'articles') await loadInventory();
        if (inventoryTabState.activeTab === 'lots') await loadLots();
    } catch (error) { showNotification('Erreur: ' + error.message, 'error'); }
}

async function loadPOSSales() {
    try {
        const result = await inventoryApi.getSales({ limit: 200 });
        posSalesData = (result && result.success) ? result.data : [];
        displayPOSSales();
    } catch (e) { console.error('Error loading POS sales:', e); }
}

function displayPOSSales() {
    const tbody = document.getElementById('pos-sales-tbody');
    if (!tbody) return;
    if (!posSalesData.length) {
        tbody.innerHTML = buildInventoryEmptyRow(6, 'Aucune vente enregistrée', 'L\'historique des ventes et encaissements réalisés à la caisse apparaîtra ici.');
        return;
    }
    tbody.innerHTML = posSalesData.map(s => {
        const customer = s.patientId
            ? `${s.lastName || ''} ${s.firstName || ''}`.trim()
            : (s.customerName || 'Client de passage');
        const itemsSummary = (s.items || []).map(i => `${i.itemName} ×${i.quantity}`).join(', ');
        const returned = s.status === 'returned';
        const open = !returned && (s.status === 'open' || !s.status);
        const statusLabel = returned ? 'Retournée' : (open ? 'Ouverte' : 'Facturée');
        return `
        <tr class="${returned ? 'pos-sale-returned' : ''}">
            <td style="padding: 12px 14px;">${formatDateTime(s.saleDate)}</td>
            <td style="padding: 12px 14px;">${customer}</td>
            <td style="padding: 12px 14px; font-size:13px; color:#64748b">${itemsSummary}</td>
            <td style="padding: 12px 14px; text-align:right; font-weight:600;">${formatCurrency(s.finalAmount)}</td>
            <td style="padding: 12px 14px;">
                <span style="background:#f1f5f9;padding:4px 10px;border-radius:20px;font-size:12px">${statusLabel}</span>
            </td>
            <td style="padding: 12px 14px; white-space:nowrap">
                ${open ? `<button type="button" class="btn btn-secondary btn-small" onclick="editPOSSale('${s.id}')">Modifier</button>` : ''}
                <button type="button" class="btn btn-secondary btn-small" onclick="viewPOSInvoice('${s.id}')">Voir facture</button>
                ${returned ? '' : `<button type="button" class="btn btn-danger btn-small" onclick="returnPOSSale('${s.id}')">Retourner</button>`}
            </td>
        </tr>`;
    }).join('');
}

async function editPOSSale(saleId) {
    try {
        const result = await inventoryApi.getSale(saleId);
        if (!result?.success) throw new Error(result?.error || 'Vente introuvable');
        const sale = result.data;
        if (sale.status !== 'open' && sale.status) throw new Error('Cette vente est déjà clôturée');
        editingPOSSaleId = saleId;
        posCart = (sale.items || []).map(item => ({
            inventoryId: item.inventoryId,
            name: item.itemName,
            unitPrice: Number(item.unitPrice || 0),
            unit: item.unit || 'unité',
            stock: Number(item.stockQuantity || 0) + Number(item.quantity || 0),
            quantity: Number(item.quantity || 1)
        }));
        document.getElementById('pos-customer-name').value = sale.customerName || '';
        document.getElementById('pos-patient-select').value = sale.patientId || '';
        document.getElementById('pos-discount-percent').value = Number(sale.discountPercent || 0);
        document.getElementById('pos-discount-amount').value = Number(sale.discountAmount || 0);
        document.getElementById('pos-payment-method').value = sale.paymentMethod || 'Espèces';
        const submitButton = document.getElementById('pos-submit-button');
        if (submitButton) submitButton.textContent = 'Enregistrer les modifications';
        switchInventoryTab('pos');
        renderPOSCart();
    } catch (error) { showNotification('Erreur: ' + error.message, 'error'); }
}

function buildPOSInvoiceHtml(sale, settings = {}) {
    const customer = sale.patientId ? `${sale.lastName || ''} ${sale.firstName || ''}`.trim() : (sale.customerName || 'Client de passage');
    const rows = (sale.items || []).map(item => `<tr><td>${escapeInventoryHtml(item.itemName)}</td><td>${Number(item.quantity || 0)}</td><td>${formatCurrency(item.unitPrice || 0)}</td><td>${formatCurrency(item.totalPrice || 0)}</td></tr>`).join('');
    const logo = settings.cabinetLogoDataUrl ? `<img src="${escapeInventoryHtml(settings.cabinetLogoDataUrl)}" style="width:22mm;height:16mm;object-fit:contain" alt="">` : '';
    const invoiceNumber = sale.invoiceNumber || `PROV-${String(sale.id).slice(-6).toUpperCase()}`;
    const barcode = settings.documentShowBarcode === 0 || settings.documentShowBarcode === false
        ? ''
        : (typeof window.buildDocumentBarcodeHtml === 'function'
            ? window.buildDocumentBarcodeHtml(invoiceNumber)
            : `<div class="invoice-reference">${escapeInventoryHtml(invoiceNumber)}</div>`);
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
      @page{size:A5 portrait;margin:0}*{box-sizing:border-box}html,body{width:148mm;height:210mm;margin:0;background:#fff}body{font-family:"Segoe UI",Arial,sans-serif;color:#172033;font-size:8.7pt}.invoice-page{min-height:210mm;padding:9mm;display:flex;flex-direction:column}.head{display:grid;grid-template-columns:1fr 28mm 1fr;align-items:center;gap:3mm;padding-bottom:3.5mm;border-bottom:1.2px solid #172033}.brand h1{font-size:12.5pt;line-height:1.15;margin:0 0 1mm}.logo-center{text-align:center}.logo-center img{width:24mm;height:17mm;object-fit:contain}.muted{color:#42526a;font-size:7.6pt;line-height:1.35}.meta{text-align:right}.meta h2{font-size:15pt;line-height:1;margin:0 0 1mm;letter-spacing:.4px}.meta .invoice-reference{font-size:8pt;font-weight:700}.client{margin:5mm 0 3.5mm;padding:0 0 2.5mm;border-bottom:1px solid #9ba6b5}.client strong{display:block;font-size:7.5pt;text-transform:uppercase;letter-spacing:.45px;margin-bottom:.8mm}.client div{font-weight:600;font-size:9pt}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #cbd3dd;padding:2.1mm 1.5mm;text-align:left}th{font-size:7.3pt;text-transform:uppercase;letter-spacing:.35px;font-weight:700;background:transparent;border-top:1.2px solid #172033;color:#172033}th:nth-child(n+2),td:nth-child(n+2){text-align:right}.invoice-bottom{margin-top:auto;padding-top:5mm}.discount{font-size:8pt;text-align:right;color:#42526a;margin-bottom:2mm}.total{margin-left:auto;width:62mm;border-top:1.5px solid #172033;padding-top:2.5mm;display:flex;justify-content:space-between;gap:5mm;font-size:11.3pt;font-weight:700}.footer-row{display:grid;grid-template-columns:1fr 54mm;gap:6mm;align-items:end;margin-top:8mm}.barcode-slot{min-height:14mm;display:flex;align-items:end}.document-barcode{display:inline-flex;flex-direction:column;align-items:center;gap:.5mm;font-size:6.5pt;letter-spacing:.65px;color:#172033}.document-barcode svg{display:block;width:39mm;height:8mm}.signature{text-align:center;font-size:7.8pt;color:#172033}.signature .line{border-top:1px solid #172033;width:50mm;margin:0 auto 2mm}@media print{html,body{background:#fff}.invoice-page{min-height:210mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><main class="invoice-page"><header class="head"><div class="brand"><h1>${escapeInventoryHtml(settings.cabinetName || 'MedCareSO')}</h1><div class="muted">${escapeInventoryHtml(settings.cabinetAddress || '')}<br>${escapeInventoryHtml(settings.cabinetPhone || '')} ${escapeInventoryHtml(settings.cabinetEmail || '')}</div></div><div class="logo-center">${logo}</div><div class="meta"><h2>FACTURE</h2><div class="invoice-reference">${escapeInventoryHtml(invoiceNumber)}</div><div class="muted">${formatDateTime(sale.saleDate)}</div></div></header><section class="client"><strong>Client / Patient</strong><div>${escapeInventoryHtml(customer)}</div></section><table><thead><tr><th>Désignation</th><th>Quantité</th><th>Prix unitaire</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><section class="invoice-bottom">${Number(sale.discountAmount || 0) || Number(sale.discountPercent || 0) ? `<div class="discount">Remise appliquée : ${formatCurrency(Number(sale.totalAmount || 0)-Number(sale.finalAmount || 0))}</div>` : ''}<div class="total"><span>Total général</span><span>${formatCurrency(sale.finalAmount || 0)}</span></div><div class="footer-row"><div class="barcode-slot">${barcode}</div><div class="signature"><div class="line"></div>Signature / Cachet</div></div></section></main></body></html>`;
}

async function viewPOSInvoice(saleId) {
    try {
        const [saleResult, settingsResult] = await Promise.all([inventoryApi.getSale(saleId), window.api.settings.get()]);
        if (!saleResult?.success) throw new Error(saleResult?.error || 'Vente introuvable');
        const sale = saleResult.data;
        const settings = settingsResult?.success ? settingsResult.data || {} : {};
        document.getElementById('pos-invoice-preview')?.remove();
        const render = () => buildPOSInvoiceHtml(sale, settings);
        const returned = sale.status === 'returned';
        document.body.insertAdjacentHTML('beforeend', `<div id="pos-invoice-preview" class="inventory-detail-overlay"><div class="inventory-detail-dialog pos-invoice-dialog"><div class="inventory-detail-header"><div><span class="inventory-detail-kicker">Aperçu A5</span><h2>Facture de vente${returned ?' — retournée' : ''}</h2></div><button class="close-btn" onclick="document.getElementById('pos-invoice-preview').remove()">&times;</button></div><div class="inventory-detail-body pos-invoice-body"><iframe id="pos-invoice-frame" class="pos-invoice-frame"></iframe></div><div class="inventory-detail-footer"><button class="btn btn-secondary" onclick="document.getElementById('pos-invoice-preview').remove()">Fermer</button><button class="btn btn-primary" onclick="printPOSInvoice('${saleId}')">${returned ?'Imprimer la facture' : 'Imprimer et clôturer'}</button></div></div></div>`);
        document.getElementById('pos-invoice-frame').srcdoc = render();
    } catch (error) { showNotification('Erreur: ' + error.message, 'error'); }
}

async function printPOSInvoice(saleId) {
    try {
        const initialSale = await inventoryApi.getSale(saleId);
        if (!initialSale?.success) throw new Error(initialSale?.error || 'Vente introuvable');
        const returned = initialSale.data?.status === 'returned';
        const finalized = returned
            ? { success: true, invoiceNumber: initialSale.data?.invoiceNumber || `PROV-${String(saleId).slice(-6).toUpperCase()}` }
            : await inventoryApi.finalizeSale(saleId);
        if (!finalized?.success) throw new Error(finalized?.error || 'Clôture impossible');
        const [saleResult, settingsResult] = await Promise.all([inventoryApi.getSale(saleId), window.api.settings.get()]);
        const html = buildPOSInvoiceHtml(saleResult.data, settingsResult?.data || {});
        const printed = await inventoryApi.printHtml({
            html,
            pageSize: 'A5',
            documentTitle: `Facture_${finalized.invoiceNumber}`
        });
        if (printed?.success === false) throw new Error(printed.error || 'Impression impossible');
        document.getElementById('pos-invoice-preview')?.remove();
        showNotification(returned ? 'Facture retournée envoyée à l’impression' : 'Facture clôturée et envoyée à l’impression', 'success');
        await loadPOSSales();
    } catch (error) { showNotification('Erreur: ' + error.message, 'error'); }
}

async function returnPOSSale(saleId) {
    try {
        const saleResult = await inventoryApi.getSale(saleId);
        if (!saleResult?.success) throw new Error(saleResult?.error || 'Vente introuvable');
        const sale = saleResult.data;
        if (sale.status === 'returned') {
            showNotification('Cette vente a déjà été retournée', 'warning');
            await loadPOSSales();
            return;
        }
        document.getElementById('pos-return-dialog')?.remove();
        const customer = sale.patientId
            ? `${sale.lastName || ''} ${sale.firstName || ''}`.trim()
            : (sale.customerName || 'Client de passage');
        const reference = sale.invoiceNumber || `Vente ${String(sale.id || '').slice(-8).toUpperCase()}`;
        document.body.insertAdjacentHTML('beforeend', `
          <div id="pos-return-dialog" class="inventory-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="pos-return-title">
            <div class="inventory-detail-dialog" style="width:min(520px, calc(100vw - 32px));">
              <div class="inventory-detail-header">
                <div><span class="inventory-detail-kicker">Retour de vente</span><h2 id="pos-return-title">Restaurer le stock</h2></div>
                <button type="button" class="close-btn" onclick="document.getElementById('pos-return-dialog').remove()">&times;</button>
              </div>
              <div class="inventory-detail-body" style="padding:24px;">
                <div style="padding:14px 16px; border:1px solid #dbe5ee; border-radius:10px; background:#f8fafc; margin-bottom:18px;">
                  <div style="font-weight:700; color:#1e293b;">${escapeInventoryHtml(reference)}</div>
                  <div style="margin-top:5px; color:#64748b;">${escapeInventoryHtml(customer || 'Client de passage')} · ${formatCurrency(sale.finalAmount || 0)}</div>
                </div>
                <p style="margin:0 0 14px; color:#475569; line-height:1.5;">Le retour annule cette vente et remet les quantités vendues dans le stock. Cette action ne peut pas être annulée.</p>
                <label for="pos-return-reason" style="display:block; margin-bottom:7px; font-weight:700; color:#1e293b;">Motif du retour <span style="color:#dc2626;">*</span></label>
                <textarea id="pos-return-reason" class="form-control" rows="3" placeholder="Ex. erreur de facturation, article retourné…" style="resize:vertical;"></textarea>
                <div id="pos-return-error" style="display:none; color:#b91c1c; font-size:13px; margin-top:8px;"></div>
              </div>
              <div class="inventory-detail-footer">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('pos-return-dialog').remove()">Annuler</button>
                <button type="button" id="pos-return-confirm" class="btn btn-danger">Confirmer le retour</button>
              </div>
            </div>
          </div>`);
        const reasonInput = document.getElementById('pos-return-reason');
        const errorEl = document.getElementById('pos-return-error');
        const confirmButton = document.getElementById('pos-return-confirm');
        reasonInput?.focus();
        confirmButton?.addEventListener('click', async () => {
            const reason = reasonInput?.value?.trim() || '';
            if (!reason) {
                if (errorEl) {
                    errorEl.textContent = 'Veuillez indiquer le motif du retour.';
                    errorEl.style.display = 'block';
                }
                reasonInput?.focus();
                return;
            }
            confirmButton.disabled = true;
            confirmButton.textContent = 'Retour en cours…';
            try {
                const result = await inventoryApi.returnSale(saleId, reason);
                if (!result?.success) throw new Error(result?.error || 'Retour impossible');
                document.getElementById('pos-return-dialog')?.remove();
                showNotification('Retour enregistré : le stock a été restauré', 'success');
                await loadPOSSales();
                if (!isAssistantInventoryUser()) await loadInventoryStats();
                if (inventoryTabState.activeTab === 'articles') await loadInventory();
            } catch (error) {
                if (errorEl) {
                    errorEl.textContent = error?.message || 'Retour impossible';
                    errorEl.style.display = 'block';
                }
                confirmButton.disabled = false;
                confirmButton.textContent = 'Confirmer le retour';
            }
        });
    } catch (error) {
        showNotification('Erreur: ' + error.message, 'error');
    }
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
            await inventoryApi.printHtml({
                html: content,
                pageSize: 'A5',
                documentTitle: `Ticket_Vente_${saleId.slice(-6)}`
            });
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
    const moreAddBtn = document.getElementById('inventory-more-add-btn');
    if (moreAddBtn && !moreAddBtn.dataset.boundDropdown && typeof AntDropdown !== 'undefined') {
        AntDropdown.create(moreAddBtn, [
            { key: 'supplier', label: 'Nouveau fournisseur', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' },
            { key: 'order', label: 'Nouvelle commande', icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 18 15 15"/></svg>' },
        ], {
            onClick: (key) => {
                if (key === 'supplier') openSupplierModal();
                if (key === 'order') openPurchaseOrderModal();
            }
        });
        moreAddBtn.dataset.boundDropdown = '1';
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
    adjustStockFromArticleDetails,
    changeInventoryPage,
    deleteInventoryItem,
    deletePurchaseOrder,
    deleteSupplier,
    editInventoryItem,
    editPOSSale,
    editSupplier,
    filterInventory,
    filterLots,
    filterPurchaseHistory,
    filterPurchaseOrders,
    filterSuppliers,
    initInventory,
    loadInventory,
    openInventoryArticleDetails,
    openInventoryLotAdjustModal,
    openInventoryLotModal,
    openInventoryLotModalForItem,
    openInventoryModal,
    openPurchaseOrderModal,
    openReceiveOrderModal,
    openStockAdjustModal,
    openSupplierModal,
    printPOSReceipt,
    printPOSInvoice,
    recalculatePOS,
    refreshInventoryModule,
    removePOSCartItem,
    returnPOSSale,
    resetInventoryFilters,
    saveInventoryItem,
    saveInventoryLot,
    savePurchaseOrder,
    saveSupplier,
    submitPOSSale,
    submitReceiveOrder,
    switchInventoryTab,
    toggleInventoryPerishableFields,
    updatePOSCartPrice,
    updatePOSCartQty,
    viewPOSInvoice,
  viewSupplier
});
