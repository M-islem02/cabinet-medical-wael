// =============================================
// INVENTORY/STOCK MANAGEMENT MODULE
// =============================================

const INVENTORY_PAGE_SIZE = 20;

let inventoryData = [];
let inventoryInitialized = false;
let inventoryPagination = {
    page: 1,
    pageSize: INVENTORY_PAGE_SIZE,
    total: 0,
    totalPages: 1
};
let inventoryFilters = {
    category: '',
    lowStock: false,
    expiring: false,
    search: ''
};

// Default categories for physical stock
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
    'Autre'
];

// Initialize inventory module
async function initInventory() {
    if (!inventoryInitialized) {
        await loadInventoryCategories();
        setupInventoryEventListeners();
        inventoryInitialized = true;
    }

    await loadInventory();
    await loadInventoryStats();
}

// Load inventory categories into select
async function loadInventoryCategories() {
    const select = document.getElementById('inventory-category');
    if (!select) return;

    let datalist = document.getElementById('inventory-categories-list');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'inventory-categories-list';
        document.body.appendChild(datalist);
        select.setAttribute('list', 'inventory-categories-list');
    }

    datalist.innerHTML = DEFAULT_INVENTORY_CATEGORIES.map(cat =>
        `<option value="${cat}">`
    ).join('');
}

