/**
 * Mobile Web Application for Cabinet Médical (MedCareSO Mobile)
 * Responsive Ant Design Mobile SPA for Smartphone / Tablet
 */

export function renderMobileCabinetHtml(shareData = {}) {
  const token = shareData.token || '';
  const cabinetName = shareData.cabinetName || 'Cabinet Médical';
  const doctorName = shareData.doctorName || 'Médecin';

  return `<!DOCTYPE html>
<html lang="fr" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1677ff">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <title>${cabinetName} • Mobile</title>
  <style>
    :root {
      --primary: #1677ff;
      --primary-hover: #4096ff;
      --primary-light: #e6f4ff;
      --success: #52c41a;
      --warning: #faad14;
      --danger: #ff4d4f;
      --bg: #f5f7fa;
      --card-bg: #ffffff;
      --text: #1f2937;
      --text-muted: #6b7280;
      --border: #e5e7eb;
      --radius: 12px;
      --bottom-nav-height: 60px;
      --header-height: 56px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    [dir="rtl"] {
      text-align: right;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }

    body {
      background: var(--bg);
      color: var(--text);
      font-size: 14px;
      padding-top: var(--header-height);
      padding-bottom: calc(var(--bottom-nav-height) + 16px);
      min-height: 100vh;
    }

    /* Top Bar */
    .mobile-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: var(--header-height);
      background: #ffffff;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      z-index: 100;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }

    .header-title {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .live-indicator {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 0 2px rgba(82, 196, 26, 0.2);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-lang {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
      cursor: pointer;
    }

    /* Bottom Navigation Bar */
    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: var(--bottom-nav-height);
      background: #ffffff;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-around;
      align-items: center;
      z-index: 100;
      padding-bottom: env(safe-area-inset-bottom);
      box-shadow: 0 -2px 8px rgba(0,0,0,0.03);
    }

    .nav-tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s;
    }

    .nav-tab.active {
      color: var(--primary);
      font-weight: 600;
    }

    .nav-tab .tab-icon {
      font-size: 20px;
      margin-bottom: 2px;
    }

    .nav-tab .tab-label {
      font-size: 11px;
    }

    /* Main Container */
    .container {
      padding: 12px 14px;
      max-width: 600px;
      margin: 0 auto;
    }

    .section-view {
      display: none;
    }

    .section-view.active {
      display: block;
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Cards */
    .card {
      background: var(--card-bg);
      border-radius: var(--radius);
      border: 1px solid var(--border);
      padding: 14px;
      margin-bottom: 12px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .card-title {
      font-size: 15px;
      font-weight: 600;
      color: #111827;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 9px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      border: none;
      cursor: pointer;
      transition: background 0.15s, transform 0.05s;
      width: 100%;
    }

    .btn:active {
      transform: scale(0.98);
    }

    .btn-primary {
      background: var(--primary);
      color: #ffffff;
    }

    .btn-primary:active {
      background: var(--primary-hover);
    }

    .btn-success {
      background: var(--success);
      color: #ffffff;
    }

    .btn-secondary {
      background: #ffffff;
      color: var(--text);
      border: 1px solid var(--border);
    }

    .btn-danger {
      background: #fff1f0;
      color: var(--danger);
      border: 1px solid #ffa39e;
    }

    .btn-small {
      padding: 5px 10px;
      font-size: 12px;
      border-radius: 6px;
      width: auto;
    }

    /* Inputs */
    .form-group {
      margin-bottom: 12px;
    }

    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      margin-bottom: 4px;
    }

    .form-control {
      width: 100%;
      height: 40px;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 14px;
      background: #ffffff;
      color: var(--text);
      outline: none;
      transition: border 0.15s;
    }

    .form-control:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.15);
    }

    textarea.form-control {
      height: auto;
      min-height: 80px;
      resize: vertical;
    }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }

    .badge-primary { background: var(--primary-light); color: var(--primary); }
    .badge-success { background: #f6ffed; color: var(--success); border: 1px solid #b7eb8f; }
    .badge-warning { background: #fffbe6; color: var(--warning); border: 1px solid #ffe58f; }
    .badge-danger { background: #fff1f0; color: var(--danger); border: 1px solid #ffa39e; }

    /* List Items */
    .item-card {
      background: #ffffff;
      border-radius: 10px;
      border: 1px solid var(--border);
      padding: 12px;
      margin-bottom: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .item-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .item-name {
      font-size: 14.5px;
      font-weight: 600;
      color: #111827;
    }

    .item-sub {
      font-size: 12.5px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .item-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }

    /* Big Prominent Action Banner */
    .hero-action-box {
      background: linear-gradient(135deg, #1677ff 0%, #0958d9 100%);
      color: #ffffff;
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 14px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(22, 119, 255, 0.25);
    }

    .hero-action-box h3 {
      font-size: 17px;
      margin-bottom: 4px;
    }

    .hero-action-box p {
      font-size: 13px;
      opacity: 0.9;
      margin-bottom: 12px;
    }

    .btn-hero {
      background: #ffffff;
      color: var(--primary);
      font-size: 15px;
      font-weight: 700;
      padding: 12px 20px;
      border-radius: 8px;
      border: none;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    /* Camera Upload Preview */
    .photo-preview-box {
      width: 100%;
      height: 220px;
      border: 2px dashed var(--border);
      border-radius: 12px;
      background: #f9fafb;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      overflow: hidden;
      margin-bottom: 12px;
      position: relative;
    }

    .photo-preview-box img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .photo-preview-box .upload-prompt {
      text-align: center;
      color: var(--text-muted);
    }

    .photo-preview-box .upload-prompt span {
      font-size: 36px;
      display: block;
      margin-bottom: 4px;
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.45);
      display: none;
      align-items: flex-end;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(2px);
    }

    .modal-backdrop.active {
      display: flex;
    }

    .modal-sheet {
      background: #ffffff;
      width: 100%;
      max-width: 500px;
      border-radius: 20px 20px 0 0;
      padding: 20px;
      max-height: 85vh;
      overflow-y: auto;
      animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 10px;
    }

    .modal-title {
      font-size: 16px;
      font-weight: 700;
    }

    .btn-close {
      background: none;
      border: none;
      font-size: 20px;
      color: var(--text-muted);
      cursor: pointer;
    }

    /* Voice Recording Button */
    .mic-btn {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--primary);
      color: #ffffff;
      border: none;
      font-size: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 10px auto;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(22, 119, 255, 0.3);
      transition: all 0.2s;
    }

    .mic-btn.recording {
      background: var(--danger);
      animation: pulse 1.2s infinite;
    }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(255, 77, 79, 0.5); }
      70% { box-shadow: 0 0 0 16px rgba(255, 77, 79, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 77, 79, 0); }
    }

    .toast {
      position: fixed;
      top: 66px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(17, 24, 39, 0.9);
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      z-index: 2000;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
  </style>
</head>
<body>

  <!-- Top Bar -->
  <header class="mobile-header">
    <div class="header-title">
      <span class="live-indicator" title="Connecté au PC"></span>
      <span id="app-cabinet-name">${cabinetName}</span>
    </div>
    <div class="header-actions">
      <button class="btn-lang" onclick="toggleLanguage()">🌐 <span id="lang-btn-text">AR</span></button>
    </div>
  </header>

  <div id="toast" class="toast"></div>

  <!-- Main Container -->
  <main class="container">

    <!-- ================= TAB 1: AGENDA (PLANNING) ================= -->
    <section id="tab-agenda" class="section-view active">
      <div class="card" style="padding: 10px 12px; margin-bottom: 10px;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="btn btn-secondary btn-small" onclick="changeDate(-1)">◀</button>
          <input type="date" id="agenda-date" class="form-control" style="text-align: center; font-weight: 600;" onchange="loadAgenda()">
          <button class="btn btn-secondary btn-small" onclick="changeDate(1)">▶</button>
          <button class="btn btn-primary btn-small" onclick="openNewAppointmentModal()">+ RDV</button>
        </div>
      </div>

      <div id="agenda-list-container">
        <div style="text-align: center; padding: 30px; color: var(--text-muted);">
          ⏳ Chargement du planning...
        </div>
      </div>
    </section>

    <!-- ================= TAB 2: SALLE D'ATTENTE (WAITING ROOM) ================= -->
    <section id="tab-waiting" class="section-view">
      <div class="hero-action-box">
        <h3 id="txt-queue-title">Salle d'attente en direct</h3>
        <p id="queue-status-sub">0 patient(s) en attente</p>
        <button class="btn-hero" onclick="callNextPatient()">
          🔔 Appeler le Prochain Patient
        </button>
      </div>

      <div class="card-header" style="margin-top: 10px;">
        <span class="card-title">👥 File d'attente</span>
        <button class="btn btn-secondary btn-small" onclick="openCheckinModal()">+ Entrée Patient</button>
      </div>

      <div id="waiting-list-container">
        <div style="text-align: center; padding: 20px; color: var(--text-muted);">
          Aucun patient en attente
        </div>
      </div>
    </section>

    <!-- ================= TAB 3: PATIENTS ================= -->
    <section id="tab-patients" class="section-view">
      <div class="card" style="padding: 10px 12px; margin-bottom: 10px;">
        <div style="display: flex; gap: 8px;">
          <input type="search" id="patients-search" class="form-control" placeholder="🔍 Rechercher (nom, tél, cin)..." oninput="searchPatients(this.value)">
          <button class="btn btn-primary btn-small" onclick="openNewPatientModal()">+ Patient</button>
        </div>
      </div>

      <div id="patients-list-container">
        <div style="text-align: center; padding: 30px; color: var(--text-muted);">
          Tapez un nom pour rechercher un patient.
        </div>
      </div>
    </section>

    <!-- ================= TAB 4: CAMÉRA / PHOTOS CLINIQUES ================= -->
    <section id="tab-camera" class="section-view">
      <div class="card">
        <div class="card-header">
          <span class="card-title">📷 Photo / Scanner Clinique</span>
          <span class="badge badge-primary">Direct PC</span>
        </div>
        <p style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 12px;">
          Prenez une photo avec votre smartphone (radio, lésion, tympan, ordonnance) : elle sera rattachée instantanément au dossier du patient sur le PC.
        </p>

        <div class="form-group">
          <label class="form-label">1. Patient concerné</label>
          <select id="camera-patient-select" class="form-control">
            <option value="">-- Choisir le patient --</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">2. Catégorie d'image</label>
          <select id="camera-category-select" class="form-control">
            <option value="radio">🩻 Radiographie / Scanner</option>
            <option value="lesion">🔬 Lésion / Examen Visuel</option>
            <option value="ordonnance">📄 Document / Ordonnance</option>
            <option value="autre">📁 Autre Pièce Jointe</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">3. Prendre la photo</label>
          <div class="photo-preview-box" onclick="document.getElementById('camera-input').click()">
            <input type="file" id="camera-input" accept="image/*" capture="environment" style="display: none;" onchange="handlePhotoCapture(event)">
            <div id="photo-prompt" class="upload-prompt">
              <span>📸</span>
              <p>Appuyez pour prendre la photo</p>
            </div>
            <img id="photo-preview-img" style="display: none;" alt="Aperçu">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Note / Légende (Optionnel)</label>
          <input type="text" id="camera-notes" class="form-control" placeholder="Ex: Otoscopie OD, Radio thorax face...">
        </div>

        <button id="btn-upload-photo" class="btn btn-primary" onclick="uploadCapturedPhoto()" disabled>
          📤 Envoyer instantanément au PC
        </button>
      </div>
    </section>

    <!-- ================= TAB 5: NOTES & DICTÉE ================= -->
    <section id="tab-notes" class="section-view">
      <div class="card">
        <div class="card-header">
          <span class="card-title">🎙️ Dictée & Note Rapide</span>
          <span class="badge badge-success">Live Sync</span>
        </div>

        <div class="form-group">
          <label class="form-label">Patient</label>
          <select id="notes-patient-select" class="form-control">
            <option value="">-- Sélectionner un patient --</option>
          </select>
        </div>

        <div class="form-group" style="text-align: center;">
          <button id="mic-btn" class="mic-btn" onclick="toggleVoiceDictation()" title="Dicter vocalement">
            🎙️
          </button>
          <p id="mic-status-label" style="font-size: 12px; color: var(--text-muted);">
            Appuyez pour démarrer la dictée vocale
          </p>
        </div>

        <div class="form-group">
          <label class="form-label">Contenu de la note</label>
          <textarea id="notes-text" class="form-control" rows="4" placeholder="Tapez ou dictez vos observations cliniques ici..."></textarea>
        </div>

        <button class="btn btn-primary" onclick="sendQuickNote()">
          💾 Enregistrer dans le dossier PC
        </button>
      </div>
    </section>

  </main>

  <!-- Bottom Nav Tabs -->
  <nav class="bottom-nav">
    <button class="nav-tab active" data-target="tab-agenda" onclick="switchTab('tab-agenda')">
      <span class="tab-icon">📅</span>
      <span class="tab-label">Planning</span>
    </button>
    <button class="nav-tab" data-target="tab-waiting" onclick="switchTab('tab-waiting')">
      <span class="tab-icon">🪑</span>
      <span class="tab-label">Attente</span>
    </button>
    <button class="nav-tab" data-target="tab-patients" onclick="switchTab('tab-patients')">
      <span class="tab-icon">👥</span>
      <span class="tab-label">Patients</span>
    </button>
    <button class="nav-tab" data-target="tab-camera" onclick="switchTab('tab-camera')">
      <span class="tab-icon">📷</span>
      <span class="tab-label">Photo</span>
    </button>
    <button class="nav-tab" data-target="tab-notes" onclick="switchTab('tab-notes')">
      <span class="tab-icon">🎙️</span>
      <span class="tab-label">Dictée</span>
    </button>
  </nav>

  <!-- ================= MODAL NOUVEAU RDV ================= -->
  <div id="modal-appointment" class="modal-backdrop" onclick="if(event.target===this)closeModal('modal-appointment')">
    <div class="modal-sheet">
      <div class="modal-header">
        <span class="modal-title">📅 Nouveau Rendez-vous</span>
        <button class="btn-close" onclick="closeModal('modal-appointment')">✕</button>
      </div>
      <form onsubmit="saveNewAppointment(event)">
        <div class="form-group">
          <label class="form-label">Nom complet du patient</label>
          <input type="text" id="modal-rdv-name" class="form-control" required placeholder="Ex: Ben Ali Mohamed">
        </div>
        <div class="form-group">
          <label class="form-label">Téléphone</label>
          <input type="tel" id="modal-rdv-phone" class="form-control" required placeholder="Ex: 98123456">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" id="modal-rdv-date" class="form-control" required>
          </div>
          <div class="form-group">
            <label class="form-label">Heure</label>
            <input type="time" id="modal-rdv-time" class="form-control" value="09:00" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Type / Motif</label>
          <select id="modal-rdv-type" class="form-control">
            <option value="Consultation">Consultation</option>
            <option value="Contrôle">Contrôle</option>
            <option value="Urgence">Urgence</option>
            <option value="Bilan">Bilan</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top: 8px;">Enregistrer le RDV</button>
      </form>
    </div>
  </div>

  <!-- ================= MODAL ENTRÉE PATIENT ================= -->
  <div id="modal-checkin" class="modal-backdrop" onclick="if(event.target===this)closeModal('modal-checkin')">
    <div class="modal-sheet">
      <div class="modal-header">
        <span class="modal-title">🪑 Entrée Salle d'Attente</span>
        <button class="btn-close" onclick="closeModal('modal-checkin')">✕</button>
      </div>
      <form onsubmit="submitCheckin(event)">
        <div class="form-group">
          <label class="form-label">Nom du patient</label>
          <input type="text" id="modal-checkin-name" class="form-control" required placeholder="Nom & Prénom">
        </div>
        <div class="form-group">
          <label class="form-label">Téléphone</label>
          <input type="tel" id="modal-checkin-phone" class="form-control" required placeholder="Numéro de téléphone">
        </div>
        <div class="form-group">
          <label class="form-label">Motif de venue</label>
          <input type="text" id="modal-checkin-reason" class="form-control" placeholder="Ex: Consultation, contrôle, urgence...">
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top: 8px;">Valider l'Arrivée</button>
      </form>
    </div>
  </div>

  <!-- ================= MODAL NOUVEAU PATIENT ================= -->
  <div id="modal-patient" class="modal-backdrop" onclick="if(event.target===this)closeModal('modal-patient')">
    <div class="modal-sheet">
      <div class="modal-header">
        <span class="modal-title">👥 Nouveau Patient</span>
        <button class="btn-close" onclick="closeModal('modal-patient')">✕</button>
      </div>
      <form onsubmit="saveNewPatient(event)">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div class="form-group">
            <label class="form-label">Nom</label>
            <input type="text" id="modal-pat-lastname" class="form-control" required placeholder="Nom">
          </div>
          <div class="form-group">
            <label class="form-label">Prénom</label>
            <input type="text" id="modal-pat-firstname" class="form-control" required placeholder="Prénom">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Téléphone</label>
          <input type="tel" id="modal-pat-phone" class="form-control" placeholder="Numéro de téléphone">
        </div>
        <div class="form-group">
          <label class="form-label">Date de Naissance</label>
          <input type="date" id="modal-pat-birth" class="form-control">
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top: 8px;">Créer la Fiche</button>
      </form>
    </div>
  </div>

  <script>
    const TOKEN = '${token}';
    let currentLang = 'fr';
    let capturedBase64Image = null;
    let recognition = null;
    let isRecording = false;

    // Toast helper
    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 2600);
    }

    // Tab switcher
    function switchTab(targetId) {
      document.querySelectorAll('.section-view').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

      const sec = document.getElementById(targetId);
      const btn = document.querySelector(\`[data-target="\${targetId}"]\`);
      if (sec) sec.classList.add('active');
      if (btn) btn.classList.add('active');

      if (targetId === 'tab-agenda') loadAgenda();
      if (targetId === 'tab-waiting') loadWaitingRoom();
      if (targetId === 'tab-camera' || targetId === 'tab-notes') loadPatientDropdowns();
    }

    // Language switcher
    function toggleLanguage() {
      currentLang = currentLang === 'fr' ? 'ar' : 'fr';
      document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
      document.getElementById('lang-btn-text').textContent = currentLang === 'fr' ? 'AR' : 'FR';
      showToast(currentLang === 'ar' ? 'تم تحويل الواجهة للعربية' : 'Interface en Français');
    }

    // Modal Helpers
    function openModal(id) { document.getElementById(id).classList.add('active'); }
    function closeModal(id) { document.getElementById(id).classList.remove('active'); }
    function openNewAppointmentModal() {
      document.getElementById('modal-rdv-date').value = document.getElementById('agenda-date').value;
      openModal('modal-appointment');
    }
    function openCheckinModal() { openModal('modal-checkin'); }
    function openNewPatientModal() { openModal('modal-patient'); }

    // Date manipulation
    function changeDate(days) {
      const input = document.getElementById('agenda-date');
      const d = new Date(input.value || new Date());
      d.setDate(d.getDate() + days);
      input.value = d.toISOString().split('T')[0];
      loadAgenda();
    }

    // ================= 1. AGENDA API =================
    async function loadAgenda() {
      const date = document.getElementById('agenda-date').value;
      const container = document.getElementById('agenda-list-container');
      try {
        const res = await fetch(\`/api/mobile/\${TOKEN}/agenda?date=\${date}\`);
        const json = await res.json();
        
        if (!json.success || !json.data || !json.data.length) {
          container.innerHTML = '<div class="card" style="text-align: center; color: var(--text-muted); padding: 30px;">Aucun rendez-vous pour cette date</div>';
          return;
        }

        container.innerHTML = json.data.map(apt => {
          const time = (apt.appointmentDateTime || '').slice(11, 16) || apt.time || '--:--';
          const name = \`\${apt.firstName || ''} \${apt.lastName || ''}\`.trim() || apt.patientName || 'Patient';
          const phone = apt.phone || '';
          const status = apt.status || 'scheduled';
          const statusMap = {
            scheduled: { label: 'Planifié', class: 'badge-primary' },
            waiting: { label: 'En attente', class: 'badge-warning' },
            completed: { label: 'Terminé', class: 'badge-success' },
            cancelled: { label: 'Annulé', class: 'badge-danger' }
          };
          const badge = statusMap[status] || { label: status, class: 'badge-primary' };

          return \`
            <div class="item-card">
              <div class="item-top">
                <span style="font-size: 15px; font-weight: 700; color: var(--primary);">⏰ \${time}</span>
                <span class="badge \${badge.class}">\${badge.label}</span>
              </div>
              <div class="item-name">👤 \${name}</div>
              <div class="item-sub">
                <span>📋 \${apt.appointmentType || 'Consultation'}</span>
                \${phone ? \`<a href="tel:\${phone}" style="color: var(--primary); text-decoration: none; font-weight: 600;">📞 \${phone}</a>\` : ''}
              </div>
            </div>
          \`;
        }).join('');
      } catch (e) {
        container.innerHTML = '<div class="card" style="color: var(--danger); text-align: center;">Erreur de chargement de l\\'agenda</div>';
      }
    }

    async function saveNewAppointment(e) {
      e.preventDefault();
      const payload = {
        fullName: document.getElementById('modal-rdv-name').value,
        phone: document.getElementById('modal-rdv-phone').value,
        date: document.getElementById('modal-rdv-date').value,
        time: document.getElementById('modal-rdv-time').value,
        type: document.getElementById('modal-rdv-type').value
      };

      const res = await fetch(\`/api/mobile/\${TOKEN}/agenda/book\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast('✅ Rendez-vous enregistré');
        closeModal('modal-appointment');
        loadAgenda();
      } else {
        alert(json.error || 'Erreur lors de la réservation');
      }
    }

    // ================= 2. SALLE D'ATTENTE API =================
    async function loadWaitingRoom() {
      const container = document.getElementById('waiting-list-container');
      const sub = document.getElementById('queue-status-sub');
      try {
        const res = await fetch(\`/api/mobile/\${TOKEN}/waiting-room\`);
        const json = await res.json();
        
        const queue = json.data?.queue || [];
        const inConsult = json.data?.inConsultation;

        if (sub) {
          sub.textContent = inConsult 
            ? \`En consultation : \${inConsult.patientName || inConsult.ticketCode} (+\${queue.length} en attente)\`
            : \`\${queue.length} patient(s) en attente\`;
        }

        if (!queue.length && !inConsult) {
          container.innerHTML = '<div class="card" style="text-align: center; color: var(--text-muted); padding: 25px;">Aucun patient dans la salle d\\'attente</div>';
          return;
        }

        let html = '';
        if (inConsult) {
          html += \`
            <div class="item-card" style="border: 2px solid var(--success); background: #f6ffed;">
              <div class="item-top">
                <span class="badge badge-success">🟢 EN CONSULTATION</span>
                <span style="font-weight: 700;">#\${inConsult.ticketCode || '01'}</span>
              </div>
              <div class="item-name">👤 \${inConsult.patientName || 'Patient'}</div>
              <div class="item-actions">
                <button class="btn btn-secondary btn-small" onclick="updateWaitingStatus('\${inConsult.id}', 'completed')">Terminer Consultation</button>
              </div>
            </div>
          \`;
        }

        html += queue.map((item, idx) => {
          const name = item.patientName || \`Patient #\${item.ticketCode}\`;
          return \`
            <div class="item-card">
              <div class="item-top">
                <span style="font-weight: 700; color: var(--primary);">#\${item.ticketCode || (idx+1)}</span>
                <span class="badge badge-warning">En attente</span>
              </div>
              <div class="item-name">👤 \${name}</div>
              <div class="item-sub">
                <span>🕒 Arrivé à \${(item.arrivalTime || '').slice(11, 16) || '--:--'}</span>
                \${item.phone ? \`<a href="tel:\${item.phone}" style="color: var(--primary); text-decoration: none;">📞 \${item.phone}</a>\` : ''}
              </div>
              <div class="item-actions">
                <button class="btn btn-primary btn-small" onclick="updateWaitingStatus('\${item.id}', 'in-consultation')">▶ Faire entrer</button>
              </div>
            </div>
          \`;
        }).join('');

        container.innerHTML = html;
      } catch (e) {
        container.innerHTML = '<div class="card" style="color: var(--danger); text-align: center;">Erreur file d\\'attente</div>';
      }
    }

    async function callNextPatient() {
      try {
        const res = await fetch(\`/api/mobile/\${TOKEN}/waiting-room/call-next\`, { method: 'POST' });
        const json = await res.json();
        if (json.success) {
          showToast(\`🔔 Appel patient : \${json.data?.patientName || 'Patient suivant'}\`);
          loadWaitingRoom();
        } else {
          showToast(json.error || 'Aucun patient en attente');
        }
      } catch (e) {
        showToast('Erreur lors de l\\'appel');
      }
    }

    async function updateWaitingStatus(id, status) {
      await fetch(\`/api/mobile/\${TOKEN}/waiting-room/status\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
      loadWaitingRoom();
    }

    async function submitCheckin(e) {
      e.preventDefault();
      const payload = {
        fullName: document.getElementById('modal-checkin-name').value,
        phone: document.getElementById('modal-checkin-phone').value,
        reason: document.getElementById('modal-checkin-reason').value
      };
      const res = await fetch(\`/api/mobile/\${TOKEN}/waiting-room/checkin\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast('✅ Patient ajouté en salle d\\'attente');
        closeModal('modal-checkin');
        loadWaitingRoom();
      }
    }

    // ================= 3. PATIENTS API =================
    let searchDebounce = null;
    function searchPatients(q) {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(async () => {
        const container = document.getElementById('patients-list-container');
        if (!q || q.length < 2) {
          container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">Tapez au moins 2 lettres pour rechercher</div>';
          return;
        }
        try {
          const res = await fetch(\`/api/mobile/\${TOKEN}/patients?q=\${encodeURIComponent(q)}\`);
          const json = await res.json();
          const list = json.data || [];
          if (!list.length) {
            container.innerHTML = '<div class="card" style="text-align:center; padding:20px; color:var(--text-muted);">Aucun patient trouvé</div>';
            return;
          }
          container.innerHTML = list.map(p => {
            const name = \`\${p.lastName || ''} \${p.firstName || ''}\`.trim();
            return \`
              <div class="item-card">
                <div class="item-name">👤 \${name}</div>
                <div class="item-sub">
                  \${p.phone ? \`<a href="tel:\${p.phone}" style="color:var(--primary); font-weight:600; text-decoration:none;">📞 \${p.phone}</a>\` : 'Sans téléphone'}
                  \${p.birthDate ? \`<span>🎂 \${p.birthDate.slice(0,10)}</span>\` : ''}
                </div>
                <div class="item-actions">
                  <button class="btn btn-secondary btn-small" onclick="selectPatientForCamera('\${p.id}')">📷 Photo</button>
                  <button class="btn btn-secondary btn-small" onclick="selectPatientForNote('\${p.id}')">🎙️ Note</button>
                </div>
              </div>
            \`;
          }).join('');
        } catch (e) {}
      }, 300);
    }

    async function saveNewPatient(e) {
      e.preventDefault();
      const payload = {
        lastName: document.getElementById('modal-pat-lastname').value,
        firstName: document.getElementById('modal-pat-firstname').value,
        phone: document.getElementById('modal-pat-phone').value,
        birthDate: document.getElementById('modal-pat-birth').value
      };
      const res = await fetch(\`/api/mobile/\${TOKEN}/patients/create\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast('✅ Fiche patient créée');
        closeModal('modal-patient');
        loadPatientDropdowns();
      }
    }

    // ================= 4. CAMÉRA & UPLOAD PHOTO =================
    function handlePhotoCapture(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        capturedBase64Image = e.target.result;
        const img = document.getElementById('photo-preview-img');
        img.src = capturedBase64Image;
        img.style.display = 'block';
        document.getElementById('photo-prompt').style.display = 'none';
        document.getElementById('btn-upload-photo').disabled = false;
      };
      reader.readAsDataURL(file);
    }

    async function uploadCapturedPhoto() {
      const patientId = document.getElementById('camera-patient-select').value;
      if (!patientId) {
        alert('Veuillez sélectionner un patient');
        return;
      }
      if (!capturedBase64Image) {
        alert('Veuillez prendre une photo');
        return;
      }

      const btn = document.getElementById('btn-upload-photo');
      btn.disabled = true;
      btn.textContent = '⏳ Envoi vers le PC...';

      try {
        const res = await fetch(\`/api/mobile/\${TOKEN}/upload-photo\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId,
            category: document.getElementById('camera-category-select').value,
            notes: document.getElementById('camera-notes').value,
            base64: capturedBase64Image
          })
        });
        const json = await res.json();
        if (json.success) {
          showToast('✅ Photo enregistrée sur le PC !');
          // Reset photo view
          capturedBase64Image = null;
          document.getElementById('photo-preview-img').style.display = 'none';
          document.getElementById('photo-prompt').style.display = 'block';
          document.getElementById('camera-notes').value = '';
          btn.textContent = '📤 Envoyer instantanément au PC';
        } else {
          alert(json.error || 'Erreur lors de l\\'envoi');
          btn.disabled = false;
          btn.textContent = '📤 Réessayer';
        }
      } catch (e) {
        alert('Erreur de connexion avec le PC');
        btn.disabled = false;
        btn.textContent = '📤 Réessayer';
      }
    }

    function selectPatientForCamera(id) {
      switchTab('tab-camera');
      setTimeout(() => {
        document.getElementById('camera-patient-select').value = id;
      }, 100);
    }

    function selectPatientForNote(id) {
      switchTab('tab-notes');
      setTimeout(() => {
        document.getElementById('notes-patient-select').value = id;
      }, 100);
    }

    async function loadPatientDropdowns() {
      try {
        const res = await fetch(\`/api/mobile/\${TOKEN}/patients?limit=30\`);
        const json = await res.json();
        const list = json.data || [];
        const options = '<option value="">-- Choisir le patient --</option>' + 
          list.map(p => \`<option value="\${p.id}">\${p.lastName || ''} \${p.firstName || ''} (\${p.phone || ''})</option>\`).join('');

        const sel1 = document.getElementById('camera-patient-select');
        const sel2 = document.getElementById('notes-patient-select');
        if (sel1) sel1.innerHTML = options;
        if (sel2) sel2.innerHTML = options;
      } catch (e) {}
    }

    // ================= 5. DICTÉE VOCALE & NOTES =================
    function toggleVoiceDictation() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert('La dictée vocale n\\'est pas supportée par ce navigateur. Vous pouvez taper directement au clavier.');
        return;
      }

      if (isRecording) {
        recognition.stop();
        return;
      }

      recognition = new SpeechRecognition();
      recognition.lang = currentLang === 'ar' ? 'ar-TN' : 'fr-FR';
      recognition.continuous = true;
      recognition.interimResults = true;

      const micBtn = document.getElementById('mic-btn');
      const label = document.getElementById('mic-status-label');
      const textarea = document.getElementById('notes-text');

      recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add('recording');
        label.textContent = '🎙️ Écoute en cours... Parlez maintenant';
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        textarea.value = (textarea.value + ' ' + transcript).trim();
      };

      recognition.onerror = () => {
        isRecording = false;
        micBtn.classList.remove('recording');
        label.textContent = 'Erreur micro. Réessayez.';
      };

      recognition.onend = () => {
        isRecording = false;
        micBtn.classList.remove('recording');
        label.textContent = 'Dictée terminée. Appuyez pour reprendre.';
      };

      recognition.start();
    }

    async function sendQuickNote() {
      const patientId = document.getElementById('notes-patient-select').value;
      const text = document.getElementById('notes-text').value;
      if (!patientId) {
        alert('Veuillez choisir un patient');
        return;
      }
      if (!text.trim()) {
        alert('Veuillez saisir une note');
        return;
      }

      const res = await fetch(\`/api/mobile/\${TOKEN}/quick-note\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, note: text })
      });
      const json = await res.json();
      if (json.success) {
        showToast('✅ Note transmise au PC');
        document.getElementById('notes-text').value = '';
      }
    }

    // Init
    (function init() {
      const today = new Date().toISOString().split('T')[0];
      const agendaDate = document.getElementById('agenda-date');
      if (agendaDate) agendaDate.value = today;
      loadAgenda();
      loadWaitingRoom();
      setInterval(() => {
        if (document.getElementById('tab-waiting').classList.contains('active')) {
          loadWaitingRoom();
        }
      }, 4000);
    }());
  </script>
</body>
</html>`;
}
