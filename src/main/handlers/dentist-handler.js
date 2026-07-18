/**
 * Gestionnaire IPC pour le module Dentiste
 */

import { ipcMain } from 'electron';
import { query, queryOne, run } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { broadcastRealtimeEvent } from '../realtime-server.js';
import { recalculatePlanTotals } from './treatment-plans-handler.js';

const ALLOWED_TRANSITIONS = {
  proposed:    ['planned', 'cancelled'],
  planned:     ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   []
};

async function runWithFallback(primarySql, primaryParams, fallbackSql, fallbackParams = primaryParams) {
  try {
    return await run(primarySql, primaryParams);
  } catch (error) {
    return await run(fallbackSql, fallbackParams);
  }
}

async function queryOneWithFallback(primarySql, primaryParams, fallbackSql, fallbackParams = primaryParams) {
  try {
    return await queryOne(primarySql, primaryParams);
  } catch (error) {
    return await queryOne(fallbackSql, fallbackParams);
  }
}

async function queryWithFallback(primarySql, primaryParams, fallbackSql, fallbackParams = primaryParams) {
  try {
    return await query(primarySql, primaryParams);
  } catch (error) {
    return await query(fallbackSql, fallbackParams);
  }
}

export function handleDentistEvents() {

  // ========== DENTAL RECORDS ==========

  ipcMain.handle('dental:getRecord', async (event, patientId) => {
    try {
      const record = await queryOne('SELECT * FROM dental_records WHERE patientId = ?', [patientId]);
      return { success: true, data: record };
    } catch (error) {
      console.error('Error getting dental record:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:saveRecord', async (event, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const existing = await queryOne('SELECT id FROM dental_records WHERE patientId = ?', [data.patientId]);
      
      if (existing) {
        await run(`
          UPDATE dental_records SET 
            bloodType = ?, allergies = ?, medicalNotes = ?,
            lastVisitDate = ?, nextVisitDate = ?, updatedAt = ?
          WHERE patientId = ?
        `, [data.bloodType, data.allergies, data.medicalNotes,
            data.lastVisitDate, data.nextVisitDate, now, data.patientId]);
        return { success: true, id: existing.id };
      } else {
        const id = uuidv4();
        await run(`
          INSERT INTO dental_records (id, patientId, bloodType, allergies, medicalNotes, lastVisitDate, nextVisitDate, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, data.patientId, data.bloodType, data.allergies, data.medicalNotes,
            data.lastVisitDate, data.nextVisitDate, now, now]);
        return { success: true, id };
      }
    } catch (error) {
      console.error('Error saving dental record:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== DENTAL TEETH STATE ==========

  ipcMain.handle('dental:getTeeth', async (event, patientId) => {
    try {
      const teeth = await query('SELECT * FROM dental_teeth WHERE patientId = ? ORDER BY toothNumber', [patientId]);
      return { success: true, data: teeth };
    } catch (error) {
      console.error('Error getting teeth:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:getSchemaAtDate', async (event, patientId, date) => {
    try {
      if (!patientId || !date) return { success: false, error: 'Patient et date requis' };
      const [teeth, treatments] = await Promise.all([
        query(
          `SELECT * FROM dental_teeth
           WHERE patientId = ? AND updatedAt < (CAST(? AS DATE) + INTERVAL '1 day')
           ORDER BY toothNumber`,
          [patientId, date]
        ),
        query(
          `SELECT DISTINCT ON (toothNumber)
                  toothNumber, treatmentType, status AS treatmentStatus,
                  description, notes, treatmentDate
           FROM dental_treatments
           WHERE patientId = ?
             AND toothNumber IS NOT NULL
             AND treatmentDate < (CAST(? AS DATE) + INTERVAL '1 day')
           ORDER BY toothNumber, treatmentDate DESC, createdAt DESC`,
          [patientId, date]
        )
      ]);
      return { success: true, data: { teeth: teeth || [], treatments: treatments || [] } };
    } catch (error) {
      console.error('Error loading historical dental schema:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:saveTooth', async (event, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const existing = await queryOne(
        'SELECT id FROM dental_teeth WHERE patientId = ? AND toothNumber = ?',
        [data.patientId, data.toothNumber]
      );

      if (existing) {
        await run(`
          UPDATE dental_teeth SET 
            status = ?, surfaces = ?, notes = ?, updatedAt = ?
          WHERE id = ?
        `, [data.status, data.surfaces, data.notes, now, existing.id]);
      } else {
        const id = uuidv4();
        await run(`
          INSERT INTO dental_teeth (id, patientId, toothNumber, status, surfaces, notes, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, data.patientId, data.toothNumber, data.status, data.surfaces, data.notes, now]);
      }

      // Broadcast tooth update for real-time chart refresh
      broadcastRealtimeEvent({
        type: 'dental:tooth-updated',
        patientId: data.patientId,
        toothNumber: data.toothNumber,
        status: data.status
      });

      return { success: true };
    } catch (error) {
      console.error('Error saving tooth:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:saveMultipleTeeth', async (event, patientId, teethData) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      for (const tooth of teethData) {
        const existing = await queryOne(
          'SELECT id FROM dental_teeth WHERE patientId = ? AND toothNumber = ?',
          [patientId, tooth.toothNumber]
        );
        if (existing) {
          await run(`
            UPDATE dental_teeth SET status = ?, surfaces = ?, notes = ?, updatedAt = ?
            WHERE id = ?
          `, [tooth.status, tooth.surfaces, tooth.notes, now, existing.id]);
        } else {
          const id = uuidv4();
          await run(`
            INSERT INTO dental_teeth (id, patientId, toothNumber, status, surfaces, notes, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [id, patientId, tooth.toothNumber, tooth.status, tooth.surfaces, tooth.notes, now]);
        }
      }
      return { success: true };
    } catch (error) {
      console.error('Error saving multiple teeth:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== DENTAL TREATMENTS ==========

  // Get treatments grouped by tooth for real-time color overlay
  ipcMain.handle('dental:getTreatmentsByPatient', async (event, patientId) => {
    try {
      const treatments = await query(`
        SELECT toothNumber, status, treatmentType, treatmentDate
        FROM dental_treatments
        WHERE patientId = ?
        ORDER BY treatmentDate DESC
      `, [patientId]);
      // Return map: toothNumber -> most recent treatment
      const map = {};
      for (const t of (treatments || [])) {
        if (t.toothNumber && !map[t.toothNumber]) {
          map[t.toothNumber] = t;
        }
      }
      return { success: true, data: map };
    } catch (error) {
      console.error('Error getting treatments by patient:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:createTreatment', async (event, data) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      // A treatment is linked only when the user explicitly chooses a plan.
      const planId = data.planId || null;

      await run(`
        INSERT INTO dental_treatments
          (id, patientId, toothNumber, treatmentDate, treatmentType,
           surfaces, description, cost, status, planId, doctorId, notes, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.patientId, data.toothNumber,
         data.treatmentDate || now, data.treatmentType,
         data.surfaces, data.description,
         data.cost || 0, data.status || 'proposed',
         planId, data.doctorId || null, data.notes, now, now]
      );

      if (planId && data.cost > 0) {
        try {
          await recalculatePlanTotals(planId);
          broadcastRealtimeEvent({ type: 'plan:updated', planId });
        } catch (e) {
          console.warn('Could not update plan cost:', e.message);
        }
      }

      // Refresh tooth color via WS
      broadcastRealtimeEvent({
        type: 'dental:treatment-updated',
        patientId: data.patientId,
        toothNumber: data.toothNumber
      });

      return { success: true, id, planId };
    } catch (error) {
      console.error('Error creating treatment:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:getTreatments', async (event, patientId) => {
    try {
      const treatments = await query(`
        SELECT dt.*, p.firstName, p.lastName
        FROM dental_treatments dt
        LEFT JOIN patients p ON dt.patientId = p.id
        WHERE dt.patientId = ?
        ORDER BY dt.treatmentDate DESC
      `, [patientId]);
      const normalizedTreatments = (treatments || []).map((t) => {
        const paidAmount = t.paid !== undefined && t.paid !== null
          ? Number(t.paid)
          : (t.isPaid ? Number(t.cost || 0) : 0);
        return { ...t, paid: paidAmount };
      });
      return { success: true, data: normalizedTreatments };
    } catch (error) {
      console.error('Error getting treatments:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:getAllTreatments', async (event, filters = {}) => {
    try {
      let sql = `
        SELECT dt.*, p.firstName, p.lastName
        FROM dental_treatments dt
        LEFT JOIN patients p ON dt.patientId = p.id
        WHERE 1=1
      `;
      const params = [];

      if (filters.startDate) {
        sql += ' AND dt.treatmentDate >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        sql += ' AND dt.treatmentDate <= ?';
        params.push(filters.endDate);
      }
      if (filters.treatmentType) {
        sql += ' AND dt.treatmentType = ?';
        params.push(filters.treatmentType);
      }

      sql += ' ORDER BY dt.treatmentDate DESC';

      const treatments = await query(sql, params);
      const normalizedTreatments = (treatments || []).map((t) => {
        const paidAmount = t.paid !== undefined && t.paid !== null
          ? Number(t.paid)
          : (t.isPaid ? Number(t.cost || 0) : 0);
        return { ...t, paid: paidAmount };
      });
      return { success: true, data: normalizedTreatments };
    } catch (error) {
      console.error('Error getting all treatments:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:updateTreatment', async (event, id, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      // Validate state machine transition
      const existing = await queryOne(`SELECT status, planId FROM dental_treatments WHERE id = ?`, [id]);
      if (!existing) return { success: false, error: 'Traitement introuvable' };

      if (data.status && data.status !== existing.status) {
        const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
        if (!allowed.includes(data.status)) {
          return {
            success: false,
            error: `Transition de statut non autorisée : ${existing.status} → ${data.status}`
          };
        }
        // Block editing completed treatment unless admin override
        if (existing.status === 'completed' && !data._adminOverride) {
          return { success: false, error: 'Traitement terminé — modification réservée aux admins' };
        }
      }

      await run(`
        UPDATE dental_treatments SET
          toothNumber = ?, treatmentType = ?, surfaces = ?,
          description = ?, cost = ?, status = ?, planId = ?, notes = ?, updatedAt = ?
        WHERE id = ?`,
        [data.toothNumber, data.treatmentType, data.surfaces,
         data.description, data.cost, data.status || existing.status,
         data.planId || existing.planId, data.notes, now, id]
      );

      const planId = data.planId || existing.planId;
      if (planId) {
        await recalculatePlanTotals(planId);
      }
      if (existing.planId && planId && String(existing.planId) !== String(planId)) {
        await recalculatePlanTotals(existing.planId);
      }

      // If status → completed, check if all plan treatments are done
      if (data.status === 'completed' && planId) {
        const remaining = await queryOne(
          `SELECT COUNT(*) as cnt FROM dental_treatments
           WHERE planId = ? AND status != 'completed' AND status != 'cancelled'`,
          [planId]
        );
        if (Number(remaining?.cnt || 0) === 0) {
          broadcastRealtimeEvent({ type: 'plan:auto-close-check', planId });
        }
      }

      broadcastRealtimeEvent({
        type: 'dental:treatment-updated',
        patientId: data.patientId,
        toothNumber: data.toothNumber
      });

      return { success: true };
    } catch (error) {
      console.error('Error updating treatment:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:deleteTreatment', async (event, id) => {
    try {
      const treatment = await queryOne(`SELECT planId, cost FROM dental_treatments WHERE id = ?`, [id]);
      await run('DELETE FROM dental_treatments WHERE id = ?', [id]);

      // Recalculate plan cost after deletion
      if (treatment?.planId) {
        const totalCostRow = await queryOne(
          `SELECT COALESCE(SUM(cost), 0) as total FROM dental_treatments WHERE planId = ?`,
          [treatment.planId]
        );
        await run(
          `UPDATE treatment_plans SET totalCost = ?, updatedAt = ? WHERE id = ?`,
          [Number(totalCostRow?.total || 0), moment().format('YYYY-MM-DD HH:mm:ss'), treatment.planId]
        );
        await recalculatePlanTotals(treatment.planId);
        broadcastRealtimeEvent({ type: 'plan:updated', planId: treatment.planId });
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting treatment:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== DENTAL PLANS ==========

  ipcMain.handle('dental:createPlan', async (event, data) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      await run(`
        INSERT INTO dental_plans (id, patientId, title, description, startDate, endDate,
          estimatedCost, status, priority, treatments, notes, createdBy, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, data.patientId, data.title, data.description, data.startDate || now,
          data.endDate, data.estimatedCost || 0, data.status || 'active',
          data.priority || 'normal', JSON.stringify(data.treatments || []),
          data.notes, data.createdBy, now, now]);
      return { success: true, id };
    } catch (error) {
      console.error('Error creating dental plan:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:getPlans', async (event, patientId) => {
    try {
      const plans = await query('SELECT * FROM dental_plans WHERE patientId = ? ORDER BY createdAt DESC', [patientId]);
      return { success: true, data: plans };
    } catch (error) {
      console.error('Error getting dental plans:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:updatePlan', async (event, id, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      await run(`
        UPDATE dental_plans SET
          title = ?, description = ?, endDate = ?,
          estimatedCost = ?, actualCost = ?, status = ?,
          priority = ?, treatments = ?, notes = ?, updatedAt = ?
        WHERE id = ?
      `, [data.title, data.description, data.endDate,
          data.estimatedCost, data.actualCost, data.status,
          data.priority, JSON.stringify(data.treatments || []), data.notes, now, id]);
      return { success: true };
    } catch (error) {
      console.error('Error updating dental plan:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:deletePlan', async (event, id) => {
    try {
      await run('DELETE FROM dental_plans WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('Error deleting dental plan:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== DENTAL X-RAYS ==========

  ipcMain.handle('dental:createXray', async (event, data) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const xrayType = data.xrayType || data.type || 'radio';
      await runWithFallback(
        `INSERT INTO dental_xrays (id, patientId, xrayDate, xrayType, toothNumber, filePath, findings, notes, createdBy, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.patientId, data.xrayDate || now, xrayType,
          data.toothNumber, data.filePath, data.findings, data.notes, data.createdBy, now],
        `INSERT INTO dental_xrays (id, patientId, xrayDate, type, toothNumber, filePath, description, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.patientId, data.xrayDate || now, xrayType,
          data.toothNumber, data.filePath, data.description || data.findings || '', now]
      );
      return { success: true, id };
    } catch (error) {
      console.error('Error creating xray:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:getXrays', async (event, patientId) => {
    try {
      const xrays = await queryWithFallback(
        'SELECT id, patientId, xrayDate, xrayType as type, toothNumber, filePath, findings as description, notes, createdAt FROM dental_xrays WHERE patientId = ? ORDER BY xrayDate DESC',
        [patientId],
        'SELECT id, patientId, xrayDate, type, toothNumber, filePath, description, createdAt FROM dental_xrays WHERE patientId = ? ORDER BY xrayDate DESC',
        [patientId]
      );
      return { success: true, data: xrays };
    } catch (error) {
      console.error('Error getting xrays:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dental:deleteXray', async (event, id) => {
    try {
      await run('DELETE FROM dental_xrays WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('Error deleting xray:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== DENTAL STATS ==========

  ipcMain.handle('dental:getStats', async (event, patientId) => {
    try {
      let stats = {};
      if (patientId) {
        const totalTreatments = await queryOne(
          'SELECT COUNT(*) as count FROM dental_treatments WHERE patientId = ?', [patientId]);
        const totalCost = await queryOne(
          'SELECT COALESCE(SUM(cost), 0) as total FROM dental_treatments WHERE patientId = ?', [patientId]);
        const unpaid = await queryOneWithFallback(
          'SELECT COALESCE(SUM(GREATEST(cost - COALESCE(paid, 0), 0)), 0) as total FROM dental_treatments WHERE patientId = ?',
          [patientId],
          'SELECT COALESCE(SUM(cost), 0) as total FROM dental_treatments WHERE patientId = ? AND isPaid = 0',
          [patientId]
        );
        const teethAffected = await queryOne(
          'SELECT COUNT(DISTINCT toothNumber) as count FROM dental_teeth WHERE patientId = ? AND status != ?', [patientId, 'healthy']);
        const activePlans = await queryOne(
          "SELECT COUNT(*) as count FROM dental_plans WHERE patientId = ? AND status IN ('active', 'pending')",
          [patientId]
        );
        const totalImages = await queryOne(
          'SELECT COUNT(*) as count FROM dental_xrays WHERE patientId = ?',
          [patientId]
        );
        
        stats = {
          totalTreatments: totalTreatments?.count || 0,
          totalCost: totalCost?.total || 0,
          unpaidAmount: unpaid?.total || 0,
          teethAffected: teethAffected?.count || 0,
          activePlans: activePlans?.count || 0,
          totalImages: totalImages?.count || 0
        };
      } else {
        const totalPatients = await queryOne('SELECT COUNT(DISTINCT patientId) as count FROM dental_records');
        const totalTreatments = await queryOne('SELECT COUNT(*) as count FROM dental_treatments');
        const monthStart = moment().startOf('month').format('YYYY-MM-DD');
        const monthTreatments = await queryOne(
          'SELECT COUNT(*) as count FROM dental_treatments WHERE treatmentDate >= ?',
          [monthStart]
        );
        const totalRevenue = await queryOne('SELECT COALESCE(SUM(cost), 0) as total FROM dental_treatments');
        const activePlans = await queryOne(
          "SELECT COUNT(*) as count FROM dental_plans WHERE status IN ('active', 'pending')"
        );
        const totalImages = await queryOne('SELECT COUNT(*) as count FROM dental_xrays');
        
        stats = {
          totalPatients: totalPatients?.count || 0,
          totalTreatments: totalTreatments?.count || 0,
          monthTreatments: monthTreatments?.count || 0,
          totalRevenue: totalRevenue?.total || 0,
          activePlans: activePlans?.count || 0,
          totalImages: totalImages?.count || 0
        };
      }
      return { success: true, data: stats };
    } catch (error) {
      console.error('Error getting dental stats:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== TOOTH HISTORY ==========

  ipcMain.handle('dental:getToothHistory', async (event, patientId, toothNumber) => {
    try {
      const history = await query(`
        SELECT * FROM dental_treatments
        WHERE patientId = ? AND toothNumber = ?
        ORDER BY treatmentDate DESC
      `, [patientId, toothNumber]);
      return { success: true, data: history };
    } catch (error) {
      console.error('Error getting tooth history:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('Dentist events registered');
}
