// ===================== DAILY SUMMARY MODULE =====================
// Shows daily statistics: visits, echographies, kiné sessions, revenues

let summaryData = {};
let summaryDate = new Date().toISOString().split('T')[0];

/**
 * Initialize daily summary module - always set to today
 */
async function initDailySummary() {
  console.log('📋 Initializing Daily Summary module...');
  
  // Always reset to today's date on init
  summaryDate = new Date().toISOString().split('T')[0];
  
  // Set today's date in date picker
  const datePicker = document.getElementById('summary-date-picker');
  if (datePicker) {
    datePicker.value = summaryDate;
  }
  
  // Update date display
  updateSummaryDateDisplay();
  
  // Auto-load summary data
  await loadDailySummary();
  
  console.log('✅ Daily Summary module initialized');
}

/**
 * Load daily summary data
 */
async function loadDailySummary(resetToToday = false) {
  try {
    const datePicker = document.getElementById('summary-date-picker');
    
    // Reset to today if requested or if first load
    if (resetToToday || !datePicker.value) {
      summaryDate = new Date().toISOString().split('T')[0];
      if (datePicker) {
        datePicker.value = summaryDate;
      }
    } else if (datePicker && datePicker.value) {
      summaryDate = datePicker.value;
    }
    
    updateSummaryDateDisplay();
    
    const data = await window.api.dailySummary.get(summaryDate);
    summaryData = data || {};
    
    renderSummaryStats();
    renderActsTable();
    renderKineSummary();
    renderConsultationsTable();
    
  } catch (error) {
    console.error('Error loading daily summary:', error);
    // If API not available, try to calculate locally
    calculateLocalSummary();
  }
}

/**
 * Calculate summary locally from consultations
 */
async function calculateLocalSummary() {
  try {
    // Get all consultations for the date
    const consultations = await window.api.consultations.getByDate(summaryDate);
    const payments = await window.api.payments.getByDate(summaryDate);
    
    // Count acts
    let visits = 0;
    let echoes = 0;
    let kineSessions = 0;
    let reductions = 0;
    let revenue = 0;
    
    const actsCounts = {};
    const actsSummary = {};
    
    consultations.forEach(c => {
      visits++;
      
      // Parse acts if stored as JSON
      if (c.acts) {
        try {
          const acts = JSON.parse(c.acts);
          acts.forEach(act => {
            actsCounts[act] = (actsCounts[act] || 0) + 1;
            
            if (act === 'echo') echoes++;
            if (act === 'kine') kineSessions++;
            if (act === 'reduction') reductions++;
          });
        } catch (e) {
          // Acts not in JSON format
        }
      }
    });
    
    // Calculate revenue
    payments.forEach(p => {
      revenue += p.amount || 0;
      const description = String(p.description || '').trim() || 'Autre acte';
      if (!actsSummary[description]) {
        actsSummary[description] = { quantity: 0, total: 0 };
      }
      actsSummary[description].quantity += 1;
      actsSummary[description].total += Number(p.amount) || 0;
    });
    
    summaryData = {
      visits,
      echoes,
      kineSessions,
      reductions,
      revenue,
      actsCounts,
      actsSummary,
      consultations
    };
    
    renderSummaryStats();
    renderActsTable();
    renderKineSummary();
    renderConsultationsTable();
    
  } catch (error) {
    console.error('Error calculating local summary:', error);
  }
}

/**
 * Update date display
 */
function updateSummaryDateDisplay() {
  const dateSpan = document.getElementById('summary-date');
  if (dateSpan) {
    const date = new Date(summaryDate);
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateSpan.textContent = date.toLocaleDateString('fr-FR', options);
  }
}

/**
 * Render summary statistics
 */
function renderSummaryStats() {
  const visitsStat = document.getElementById('summary-visits');
  const echoStat = document.getElementById('summary-echo');
  const kineStat = document.getElementById('summary-kine');
  const reductionStat = document.getElementById('summary-reduction');
  const revenueStat = document.getElementById('summary-revenue');
  
  if (visitsStat) visitsStat.textContent = summaryData.visits || 0;
  if (echoStat) echoStat.textContent = summaryData.echoes || 0;
  if (kineStat) kineStat.textContent = summaryData.kineSessions || 0;
  if (reductionStat) reductionStat.textContent = summaryData.reductions || 0;
  if (revenueStat) revenueStat.textContent = formatCurrency(summaryData.revenue || 0);
}

/**
 * Render acts table
 */
