/**
 * Ollama AI Service for PhysioCare
 * Handles communication with local Ollama LLM for medical report generation
 * and doctor chatbot assistance
 */

import { ipcMain } from 'electron';
import http from 'http';
import { spawn } from 'child_process';
import { platform } from 'os';

// Ollama configuration
const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1'; // Use IPv4 explicitly
const OLLAMA_PORT = process.env.OLLAMA_PORT || 11434;
// Model options (from fastest to most capable):
// - 'tinyllama' : Very fast, 1.1B params (~700MB RAM) - Basic responses
// - 'qwen2:0.5b': Ultra fast, 0.5B params (~500MB RAM) - Very quick
// - 'phi'       : Fast, 2.7B params (~1.6GB RAM) - Good quality
// - 'gemma:2b'  : Fast, 2B params (~1.4GB RAM) - Google's efficient model
// - 'mistral'   : Slower, 7B params (~4GB RAM) - Best quality French
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'tinyllama'; // Changed to tinyllama for fastest responses

let ollamaProcess = null;
let isOllamaStarting = false;

function extractAvailableModelNames(models = []) {
  if (!Array.isArray(models)) return [];
  return models
    .map((entry) => String(entry?.name || entry?.model || '').trim())
    .filter(Boolean);
}

function resolveOllamaModel(models = []) {
  const availableModels = extractAvailableModelNames(models);
  if (!availableModels.length) return DEFAULT_MODEL;
  if (availableModels.includes(DEFAULT_MODEL)) return DEFAULT_MODEL;
  return availableModels[0];
}

/**
 * Start Ollama server automatically
 */
async function startOllamaServer() {
  // First, check if Ollama is already running
  const existingStatus = await checkOllamaStatus();
  if (existingStatus.available) {
    console.log('Ollama is already running');
    return { success: true, message: 'Ollama already running', models: existingStatus.models };
  }

  if (isOllamaStarting || ollamaProcess) {
    console.log('Ollama is already starting');
    return { success: true, message: 'Ollama is already starting' };
  }

  try {
    isOllamaStarting = true;
    console.log('Trying to start Ollama automatically...');

    // Determine Ollama command based on platform
    const isWindows = platform() === 'win32';
    const ollamaCmd = isWindows ? 'ollama.exe' : 'ollama';
    
    // Try to start Ollama serve
    ollamaProcess = spawn(ollamaCmd, ['serve'], {
      detached: true,
      stdio: 'ignore'
    });

    ollamaProcess.unref(); // Allow parent to exit independently

    ollamaProcess.on('error', (err) => {
      console.error('Error while starting Ollama:', err.message);
      ollamaProcess = null;
      isOllamaStarting = false;
    });

    ollamaProcess.on('exit', (code) => {
      // Code 1 often means Ollama is already running (port in use)
      if (code === 1) {
        console.log('Ollama is probably already running (port in use)');
      } else {
        console.log(`Ollama process exited with code ${code}`);
      }
      ollamaProcess = null;
      isOllamaStarting = false;
    });

    // Wait a bit for Ollama to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if it started successfully (or was already running)
    const status = await checkOllamaStatus();
    isOllamaStarting = false;

    if (status.available) {
      console.log('Ollama available and ready');
      return { success: true, message: 'Ollama available', models: status.models };
    } else {
      console.log('Ollama is not responding yet and may need more time');
      return { success: false, message: 'Ollama is starting, please wait...' };
    }
  } catch (error) {
    console.error('Unable to start Ollama:', error.message);
    isOllamaStarting = false;
    ollamaProcess = null;
    return { 
      success: false, 
      message: 'Ollama is not installed or unavailable. AI features are disabled.' 
    };
  }
}

/**
 * Check if Ollama is running and available
 */
async function checkOllamaStatus() {
  return new Promise((resolve) => {
    const options = {
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: '/api/tags',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            available: true,
            models: parsed.models || []
          });
        } catch (e) {
          resolve({ available: true, models: [] });
        }
      });
    });

    req.on('error', () => {
      resolve({ available: false, models: [] });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ available: false, models: [] });
    });

    req.end();
  });
}

/**
 * Generate text using Ollama
 */