function updateInventoryPagination(pagination = null) {
    if (!pagination) {
        inventoryPagination = {
            page: 1,
            pageSize: INVENTORY_PAGE_SIZE,
            total: Array.isArray(inventoryData) ? inventoryData.length : 0,
            totalPages: 1
        };
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
    const container = document.getElementById('inventory-pagination');
    if (!container) return;

    const total = Number(inventoryPagination.total || 0);
    const pageSize = Number(inventoryPagination.pageSize || INVENTORY_PAGE_SIZE);
    const currentPage = Math.max(1, Number(inventoryPagination.page || 1));
    const totalPages = Math.max(1, Number(inventoryPagination.totalPages || 1));

    if (total <= pageSize) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    const start = total > 0 ? ((currentPage - 1) * pageSize) + 1 : 0;
    const end = total > 0 ? Math.min(currentPage * pageSize, total) : 0;

    container.style.display = 'flex';
    container.innerHTML = `
        <div class="patients-pagination-info">Affichage ${start}-${end} sur ${total} articles</div>
        <div class="patients-pagination-actions">
            <button class="btn btn-small btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} onclick="changeInventoryPage(-1)">Précédent</button>
            <span class="patients-pagination-info">Page ${currentPage} / ${totalPages}</span>
            <button class="btn btn-small btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} onclick="changeInventoryPage(1)">Suivant</button>
        </div>
    `;
}

async function changeInventoryPage(direction) {
    const nextPage = Math.min(
        Math.max(1, inventoryPagination.page + direction),
        Math.max(1, inventoryPagination.totalPages)
    );
    if (nextPage === inventoryPagination.page) return;
    await loadInventory(nextPage);
}

// Load inventory items
async function loadInventory(page = 1) {
    const tbody = document.getElementById('inventory-tbody');

    try {
        if (tbody && !inventoryData.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center" style="padding: 40px; color: #94a3b8;">
                        Chargement...
                    </td>
                </tr>
            `;
        }

        const result = await window.api.inventory.getAll({
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

// Display inventory in table
function displayInventory() {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) {
        console.error('inventory-tbody not found');
        return;
    }

    const rows = Array.isArray(inventoryData) ? inventoryData : [];

    if (rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center" style="padding: 40px;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                        <span style="font-size: 48px;">📦</span>
                        <p style="color: #666; margin: 0;">Aucun article trouvé</p>
                        <button class="btn btn-primary btn-sm" onclick="openInventoryModal()">Ajouter un article</button>
                    </div>
                </td>
            </tr>
        `;
        renderInventoryPagination();
        return;
    }

    tbody.innerHTML = rows.map(item => {
        const minQty = item.minQuantity || item.min_quantity || 0;
        const purchasePrice = item.purchasePrice || item.purchase_price;
        const expDate = item.expirationDate || item.expiration_date;
        const isLowStock = Number(item.quantity || 0) <= Number(minQty || 0);
        const isExpiring = expDate && isExpiringSoon(expDate);
        const metaParts = [];
        if (item.location) metaParts.push(`Emplacement: ${item.location}`);
        if (expDate) metaParts.push(`Expiration: ${new Date(expDate).toLocaleDateString('fr-FR')}`);

        return `
        <tr class="inventory-row" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <td style="padding: 16px;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <strong style="color: #1e293b; font-size: 15px;">${item.name}</strong>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        ${isLowStock ? '<span style="background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">Stock bas</span>' : ''}
                        ${isExpiring ? '<span style="background: #fef3c7; color: #d97706; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">Expire bientôt</span>' : ''}
                    </div>
                    ${metaParts.length ? `<div class="inventory-row-meta">${metaParts.map(part => `<span>${part}</span>`).join('')}</div>` : ''}
                </div>
            </td>
            <td style="padding: 16px;">
                <span style="background: #f1f5f9; padding: 4px 10px; border-radius: 8px; font-size: 13px; color: #64748b;">${item.category || 'Non classé'}</span>
            </td>
            <td style="padding: 16px;">
                <span style="font-weight: 700; font-size: 18px; color: ${isLowStock ? '#dc2626' : '#059669'};">
                    ${item.quantity}
                </span>
                <span style="color: #94a3b8; font-size: 13px; margin-left: 4px;">${item.unit || 'unité(s)'}</span>
            </td>
            <td style="padding: 16px; color: #64748b;">${minQty}</td>
            <td style="padding: 16px; font-weight: 500; color: #1e293b;">${purchasePrice ? formatCurrency(purchasePrice) : '-'}</td>
            <td style="padding: 16px; color: #64748b;">${item.supplier || '-'}</td>
            <td style="padding: 16px;">
                <div class="inventory-actions">
                    <button onclick="openStockAdjustModal('${item.id}')" title="Ajuster stock" class="inventory-action-btn inventory-action-btn-stock">Stock</button>
                    <button onclick="editInventoryItem('${item.id}')" title="Modifier" class="inventory-action-btn inventory-action-btn-edit">Modifier</button>
                    <button onclick="deleteInventoryItem('${item.id}')" title="Supprimer" class="inventory-action-btn inventory-action-btn-delete">Supprimer</button>
                </div>
            </td>
        </tr>
    `;
    }).join('');

    renderInventoryPagination();
}

// Check if expiring soon (within 30 days)
function isExpiringSoon(dateStr) {
    const expDate = new Date(dateStr);
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    return expDate <= thirtyDays;
}

// Load inventory statistics
async function loadInventoryStats() {
    try {
        const statsResult = await window.api.inventory.getStats();
        const lowStockResult = await window.api.inventory.getLowStock();
        const expiringResult = await window.api.inventory.getExpiringSoon(30);

        const stats = (statsResult && statsResult.success) ? statsResult.data : (statsResult || {});
        const lowStock = (lowStockResult && lowStockResult.success) ? lowStockResult.data : (lowStockResult || []);
        const expiring = (expiringResult && expiringResult.success) ? expiringResult.data : (expiringResult || []);

        const totalItemsEl = document.getElementById('stat-total-items');
        const lowStockEl = document.getElementById('stat-low-stock');
        const expiringEl = document.getElementById('inventory-expiring');
        const totalValueEl = document.getElementById('stat-stock-value');

        if (totalItemsEl) totalItemsEl.textContent = stats.totalItems || 0;
        if (lowStockEl) lowStockEl.textContent = lowStock.length;
        if (expiringEl) expiringEl.textContent = expiring.length;
        if (totalValueEl) totalValueEl.textContent = formatCurrency(stats.totalValue || 0);

    } catch (error) {
        console.error('Error loading inventory stats:', error);
    }
}

// Open inventory modal
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
            document.getElementById('inventory-supplier').value = item.supplier || '';
            document.getElementById('inventory-expiration').value = item.expirationDate || item.expiration_date || '';
            document.getElementById('inventory-location').value = item.location || '';
            document.getElementById('inventory-notes').value = item.notes || '';
        }
    }

    openModal('modal-inventory');
}

// Save inventory item
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
        supplier: document.getElementById('inventory-supplier').value.trim(),
        expirationDate: document.getElementById('inventory-expiration').value || null,
        location: document.getElementById('inventory-location').value.trim(),
        notes: document.getElementById('inventory-notes').value.trim()
    };

    try {
        let result;
        if (id) {
            result = await window.api.inventory.update(id, data);
            showNotification('Article modifié avec succès', 'success');
        } else {
            result = await window.api.inventory.create(data);
            showNotification('Article ajouté avec succès', 'success');
        }

        if (result && !result.success) {
            throw new Error(result.error || 'Erreur inconnue');
        }

        closeModal('modal-inventory');
        await loadInventory(inventoryPagination.page);
        await loadInventoryStats();
    } catch (error) {
        console.error('Error saving inventory item:', error);
        showNotification('Erreur lors de l\'enregistrement: ' + error.message, 'error');
    }
}

