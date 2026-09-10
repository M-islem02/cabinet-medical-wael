/**
 * Gestionnaire IPC pour le module Traumatologie & Chirurgie Orthopédique
 */

import { ipcMain } from 'electron';
import { query, queryOne, run, withTransaction } from '../database-unified.js';
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

async function recordTraumatoLesionSnapshot(data, recordedAt) {
  try {
    await run(
      `INSERT INTO traumato_lesions_history
         (id, patientId, boneCode, status, notes, recordedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), data.patientId, data.boneCode, data.status || 'healthy', data.notes || null, recordedAt]
    );
  } catch (err) {
    console.warn('Snapshot history error (non-fatal):', err.message);
  }
}

export function handleTraumatologyEvents() {

  // ========== TRAUMATOLOGY CLINICAL RECORDS ==========

  ipcMain.handle('traumato:getRecord', async (event, patientId) => {
    try {
      if (!patientId) return { success: false, error: 'Patient requis' };
      const record = await queryOne('SELECT * FROM traumato_records WHERE patientId = ?', [patientId]);
      return { success: true, data: record || null };
    } catch (error) {
      console.error('Error getting traumato record:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:saveRecord', async (event, data) => {
    try {
      if (!data || !data.patientId) return { success: false, error: 'Données ou patientId manquants' };
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const existing = await queryOne('SELECT id FROM traumato_records WHERE patientId = ?', [data.patientId]);

      if (existing) {
        await run(`
          UPDATE traumato_records SET
            generalNotes = ?, allergies = ?, bloodType = ?,
            mechanism = ?, accidentDate = ?, evaScore = ?,
            cauchoixStage = ?, neuroVascularExam = ?, compartmentSyndromeNotes = ?,
            lastVisitDate = ?, nextVisitDate = ?, updatedAt = ?
          WHERE patientId = ?
        `, [
          data.generalNotes ?? null,
          data.allergies ?? null,
          data.bloodType ?? null,
          data.mechanism ?? null,
          data.accidentDate ?? null,
          data.evaScore ?? 0,
          data.cauchoixStage ?? null,
          data.neuroVascularExam ?? null,
          data.compartmentSyndromeNotes ?? null,
          data.lastVisitDate ?? null,
          data.nextVisitDate ?? null,
          now,
          data.patientId
        ]);
        return { success: true, id: existing.id };
      } else {
        const id = uuidv4();
        await run(`
          INSERT INTO traumato_records (
            id, patientId, generalNotes, allergies, bloodType,
            mechanism, accidentDate, evaScore, cauchoixStage,
            neuroVascularExam, compartmentSyndromeNotes,
            lastVisitDate, nextVisitDate, createdAt, updatedAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id,
          data.patientId,
          data.generalNotes ?? null,
          data.allergies ?? null,
          data.bloodType ?? null,
          data.mechanism ?? null,
          data.accidentDate ?? null,
          data.evaScore ?? 0,
          data.cauchoixStage ?? null,
          data.neuroVascularExam ?? null,
          data.compartmentSyndromeNotes ?? null,
          data.lastVisitDate ?? null,
          data.nextVisitDate ?? null,
          now,
          now
        ]);
        return { success: true, id };
      }
    } catch (error) {
      console.error('Error saving traumato record:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== LESIONS / BONE STATUSES ==========

  ipcMain.handle('traumato:getLesions', async (event, patientId) => {
    try {
      if (!patientId) return { success: false, data: [] };
      const lesions = await query('SELECT * FROM traumato_lesions WHERE patientId = ? ORDER BY boneCode', [patientId]);
      return { success: true, data: lesions || [] };
    } catch (error) {
      console.error('Error getting traumato lesions:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:getLesionsAtDate', async (event, patientId, date) => {
    try {
      if (!patientId || !date) return { success: false, error: 'Patient et date requis' };
      const dateStr = String(date).substring(0, 10);
      const nextDay = moment(dateStr, 'YYYY-MM-DD').isValid()
        ? moment(dateStr, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD')
        : dateStr + ' 23:59:59';

      const [lesions, treatments, history] = await Promise.all([
        query(
          `SELECT * FROM traumato_lesions
           WHERE patientId = ? AND updatedAt < ?
           ORDER BY boneCode`,
          [patientId, nextDay]
        ),
        query(
          `SELECT * FROM traumato_treatments
           WHERE patientId = ? AND treatmentDate < ?
           ORDER BY treatmentDate DESC, createdAt DESC`,
          [patientId, nextDay]
        ),
        query(
          `SELECT DISTINCT ON (boneCode)
                  boneCode, status, notes, recordedAt
           FROM traumato_lesions_history
           WHERE patientId = ? AND recordedAt < ?
           ORDER BY boneCode, recordedAt DESC`,
          [patientId, nextDay]
        )
      ]);
      return { success: true, data: { lesions: lesions || [], treatments: treatments || [], history: history || [] } };
    } catch (error) {
      console.error('Error loading historical traumato schema:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:saveLesion', async (event, data) => {
    try {
      if (!data || !data.patientId || !data.boneCode) {
        return { success: false, error: 'patientId et boneCode requis' };
      }
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      await withTransaction(async () => {
        const existing = await queryOne(
          'SELECT id FROM traumato_lesions WHERE patientId = ? AND boneCode = ?',
          [data.patientId, data.boneCode]
        );

        if (existing) {
          await run(`
            UPDATE traumato_lesions SET
              boneName = ?, status = ?, side = ?,
              fractureClassification = ?, displacement = ?, treatmentMode = ?,
              notes = ?, updatedAt = ?
            WHERE id = ?
          `, [
            data.boneName || data.boneCode,
            data.status || 'healthy',
            data.side || 'unilateral',
            data.fractureClassification || null,
            data.displacement || null,
            data.treatmentMode || null,
            data.notes || null,
            now,
            existing.id
          ]);
        } else {
          const id = uuidv4();
          await run(`
            INSERT INTO traumato_lesions (
              id, patientId, boneCode, boneName, status, side,
              fractureClassification, displacement, treatmentMode, notes,
              createdAt, updatedAt
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            id,
            data.patientId,
            data.boneCode,
            data.boneName || data.boneCode,
            data.status || 'healthy',
            data.side || 'unilateral',
            data.fractureClassification || null,
            data.displacement || null,
            data.treatmentMode || null,
            data.notes || null,
            now,
            now
          ]);
        }
        await recordTraumatoLesionSnapshot(data, now);
      });

      broadcastRealtimeEvent({
        type: 'traumato:lesion-updated',
        patientId: data.patientId,
        boneCode: data.boneCode,
        status: data.status
      });

      return { success: true };
    } catch (error) {
      console.error('Error saving traumato lesion:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:saveMultipleLesions', async (event, patientId, lesionsData) => {
    try {
      if (!patientId || !Array.isArray(lesionsData)) {
        return { success: false, error: 'Paramètres invalides' };
      }
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      await withTransaction(async () => {
        for (const item of lesionsData) {
          const existing = await queryOne(
            'SELECT id FROM traumato_lesions WHERE patientId = ? AND boneCode = ?',
            [patientId, item.boneCode]
          );
          if (existing) {
            await run(`
              UPDATE traumato_lesions SET
                boneName = ?, status = ?, side = ?,
                fractureClassification = ?, displacement = ?, treatmentMode = ?,
                notes = ?, updatedAt = ?
              WHERE id = ?
            `, [
              item.boneName || item.boneCode,
              item.status || 'healthy',
              item.side || 'unilateral',
              item.fractureClassification || null,
              item.displacement || null,
              item.treatmentMode || null,
              item.notes || null,
              now,
              existing.id
            ]);
          } else {
            const id = uuidv4();
            await run(`
              INSERT INTO traumato_lesions (
                id, patientId, boneCode, boneName, status, side,
                fractureClassification, displacement, treatmentMode, notes,
                createdAt, updatedAt
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              id,
              patientId,
              item.boneCode,
              item.boneName || item.boneCode,
              item.status || 'healthy',
              item.side || 'unilateral',
              item.fractureClassification || null,
              item.displacement || null,
              item.treatmentMode || null,
              item.notes || null,
              now,
              now
            ]);
          }
          await recordTraumatoLesionSnapshot({ ...item, patientId }, now);
        }
      });
      return { success: true };
    } catch (error) {
      console.error('Error saving multiple traumato lesions:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== TREATMENTS & ACTS ==========

  ipcMain.handle('traumato:getTreatmentsByPatient', async (event, patientId) => {
    try {
      if (!patientId) return { success: false, data: {} };
      const treatments = await query(`
        SELECT boneCode, status, treatmentType, treatmentDate
        FROM traumato_treatments
        WHERE patientId = ?
        ORDER BY treatmentDate DESC
      `, [patientId]);
      const map = {};
      for (const t of (treatments || [])) {
        if (t.boneCode && !map[t.boneCode]) {
          map[t.boneCode] = t;
        }
      }
      return { success: true, data: map };
    } catch (error) {
      console.error('Error getting traumato treatments by patient:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:createTreatment', async (event, data) => {
    try {
      if (!data || !data.patientId || !data.treatmentType) {
        return { success: false, error: 'patientId et treatmentType requis' };
      }
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const planId = data.planId || null;

      await run(`
        INSERT INTO traumato_treatments
          (id, patientId, boneCode, treatmentDate, treatmentType,
           description, cost, paid, isPaid, status, planId, doctorId, notes, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.patientId,
          data.boneCode || null,
          data.treatmentDate || now,
          data.treatmentType,
          data.description || null,
          Number(data.cost || 0),
          Number(data.paid || 0),
          Boolean(data.isPaid),
          data.status || 'completed',
          planId,
          data.doctorId || null,
          data.notes || null,
          now,
          now
        ]
      );

      if (planId && Number(data.cost) > 0) {
        try {
          await recalculatePlanTotals(planId);
          broadcastRealtimeEvent({ type: 'plan:updated', planId });
        } catch (e) {
          console.warn('Could not update plan cost:', e.message);
        }
      }

      broadcastRealtimeEvent({
        type: 'traumato:treatment-updated',
        patientId: data.patientId,
        boneCode: data.boneCode
      });

      return { success: true, id, planId };
    } catch (error) {
      console.error('Error creating traumato treatment:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:getTreatments', async (event, patientId) => {
    try {
      if (!patientId) return { success: false, data: [] };
      const treatments = await query(`
        SELECT tt.*, p.firstName, p.lastName
        FROM traumato_treatments tt
        LEFT JOIN patients p ON tt.patientId = p.id
        WHERE tt.patientId = ?
        ORDER BY tt.treatmentDate DESC
      `, [patientId]);
      const normalized = (treatments || []).map((t) => ({
        ...t,
        cost: Number(t.cost || 0),
        paid: Number(t.paid || (t.isPaid ? t.cost : 0))
      }));
      return { success: true, data: normalized };
    } catch (error) {
      console.error('Error getting traumato treatments:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:getAllTreatments', async (event, filters = {}) => {
    try {
      let sql = `
        SELECT tt.*, p.firstName, p.lastName
        FROM traumato_treatments tt
        LEFT JOIN patients p ON tt.patientId = p.id
        WHERE 1=1
      `;
      const params = [];

      if (filters.startDate) {
        sql += ' AND tt.treatmentDate >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        sql += ' AND tt.treatmentDate <= ?';
        params.push(filters.endDate);
      }
      if (filters.treatmentType) {
        sql += ' AND tt.treatmentType = ?';
        params.push(filters.treatmentType);
      }

      sql += ' ORDER BY tt.treatmentDate DESC';

      const treatments = await query(sql, params);
      const normalized = (treatments || []).map((t) => ({
        ...t,
        cost: Number(t.cost || 0),
        paid: Number(t.paid || (t.isPaid ? t.cost : 0))
      }));
      return { success: true, data: normalized };
    } catch (error) {
      console.error('Error getting all traumato treatments:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:updateTreatment', async (event, id, data) => {
    try {
      if (!id || !data) return { success: false, error: 'Données manquantes' };
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const existing = await queryOne(`SELECT status, planId FROM traumato_treatments WHERE id = ?`, [id]);
      if (!existing) return { success: false, error: 'Traitement introuvable' };

      if (data.status && data.status !== existing.status) {
        const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
        if (!allowed.includes(data.status)) {
          return {
            success: false,
            error: `Transition de statut non autorisée : ${existing.status} → ${data.status}`
          };
        }
      }

      await run(`
        UPDATE traumato_treatments SET
          boneCode = ?, treatmentType = ?, description = ?,
          cost = ?, paid = ?, isPaid = ?, status = ?, planId = ?, notes = ?, updatedAt = ?
        WHERE id = ?`,
        [
          data.boneCode ?? null,
          data.treatmentType,
          data.description ?? null,
          Number(data.cost ?? 0),
          Number(data.paid ?? 0),
          Boolean(data.isPaid),
          data.status || existing.status,
          data.planId || existing.planId,
          data.notes ?? null,
          now,
          id
        ]
      );

      const planId = data.planId || existing.planId;
      if (planId) {
        await recalculatePlanTotals(planId);
      }

      broadcastRealtimeEvent({
        type: 'traumato:treatment-updated',
        patientId: data.patientId,
        boneCode: data.boneCode
      });

      return { success: true };
    } catch (error) {
      console.error('Error updating traumato treatment:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:deleteTreatment', async (event, id) => {
    try {
      if (!id) return { success: false, error: 'ID requis' };
      const treatment = await queryOne(`SELECT planId FROM traumato_treatments WHERE id = ?`, [id]);
      await run('DELETE FROM traumato_treatments WHERE id = ?', [id]);

      if (treatment?.planId) {
        await recalculatePlanTotals(treatment.planId);
        broadcastRealtimeEvent({ type: 'plan:updated', planId: treatment.planId });
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting traumato treatment:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== PLANS ==========

  ipcMain.handle('traumato:createPlan', async (event, data) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      await run(`
        INSERT INTO traumato_plans (id, patientId, title, description, startDate, endDate,
          estimatedCost, status, priority, treatments, notes, createdBy, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        data.patientId,
        data.title || 'Plan de soins traumatologique',
        data.description || null,
        data.startDate || now,
        data.endDate || null,
        data.estimatedCost || 0,
        data.status || 'active',
        data.priority || 'normal',
        JSON.stringify(data.treatments || []),
        data.notes || null,
        data.createdBy || null,
        now,
        now
      ]);
      return { success: true, id };
    } catch (error) {
      console.error('Error creating traumato plan:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:getPlans', async (event, patientId) => {
    try {
      if (!patientId) return { success: false, data: [] };
      const plans = await query('SELECT * FROM traumato_plans WHERE patientId = ? ORDER BY createdAt DESC', [patientId]);
      return { success: true, data: plans || [] };
    } catch (error) {
      console.error('Error getting traumato plans:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:updatePlan', async (event, id, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      await run(`
        UPDATE traumato_plans SET
          title = ?, description = ?, endDate = ?,
          estimatedCost = ?, actualCost = ?, status = ?,
          priority = ?, treatments = ?, notes = ?, updatedAt = ?
        WHERE id = ?
      `, [
        data.title,
        data.description,
        data.endDate,
        data.estimatedCost,
        data.actualCost,
        data.status,
        data.priority,
        JSON.stringify(data.treatments || []),
        data.notes,
        now,
        id
      ]);
      return { success: true };
    } catch (error) {
      console.error('Error updating traumato plan:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:deletePlan', async (event, id) => {
    try {
      await run('DELETE FROM traumato_plans WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('Error deleting traumato plan:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== IMAGING (X-RAYS, CT, MRI, ECHO) ==========

  ipcMain.handle('traumato:createImaging', async (event, data) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      await run(
        `INSERT INTO traumato_imaging (id, patientId, imagingDate, imagingType, boneCode, filePath, findings, notes, createdBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.patientId,
          data.imagingDate || now,
          data.imagingType || data.type || 'Radiographie',
          data.boneCode || null,
          data.filePath || null,
          data.findings || data.description || '',
          data.notes || '',
          data.createdBy || null,
          now
        ]
      );
      return { success: true, id };
    } catch (error) {
      console.error('Error creating traumato imaging:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:getImaging', async (event, patientId) => {
    try {
      if (!patientId) return { success: false, data: [] };
      const items = await query(
        'SELECT id, patientId, imagingDate, imagingType, boneCode, filePath, findings, notes, createdAt FROM traumato_imaging WHERE patientId = ? ORDER BY imagingDate DESC',
        [patientId]
      );
      return { success: true, data: items || [] };
    } catch (error) {
      console.error('Error getting traumato imaging:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('traumato:deleteImaging', async (event, id) => {
    try {
      await run('DELETE FROM traumato_imaging WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('Error deleting traumato imaging:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== STATS ==========

  ipcMain.handle('traumato:getStats', async (event, patientId) => {
    try {
      let stats = {};
      if (patientId) {
        const totalTreatments = await queryOne(
          'SELECT COUNT(*) as count FROM traumato_treatments WHERE patientId = ?', [patientId]);
        const totalCost = await queryOne(
          'SELECT COALESCE(SUM(cost), 0) as total FROM traumato_treatments WHERE patientId = ?', [patientId]);
        const unpaid = await queryOne(
          'SELECT COALESCE(SUM(GREATEST(cost - COALESCE(paid, 0), 0)), 0) as total FROM traumato_treatments WHERE patientId = ?', [patientId]);
        const lesionsCount = await queryOne(
          "SELECT COUNT(DISTINCT boneCode) as count FROM traumato_lesions WHERE patientId = ? AND status != 'healthy'", [patientId]);
        const activePlans = await queryOne(
          "SELECT COUNT(*) as count FROM traumato_plans WHERE patientId = ? AND status IN ('active', 'pending')", [patientId]);
        const totalImages = await queryOne(
          'SELECT COUNT(*) as count FROM traumato_imaging WHERE patientId = ?', [patientId]);

        stats = {
          totalTreatments: Number(totalTreatments?.count || 0),
          totalCost: Number(totalCost?.total || 0),
          unpaidAmount: Number(unpaid?.total || 0),
          lesionsCount: Number(lesionsCount?.count || 0),
          activePlans: Number(activePlans?.count || 0),
          totalImages: Number(totalImages?.count || 0)
        };
      } else {
        const totalPatients = await queryOne('SELECT COUNT(DISTINCT patientId) as count FROM traumato_records');
        const totalTreatments = await queryOne('SELECT COUNT(*) as count FROM traumato_treatments');
        const monthStart = moment().startOf('month').format('YYYY-MM-DD');
        const monthTreatments = await queryOne(
          'SELECT COUNT(*) as count FROM traumato_treatments WHERE treatmentDate >= ?', [monthStart]);
        const totalRevenue = await queryOne('SELECT COALESCE(SUM(cost), 0) as total FROM traumato_treatments');
        const activePlans = await queryOne(
          "SELECT COUNT(*) as count FROM traumato_plans WHERE status IN ('active', 'pending')");
        const totalImages = await queryOne('SELECT COUNT(*) as count FROM traumato_imaging');

        stats = {
          totalPatients: Number(totalPatients?.count || 0),
          totalTreatments: Number(totalTreatments?.count || 0),
          monthTreatments: Number(monthTreatments?.count || 0),
          totalRevenue: Number(totalRevenue?.total || 0),
          activePlans: Number(activePlans?.count || 0),
          totalImages: Number(totalImages?.count || 0)
        };
      }
      return { success: true, data: stats };
    } catch (error) {
      console.error('Error getting traumato stats:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== BONE HISTORY ==========

  ipcMain.handle('traumato:getBoneHistory', async (event, patientId, boneCode) => {
    try {
      if (!patientId || !boneCode) return { success: false, data: [] };
      const history = await query(`
        SELECT * FROM traumato_treatments
        WHERE patientId = ? AND boneCode = ?
        ORDER BY treatmentDate DESC
      `, [patientId, boneCode]);
      return { success: true, data: history || [] };
    } catch (error) {
      console.error('Error getting bone history:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('Traumatology events registered');
}
