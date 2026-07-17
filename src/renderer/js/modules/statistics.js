// ========== STATISTICS ==========

const statisticsState = {
  isLoading: false,
  lastLoadedAt: 0,
  cacheTtlMs: 0
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRevenueAmount(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DA`;
}

function renderStatisticsList(containerId, items, badgeColor, emptyLabel) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = `<div class="statistics-list-empty">${escapeHtml(emptyLabel)}</div>`;
    return;
  }

  container.innerHTML = items.map((item, index) => `
    <div class="statistics-list-item" style="padding: 10px 0;">
      <div class="statistics-list-main">
        <span class="statistics-list-rank">${index + 1}</span>
        <span class="statistics-list-label" style="font-size: 13px; font-weight: 600; color: #1e293b;">${escapeHtml(item.name || 'Élément')}</span>
      </div>
      <span class="statistics-list-badge" style="background: ${badgeColor}; font-size: 11px; padding: 4px 10px;">${Number(item.count || 0)}</span>
    </div>
  `).join('');
}

function handleStatsPeriodChange() {
  const period = document.getElementById('stats-period-select').value;
  const customDatesDiv = document.getElementById('stats-custom-dates');
  if (customDatesDiv) {
    customDatesDiv.style.display = period === 'custom' ? 'flex' : 'none';
  }
  if (period !== 'custom') {
    loadStatistics(true);
  }
}

function handleStatsCustomDateChange() {
  const startDate = document.getElementById('stats-start-date')?.value || '';
  const endDate = document.getElementById('stats-end-date')?.value || '';
  if (startDate && endDate) {
    loadStatistics(true);
  }
}

async function loadStatistics(force = false) {
  try {
    if (statisticsState.isLoading) return;

    if (!force && statisticsState.lastLoadedAt && (Date.now() - statisticsState.lastLoadedAt) < statisticsState.cacheTtlMs) {
      return;
    }

    statisticsState.isLoading = true;

    const refreshButton = document.querySelector('#statistics .statistics-refresh-btn');
    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = 'Actualisation...';
    }

    // Get filter inputs
    const period = document.getElementById('stats-period-select')?.value || 'month';
    const startDate = document.getElementById('stats-start-date')?.value || '';
    const endDate = document.getElementById('stats-end-date')?.value || '';

    if (period === 'custom' && (!startDate || !endDate)) {
      showNotification('Sélectionnez les deux dates de la période', 'warning');
      return;
    }

    if (period === 'custom' && startDate > endDate) {
      showNotification('La date de début doit précéder la date de fin', 'warning');
      return;
    }

    // Fetch advanced stats from backend
    const res = await window.api.statistics.getAdvancedOverview({ period, startDate, endDate });

    if (!res?.success) {
      throw new Error(res?.error || 'Impossible de charger les statistiques');
    }

    const { role, isSuperAdmin, isDoctorAdmin, financials, clinicals, operationals } = res.data;
    const hasFinancialAccess = isSuperAdmin || isDoctorAdmin;

    // Show/hide containers based on roles
    const finContainer = document.getElementById('stats-financial-container');
    const docContainer = document.getElementById('stats-doctor-daily-container');
    const trendsCard = document.getElementById('stats-trends-card');
    const alertsCard = document.getElementById('stats-alerts-card');
    const opWidgets = document.querySelectorAll('.stats-operational-widget');

    if (hasFinancialAccess) {
      if (finContainer) finContainer.style.display = 'grid';
      if (trendsCard) trendsCard.style.display = 'block';
      if (alertsCard) alertsCard.style.display = 'block';
      if (docContainer) docContainer.style.display = 'none';
      opWidgets.forEach(w => w.style.display = 'block');

      // Populate Financials
      if (financials) {
        document.getElementById('stat-adv-revenue').textContent = formatRevenueAmount(financials.totalRevenue);
        document.getElementById('stat-breakdown-consultations').textContent = formatRevenueAmount(financials.revenueBreakdown.consultations);
        document.getElementById('stat-breakdown-plans').textContent = formatRevenueAmount(financials.revenueBreakdown.treatmentPlans);
        document.getElementById('stat-breakdown-pos').textContent = formatRevenueAmount(financials.revenueBreakdown.posSales);

        document.getElementById('stat-adv-expenses').textContent = formatRevenueAmount(financials.totalExpenses);
        document.getElementById('stat-breakdown-general').textContent = formatRevenueAmount(financials.expenseBreakdown.general);
        document.getElementById('stat-breakdown-salaries').textContent = formatRevenueAmount(financials.expenseBreakdown.salaires);
        document.getElementById('stat-breakdown-inventory').textContent = formatRevenueAmount(financials.expenseBreakdown.inventory);

        const netMargin = financials.netMargin;
        const marginEl = document.getElementById('stat-adv-margin');
        marginEl.textContent = formatRevenueAmount(netMargin);
        marginEl.style.color = netMargin >= 0 ? '#059669' : '#dc2626';

        const marginPctEl = document.getElementById('stat-adv-margin-pct');
        if (marginPctEl) {
          const totalRev = financials.totalRevenue;
          const pct = totalRev > 0 ? Math.round((netMargin / totalRev) * 100) : 0;
          marginPctEl.textContent = `Taux de marge : ${pct}%`;
          marginPctEl.style.color = netMargin >= 0 ? '#059669' : '#dc2626';
        }

        document.getElementById('stat-adv-pending').textContent = formatRevenueAmount(financials.pendingPayments);

        // Periodical financials table
        const tbody = document.getElementById('stats-periodical-tbody');
        if (tbody) {
          if (Array.isArray(financials.periodicalFinancials) && financials.periodicalFinancials.length > 0) {
            tbody.innerHTML = financials.periodicalFinancials.map(item => {
              const pct = item.revenue > 0 ? Math.round((item.margin / item.revenue) * 100) : 0;
              const marginColor = item.margin >= 0 ? '#059669' : '#dc2626';
              return `
                <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                  <td style="padding: 10px 12px; font-weight: 600; color: #1e293b;">${escapeHtml(item.period)}</td>
                  <td style="padding: 10px 12px; text-align: right; color: #059669; font-weight: 600;">${formatRevenueAmount(item.revenue)}</td>
                  <td style="padding: 10px 12px; text-align: right; color: #dc2626;">${formatRevenueAmount(item.expenses)}</td>
                  <td style="padding: 10px 12px; text-align: right; color: ${marginColor}; font-weight: 700;">${formatRevenueAmount(item.margin)}</td>
                  <td style="padding: 10px 12px; text-align: right; color: ${marginColor}; font-weight: 700;">${pct}%</td>
                </tr>
              `;
            }).join('');
          } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #64748b;">Aucune donnée historique sur cette période.</td></tr>`;
          }
        }
      }

      // Populate Operationals
      if (operationals) {
        document.getElementById('stat-adv-chairs-occupancy').textContent = `${operationals.chairOccupancy}%`;
        document.getElementById('stat-adv-equip-occupancy').textContent = `${operationals.equipmentOccupancy}%`;

        // Unified alerts rendering
        const alertsList = document.getElementById('stats-alerts-list');
        if (alertsList) {
          const alerts = [];
          
          if (Array.isArray(operationals.alerts?.lowStock)) {
            operationals.alerts.lowStock.forEach(a => {
              alerts.push({ type: 'warning', icon: '⚠️', badge: 'Stock Bas', name: a.name, message: a.message });
            });
          }
          if (Array.isArray(operationals.alerts?.expiringLots)) {
            operationals.alerts.expiringLots.forEach(a => {
              alerts.push({ type: 'danger', icon: '⏳', badge: 'Expiration', name: a.name, message: a.message });
            });
          }
          if (Array.isArray(operationals.alerts?.maintenanceLots)) {
            operationals.alerts.maintenanceLots.forEach(a => {
              alerts.push({ type: 'info', icon: '🔧', badge: 'Maintenance', name: a.name, message: a.message });
            });
          }

          if (alerts.length > 0) {
            alertsList.innerHTML = alerts.map(a => {
              let bg = '#fef3c7', border = '#f59e0b', color = '#b45309';
              if (a.type === 'danger') { bg = '#fee2e2'; border = '#ef4444'; color = '#b91c1c'; }
              if (a.type === 'info') { bg = '#e0f2fe'; border = '#0ea5e9'; color = '#0369a1'; }

              return `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-radius: 10px; background: ${bg}; border: 1px solid ${border}; color: ${color};">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 16px;">${a.icon}</span>
                    <div style="font-size: 13px;">
                      <span style="font-weight: 800; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px; margin-right: 6px;">${a.badge}</span>
                      <strong>${escapeHtml(a.name)}</strong> — ${escapeHtml(a.message)}
                    </div>
                  </div>
                </div>
              `;
            }).join('');
          } else {
            alertsList.innerHTML = `<div style="padding: 16px; border-radius: 10px; background: #f0fdf4; border: 1px dashed #16a34a; color: #15803d; text-align: center; font-size: 13px;">✅ Aucune alerte active dans le cabinet.</div>`;
          }
        }
      }
    } else {
      if (finContainer) finContainer.style.display = 'none';
      if (trendsCard) trendsCard.style.display = 'none';
      if (alertsCard) alertsCard.style.display = 'none';
      if (docContainer) docContainer.style.display = 'grid';
      opWidgets.forEach(w => w.style.display = 'none');

      // Populate Doctor collected revenue
      if (financials) {
        document.getElementById('stat-doctor-collected').textContent = formatRevenueAmount(financials.todayCollected || 0);
      }
    }

    // Populate Clinicals
    if (clinicals) {
      document.getElementById('stat-adv-patients-seen').textContent = Number(clinicals.patientsSeen).toLocaleString('fr-FR');
      document.getElementById('stat-adv-plans-rate').textContent = `${clinicals.plansCompletion.completionRate}%`;
      document.getElementById('stat-plans-active').textContent = clinicals.plansCompletion.active;
      document.getElementById('stat-plans-completed').textContent = clinicals.plansCompletion.completed;
      document.getElementById('stat-plans-cancelled').textContent = clinicals.plansCompletion.cancelled;

      // Render Left List (Top Practitioners if Admin, Top Patients if Doctor Normal)
      const leftListTitleEl = document.getElementById('stats-list-title-left');
      if (hasFinancialAccess) {
        if (leftListTitleEl) leftListTitleEl.textContent = 'Patients consultés par médecin (Top 10)';
        renderStatisticsList(
          'stats-consultations-list',
          clinicals.patientsSeenByDoctor,
          'linear-gradient(135deg, var(--primary-color), var(--primary-light))',
          'Aucune activité médecin enregistrée'
        );
      } else {
        if (leftListTitleEl) leftListTitleEl.textContent = 'Mes Patients les plus vus (Top 10)';
        // Call top lists to get patients count
        const topListsResult = await window.api.statistics.getTopLists({ startDate, endDate });
        const topLists = topListsResult?.success ? (topListsResult.data || {}) : {};
        renderStatisticsList(
          'stats-consultations-list',
          Array.isArray(topLists.consultations) ? topLists.consultations : [],
          'linear-gradient(135deg, var(--primary-color), var(--primary-light))',
          'Aucune consultation enregistrée'
        );
      }

      // Render Right List (Dental Treatments Acts count)
      renderStatisticsList(
        'stats-acts-list',
        (clinicals.actsBreakdown || []).map(i => ({ name: i.label, count: i.count })),
        'linear-gradient(135deg, var(--success-color), #28a745)',
        'Aucun acte médical enregistré sur cette période'
      );
    }

    statisticsState.lastLoadedAt = Date.now();
  } catch (error) {
    console.error('Error loading statistics:', error);
    showNotification('Erreur lors du chargement des statistiques', 'error');
  } finally {
    statisticsState.isLoading = false;
    const refreshButton = document.querySelector('#statistics .statistics-refresh-btn');
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = 'Actualiser';
    }
  }
}

// Make functions globally available
window.loadStatistics = loadStatistics;
window.handleStatsPeriodChange = handleStatsPeriodChange;
window.handleStatsCustomDateChange = handleStatsCustomDateChange;
