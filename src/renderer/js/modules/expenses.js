// =============================================
// EXPENSES MANAGEMENT MODULE
// =============================================

let expensesData = [];
let expenseCategories = [];
let expenseFilters = {
    category: '',
    startDate: '',
    endDate: '',
    search: ''
};

// Initialize expenses module
async function initExpenses() {
    await loadExpenseCategories();
    await loadExpenses();
    await loadExpenseStats();
    setupExpenseEventListeners();
}

// Load expense categories
async function loadExpenseCategories() {
    try {
        expenseCategories = await window.api.expenseCategory.getAll();
        populateExpenseCategorySelect();
    } catch (error) {
        console.error('Error loading expense categories:', error);
    }
}

// Populate category select
function populateExpenseCategorySelect() {
    const select = document.getElementById('expense-category');
    const filterSelect = document.getElementById('filter-expense-category');
    
    if (select) {
        select.innerHTML = '<option value="">Sélectionner...</option>';
        expenseCategories.forEach(cat => {
            select.innerHTML += `<option value="${cat.id}">${cat.icon || ''} ${cat.name}</option>`;
        });
    }
    
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="">Toutes les catégories</option>';
        expenseCategories.forEach(cat => {
            filterSelect.innerHTML += `<option value="${cat.id}">${cat.icon || ''} ${cat.name}</option>`;
        });
    }
}

// Load expenses
async function loadExpenses() {
    try {
        const params = {};
        if (expenseFilters.category) params.category_id = expenseFilters.category;
        if (expenseFilters.startDate) params.startDate = expenseFilters.startDate;
        if (expenseFilters.endDate) params.endDate = expenseFilters.endDate;
        
        expensesData = await window.api.expense.getAll(params);
        displayExpenses();
    } catch (error) {
        console.error('Error loading expenses:', error);
        showNotification('Erreur lors du chargement des dépenses', 'error');
    }
}