function renderActsTable() {
  const tbody = document.getElementById('summary-acts-tbody');
  if (!tbody) return;
  
  const actsSummary = summaryData.actsSummary || {};
  const allowedActs = typeof getAllowedConsultationActValues === 'function'
    ? new Set(getAllowedConsultationActValues())
    : null;
  const actIcons = {
    consultation: '🩺',
    ecg: '🫀',
    ecgstress: '🏃',
    echo: '🔬',
    holtermapa: '📟',
    kine: '🏃',
    reduction: '🩹',
    infiltration: '💉',
    electrotherapie: '⚡',
    massage: '✋',
    tecartherapie: '🔥',
    ondesdechoc: '🌊',
    mesotherapie: '💉',
    lasertherapie: '🔴',
    dryneedling: '🪡',
    osteopathie: '🦴',
    other: '📝'
  };
  const getActDisplayLabel = (rawValue) => {
    const normalized = typeof window.resolveConsultationActValue === 'function'
      ? window.resolveConsultationActValue(rawValue)
      : String(rawValue || '').trim();
    const icon = actIcons[normalized] || '📝';
    const label = typeof window.getConsultationActLabel === 'function'
      ? window.getConsultationActLabel(normalized)
      : (normalized || 'Autre acte');
    return `${icon} ${label}`;
  };

  const summaryEntries = Object.entries(actsSummary).filter(([, info]) => {
    const actTypeValue = typeof window.resolveConsultationActValue === 'function'
      ? window.resolveConsultationActValue(info?.actType || '')
      : String(info?.actType || '').trim();
    const descriptionValue = typeof window.resolveConsultationActValue === 'function'
      ? window.resolveConsultationActValue(info?.description || '')
      : String(info?.description || '').trim();

    if (allowedActs && !allowedActs.has(actTypeValue) && !allowedActs.has(descriptionValue)) {
      if (descriptionValue) {
        return false;
      }
    }
    const quantity = Number(info?.quantity) || 0;
    const total = Number(info?.total) || 0;
    return quantity > 0 || total > 0;
  }).filter(([actType]) => {
    if (!allowedActs) return true;
    const normalized = typeof window.resolveConsultationActValue === 'function'
      ? window.resolveConsultationActValue(actType)
      : String(actType || '').trim();
    return allowedActs.has(normalized);
  });

  if (summaryEntries.length > 0) {
    tbody.innerHTML = summaryEntries.map(([actType, info]) => {
      const quantity = Number(info?.quantity) || 0;
      const total = Number(info?.total) || 0;
      const label = getActDisplayLabel(actType);
      return `
        <tr>
          <td>${label}</td>
          <td><span class="badge" style="background: #dbeafe; color: #1e40af;">${quantity}</span></td>
          <td><strong style="color: #10b981;">${formatCurrency(total)}</strong></td>
        </tr>
      `;
    }).join('');

    const totalAmount = summaryEntries.reduce((sum, [, info]) => sum + (Number(info?.total) || 0), 0);

    tbody.innerHTML += `
      <tr style="background: #f8fafc; font-weight: bold;">
        <td>TOTAL</td>
        <td>-</td>
        <td style="color: #10b981;">${formatCurrency(totalAmount)}</td>
      </tr>
    `;
    return;
  }

  const acts = summaryData.actsCounts || {};
  const fallbackPrices = {
    consultation: 2000,
    ecg: 0,
    ecgstress: 0,
    echo: 3000,
    holtermapa: 0,
    kine: 1500,
    infiltration: 2500,
    electrotherapie: 1000,
    massage: 1500
  };

  const entries = Object.entries(acts).filter(([actType]) => {
    if (!allowedActs) return true;
    const normalized = typeof window.resolveConsultationActValue === 'function'
      ? window.resolveConsultationActValue(actType)
      : String(actType || '').trim();
    return allowedActs.has(normalized);
  });
  
  if (entries.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="3" class="text-center">Aucune donnée pour cette date</td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = entries.map(([actType, count]) => {
    const normalized = typeof window.resolveConsultationActValue === 'function'
      ? window.resolveConsultationActValue(actType)
      : String(actType || '').trim();
    const price = fallbackPrices[normalized] || 0;
    const total = count * price;
    return `
      <tr>
        <td>${getActDisplayLabel(normalized || actType)}</td>
        <td><span class="badge" style="background: #dbeafe; color: #1e40af;">${count}</span></td>
        <td><strong style="color: #10b981;">${price > 0 ? formatCurrency(total) : '-'}</strong></td>
      </tr>
    `;
  }).join('');
  
  // Add total row
  const totalAmount = entries.reduce((sum, [actType, count]) => {
    const normalized = typeof window.resolveConsultationActValue === 'function'
      ? window.resolveConsultationActValue(actType)
      : String(actType || '').trim();
    return sum + (count * (fallbackPrices[normalized] || 0));
  }, 0);
  
  tbody.innerHTML += `
    <tr style="background: #f8fafc; font-weight: bold;">
      <td>TOTAL</td>
      <td>-</td>
      <td style="color: #10b981;">${totalAmount > 0 ? formatCurrency(totalAmount) : '-'}</td>
    </tr>
  `;
}

/**
 * Render kiné summary
 */
async function renderKineSummary() {
  const tbody = document.getElementById('summary-kine-tbody');
  if (!tbody) return;
  
  try {
    // First try using kineSummary from main API call if available
    if (summaryData.kineSummary && Object.keys(summaryData.kineSummary).length > 0) {
      const kines = Object.values(summaryData.kineSummary);
      tbody.innerHTML = kines.map(k => `
        <tr>
          <td><strong>${k.name}</strong></td>
          <td><span class="badge" style="background: #dbeafe; color: #1e40af;">${k.sessions}</span></td>
          <td><strong style="color: #10b981;">${formatCurrency(k.revenue)}</strong></td>
        </tr>
      `).join('');
      return;
    }
    
    // Fallback to separate API call
    const kineSummary = await window.api.kineStaff.getDailySummary(summaryDate);
    
    if (!kineSummary || kineSummary.length === 0) {
      tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="3" class="text-center">Aucune séance kiné pour cette date</td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = kineSummary.map(k => `
      <tr>
        <td><strong>${k.kineName}</strong></td>
        <td><span class="badge" style="background: #dbeafe; color: #1e40af;">${k.sessions}</span></td>
        <td><strong style="color: #10b981;">${formatCurrency(k.revenue)}</strong></td>
      </tr>
    `).join('');
    
  } catch (error) {
    console.error('Error loading kiné summary:', error);
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="3" class="text-center">Erreur de chargement</td>
      </tr>
    `;
  }
}

/**
 * Print daily summary
 */
function printDailySummary() {
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Résumé du ${formatDatePrint(summaryDate)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { text-align: center; color: #1e40af; }
        .date { text-align: center; color: #666; margin-bottom: 30px; }
        .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; margin-bottom: 30px; }
        .stat-card { text-align: center; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
        .stat-value { font-size: 32px; font-weight: bold; color: #1e40af; }
        .stat-label { color: #666; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8fafc; }
        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 50px; }
      </style>
    </head>
    <body>
      <h1>📋 Résumé Journalier</h1>
      <p class="date">${formatDatePrint(summaryDate)}</p>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${summaryData.visits || 0}</div>
          <div class="stat-label">Visites</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${summaryData.echoes || 0}</div>
          <div class="stat-label">Échographies</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${summaryData.kineSessions || 0}</div>
          <div class="stat-label">Séances Kiné</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${summaryData.reductions || 0}</div>
          <div class="stat-label">Réductions</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #10b981;">${formatCurrency(summaryData.revenue || 0)}</div>
          <div class="stat-label">Revenus</div>
        </div>
      </div>
      
      <p class="footer">Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</p>
    </body>
    </html>
  `;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.print();
}

/**
 * Format currency helper
 */
function formatCurrency(amount) {
  // Handle null, undefined, empty string, and NaN
  const numericAmount = parseFloat(amount);
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
  
  return new Intl.NumberFormat('fr-DZ', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(safeAmount) + ' DZD';
}

/**
 * Render consultations table for the day
 */
function renderConsultationsTable() {
  const tbody = document.getElementById('summary-consultations-tbody');
  if (!tbody) return;
  
  const consultations = summaryData.consultations || [];
  
  if (!consultations.length) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5" class="text-center">Aucune consultation pour cette date</td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = consultations.map(c => {
    // Try createdAt first (has time), then consultationDate
    const dateTime = c.createdAt ? new Date(c.createdAt) : (c.consultationDate ? new Date(c.consultationDate) : null);
    const timeStr = dateTime && !isNaN(dateTime.getTime()) && dateTime.getHours() !== 0 
      ? dateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) 
      : '-';
    const patientName = `${c.lastName || ''} ${c.firstName || ''}`.trim() || 'Patient inconnu';
    const type = c.type || '-';
    const reason = c.reason || '-';
    const diagnosis = c.diagnosis || '-';
    
    // Truncate long text
    const reasonShort = reason.length > 30 ? reason.substring(0, 30) + '...' : reason;
    const diagnosisShort = diagnosis.length > 30 ? diagnosis.substring(0, 30) + '...' : diagnosis;
    
    return `
      <tr>
        <td><strong>${timeStr}</strong></td>
        <td>${escapeHTMLSummary(patientName)}</td>
        <td><span class="badge" style="background: #dbeafe; color: #1e40af;">${escapeHTMLSummary(type)}</span></td>
        <td title="${escapeHTMLSummary(reason)}">${escapeHTMLSummary(reasonShort)}</td>
        <td title="${escapeHTMLSummary(diagnosis)}">${escapeHTMLSummary(diagnosisShort)}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Escape HTML for safety
 */
function escapeHTMLSummary(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Format date for print (dd/mm/yyyy)
 */
function formatDatePrint(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Make functions global
window.loadDailySummary = loadDailySummary;
window.printDailySummary = printDailySummary;
