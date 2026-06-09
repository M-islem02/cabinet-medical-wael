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
    <div class="statistics-list-item">
      <div class="statistics-list-main">
        <span class="statistics-list-rank">${index + 1}</span>
        <span class="statistics-list-label">${escapeHtml(item.name || 'Element')}</span>
      </div>
      <span class="statistics-list-badge" style="background: ${badgeColor};">${Number(item.count || 0)}</span>
    </div>
  `).join('');
}

async function loadStatistics(force = false) {
  try {
    if (statisticsState.isLoading) {
      return;
    }

    if (!force && statisticsState.lastLoadedAt && (Date.now() - statisticsState.lastLoadedAt) < statisticsState.cacheTtlMs) {
      return;
    }

    statisticsState.isLoading = true;

    const refreshButton = document.querySelector('#statistics .section-header .btn.btn-secondary');
    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = 'Actualisation...';
    }

    const isDirector = false;

    const [overviewResult, topListsResult, doctorsLeaderboardResult] = await Promise.all([
      window.api.statistics.getOverview(),
      window.api.statistics.getTopLists(),
      isDirector ? window.api.statistics.getDoctorsLeaderboard() : Promise.resolve({ success: true, data: [] })
    ]);

    if (!overviewResult?.success) {
      throw new Error(overviewResult?.error || 'Impossible de charger les statistiques');
    }

    const overview = overviewResult.data || {};
    const topLists = topListsResult?.success ? (topListsResult.data || {}) : {};
    const doctorsLeaderboard = doctorsLeaderboardResult?.success ? (doctorsLeaderboardResult.data || []) : [];

    const sectionTitleEl = document.getElementById('statistics-section-title');
    const sectionSubtitleEl = document.getElementById('statistics-section-subtitle');
    const leftListTitleEl = document.getElementById('stats-list-title-left');
    const rightListTitleEl = document.getElementById('stats-list-title-right');

    if (sectionTitleEl) {
      sectionTitleEl.textContent = isDirector ? 'Statistiques de Supervision' : 'Statistiques';
    }

    if (sectionSubtitleEl) {
      sectionSubtitleEl.textContent = isDirector
        ? 'Vue direction: performance globale et activite des medecins.'
        : 'Vue compacte de l\'activite du cabinet avec affichage complet des indicateurs.';
    }

    if (leftListTitleEl) {
      leftListTitleEl.textContent = isDirector
        ? 'Top medecins par consultations'
        : 'Consultations par patient (Top 10)';
    }

    if (rightListTitleEl) {
      rightListTitleEl.textContent = isDirector
        ? 'Medicaments les plus prescrits (global)'
        : 'Medicaments les plus prescrits';
    }

    const statPatientsEl = document.getElementById('stat-total-patients');
    const statAppointmentsEl = document.getElementById('stat-total-appointments');
    const statConsultationsEl = document.getElementById('stat-total-consultations');
    const statPrescriptionsEl = document.getElementById('stat-total-prescriptions');
    const statSickLeavesEl = document.getElementById('stat-total-sickleaves');
    const statRevenueEl = document.getElementById('stat-total-revenue');

    if (statPatientsEl) statPatientsEl.textContent = Number(overview.patients || 0).toLocaleString('fr-FR');
    if (statAppointmentsEl) statAppointmentsEl.textContent = Number(overview.appointments || 0).toLocaleString('fr-FR');
    if (statConsultationsEl) statConsultationsEl.textContent = Number(overview.consultations || 0).toLocaleString('fr-FR');
    if (statPrescriptionsEl) statPrescriptionsEl.textContent = Number(overview.prescriptions || 0).toLocaleString('fr-FR');
    if (statSickLeavesEl) statSickLeavesEl.textContent = Number(overview.sickLeaves || 0).toLocaleString('fr-FR');
    if (statRevenueEl) statRevenueEl.textContent = formatRevenueAmount(overview.revenue || 0);

    renderStatisticsList(
      'stats-consultations-list',
      isDirector
        ? (Array.isArray(doctorsLeaderboard) ? doctorsLeaderboard : [])
        : (Array.isArray(topLists.consultations) ? topLists.consultations : []),
      'linear-gradient(135deg, var(--primary-color), var(--primary-light))',
      isDirector ? 'Aucune activite medecin disponible' : 'Aucune donnee disponible'
    );

    renderStatisticsList(
      'stats-medications-list',
      Array.isArray(topLists.medications) ? topLists.medications : [],
      'linear-gradient(135deg, var(--success-color), #28a745)',
      'Aucune donnee disponible'
    );

    statisticsState.lastLoadedAt = Date.now();
  } catch (error) {
    console.error('Error loading statistics:', error);
    showNotification('Erreur lors du chargement des statistiques', 'error');
  } finally {
    statisticsState.isLoading = false;
    const refreshButton = document.querySelector('#statistics .section-header .btn.btn-secondary');
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.textContent = 'Actualiser';
    }
  }
}

window.loadStatistics = loadStatistics;