// Display expenses in table
function displayExpenses() {
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;
    
    // Filter by search
    let filtered = expensesData;
    if (expenseFilters.search) {
        const search = expenseFilters.search.toLowerCase();
        filtered = expensesData.filter(e => 
            e.description?.toLowerCase().includes(search) ||
            e.vendor?.toLowerCase().includes(search) ||
            e.category_name?.toLowerCase().includes(search)
        );
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center" style="padding: 40px;">
                    <p style="color: #666;">Aucune dépense trouvée</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filtered.map(expense => `
        <tr>
            <td>${formatDate(expense.date)}</td>
            <td>${expense.category_icon || ''} ${expense.category_name || 'Non catégorisé'}</td>
            <td>${expense.description || '-'}</td>
            <td>${expense.vendor || '-'}</td>
            <td style="font-weight: bold; color: #ef4444;">${formatCurrency(expense.amount)}</td>
            <td>
                <button class="btn btn-sm btn-info" onclick="editExpense(${expense.id})" title="Modifier">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteExpense(${expense.id})" title="Supprimer">🗑️</button>
            </td>
        </tr>
    `).join('');
}

// Load expense statistics
async function loadExpenseStats() {
    try {
        const stats = await window.api.expense.getStats();
        
        // Update stats cards
        const totalMonthEl = document.getElementById('expense-total-month');
        const avgDayEl = document.getElementById('expense-avg-day');
        const topCategoryEl = document.getElementById('expense-top-category');
        const totalYearEl = document.getElementById('expense-total-year');
        
        if (totalMonthEl) totalMonthEl.textContent = formatCurrency(stats.totalMonth || 0);
        if (avgDayEl) avgDayEl.textContent = formatCurrency(stats.avgPerDay || 0);
        if (topCategoryEl) topCategoryEl.textContent = stats.topCategory || '-';
        if (totalYearEl) totalYearEl.textContent = formatCurrency(stats.totalYear || 0);
        
    } catch (error) {
        console.error('Error loading expense stats:', error);
    }
}

// Open expense modal
function openExpenseModal(id = null) {
    const modal = document.getElementById('modal-expense');
    const form = document.getElementById('expense-form');
    const title = document.getElementById('expense-modal-title');
    
    form.reset();
    document.getElementById('expense-id').value = '';
    document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
    title.textContent = '💸 Nouvelle Dépense';
    
    if (id) {
        const expense = expensesData.find(e => e.id === id);
        if (expense) {
            title.textContent = '💸 Modifier Dépense';
            document.getElementById('expense-id').value = expense.id;
            document.getElementById('expense-date').value = expense.date;
            document.getElementById('expense-amount').value = expense.amount;
            document.getElementById('expense-category').value = expense.category_id || '';
            document.getElementById('expense-description').value = expense.description || '';
            document.getElementById('expense-vendor').value = expense.vendor || '';
            document.getElementById('expense-receipt').value = expense.receipt_number || '';
            document.getElementById('expense-payment-method').value = expense.payment_method || 'Espèces';
            document.getElementById('expense-notes').value = expense.notes || '';
        }
    }
    
    openModal('modal-expense');
}

// Save expense
async function saveExpense(event) {
    event.preventDefault();
    
    const id = document.getElementById('expense-id').value;
    const data = {
        date: document.getElementById('expense-date').value,
        amount: parseFloat(document.getElementById('expense-amount').value),
        category_id: document.getElementById('expense-category').value || null,
        description: document.getElementById('expense-description').value.trim(),
        vendor: document.getElementById('expense-vendor').value.trim(),
        receipt_number: document.getElementById('expense-receipt').value.trim(),
        payment_method: document.getElementById('expense-payment-method').value,
        notes: document.getElementById('expense-notes').value.trim()
    };
    
    try {
        if (id) {
            await window.api.expense.update(parseInt(id), data);
            showNotification('Dépense modifiée avec succès', 'success');
        } else {
            await window.api.expense.create(data);
            showNotification('Dépense ajoutée avec succès', 'success');
        }
        
        closeModal('modal-expense');
        await loadExpenses();
        await loadExpenseStats();
    } catch (error) {
        console.error('Error saving expense:', error);
        showNotification('Erreur lors de l\'enregistrement', 'error');
    }
}

// Edit expense
function editExpense(id) {
    openExpenseModal(id);
}

// Delete expense
async function deleteExpense(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')) {
        return;
    }
    
    try {
        await window.api.expense.delete(id);
        showNotification('Dépense supprimée', 'success');
        await loadExpenses();
        await loadExpenseStats();
    } catch (error) {
        console.error('Error deleting expense:', error);
        showNotification('Erreur lors de la suppression', 'error');
    }
}

// Setup event listeners
function setupExpenseEventListeners() {
    // Filter by category
    const categoryFilter = document.getElementById('filter-expense-category');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', (e) => {
            expenseFilters.category = e.target.value;
            loadExpenses();
        });
    }
    
    // Filter by date range
    const startDate = document.getElementById('filter-expense-start');
    const endDate = document.getElementById('filter-expense-end');
    
    if (startDate) {
        startDate.addEventListener('change', (e) => {
            expenseFilters.startDate = e.target.value;
            loadExpenses();
        });
    }
    
    if (endDate) {
        endDate.addEventListener('change', (e) => {
            expenseFilters.endDate = e.target.value;
            loadExpenses();
        });
    }
    
    // Search
    const searchInput = document.getElementById('search-expenses');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            expenseFilters.search = e.target.value;
            displayExpenses();
        });
    }
}

// Export expenses to CSV
async function exportExpenses() {
    if (expensesData.length === 0) {
        showNotification('Aucune dépense à exporter', 'warning');
        return;
    }
    
    const headers = ['Date', 'Catégorie', 'Description', 'Fournisseur', 'Montant', 'Mode de paiement'];
    const rows = expensesData.map(e => [
        e.date,
        e.category_name || '',
        e.description || '',
        e.vendor || '',
        e.amount,
        e.payment_method || ''
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `depenses_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Export réussi', 'success');
}

// Format currency
function formatCurrency(amount) {
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
window.initExpenses = initExpenses;
window.loadExpenses = loadExpenses;
window.openExpenseModal = openExpenseModal;
window.saveExpense = saveExpense;
window.editExpense = editExpense;
window.deleteExpense = deleteExpense;
window.exportExpenses = exportExpenses;