// Edit inventory item
function editInventoryItem(id) {
    openInventoryModal(id);
}

// Delete inventory item
async function deleteInventoryItem(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet article ?')) {
        return;
    }

    try {
        await window.api.inventory.delete(id);
        showNotification('Article supprimé', 'success');
        await loadInventory(inventoryPagination.page);
        await loadInventoryStats();
    } catch (error) {
        console.error('Error deleting inventory item:', error);
        showNotification('Erreur lors de la suppression', 'error');
    }
}

// Open stock adjustment modal
function openStockAdjustModal(id) {
    const item = inventoryData.find(i => i.id === id);
    if (!item) return;

    document.getElementById('stock-adjust-id').value = item.id;
    document.getElementById('stock-adjust-name').textContent = item.name;
    document.getElementById('stock-adjust-current').textContent = `${item.quantity} ${item.unit || 'unité(s)'}`;
    document.getElementById('stock-adjust-type').value = 'in';
    document.getElementById('stock-adjust-quantity').value = '';
    document.getElementById('stock-adjust-reason').value = '';

    openModal('modal-stock-adjust');
}

// Adjust stock
async function adjustStock(event) {
    event.preventDefault();

    const id = document.getElementById('stock-adjust-id').value;
    const type = document.getElementById('stock-adjust-type').value;
    const quantity = parseInt(document.getElementById('stock-adjust-quantity').value, 10);
    const reason = document.getElementById('stock-adjust-reason').value.trim();

    if (quantity <= 0) {
        showNotification('La quantité doit être supérieure à 0', 'warning');
        return;
    }

    try {
        const result = await window.api.inventory.adjustStock(id, quantity, type, reason);
        if (result && result.success) {
            showNotification(`Stock ${type === 'in' ? 'augmenté' : 'diminué'} avec succès`, 'success');
            closeModal('modal-stock-adjust');
            await loadInventory(inventoryPagination.page);
            await loadInventoryStats();
        } else {
            showNotification(result?.error || 'Erreur lors de l\'ajustement', 'error');
        }
    } catch (error) {
        console.error('Error adjusting stock:', error);
        showNotification(error.message || 'Erreur lors de l\'ajustement', 'error');
    }
}

// Debounced inventory search to avoid reloading on every keystroke.
const debouncedLoadInventory = debounce((page = 1) => loadInventory(page), 300);

// Setup event listeners
function setupInventoryEventListeners() {
    const searchInput = document.getElementById('inventory-search');
    if (searchInput && !searchInput.dataset.boundInventorySearch) {
        searchInput.addEventListener('input', () => filterInventory());
        searchInput.dataset.boundInventorySearch = '1';
    }

    const lowStockCheckbox = document.getElementById('inventory-low-only');
    if (lowStockCheckbox && !lowStockCheckbox.dataset.boundInventoryLowStock) {
        lowStockCheckbox.addEventListener('change', async (e) => {
            inventoryFilters.lowStock = e.target.checked;
            await loadInventory(1);
        });
        lowStockCheckbox.dataset.boundInventoryLowStock = '1';
    }

    const expiringCheckbox = document.getElementById('filter-expiring');
    if (expiringCheckbox && !expiringCheckbox.dataset.boundInventoryExpiring) {
        expiringCheckbox.addEventListener('change', async (e) => {
            inventoryFilters.expiring = e.target.checked;
            await loadInventory(1);
        });
        expiringCheckbox.dataset.boundInventoryExpiring = '1';
    }
}

// Filter inventory (called from HTML oninput and from the input listener)
function filterInventory() {
    const searchInput = document.getElementById('inventory-search');
    if (searchInput) {
        inventoryFilters.search = searchInput.value.trim();
    }
    debouncedLoadInventory(1);
}

// Format currency
function formatCurrency(amount) {
    if (typeof window.formatCurrency === 'function') {
        return window.formatCurrency(amount);
    }
    return new Intl.NumberFormat('fr-DZ', {
        style: 'decimal',
        minimumFractionDigits: 2
    }).format(amount) + ' DZD';
}

// Format date
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR');
}

// Make functions globally available
window.initInventory = initInventory;
window.loadInventory = loadInventory;
window.openInventoryModal = openInventoryModal;
window.saveInventoryItem = saveInventoryItem;
window.editInventoryItem = editInventoryItem;
window.deleteInventoryItem = deleteInventoryItem;
window.openStockAdjustModal = openStockAdjustModal;
window.adjustStock = adjustStock;
window.filterInventory = filterInventory;
window.changeInventoryPage = changeInventoryPage;
