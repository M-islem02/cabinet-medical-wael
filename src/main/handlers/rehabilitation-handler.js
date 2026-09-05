/**
 * Rehabilitation Handler - Gestion des fonctionnalitÃ©s MPR
 * MÃ©decine Physique et Fonctionnelle / RÃ©Ã©ducation
 */

import { ipcMain } from 'electron';
import { registerValidatedContractHandler } from '../ipc/contract-handler.js';
import { query, queryOne, run, withTransaction } from '../database-unified.js';

// Helper pour convertir les valeurs vides en null (MariaDB compatibility)
const toNullIfEmpty = (val) => (val === '' || val === undefined) ? null : val;
const toNumberOrNull = (val) => {
  if (val === '' || val === undefined || val === null) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
};
const toIntOrDefault = (val, def = 0) => {
  if (val === '' || val === undefined || val === null) return def;
  const num = parseInt(val, 10);
  return isNaN(num) ? def : num;
};
const buildFullName = (firstName, lastName) => `${firstName || ''} ${lastName || ''}`.trim();
const formatPrescriptionFrequency = (prescription = {}) => {
  const sessionsPerWeek = toIntOrDefault(prescription?.sessionsPerWeek, 0);
  const weeks = toIntOrDefault(prescription?.weeks, 0);
  return `${sessionsPerWeek}x/sem pendant ${weeks} sem`;
};
const parsePrescriptionFrequency = (frequency, fallbackSessions = 0) => {
  const match = String(frequency || '').match(/(\d+)x\/sem pendant (\d+) sem/i);
  return {
    sessionsPerWeek: match ? parseInt(match[1], 10) : toIntOrDefault(fallbackSessions, 0),
    weeks: match ? parseInt(match[2], 10) : 0
  };
};
const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};
const mapRehabilitationPlanRecord = (plan) => {
  if (!plan) {
    return null;
  }

  return {
    ...plan,
    objectives: {
      shortTerm: plan.shortTermObjectives || '',
      mediumTerm: plan.mediumTermObjectives || '',
      longTerm: plan.longTermObjectives || ''
    },
    kinePrescription: parsePrescriptionFrequency(plan.kinesiotherapyFrequency, plan.kinesiotherapy),
    ergoPrescription: parsePrescriptionFrequency(plan.ergotherapyFrequency, plan.ergotherapy),
    orthoPrescription: parsePrescriptionFrequency(plan.speechTherapyFrequency, plan.speechTherapy),
    equipment: parseJsonArray(plan.otherEquipment),
    equipmentDetails: plan.equipmentDetails || ''
  };
};

// ========== FUNCTIONAL EVALUATIONS ==========