async function generateText(prompt, model = DEFAULT_MODEL, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 0.9,
        num_predict: options.max_tokens || 2000
      }
    });

    const reqOptions = {
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 120000 // 2 minutes timeout for generation
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.response) {
            resolve({
              success: true,
              response: parsed.response,
              model: parsed.model,
              totalDuration: parsed.total_duration
            });
          } else if (parsed.error) {
            resolve({ success: false, error: parsed.error });
          } else {
            resolve({ success: false, error: 'Invalid response from Ollama' });
          }
        } catch (e) {
          resolve({ success: false, error: 'Erreur de parsing: ' + e.message });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ success: false, error: 'Connection error to Ollama: ' + e.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Timeout: Ollama is taking too long to respond' });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Generate a medical report based on patient data
 */
async function generateMedicalReport(patientData, reportType, customInstructions = '', model = DEFAULT_MODEL) {
  const systemContext = `Tu es un assistant mÃ©dical professionnel pour un cabinet de mÃ©decine physique et rÃ©Ã©ducation (MPR) en AlgÃ©rie.
Tu gÃ©nÃ¨res des rapports mÃ©dicaux en franÃ§ais avec une terminologie mÃ©dicale appropriÃ©e.
Sois prÃ©cis, professionnel et respecte le secret mÃ©dical.`;

  let prompt = systemContext + '\n\n';

  // Build patient context
  prompt += `=== INFORMATIONS PATIENT ===
Nom: ${patientData.firstName} ${patientData.lastName}
Ã‚ge: ${patientData.age || 'Non spÃ©cifiÃ©'}
Sexe: ${patientData.gender || 'Non spÃ©cifiÃ©'}
Groupe sanguin: ${patientData.bloodType || 'Non spÃ©cifiÃ©'}
`;

  if (patientData.medicalHistory) {
    prompt += `AntÃ©cÃ©dents mÃ©dicaux: ${patientData.medicalHistory}\n`;
  }
  if (patientData.allergies) {
    prompt += `Allergies: ${patientData.allergies}\n`;
  }

  // Add consultations if available
  if (patientData.consultations && patientData.consultations.length > 0) {
    prompt += `\n=== DERNIÃˆRES CONSULTATIONS ===\n`;
    patientData.consultations.slice(0, 5).forEach((c, i) => {
      prompt += `\n[${i + 1}] Date: ${c.date}
Motif: ${c.reason || 'Non spÃ©cifiÃ©'}
Diagnostic: ${c.diagnosis || 'Non spÃ©cifiÃ©'}
Traitement: ${c.treatment || 'Non spÃ©cifiÃ©'}
`;
    });
  }

  // Report type specific instructions
  switch (reportType) {
    case 'medical_summary':
      prompt += `\n=== INSTRUCTIONS ===
GÃ©nÃ¨re un rÃ©sumÃ© mÃ©dical complet pour ce patient incluant:
1. SynthÃ¨se de l'Ã©tat de santÃ© actuel
2. Historique des pathologies
3. Traitements en cours
4. Recommandations de suivi
`;
      break;

    case 'rehabilitation_plan':
      prompt += `\n=== INSTRUCTIONS ===
GÃ©nÃ¨re un plan de rÃ©Ã©ducation personnalisÃ© incluant:
1. Objectifs de rÃ©Ã©ducation (court, moyen, long terme)
2. Programme de sÃ©ances recommandÃ©
3. Exercices Ã  domicile
4. CritÃ¨res d'Ã©valuation du progrÃ¨s
5. PrÃ©cautions et contre-indications
`;
      break;

    case 'discharge_report':
      prompt += `\n=== INSTRUCTIONS ===
GÃ©nÃ¨re un rapport de sortie/fin de traitement incluant:
1. Motif initial de prise en charge
2. Ã‰volution pendant le traitement
3. Ã‰tat actuel du patient
4. Recommandations post-traitement
5. Suivi Ã  prÃ©voir
`;
      break;

    case 'insurance_report':
      prompt += `\n=== INSTRUCTIONS ===
GÃ©nÃ¨re un rapport pour l'assurance/mutuelle incluant:
1. Diagnostic principal et secondaires
2. Dates de prise en charge
3. Nature des soins effectuÃ©s
4. Nombre de sÃ©ances rÃ©alisÃ©es
5. Ã‰volution et pronostic
`;
      break;

    case 'administrative':
      prompt += `\n=== INSTRUCTIONS ===
GÃ©nÃ¨re un rapport administratif incluant:
1. RÃ©sumÃ© des prestations
2. Suivi financier (si donnÃ©es disponibles)
3. Planning des prochains rendez-vous
4. Notes administratives importantes
`;
      break;

    default:
      prompt += `\n=== INSTRUCTIONS ===
GÃ©nÃ¨re un rapport mÃ©dical gÃ©nÃ©ral pour ce patient.
`;
  }

  if (customInstructions) {
    prompt += `\nInstructions supplÃ©mentaires: ${customInstructions}\n`;
  }

  prompt += `\n=== RAPPORT ===\n`;

  return await generateText(prompt, model, { temperature: 0.5 });
}

/**
 * Doctor chatbot - answer questions about patient data
 */
async function chatWithDoctor(message, context = {}, model = DEFAULT_MODEL) {
  const systemContext = `Tu es un assistant IA pour un mÃ©decin spÃ©cialiste en mÃ©decine physique et rÃ©Ã©ducation (MPR) en AlgÃ©rie.
Tu aides le mÃ©decin Ã :
- RÃ©sumer les dossiers patients
- Expliquer des informations cliniques
- SuggÃ©rer des plans de traitement
- RÃ©diger des conclusions et recommandations

RÃ©ponds toujours en franÃ§ais professionnel mÃ©dical.
Ne donne jamais de diagnostic dÃ©finitif - tu assistes le mÃ©decin qui prend les dÃ©cisions.
`;

  let prompt = systemContext + '\n\n';

  // Add patient context if available
  if (context.patient) {
    prompt += `=== CONTEXTE PATIENT ===
Nom: ${context.patient.firstName} ${context.patient.lastName}
Ã‚ge: ${context.patient.age || 'Non spÃ©cifiÃ©'}
AntÃ©cÃ©dents: ${context.patient.medicalHistory || 'Non renseignÃ©s'}
Allergies: ${context.patient.allergies || 'Aucune connue'}
`;
  }

  // Add recent consultations if available
  if (context.consultations && context.consultations.length > 0) {
    prompt += `\n=== CONSULTATIONS RÃ‰CENTES ===\n`;
    context.consultations.slice(0, 3).forEach((c, i) => {
      prompt += `[${c.date}] Motif: ${c.reason || '-'}, Diagnostic: ${c.diagnosis || '-'}\n`;
    });
  }

  prompt += `\n=== QUESTION DU MÃ‰DECIN ===\n${message}\n\n=== RÃ‰PONSE ===\n`;

  return await generateText(prompt, model, { temperature: 0.7 });
}

/**
 * Generate a treatment conclusion
 */
async function generateConclusion(consultationData, model = DEFAULT_MODEL) {
  const prompt = `Tu es un assistant mÃ©dical pour un mÃ©decin MPR en AlgÃ©rie.
GÃ©nÃ¨re une conclusion professionnelle pour cette consultation:

Patient: ${consultationData.patientName}
Date: ${consultationData.date}
Motif: ${consultationData.reason || 'Non spÃ©cifiÃ©'}
Examen clinique: ${consultationData.examination || 'Non dÃ©taillÃ©'}
Diagnostic: ${consultationData.diagnosis || 'Ã€ prÃ©ciser'}
Traitement proposÃ©: ${consultationData.treatment || 'Non spÃ©cifiÃ©'}

GÃ©nÃ¨re une conclusion structurÃ©e et professionnelle en franÃ§ais:`;

  return await generateText(prompt, model, { temperature: 0.5, max_tokens: 500 });
}

/**
 * Setup IPC handlers for Ollama AI features
 */
export function setupOllamaHandlers() {
  // Check Ollama status and try to start if not running
  ipcMain.handle('ai:check-status', async () => {
    let status = await checkOllamaStatus();
    
    // If not available, try to start it automatically
    if (!status.available && !isOllamaStarting) {
      console.log('Ollama unavailable, trying automatic startup...');
      await startOllamaServer();
      // Check again after attempting to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      status = await checkOllamaStatus();
    }
    
    return status;
  });

  // Start Ollama manually (if needed)
  ipcMain.handle('ai:start-ollama', async () => {
    return await startOllamaServer();
  });

  // Generate medical report
  ipcMain.handle('ai:generate-report', async (event, { patientData, reportType, customInstructions }) => {
    try {
      let status = await checkOllamaStatus();
      
      // Auto-start if not available
      if (!status.available) {
        console.log('Starting Ollama automatically for report generation...');
        await startOllamaServer();
        await new Promise(resolve => setTimeout(resolve, 3000));
        status = await checkOllamaStatus();
      }
      
      if (!status.available) {
        return { 
          success: false, 
          error: 'Ollama is not available. Please check that Ollama is installed on this PC.' 
        };
      }

      const selectedModel = resolveOllamaModel(status.models);
      return await generateMedicalReport(patientData, reportType, customInstructions, selectedModel);
    } catch (error) {
      console.error('AI Report generation error:', error);
      return { success: false, error: error.message };
    }
  });

  // Doctor chatbot
  ipcMain.handle('ai:chat', async (event, { message, context }) => {
    try {
      let status = await checkOllamaStatus();
      
      // Auto-start if not available
      if (!status.available) {
        console.log('Starting Ollama automatically for chatbot...');
        await startOllamaServer();
        await new Promise(resolve => setTimeout(resolve, 3000));
        status = await checkOllamaStatus();
      }
      
      if (!status.available) {
        return { 
          success: false, 
          error: 'Ollama is not available. Please check that Ollama is installed on this PC.' 
        };
      }

      const selectedModel = resolveOllamaModel(status.models);
      return await chatWithDoctor(message, context, selectedModel);
    } catch (error) {
      console.error('AI Chat error:', error);
      return { success: false, error: error.message };
    }
  });

  // Generate consultation conclusion
  ipcMain.handle('ai:generate-conclusion', async (event, consultationData) => {
    try {
      let status = await checkOllamaStatus();
      
      // Auto-start if not available
      if (!status.available) {
        console.log('Starting Ollama automatically for conclusion...');
        await startOllamaServer();
        await new Promise(resolve => setTimeout(resolve, 3000));
        status = await checkOllamaStatus();
      }
      
      if (!status.available) {
        return { 
          success: false, 
          error: 'Ollama is not available.' 
        };
      }

      const selectedModel = resolveOllamaModel(status.models);
      return await generateConclusion(consultationData, selectedModel);
    } catch (error) {
      console.error('AI Conclusion error:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('Ollama AI handlers registered');
}

export {
  checkOllamaStatus,
  startOllamaServer,
  generateMedicalReport,
  chatWithDoctor,
  generateConclusion
};
