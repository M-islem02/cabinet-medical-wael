/**
 * AI Module - Doctor Chatbot and Report Generation
 * Uses Ollama locally for offline AI functionality
 * Available only to doctors (not assistants)
 */

// AI Status
let aiAvailable = false;
let aiModels = [];

/**
 * Check if AI features are enabled and available
 */
async function checkAIStatus() {
  try {
    // Check package config first
    const configResult = await window.api.package.getConfig();
    if (!configResult.success || !configResult.data) {
      return { enabled: false, available: false, reason: 'Configuration non chargée' };
    }
    
    const config = configResult.data;
    const aiReportsEnabled = config.featureAiReports === 1;
    const aiChatbotEnabled = config.featureAiChatbot === 1;
    
    if (!aiReportsEnabled && !aiChatbotEnabled) {
      return { enabled: false, available: false, reason: 'IA non incluse dans votre package' };
    }
    
    // Check if Ollama is running
    const status = await window.api.ai.checkStatus();
    aiAvailable = status.available;
    aiModels = status.models || [];
    
    return {
      enabled: true,
      available: status.available,
      models: aiModels,
      features: {
        reports: aiReportsEnabled,
        chatbot: aiChatbotEnabled
      },
      reason: status.available ? 'Ollama connecté' : 'Ollama non démarré'
    };
  } catch (error) {
    console.error('Error checking AI status:', error);
    return { enabled: false, available: false, reason: 'Erreur de vérification' };
  }
}

/**
 * Initialize AI module
 */
async function initAIModule() {
  // Only for doctors
  if (currentUserRole === 'assistant') {
    console.log('🤖 AI module skipped for assistant role');
    return;
  }
  
  const status = await checkAIStatus();
  console.log('🤖 AI Status:', status);
  
  // Update UI based on AI availability
  updateAIStatusIndicator(status);
  
  if (status.enabled && status.available) {
    showNotification('🤖 Assistant IA disponible', 'success');
  } else if (status.enabled && !status.available) {
    console.log('⚠️ AI enabled but Ollama not running');
  }
}

/**
 * Update AI status indicator in UI
 */
function updateAIStatusIndicator(status) {
  const indicator = document.getElementById('ai-status-indicator');
  if (!indicator) return;
  
  if (status.enabled && status.available) {
    indicator.innerHTML = `<span class="ai-status online">🤖 IA Active</span>`;
  } else if (status.enabled) {
    indicator.innerHTML = `<span class="ai-status offline">🤖 IA Hors-ligne</span>`;
  } else {
    indicator.innerHTML = '';
  }
}

/**
 * Open AI Chatbot modal
 */
async function openAIChatbot() {
  // Check permissions
  if (currentUserRole === 'assistant') {
    showNotification('❌ L\'assistant IA n\'est pas disponible pour les assistants', 'error');
    return;
  }
  
  const status = await checkAIStatus();
  if (!status.available) {
    // Show friendly message - auto-start is happening in background
    showNotification('🔄 Démarrage automatique du service IA en cours... Veuillez patienter quelques instants.', 'info');
    
    // Wait a bit and check again
    await new Promise(resolve => setTimeout(resolve, 4000));
    const newStatus = await checkAIStatus();
    
    if (!newStatus.available) {
      showNotification('⚠️ Le service IA n\'est pas disponible. Assurez-vous que Ollama est installé sur ce PC.', 'warning');
      return;
    } else {
      showNotification('✅ Service IA démarré avec succès!', 'success');
    }
  }
  
  // Load current patient context if available
  let patientContext = null;
  if (currentPatientId && currentPatientData) {
    patientContext = {
      patient: currentPatientData,
      consultations: [] // Would need to load from DB
    };
  }
  
  // Show chatbot modal
  document.getElementById('ai-chatbot-context').innerHTML = patientContext 
    ? `<strong>Contexte:</strong> ${patientContext.patient.firstName} ${patientContext.patient.lastName}`
    : '<em>Aucun patient sélectionné</em>';
  document.getElementById('ai-chat-messages').innerHTML = '';
  document.getElementById('ai-chat-input').value = '';
  
  showModal('modal-ai-chatbot');
  document.getElementById('ai-chat-input').focus();
}

/**
 * Send message to AI chatbot
 */