export function handleRehabilitationEvents() {
  
// Create functional evaluation
ipcMain.handle('functionalEvaluation:create', async (event, data) => {
  try {
    const id = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await run(`
      INSERT INTO functional_evaluations (
        id, patientId, evaluationDate, evaluatorId,
        autonomyScore, autonomyNotes, mobilityScore, mobilityNotes, walkingAbility, walkingAid, walkingDistance,
        balanceScore, balanceNotes, coordinationScore, coordinationNotes,
        painScore, painLocation, painType, painNotes,
        spasticityScore, spasticityLocation, spasticityNotes,
        jointRange, mrcScores, globalAssessment, functionalDiagnosis, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      data.patientId,
      data.date || new Date().toISOString().split('T')[0],
      toNullIfEmpty(data.evaluatorId),
      toIntOrDefault(data.autonomyScore, 0),
      toNullIfEmpty(data.autonomyNotes),
      toIntOrDefault(data.mobilityScore, 0),
      toNullIfEmpty(data.mobilityNotes),
      data.gaitType || 'normal',
      data.walkingAid || 'aucune',
      toNullIfEmpty(data.walkingDistance),
      toIntOrDefault(data.balanceScore, 0),
      toNullIfEmpty(data.balanceNotes),
      toIntOrDefault(data.coordinationScore, 0),
      toNullIfEmpty(data.coordinationNotes),
      toIntOrDefault(data.painEVA, 0),
      toNullIfEmpty(data.painLocation),
      toNullIfEmpty(data.painType),
      toNullIfEmpty(data.painNotes),
      toIntOrDefault(data.spasticityAshworth, 0),
      toNullIfEmpty(data.spasticityLocation),
      toNullIfEmpty(data.spasticityNotes),
      toNullIfEmpty(data.jointRange),
      toNullIfEmpty(data.mrcScores),
      data.type || 'initial',
      toNullIfEmpty(data.objectives),
      toNullIfEmpty(data.observations)
    ]);
    
    console.log('âœ… Functional evaluation created:', id);
    return { success: true, id: id };
  } catch (error) {
    console.error('Error creating functional evaluation:', error);
    return { success: false, error: error.message };
  }
});

// Get evaluations by patient
ipcMain.handle('functionalEvaluation:getByPatient', async (event, patientId) => {
  try {
    const result = await query(`
      SELECT fe.*, u.fullName as evaluatorName
      FROM functional_evaluations fe
      LEFT JOIN users u ON fe.evaluatorId = u.id
      WHERE fe.patientId = ?
      ORDER BY fe.evaluationDate DESC
    `, [patientId]);
    return result || [];
  } catch (error) {
    console.error('Error getting patient evaluations:', error);
    return [];
  }
});

// Get evaluation by ID
ipcMain.handle('functionalEvaluation:getById', async (event, id) => {
  try {
    return await queryOne(`
      SELECT fe.*, u.fullName as evaluatorName
      FROM functional_evaluations fe
      LEFT JOIN users u ON fe.evaluatorId = u.id
      WHERE fe.id = ?
    `, [id]);
  } catch (error) {
    console.error('Error getting evaluation:', error);
    return null;
  }
});

// Get latest evaluation for patient
ipcMain.handle('functionalEvaluation:getLatest', async (event, patientId) => {
  try {
    return await queryOne(`
      SELECT fe.*, u.fullName as evaluatorName
      FROM functional_evaluations fe
      LEFT JOIN users u ON fe.evaluatorId = u.id
      WHERE fe.patientId = ?
      ORDER BY fe.evaluationDate DESC
      LIMIT 1
    `, [patientId]);
  } catch (error) {
    console.error('Error getting latest evaluation:', error);
    return null;
  }
});

// Update evaluation
ipcMain.handle('functionalEvaluation:update', async (event, id, data) => {
  try {
    await run(`
      UPDATE functional_evaluations SET
        evaluationDate = ?, globalAssessment = ?,
        autonomyScore = ?, mobilityScore = ?, balanceScore = ?, coordinationScore = ?,
        painScore = ?, painLocation = ?, spasticityScore = ?,
        walkingAbility = ?, walkingAid = ?, walkingDistance = ?,
        jointRange = ?, mrcScores = ?,
        notes = ?, functionalDiagnosis = ?,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      data.date, 
      data.type,
      toIntOrDefault(data.autonomyScore, 0), 
      toIntOrDefault(data.mobilityScore, 0), 
      toIntOrDefault(data.balanceScore, 0), 
      toIntOrDefault(data.coordinationScore, 0),
      toIntOrDefault(data.painEVA, 0), 
      toNullIfEmpty(data.painLocation), 
      toIntOrDefault(data.spasticityAshworth, 0),
      toNullIfEmpty(data.gaitType),
      toNullIfEmpty(data.walkingAid),
      toNullIfEmpty(data.walkingDistance),
      toNullIfEmpty(data.jointRange),
      toNullIfEmpty(data.mrcScores),
      toNullIfEmpty(data.observations), 
      toNullIfEmpty(data.objectives),
      id
    ]);
    
    return { success: true };
  } catch (error) {
    console.error('Error updating evaluation:', error);
    return { success: false, error: error.message };
  }
});

