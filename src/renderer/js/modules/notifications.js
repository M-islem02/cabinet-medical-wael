// ========== NOTIFICATIONS ==========
let realtimeSocket = null;
let realtimeReconnectTimer = null;

function showNotification(message, type = 'info') {
  // Créer la notification
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;

  // Ajouter au DOM
  document.body.appendChild(notification);

  // Animation
  setTimeout(() => notification.classList.add('show'), 10);

  // Supprimer après 3 secondes
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function handleRealtimeEvent(payload = {}) {
  if (!payload?.type) return;

  if (payload.type === 'patient:new' || payload.type === 'patient:created' || payload.type === 'patient:updated') {
    showNotification(payload.message || payload.title || 'Nouveau patient enregistré', 'info');
    if (typeof loadPatients === 'function') loadPatients();
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
    if (typeof refreshPatientRecordsCache === 'function') refreshPatientRecordsCache();
    return;
  }

  if (payload.type === 'appointment:new' || payload.type === 'appointment:created' || payload.type === 'appointment:updated') {
    showNotification(payload.message || payload.title || 'Nouveau rendez-vous enregistré', 'info');
    if (typeof loadAppointments === 'function') loadAppointments();
    if (typeof loadCalendarEvents === 'function') loadCalendarEvents();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof loadTodayAppointments === 'function') loadTodayAppointments();
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
    return;
  }

  if (payload.type === 'waiting-room:new' || payload.type === 'waiting-room:update' || payload.type === 'waiting-room:call') {
    if (payload.type === 'waiting-room:new') {
      showNotification(payload.title || 'Nouveau patient en salle d’attente', 'info');
    }
    if (typeof loadWaitingRoom === 'function') loadWaitingRoom();
    if (typeof updateWaitingRoomBadge === 'function') updateWaitingRoomBadge();
    if (typeof loadWaitingRoomStats === 'function') loadWaitingRoomStats();
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
    return;
  }

  if (payload.type === 'attachment:new' || payload.type === 'patient:photo') {
    showNotification(payload.title || 'Nouvelle photo reçue depuis le mobile', 'info');
    if (typeof currentPatientId !== 'undefined' && String(currentPatientId) === String(payload.patientId)) {
      if (typeof loadPatientAttachments === 'function') loadPatientAttachments(payload.patientId);
      if (typeof loadPatientConsultations === 'function') loadPatientConsultations(payload.patientId);
    }
    return;
  }

  if (payload.type === 'consultation:note') {
    showNotification(payload.title || 'Nouvelle note reçue depuis le mobile', 'info');
    if (typeof currentPatientId !== 'undefined' && String(currentPatientId) === String(payload.patientId)) {
      if (typeof loadPatientConsultations === 'function') loadPatientConsultations(payload.patientId);
    }
    return;
  }

  if (payload.type === 'payment-request:new') {
    showNotification(payload.message || 'Nouvelle demande de paiement', 'info');
    void (async () => {
      if (typeof loadPendingPaymentRequests === 'function') await loadPendingPaymentRequests();
      const paymentsSection = document.getElementById('payments');
      if (paymentsSection?.classList.contains('active')) {
        if (typeof loadPayments === 'function') await loadPayments(null, { forcePending: true });
        if (typeof loadPaymentStats === 'function') await loadPaymentStats();
      }
    })();
    return;
  }

  if (payload.type === 'payment-request:updated') {
    // Refresh in order: first invalidate pending requests, then render the paid
    // transaction. This prevents a stale pending row appearing beside it.
    void (async () => {
      if (typeof loadPendingPaymentRequests === 'function') await loadPendingPaymentRequests();
      const paymentsSection = document.getElementById('payments');
      if (paymentsSection?.classList.contains('active')) {
        if (typeof loadPayments === 'function') await loadPayments(null, { forcePending: true });
        if (typeof loadPaymentStats === 'function') await loadPaymentStats();
      }
    })();
    return;
  }

  if (payload.type === 'notification:new') {
    const text = payload.message || payload.title || 'Nouvelle notification';
    showNotification(text, 'info');
  }
}

async function initRealtimeNotifications() {
  if (!window.api?.realtime?.getConfig || !window.WebSocket) return;
  if (realtimeSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(realtimeSocket.readyState)) return;

  const userId = currentUserId || localStorage.getItem('currentUserId') || '';
  const role = currentUserRole || localStorage.getItem('currentUserRole') || '';
  if (!userId || !role) return;

  try {
    const config = await window.api.realtime.getConfig();
    if (!config?.enabled || !config.port || !config.token) {
      clearTimeout(realtimeReconnectTimer);
      realtimeReconnectTimer = setTimeout(initRealtimeNotifications, 1000);
      return;
    }

    const url = `ws://${config.host || '127.0.0.1'}:${config.port}/?token=${encodeURIComponent(config.token)}&userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`;
    realtimeSocket = new WebSocket(url);

    realtimeSocket.addEventListener('message', (event) => {
      try {
        handleRealtimeEvent(JSON.parse(event.data || '{}'));
      } catch (error) {
        console.error('Realtime message parse error:', error);
      }
    });

    realtimeSocket.addEventListener('close', () => {
      realtimeSocket = null;
      clearTimeout(realtimeReconnectTimer);
      realtimeReconnectTimer = setTimeout(initRealtimeNotifications, 3000);
    });

    realtimeSocket.addEventListener('error', () => {
      try {
        realtimeSocket.close();
      } catch (_) {
        // ignore close errors
      }
    });
  } catch (error) {
    console.error('Realtime notifications unavailable:', error);
  }
}

window.initRealtimeNotifications = initRealtimeNotifications;

// ========== CSS pour les notifications ==========
const notificationStyles = `
.notification {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 15px 20px;
  border-radius: 6px;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  opacity: 0;
  transform: translateY(-20px);
  transition: all 0.3s ease;
  z-index: 10000;
  max-width: 400px;
}

.notification.show {
  opacity: 1;
  transform: translateY(0);
}

.notification-info {
  background: #E3F2FD;
  color: #1976D2;
  border-left: 4px solid #2196F3;
}

.notification-success {
  background: #E8F5E9;
  color: #388E3C;
  border-left: 4px solid #4CAF50;
}

.notification-error {
  background: #FFEBEE;
  color: #C62828;
  border-left: 4px solid #F44336;
}

.notification-warning {
  background: #FFF3E0;
  color: #E65100;
  border-left: 4px solid #FF9800;
}

@media (max-width: 480px) {
  .notification {
    right: 10px;
    left: 10px;
    max-width: none;
  }
}
`;

// Injecter les styles
const styleSheet = document.createElement('style');
styleSheet.textContent = notificationStyles;
document.head.appendChild(styleSheet);