async function sendAIChatMessage() {
  const input = document.getElementById('ai-chat-input');
  const message = input.value.trim();
  
  if (!message) return;
  
  const messagesContainer = document.getElementById('ai-chat-messages');
  const sendBtn = document.getElementById('btn-ai-chat-send');
  
  // Disable input and button
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;
  
  // Add user message
  messagesContainer.innerHTML += `
    <div class="chat-message user">
      <div class="message-content">${escapeHtml(message)}</div>
    </div>
  `;
  
  input.value = '';
  
  // Add loading indicator
  const loadingId = 'ai-loading-' + Date.now();
  messagesContainer.innerHTML += `
    <div class="chat-message ai loading" id="${loadingId}">
      <div class="message-content">
        <span class="typing-indicator">🤖 En train de réfléchir...</span>
      </div>
    </div>
  `;
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  try {
    // Build context
    const context = {};
    if (typeof currentPatientData !== 'undefined' && currentPatientData) {
      context.patient = currentPatientData;
    }
    
    // Set a timeout for the request
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Délai dépassé - le service IA met trop de temps')), 90000)
    );
    
    const resultPromise = window.api.ai.chat({ message, context });
    const result = await Promise.race([resultPromise, timeoutPromise]);
    
    // Remove loading
    document.getElementById(loadingId)?.remove();
    
    if (result.success) {
      messagesContainer.innerHTML += `
        <div class="chat-message ai">
          <div class="message-content">${formatAIResponse(result.response)}</div>
        </div>
      `;
    } else {
      messagesContainer.innerHTML += `
        <div class="chat-message ai error">
          <div class="message-content">❌ ${result.error || 'Erreur inconnue'}</div>
        </div>
      `;
    }
  } catch (error) {
    document.getElementById(loadingId)?.remove();
    messagesContainer.innerHTML += `
      <div class="chat-message ai error">
        <div class="message-content">❌ Erreur: ${error.message}</div>
      </div>
    `;
  }
  
  // Re-enable input and button
  input.disabled = false;
  if (sendBtn) sendBtn.disabled = false;
  input.focus();
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Open AI Report Generator modal
 */
async function openAIReportGenerator(patientId = null) {
  if (currentUserRole === 'assistant') {
    showNotification('❌ Les rapports IA ne sont pas disponibles pour les assistants', 'error');
    return;
  }
  
  const status = await checkAIStatus();
  if (!status.available) {
    // Show friendly message - auto-start is happening in background
    showNotification('🔄 Démarrage automatique du service IA en cours... Veuillez patienter quelques instants.', 'info');
    
    // Wait a bit and check again
    await new Promise(resolve => setTimeout(resolve, 4000));
    const newStatus = await checkAIStatus();
    
    if (!newStatus.available) {
      showNotification('⚠️ Le service IA n\'est pas disponible. Assurez-vous que Ollama est installé sur ce PC.', 'warning');
      return;
    } else {
      showNotification('✅ Service IA démarré avec succès!', 'success');
    }
  }
  
  // Use current patient if none specified
  const targetPatientId = patientId || currentPatientId;
  
  if (!targetPatientId) {
    showNotification('❌ Veuillez sélectionner un patient d\'abord', 'error');
    return;
  }
  
  // Load patient data
  try {
    const result = await window.api.patient.getById(targetPatientId);
    if (!result.success) {
      showNotification('❌ Erreur lors du chargement du patient', 'error');
      return;
    }
    
    const patient = result.data;
    
    document.getElementById('ai-report-patient-id').value = targetPatientId;
    document.getElementById('ai-report-patient-name').textContent = `${patient.firstName} ${patient.lastName}`;
    document.getElementById('ai-report-type').value = 'medical_summary';
    document.getElementById('ai-report-instructions').value = '';
    document.getElementById('ai-report-output').value = '';
    document.getElementById('ai-report-output').style.display = 'none';
    document.getElementById('btn-ai-report-copy').style.display = 'none';
    document.getElementById('btn-ai-report-save').style.display = 'none';
    
    showModal('modal-ai-report');
  } catch (error) {
    showNotification('❌ Erreur: ' + error.message, 'error');
  }
}

/**
 * Generate AI report
 */