// Delete evaluation
ipcMain.handle('functionalEvaluation:delete', async (event, id) => {
  try {
    await run('DELETE FROM functional_evaluations WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    console.error('Error deleting evaluation:', error);
    return { success: false, error: error.message };
  }
});

// ========== MEDICAL SCALES ==========

ipcMain.handle('medicalScale:getAll', async () => {
  try {
    return await query("SELECT * FROM analysis_types WHERE category = 'Ã‰chelle MPR' ORDER BY name", []);
  } catch (error) {
    console.error('Error getting medical scales:', error);
    return [];
  }
});

ipcMain.handle('medicalScale:getByCategory', async (event, category) => {
  try {
    return await query("SELECT * FROM analysis_types WHERE category = 'Ã‰chelle MPR' ORDER BY name", []);
  } catch (error) {
    console.error('Error getting scales by category:', error);
    return [];
  }
});

ipcMain.handle('medicalScale:saveScore', async (event, data) => {
  try {
    const id = `scale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await run(`
      INSERT INTO medical_scales (id, patientId, evaluationId, evaluationDate, scaleType, score, maxScore, interpretation, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      data.patientId,
      toNullIfEmpty(data.evaluationId),
      new Date().toISOString().slice(0, 19).replace('T', ' '),
      data.scaleType,
      toNumberOrNull(data.score),
      toNumberOrNull(data.maxScore),
      toNullIfEmpty(data.interpretation),
      toNullIfEmpty(data.notes)
    ]);
    
    return { success: true, id: id || result.lastInsertId || result.lastInsertRowid };
  } catch (error) {
    console.error('Error saving scale score:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('medicalScale:getPatientScores', async (event, patientId) => {
  try {
    return await query(`
      SELECT ms.*, at.name as scaleName, at.description, at.category
      FROM medical_scales ms
      LEFT JOIN analysis_types at ON ms.scaleType = at.name
      WHERE ms.patientId = ?
      ORDER BY ms.createdAt DESC
    `, [patientId]);
  } catch (error) {
    console.error('Error getting patient scores:', error);
    return [];
  }
});

ipcMain.handle('medicalScale:getScoreHistory', async (event, patientId, scaleType) => {
  try {
    return await query(`
      SELECT * FROM medical_scales
      WHERE patientId = ? AND scaleType = ?
      ORDER BY createdAt ASC
    `, [patientId, scaleType]);
  } catch (error) {
    console.error('Error getting score history:', error);
    return [];
  }
});

// ========== REHABILITATION PLANS ==========

// Create rehabilitation plan - using existing table columns
registerValidatedContractHandler(ipcMain, 'rehabilitationPlan', 'create', async (event, data) => {
  try {
    const id = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate total sessions from prescriptions
    const kineTotal = (data.kinePrescription?.sessionsPerWeek || 0) * (data.kinePrescription?.weeks || 0);
    const ergoTotal = (data.ergoPrescription?.sessionsPerWeek || 0) * (data.ergoPrescription?.weeks || 0);
    const orthoTotal = (data.orthoPrescription?.sessionsPerWeek || 0) * (data.orthoPrescription?.weeks || 0);
    const totalSessions = kineTotal + ergoTotal + orthoTotal;
    
    await run(`
      INSERT INTO rehabilitation_plans (
        id, patientId, createdBy, startDate, endDate, status,
        shortTermObjectives, mediumTermObjectives, longTermObjectives,
        kinesiotherapy, kinesiotherapyFrequency, kinesiotherapyNotes,
        ergotherapy, ergotherapyFrequency, ergotherapyNotes,
        speechTherapy, speechTherapyFrequency, speechTherapyNotes,
        otherEquipment, equipmentDetails, totalSessions, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      data.patientId,
      toNullIfEmpty(data.createdBy),
      data.startDate,
      toNullIfEmpty(data.endDate),
      data.status || 'active',
      toNullIfEmpty(data.shortTermObjectives),
      toNullIfEmpty(data.mediumTermObjectives),
      toNullIfEmpty(data.longTermObjectives),
      toIntOrDefault(data.kinePrescription?.sessionsPerWeek, 0),
      formatPrescriptionFrequency(data.kinePrescription),
      null,
      toIntOrDefault(data.ergoPrescription?.sessionsPerWeek, 0),
      formatPrescriptionFrequency(data.ergoPrescription),
      null,
      toIntOrDefault(data.orthoPrescription?.sessionsPerWeek, 0),
      formatPrescriptionFrequency(data.orthoPrescription),
      null,
      JSON.stringify(data.equipment || []),
      toNullIfEmpty(data.equipmentDetails),
      totalSessions,
      toNullIfEmpty(data.notes)
    ]);
    
    console.log('âœ… Rehabilitation plan created:', id);
    return { success: true, id: id };
  } catch (error) {
    console.error('Error creating rehabilitation plan:', error);
    return { success: false, error: error.message };
  }
});

// Get plans by patient
registerValidatedContractHandler(ipcMain, 'rehabilitationPlan', 'getByPatient', async (event, patientId) => {
  try {
    const plans = await query(`
      SELECT rp.*, u.fullName as creatorName
      FROM rehabilitation_plans rp
      LEFT JOIN users u ON rp.createdBy = u.id
      WHERE rp.patientId = ?
      ORDER BY rp.startDate DESC
    `, [patientId]);
    
    return (plans || []).map(mapRehabilitationPlanRecord);
  } catch (error) {
    console.error('Error getting patient rehabilitation plans:', error);
    return [];
  }
});

// Get plan by ID
registerValidatedContractHandler(ipcMain, 'rehabilitationPlan', 'getById', async (event, id) => {
  try {
    const plan = await queryOne(`
      SELECT rp.*, u.fullName as creatorName
      FROM rehabilitation_plans rp
      LEFT JOIN users u ON rp.createdBy = u.id
      WHERE rp.id = ?
    `, [id]);
    
    return mapRehabilitationPlanRecord(plan);
  } catch (error) {
    console.error('Error getting rehabilitation plan:', error);
    return null;
  }
});

// Get active plan for patient
registerValidatedContractHandler(ipcMain, 'rehabilitationPlan', 'getActive', async (event, patientId) => {
  try {
    const plan = await queryOne(`
      SELECT * FROM rehabilitation_plans
      WHERE patientId = ? AND status = 'active'
      ORDER BY startDate DESC
      LIMIT 1
    `, [patientId]);
    
    return mapRehabilitationPlanRecord(plan);
  } catch (error) {
    console.error('Error getting active plan:', error);
    return null;
  }
});

// Update plan status
registerValidatedContractHandler(ipcMain, 'rehabilitationPlan', 'updateStatus', async (event, id, status) => {
  try {
    await run(`UPDATE rehabilitation_plans SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [status, id]);
    return { success: true };
  } catch (error) {
    console.error('Error updating plan status:', error);
    return { success: false, error: error.message };
  }
});

// Delete plan
registerValidatedContractHandler(ipcMain, 'rehabilitationPlan', 'delete', async (event, id) => {
  try {
    await run('DELETE FROM rehabilitation_plans WHERE id = ?', [id]);
    return { success: true };
  } catch (error) {
    console.error('Error deleting rehabilitation plan:', error);
    return { success: false, error: error.message };
  }
});

// ========== REHABILITATION SESSIONS ==========

registerValidatedContractHandler(ipcMain, 'rehabilitationSession', 'create', async (event, data) => {
  try {
    const id = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await run(`
      INSERT INTO rehabilitation_sessions (
        id, rehabilitationPlanId, patientId, therapistId, sessionDate, sessionType, 
        sessionNumber, duration, techniques, exercises, observations, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      toNullIfEmpty(data.planId),
      data.patientId,
      toNullIfEmpty(data.therapistId),
      data.date,
      data.sessionType || 'RÃ©Ã©ducation',
      toIntOrDefault(data.sessionNumber, 1),
      toIntOrDefault(data.duration, 30),
      JSON.stringify(data.techniques || []),
      JSON.stringify(data.exercises || []),
      toNullIfEmpty(data.progress),
      data.status || 'scheduled',
      toNullIfEmpty(data.notes)
    ]);
    
    return { success: true, id: id };
  } catch (error) {
    console.error('Error creating rehabilitation session:', error);
    return { success: false, error: error.message };
  }
});

registerValidatedContractHandler(ipcMain, 'rehabilitationSession', 'getByPlan', async (event, planId) => {
  try {
    return await query(`
      SELECT rs.*, u.fullName as therapistName
      FROM rehabilitation_sessions rs
      LEFT JOIN users u ON rs.therapistId = u.id
      WHERE rs.rehabilitationPlanId = ?
      ORDER BY rs.sessionDate DESC
    `, [planId]) || [];
  } catch (error) {
    console.error('Error getting plan sessions:', error);
    return [];
  }
});

registerValidatedContractHandler(ipcMain, 'rehabilitationSession', 'getByPatient', async (event, patientId) => {
  try {
    return await query(`
      SELECT rs.*, u.fullName as therapistName
      FROM rehabilitation_sessions rs
      LEFT JOIN users u ON rs.therapistId = u.id
      WHERE rs.patientId = ?
      ORDER BY rs.sessionDate DESC
    `, [patientId]) || [];
  } catch (error) {
    console.error('Error getting patient sessions:', error);
    return [];
  }
});

registerValidatedContractHandler(ipcMain, 'rehabilitationSession', 'getById', async (event, id) => {
  try {
    return await queryOne(`
      SELECT rs.*, u.fullName as therapistName
      FROM rehabilitation_sessions rs
      LEFT JOIN users u ON rs.therapistId = u.id
      WHERE rs.id = ?
    `, [id]);
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
});

registerValidatedContractHandler(ipcMain, 'rehabilitationSession', 'complete', async (event, id, data) => {
  try {
    await run(`
      UPDATE rehabilitation_sessions SET
        status = 'completed',
        observations = ?,
        notes = ?
      WHERE id = ?
    `, [toNullIfEmpty(data.progress), toNullIfEmpty(data.notes), id]);
    return { success: true };
  } catch (error) {
    console.error('Error completing session:', error);
    return { success: false, error: error.message };
  }
});

registerValidatedContractHandler(ipcMain, 'rehabilitationSession', 'cancel', async (event, id, reason) => {
  try {
    return await withTransaction(async () => {
    const existing = await queryOne('SELECT notes FROM rehabilitation_sessions WHERE id = ? FOR UPDATE', [id]);
    const appendReason = `AnnulÃ©: ${reason || 'Sans raison'}`;
    const newNotes = existing?.notes ? `${existing.notes} | ${appendReason}` : appendReason;

    await run(`
      UPDATE rehabilitation_sessions SET
        status = 'cancelled',
        notes = ?
      WHERE id = ?
    `, [newNotes, id]);
    return { success: true };
    });
  } catch (error) {
    console.error('Error cancelling session:', error);
    return { success: false, error: error.message };
  }
});

registerValidatedContractHandler(ipcMain, 'rehabilitationSession', 'getTodaySessions', async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sessions = await query(`
      SELECT rs.*, 
             p.firstName,
             p.lastName,
             u.fullName as therapistName
      FROM rehabilitation_sessions rs
      LEFT JOIN patients p ON rs.patientId = p.id
      LEFT JOIN users u ON rs.therapistId = u.id
      WHERE DATE(rs.sessionDate) = DATE(?)
      ORDER BY rs.sessionDate
    `, [today]) || [];

    return sessions.map((session) => ({
      ...session,
      patientName: buildFullName(session.firstName, session.lastName)
    }));
  } catch (error) {
    console.error('Error getting today sessions:', error);
    return [];
  }
});

console.log('Rehabilitation handlers registered');

} // End of handleRehabilitationEvents