async function generateAIReport() {
  const patientId = document.getElementById('ai-report-patient-id').value;
  const reportType = document.getElementById('ai-report-type').value;
  const customInstructions = document.getElementById('ai-report-instructions').value;
  const outputArea = document.getElementById('ai-report-output');
  const generateBtn = document.getElementById('btn-ai-report-generate');
  
  generateBtn.disabled = true;
  generateBtn.textContent = '⏳ Génération en cours...';
  outputArea.style.display = 'block';
  outputArea.value = 'Génération du rapport en cours...\nCela peut prendre quelques secondes.';
  
  try {
    // Load full patient data with consultations
    const patientResult = await window.api.patient.getById(patientId);
    if (!patientResult.success) {
      throw new Error('Patient non trouvé');
    }
    
    const patient = patientResult.data;
    
    // Calculate age
    if (patient.dateOfBirth) {
      const birthDate = new Date(patient.dateOfBirth);
      const today = new Date();
      patient.age = today.getFullYear() - birthDate.getFullYear();
    }
    
    // Load consultations
    const consultResult = await window.api.consultation.getByPatient(patientId);
    patient.consultations = consultResult.success ? consultResult.data : [];
    
    // Generate report
    const result = await window.api.ai.generateReport({
      patientData: patient,
      reportType,
      customInstructions
    });
    
    if (result.success) {
      outputArea.value = result.response;
      document.getElementById('btn-ai-report-copy').style.display = 'inline-block';
      document.getElementById('btn-ai-report-save').style.display = 'inline-block';
    } else {
      outputArea.value = '❌ Erreur: ' + result.error;
    }
  } catch (error) {
    outputArea.value = '❌ Erreur: ' + error.message;
  }
  
  generateBtn.disabled = false;
  generateBtn.textContent = '🤖 Générer le Rapport';
}

/**
 * Copy AI report to clipboard
 */
function copyAIReport() {
  const output = document.getElementById('ai-report-output');
  output.select();
  document.execCommand('copy');
  showNotification('📋 Rapport copié dans le presse-papiers', 'success');
}

/**
 * Save AI report as document
 */
async function saveAIReport() {
  const patientId = document.getElementById('ai-report-patient-id').value;
  const reportType = document.getElementById('ai-report-type').value;
  const content = document.getElementById('ai-report-output').value;
  
  if (!content || content.startsWith('❌')) {
    showNotification('❌ Aucun rapport valide à sauvegarder', 'error');
    return;
  }
  
  const reportTypeLabels = {
    'medical_summary': 'Résumé Médical',
    'rehabilitation_plan': 'Plan de Rééducation',
    'discharge_report': 'Rapport de Sortie',
    'insurance_report': 'Rapport Assurance',
    'administrative': 'Rapport Administratif'
  };
  
  try {
    // Save as a document attachment
    const docData = {
      patientId,
      type: 'ai_report',
      category: reportTypeLabels[reportType] || 'Rapport IA',
      title: `Rapport IA - ${reportTypeLabels[reportType] || reportType}`,
      content,
      createdBy: currentUserId
    };
    
    // You would need to implement a document saving endpoint
    showNotification('✅ Rapport sauvegardé (fonctionnalité à implémenter)', 'success');
    closeModal('modal-ai-report');
  } catch (error) {
    showNotification('❌ Erreur lors de la sauvegarde: ' + error.message, 'error');
  }
}

/**
 * Generate AI conclusion for consultation
 */
async function generateAIConclusion(consultationData) {
  if (currentUserRole === 'assistant') {
    return { success: false, error: 'Non disponible pour les assistants' };
  }
  
  const status = await checkAIStatus();
  if (!status.available) {
    return { success: false, error: 'Ollama non disponible' };
  }
  
  return await window.api.ai.generateConclusion(consultationData);
}

/**
 * Format AI response for display
 */
function formatAIResponse(text) {
  // Convert markdown-like formatting to HTML
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

/**
 * Escape HTML entities
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export functions
if (typeof window !== 'undefined') {
  window.initAIModule = initAIModule;
  window.openAIChatbot = openAIChatbot;
  window.sendAIChatMessage = sendAIChatMessage;
  window.openAIReportGenerator = openAIReportGenerator;
  window.generateAIReport = generateAIReport;
  window.copyAIReport = copyAIReport;
  window.saveAIReport = saveAIReport;
  window.generateAIConclusion = generateAIConclusion;
  window.checkAIStatus = checkAIStatus;
}
