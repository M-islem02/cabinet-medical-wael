/**
 * Gestionnaire IPC — Module Plans de Traitement
 * Sous-plan D: plans multi-séances avec suivi financier intégré
 */

import { ipcMain } from 'electron';
import { query, queryOne, run, withTransaction } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { broadcastRealtimeEvent } from '../realtime-server.js';
import { registerValidatedContractHandler } from '../ipc/contract-handler.js';

// ─── State machine ───────────────────────────────────────────────────────────
const ALLOWED_STATUS_TRANSITIONS = {
  active: ['completed', 'archived', 'cancelled'],
  completed: ['active', 'archived', 'cancelled'],
  archived: ['active'],
  cancelled: ['active', 'archived']
};

function validateStatusTransition(from, to) {
  const allowed = ALLOWED_STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function recalculatePlanTotals(planId) {
  try {
    const treatmentsRow = await queryOne(
      `SELECT COUNT(*) as treatmentCount, COALESCE(SUM(cost), 0) as totalCost
       FROM dental_treatments
       WHERE planId = ?`,
      [planId]
    ).catch(() => ({ treatmentCount: 0, totalCost: 0 }));
    const sessionsRow = await queryOne(
      `SELECT COALESCE(SUM(paidAmount), 0) as totalPaid FROM plan_payment_sessions WHERE planId = ?`,
      [planId]
    );
    const totalPaid = Number(sessionsRow?.totalPaid || 0);
    const plan = await queryOne(`SELECT totalCost, status FROM treatment_plans WHERE id = ?`, [planId]);
    if (!plan) return;

    const treatmentCount = Number(treatmentsRow?.treatmentCount || 0);
    const totalCost = treatmentCount > 0
      ? Number(treatmentsRow?.totalCost || 0)
      : Number(plan.totalCost || 0);
    const newStatus = (totalPaid >= totalCost && totalCost > 0 && plan.status === 'active')
      ? 'completed'
      : plan.status;

    await run(
      `UPDATE treatment_plans SET totalCost = ?, totalPaid = ?, status = ?, updatedAt = ? WHERE id = ?`,
      [totalCost, totalPaid, newStatus, moment().format('YYYY-MM-DD HH:mm:ss'), planId]
    );

    return { totalCost, totalPaid, newStatus };
  } catch (err) {
    console.error('Error recalculating plan totals:', err);
    throw err;
  }
}

async function assertSingleActivePlan(patientId, excludeId = null) {
  const params = [patientId];
  let sql = `SELECT id FROM treatment_plans WHERE patientId = ? AND status = 'active'`;
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  sql += ' LIMIT 1';
  const existing = await queryOne(sql, params);
  if (existing?.id) {
    return {
      success: false,
      error: 'Ce patient possède déjà un plan actif. Archivez ou terminez le plan actif avant d’en créer un autre.'
    };
  }
  return { success: true };
}

function getUserFinancialContext() {
  const role = String(global.currentUser?.role || '').trim();
  return {
    role,
    userId: global.currentUser?.id || null,
    isSuperAdmin: !!global.currentUser?.isSuperAdmin,
    isDoctorAdmin: !!global.currentUser?.isAdmin && !global.currentUser?.isSuperAdmin,
    isPractitioner: role === 'doctor' || role === 'dentist'
  };
}

function canSeeAllPlanFinancials() {
  const context = getUserFinancialContext();
  return context.isSuperAdmin || context.isDoctorAdmin || context.isPractitioner;
}

function applyPlanFinancialVisibility(plan) {
  if (canSeeAllPlanFinancials()) return plan;
  return {
    ...plan,
    totalCost: null,
    totalPaid: null,
    balance: null
  };
}

function applySessionFinancialVisibility(session) {
  if (canSeeAllPlanFinancials()) return session;
  const today = moment().format('YYYY-MM-DD');
  const isTodayPayment = String(session.paidDate || '').startsWith(today);
  return {
    ...session,
    expectedAmount: null,
    paidAmount: isTodayPayment ? session.paidAmount : null
  };
}

// ─── Handler registration ─────────────────────────────────────────────────────
export function handleTreatmentPlanEvents() {

  // ── CREATE ────────────────────────────────────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'create', async (event, data) => {
    try {
      if (!data?.patientId) return { success: false, error: 'patientId requis' };
      if (!data?.title) return { success: false, error: 'Titre requis' };
      if (Number(data.totalCost) < 0) return { success: false, error: 'Coût invalide' };
      return await withTransaction(async () => {
      await queryOne('SELECT pg_advisory_xact_lock(hashtext(?))', [`active-plan:${data.patientId}`]);

      const initialStatus = ['active', 'archived', 'cancelled'].includes(data.status)
        ? data.status
        : 'active';
      if (initialStatus === 'active') {
        const activeCheck = await assertSingleActivePlan(data.patientId);
        if (!activeCheck.success) return activeCheck;
      }

      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const sessionsCount = Math.max(1, parseInt(data.sessionsCount || 1));

      await run(
        `INSERT INTO treatment_plans
          (id, patientId, title, treatmentType, description, specialty, totalCost, sessionsCount, sessions, startDate, status, createdBy, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.patientId, data.title, data.treatmentType || null,
          data.description || null, data.specialty || 'dentistry',
          Number(data.totalCost || 0), sessionsCount, sessionsCount, data.startDate || now.slice(0, 10),
          initialStatus, data.createdBy || null, data.notes || null, now, now]
      );

      if (sessionsCount >= 1) {
        for (let i = 1; i <= sessionsCount; i++) {
          await run(
            `INSERT INTO plan_payment_sessions (id, planId, sessionNumber, expectedAmount, status, createdAt)
             VALUES (?, ?, ?, ?, 'pending', ?)`,
            [uuidv4(), id, i, 0, now]
          );
        }
      }

      broadcastRealtimeEvent({ type: 'plan:created', planId: id, patientId: data.patientId });
      return { success: true, id };
      });
    } catch (err) {
      console.error('Error creating plan:', err);
      return { success: false, error: err.message };
    }
  });

  // ── GET ALL ───────────────────────────────────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'getAll', async (event, filters = {}) => {
    try {
      let sql = `
        SELECT tp.*, p.firstName, p.lastName,
               (tp.totalCost - tp.totalPaid) as balance,
               EXISTS (
                 SELECT 1 FROM plan_payment_sessions pps
                 WHERE pps.planId = tp.id
                   AND (COALESCE(pps.paidAmount, 0) > 0 OR pps.paymentId IS NOT NULL OR pps.status = 'paid')
               ) AS hasCollectedPayment
        FROM treatment_plans tp
        LEFT JOIN patients p ON p.id = tp.patientId
        WHERE 1=1
      `;
      const params = [];

      if (filters.patientId) { sql += ' AND tp.patientId = ?'; params.push(filters.patientId); }
      if (filters.status) { sql += ' AND tp.status = ?'; params.push(filters.status); }
      if (filters.specialty) { sql += ' AND tp.specialty = ?'; params.push(filters.specialty); }
      if (filters.createdBy) { sql += ' AND tp.createdBy = ?'; params.push(filters.createdBy); }
      if (filters.search) {
        const term = `%${filters.search}%`;
        sql += ` AND (p.firstName LIKE ? OR p.lastName LIKE ? OR (p.lastName || ' ' || p.firstName) LIKE ? OR (p.firstName || ' ' || p.lastName) LIKE ?)`;
        params.push(term, term, term, term);
      }

      sql += ' ORDER BY tp.createdAt DESC';

      const plans = await query(sql, params);
      return { success: true, data: (plans || []).map(applyPlanFinancialVisibility) };
    } catch (err) {
      console.error('Error getting plans:', err);
      return { success: false, error: err.message };
    }
  });

  // ── GET BY PATIENT ────────────────────────────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'getByPatient', async (event, patientId) => {
    try {
      if (!patientId) return { success: false, error: 'patientId requis' };
      const plans = await query(
        `SELECT tp.*, (tp.totalCost - tp.totalPaid) as balance
         FROM treatment_plans tp
         WHERE tp.patientId = ?
         ORDER BY tp.createdAt DESC`,
        [patientId]
      );

      // Attach sessions to each plan
      const enriched = await Promise.all((plans || []).map(async (plan) => {
        const sessions = await query(
          `SELECT * FROM plan_payment_sessions WHERE planId = ? ORDER BY sessionNumber`,
          [plan.id]
        );
        return {
          ...applyPlanFinancialVisibility(plan),
          sessions: (sessions || []).map(applySessionFinancialVisibility)
        };
      }));

      return { success: true, data: enriched };
    } catch (err) {
      console.error('Error getting plans by patient:', err);
      return { success: false, error: err.message };
    }
  });

  // ── GET BY ID ─────────────────────────────────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'getById', async (event, id) => {
    try {
      const plan = await queryOne(
        `SELECT tp.*, p.firstName, p.lastName, (tp.totalCost - tp.totalPaid) as balance
         FROM treatment_plans tp
         LEFT JOIN patients p ON p.id = tp.patientId
         WHERE tp.id = ?`,
        [id]
      );
      if (!plan) return { success: false, error: 'Plan introuvable' };

      const sessions = await query(
        `SELECT pps.*, pay.paymentMethod
         FROM plan_payment_sessions pps
         LEFT JOIN payments pay ON pay.id = pps.paymentId
         WHERE pps.planId = ?
         ORDER BY pps.sessionNumber`,
        [id]
      );
      const treatments = await query(
        `SELECT * FROM dental_treatments WHERE planId = ? ORDER BY treatmentDate`,
        [id]
      );
      const equipment = await query(
        `SELECT peu.*, COALESCE(e.name, i.name) as equipmentName,
                e.category as equipmentCategory, e.status as equipmentStatus
         FROM plan_equipment_usage peu
         LEFT JOIN inventory i ON peu.inventoryId = i.id
         LEFT JOIN equipment e ON peu.equipmentId = e.id
         WHERE peu.planId = ? ORDER BY peu.createdAt DESC`,
        [id]
      );

      return {
        success: true,
        data: {
          ...applyPlanFinancialVisibility(plan),
          sessions: (sessions || []).map(applySessionFinancialVisibility),
          treatments: treatments || [],
          equipment: equipment || []
        }
      };
    } catch (err) {
      console.error('Error getting plan by id:', err);
      return { success: false, error: err.message };
    }
  });

  // ── UPDATE ────────────────────────────────────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'update', async (event, id, data) => {
    try {
      return await withTransaction(async () => {
      const plan = await queryOne(`SELECT patientId, status FROM treatment_plans WHERE id = ? FOR UPDATE`, [id]);
      if (!plan) return { success: false, error: 'Plan introuvable' };
      if (plan.status === 'archived') {
        return { success: false, error: 'Un plan archivé doit être désarchivé avant modification.' };
      }
      const context = getUserFinancialContext();
      if (plan.status === 'completed' && !(data._adminOverride || context.isSuperAdmin || context.isDoctorAdmin || context.isPractitioner)) {
        return { success: false, error: 'Plan terminé — modification réservée aux admins' };
      }
      if (data.status && data.status !== plan.status) {
        if (plan.status === 'completed' && data.status !== 'completed' && !(context.isSuperAdmin || context.isDoctorAdmin || context.isPractitioner || data._adminOverride)) {
          return { success: false, error: 'Réouverture réservée à un administrateur.' };
        }
        if (!validateStatusTransition(plan.status, data.status) && !data._adminOverride) {
          return { success: false, error: `Transition de statut non autorisée : ${plan.status} → ${data.status}` };
        }
        if (data.status === 'active') {
          await queryOne('SELECT pg_advisory_xact_lock(hashtext(?))', [`active-plan:${plan.patientId}`]);
          const activeCheck = await assertSingleActivePlan(plan.patientId, id);
          if (!activeCheck.success) return activeCheck;
        }
      }

      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const treatments = await queryOne(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(cost), 0) as total FROM dental_treatments WHERE planId = ?`,
        [id]
      ).catch(() => ({ cnt: 0, total: 0 }));
      const totalCost = Number(treatments?.cnt || 0) > 0
        ? Number(treatments?.total || 0)
        : Number(data.totalCost || 0);
      await run(
        `UPDATE treatment_plans SET
          title = ?, treatmentType = ?, description = ?,
          totalCost = ?, sessionsCount = ?, status = ?,
          notes = ?, updatedAt = ?
         WHERE id = ?`,
        [data.title, data.treatmentType || null, data.description || null,
        totalCost, Math.max(1, parseInt(data.sessionsCount || 1)),
        data.status || plan.status, data.notes || null, now, id]
      );

      await recalculatePlanTotals(id);
      broadcastRealtimeEvent({ type: 'plan:updated', planId: id });
      return { success: true };
      });
    } catch (err) {
      console.error('Error updating plan:', err);
      return { success: false, error: err.message };
    }
  });

  registerValidatedContractHandler(ipcMain, 'plans', 'updateStatus', async (event, id, status) => {
    try {
      return await withTransaction(async () => {
        const plan = await queryOne('SELECT patientId, status FROM treatment_plans WHERE id = ? FOR UPDATE', [id]);
        if (!plan) return { success: false, error: 'Plan introuvable' };
        if (plan.status === status) return { success: true };

        const context = getUserFinancialContext();
        if (!(context.isSuperAdmin || context.isDoctorAdmin || context.isPractitioner)) {
          return { success: false, error: 'Modification du statut réservée au praticien' };
        }
        if (!validateStatusTransition(plan.status, status)) {
          return { success: false, error: `Transition de statut non autorisée : ${plan.status} → ${status}` };
        }
        if (status === 'active') {
          await queryOne('SELECT pg_advisory_xact_lock(hashtext(?))', [`active-plan:${plan.patientId}`]);
          const activeCheck = await assertSingleActivePlan(plan.patientId, id);
          if (!activeCheck.success) return activeCheck;
        }

        if (status === 'archived' || status === 'cancelled') {
          const requests = await query(
            `SELECT paymentRequestId FROM plan_payment_sessions
             WHERE planId = ? AND paymentRequestId IS NOT NULL`,
            [id]
          );
          const requestIds = (requests || []).map((row) => row.paymentRequestId).filter(Boolean);
          for (const requestId of requestIds) {
            await run('UPDATE user_notifications SET isRead = 1 WHERE id = ?', [requestId]);
            broadcastRealtimeEvent({ type: 'payment-request:updated', id: requestId });
          }
          await run(
            `UPDATE plan_payment_sessions
             SET status = CASE WHEN status = 'requested' THEN 'pending' ELSE status END,
                 paymentRequestId = NULL
             WHERE planId = ?`,
            [id]
          );
        }

        await run(
          'UPDATE treatment_plans SET status = ?, updatedAt = ? WHERE id = ?',
          [status, moment().format('YYYY-MM-DD HH:mm:ss'), id]
        );
        broadcastRealtimeEvent({ type: 'plan:updated', planId: id, patientId: plan.patientId });
        return { success: true };
      });
    } catch (err) {
      console.error('Error updating plan status:', err);
      return { success: false, error: err.message };
    }
  });

  // ── ARCHIVE (soft-delete) ─────────────────────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'archive', async (event, id) => {
    try {
      await run(
        `UPDATE treatment_plans SET status = 'archived', updatedAt = ? WHERE id = ?`,
        [moment().format('YYYY-MM-DD HH:mm:ss'), id]
      );
      broadcastRealtimeEvent({ type: 'plan:updated', planId: id });
      return { success: true };
    } catch (err) {
      console.error('Error archiving plan:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('plans:unarchive', async (event, id) => {
    try {
      const plan = await queryOne(`SELECT patientId, status FROM treatment_plans WHERE id = ?`, [id]);
      if (!plan) return { success: false, error: 'Plan introuvable' };
      if (plan.status !== 'archived') return { success: false, error: 'Ce plan n’est pas archivé.' };

      const activeCheck = await assertSingleActivePlan(plan.patientId, id);
      if (!activeCheck.success) return activeCheck;

      await run(
        `UPDATE treatment_plans SET status = 'active', updatedAt = ? WHERE id = ?`,
        [moment().format('YYYY-MM-DD HH:mm:ss'), id]
      );
      broadcastRealtimeEvent({ type: 'plan:updated', planId: id });
      return { success: true };
    } catch (err) {
      console.error('Error unarchiving plan:', err);
      return { success: false, error: err.message };
    }
  });

  // ── DELETE (bloqué si données liées) ─────────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'delete', async (event, id) => {
    try {
      return await withTransaction(async () => {
      const plan = await queryOne(`SELECT totalPaid, status FROM treatment_plans WHERE id = ? FOR UPDATE`, [id]);
      if (!plan) return { success: false, error: 'Plan introuvable' };
      const paymentEvidence = await queryOne(
        `SELECT COUNT(*) AS count
         FROM plan_payment_sessions
         WHERE planId = ?
           AND (COALESCE(paidAmount, 0) > 0 OR paymentId IS NOT NULL OR status = 'paid')`,
        [id]
      );

      if (Number(plan.totalPaid || 0) > 0 || Number(paymentEvidence?.count || 0) > 0) {
        return {
          success: false,
          error: 'Ce plan contient des paiements — archivez-le plutôt que de le supprimer.'
        };
      }

      const pendingRequests = await query(
        'SELECT paymentRequestId FROM plan_payment_sessions WHERE planId = ? AND paymentRequestId IS NOT NULL',
        [id]
      );
      for (const request of pendingRequests || []) {
        await run('UPDATE user_notifications SET isRead = 1 WHERE id = ?', [request.paymentRequestId]);
        broadcastRealtimeEvent({ type: 'payment-request:updated', id: request.paymentRequestId });
      }
      await run(`DELETE FROM plan_payment_sessions WHERE planId = ?`, [id]);
      await run(`DELETE FROM treatment_plans WHERE id = ?`, [id]);
      broadcastRealtimeEvent({ type: 'plan:deleted', planId: id });
      return { success: true };
      });
    } catch (err) {
      console.error('Error deleting plan:', err);
      return { success: false, error: err.message };
    }
  });

  // ── ADD PAYMENT SESSION ───────────────────────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'addPaymentSession', async (event, data) => {
    try {
      const { planId, sessionId: requestedSessionId, paidAmount, scheduledDate, paidDate, paymentMethod, notes, recordedBy } = data || {};
      if (!planId) return { success: false, error: 'planId requis' };
      return await withTransaction(async () => {

      await recalculatePlanTotals(planId);
      const plan = await queryOne(`SELECT * FROM treatment_plans WHERE id = ? FOR UPDATE`, [planId]);
      if (!plan) return { success: false, error: 'Plan introuvable' };
      if (!['active', 'completed'].includes(plan.status)) {
        return { success: false, error: 'Ce plan doit être actif ou terminé pour enregistrer un paiement.' };
      }

      const balance = plan.totalCost - plan.totalPaid;
      const amount = Number(paidAmount || 0);

      if (amount <= 0) return { success: false, error: 'Montant invalide' };
      if (amount > balance + 0.01) {
        return {
          success: false,
          error: `Paiement (${amount.toLocaleString()} DA) dépasse le solde restant (${balance.toLocaleString()} DA)`
        };
      }

      let pendingSession = null;
      if (requestedSessionId) {
        pendingSession = await queryOne(
          `SELECT * FROM plan_payment_sessions
           WHERE id = ? AND planId = ? FOR UPDATE`,
          [requestedSessionId, planId]
        );
        if (!pendingSession) return { success: false, error: 'Séance introuvable' };
        if (pendingSession.status === 'paid' || Number(pendingSession.paidAmount || 0) > 0) {
          return { success: false, error: 'Cette séance est déjà encaissée.' };
        }
      } else {
        pendingSession = await queryOne(
          `SELECT * FROM plan_payment_sessions
           WHERE planId = ? AND status != 'paid'
           ORDER BY sessionNumber ASC LIMIT 1 FOR UPDATE`,
          [planId]
        );
      }
      const lastSession = pendingSession ? null : await queryOne(
        `SELECT MAX(sessionNumber) as maxN FROM plan_payment_sessions WHERE planId = ?`, [planId]
      );
      const sessionNumber = pendingSession
        ? Number(pendingSession.sessionNumber)
        : (Number(lastSession?.maxN || 0)) + 1;

      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const sessionId = pendingSession?.id || uuidv4();
      const paymentId = uuidv4();
      const description = `Séance ${sessionNumber}/${plan.sessionsCount || sessionNumber} — ${plan.title || 'Plan de traitement'}`;
      await run(
        `INSERT INTO payments
         (id, patientId, consultationId, amount, paymentDate, paymentMethod, description, notes, createdAt, updatedAt)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, plan.patientId, amount, paidDate || now, paymentMethod || 'Espèces', description, notes || null, now, now]
      );
      if (pendingSession) {
        const pendingRequestId = pendingSession.paymentRequestId || null;
        await run(
          `UPDATE plan_payment_sessions
           SET scheduledDate = ?, paidDate = ?, paidAmount = ?, status = 'paid', notes = ?, recordedBy = ?, paymentId = ?, paymentRequestId = NULL
           WHERE id = ?`,
          [scheduledDate || pendingSession.scheduledDate || paidDate || now,
            paidDate || now, amount, notes || pendingSession.notes || null,
            recordedBy || null, paymentId, sessionId]
        );
        if (pendingRequestId) {
          await run('UPDATE user_notifications SET isRead = 1 WHERE id = ?', [pendingRequestId]);
          broadcastRealtimeEvent({ type: 'payment-request:updated', id: pendingRequestId });
        }
      } else {
        await run(
          `INSERT INTO plan_payment_sessions
            (id, planId, sessionNumber, scheduledDate, paidDate, expectedAmount, paidAmount, status, notes, recordedBy, paymentId, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)`,
          [sessionId, planId, sessionNumber,
            scheduledDate || paidDate || now,
            paidDate || now,
            amount, amount, notes || null, recordedBy || null, paymentId, now]
        );
      }

      const result = await recalculatePlanTotals(planId);
      broadcastRealtimeEvent({ type: 'plan:payment-recorded', planId, patientId: plan.patientId });

      return {
        success: true,
        id: sessionId,
        paymentId,
        newBalance: canSeeAllPlanFinancials()
          ? Number(result?.totalCost ?? plan.totalCost) - Number(result?.totalPaid ?? (Number(plan.totalPaid || 0) + amount))
          : null,
        autoClosed: result?.newStatus === 'completed'
      };
      });
    } catch (err) {
      console.error('Error adding payment session:', err);
      return { success: false, error: err.message };
    }
  });

  // ── UPDATE EXISTING PAYMENT SESSION ───────────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'updateSessionPayment', async (event, data = {}) => {
    try {
      const { planId, sessionId, paidAmount, paidDate, paymentMethod, notes, recordedBy } = data || {};
      if (!planId || !sessionId) return { success: false, error: 'planId et sessionId requis' };

      const context = getUserFinancialContext();
      if (!context.userId) {
        return { success: false, error: 'Authentification requise.' };
      }
      return await withTransaction(async () => {

      const session = await queryOne(
        `SELECT * FROM plan_payment_sessions WHERE id = ? AND planId = ? FOR UPDATE`,
        [sessionId, planId]
      );
      if (!session) return { success: false, error: 'Séance introuvable' };

      const plan = await queryOne(`SELECT * FROM treatment_plans WHERE id = ? FOR UPDATE`, [planId]);
      if (!plan) return { success: false, error: 'Plan introuvable' };

      const amount = Number(paidAmount || 0);
      if (amount <= 0) return { success: false, error: 'Montant invalide' };

      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const resolvedPaidDate = paidDate || now;
      let paymentId = session.paymentId || null;
      const pendingRequestId = session.paymentRequestId || null;

      if (paymentId) {
        await run(
          `UPDATE payments
           SET amount = ?, paymentDate = ?, paymentMethod = ?, notes = ?, updatedAt = ?
           WHERE id = ?`,
          [amount, resolvedPaidDate, paymentMethod || 'Espèces', notes || null, now, paymentId]
        );
      } else {
        paymentId = uuidv4();
        const description = `Séance ${session.sessionNumber || ''}/${plan.sessionsCount || session.sessionNumber || 1} — ${plan.title || 'Plan de traitement'}`;
        await run(
          `INSERT INTO payments
           (id, patientId, consultationId, amount, paymentDate, paymentMethod, description, notes, createdAt, updatedAt)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
          [paymentId, plan.patientId, amount, resolvedPaidDate, paymentMethod || 'Espèces', description, notes || null, now, now]
        );
      }

      await run(
        `UPDATE plan_payment_sessions
         SET paidDate = ?, paidAmount = ?, status = 'paid', notes = ?, recordedBy = ?, paymentId = ?, paymentRequestId = NULL
         WHERE id = ? AND planId = ?`,
        [resolvedPaidDate, amount, notes || session.notes || null, recordedBy || null, paymentId, sessionId, planId]
      );

      if (pendingRequestId) {
        await run('UPDATE user_notifications SET isRead = 1 WHERE id = ?', [pendingRequestId]);
        broadcastRealtimeEvent({ type: 'payment-request:updated', id: pendingRequestId });
      }

      await recalculatePlanTotals(planId);
      broadcastRealtimeEvent({ type: 'plan:payment-recorded', planId, patientId: plan.patientId });
      return { success: true, paymentId };
      });
    } catch (err) {
      console.error('Error updating plan session payment:', err);
      return { success: false, error: err.message };
    }
  });

  // ── GET SESSIONS ──────────────────────────────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'getSessions', async (event, planId) => {
    try {
      const sessions = await query(
        `SELECT * FROM plan_payment_sessions WHERE planId = ? ORDER BY sessionNumber`,
        [planId]
      );
      return { success: true, data: sessions || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── UPDATE SESSION TARIFFS ────────────────────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'updateSessions', async (event, planId, sessions = []) => {
    try {
      if (!planId) return { success: false, error: 'planId requis' };
      if (!Array.isArray(sessions)) return { success: false, error: 'Séances invalides' };
      return await withTransaction(async () => {

      const plan = await queryOne(`SELECT id, status FROM treatment_plans WHERE id = ? FOR UPDATE`, [planId]);
      if (!plan) return { success: false, error: 'Plan introuvable' };

      const context = getUserFinancialContext();
      if (!(context.isSuperAdmin || context.isDoctorAdmin || context.isPractitioner)) {
        return { success: false, error: 'Modification des tarifs réservée aux administrateurs.' };
      }

      let totalExpected = 0;
      const keptSessionIds = [];
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      for (const session of sessions) {
        const sessionId = session?.id;
        const sessionNumber = Math.max(1, parseInt(session?.sessionNumber || 0));
        const expectedAmount = Math.max(0, Number(session.expectedAmount || 0));
        const scheduledDate = session.scheduledDate || null;
        const notes = session.notes || null;
        totalExpected += expectedAmount;

        if (!sessionId) {
          const newSessionId = uuidv4();
          await run(
            `INSERT INTO plan_payment_sessions
             (id, planId, sessionNumber, scheduledDate, expectedAmount, status, notes, createdAt)
             VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
            [newSessionId, planId, sessionNumber || (keptSessionIds.length + 1), scheduledDate, expectedAmount, notes, now]
          );
          keptSessionIds.push(newSessionId);
          continue;
        }

        const existing = await queryOne(
          `SELECT id, paymentId FROM plan_payment_sessions WHERE id = ? AND planId = ?`,
          [sessionId, planId]
        );
        if (!existing) continue;

        await run(
          `UPDATE plan_payment_sessions
           SET sessionNumber = ?, scheduledDate = ?, expectedAmount = ?, notes = ?
           WHERE id = ? AND planId = ?`,
          [sessionNumber || (keptSessionIds.length + 1), scheduledDate, expectedAmount, notes, sessionId, planId]
        );
        keptSessionIds.push(sessionId);
      }

      if (keptSessionIds.length) {
        const placeholders = keptSessionIds.map(() => '?').join(',');
        await run(
          `DELETE FROM plan_payment_sessions
           WHERE planId = ?
             AND id NOT IN (${placeholders})
             AND COALESCE(paidAmount, 0) = 0
             AND paymentId IS NULL`,
          [planId, ...keptSessionIds]
        );
      }

      await run(
        `UPDATE treatment_plans
         SET totalCost = CASE WHEN ? > 0 THEN ? ELSE totalCost END,
             sessionsCount = ?,
             updatedAt = ?
         WHERE id = ?`,
        [totalExpected, totalExpected, sessions.length || 1, now, planId]
      );

      broadcastRealtimeEvent({ type: 'plan:updated', planId });
      return { success: true, totalCost: totalExpected };
      });
    } catch (err) {
      console.error('Error updating plan sessions:', err);
      return { success: false, error: err.message };
    }
  });

  // ── RECALCULATE ───────────────────────────────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'recalculate', async (event, planId) => {
    try {
      await recalculatePlanTotals(planId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── PENDING BALANCES (admin dashboard) ───────────────────────────────────
  registerValidatedContractHandler(ipcMain, 'plans', 'getPendingBalances', async () => {
    try {
      const context = getUserFinancialContext();
      if (!(context.isSuperAdmin || context.isDoctorAdmin || context.isPractitioner)) {
        return { success: false, error: 'Accès réservé aux administrateurs.' };
      }
      const plans = await query(
        `SELECT tp.*, p.firstName, p.lastName,
                (tp.totalCost - tp.totalPaid) as balance
         FROM treatment_plans tp
         LEFT JOIN patients p ON p.id = tp.patientId
         WHERE tp.status = 'active' AND tp.totalCost > tp.totalPaid
         ORDER BY balance DESC`,
        []
      );
      return { success: true, data: plans || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  registerValidatedContractHandler(ipcMain, 'plans', 'requestPayment', async (event, data = {}) => {
    try {
      const result = await withTransaction(async () => {
      if (data.planId) {
        await recalculatePlanTotals(data.planId);
      }
      const plan = await queryOne(
        `SELECT tp.*, p.firstName, p.lastName
         FROM treatment_plans tp
         LEFT JOIN patients p ON p.id = tp.patientId
         WHERE tp.id = ?
         FOR UPDATE OF tp`,
        [data.planId]
      );
      if (!plan) return { success: false, error: 'Plan introuvable' };
       if (!['active', 'completed'].includes(plan.status)) {
         return { success: false, error: 'Ce plan doit être actif ou terminé pour demander un paiement.' };
      }

      const amount = Number(data.amount || 0);
      const balance = Number(plan.totalCost || 0) - Number(plan.totalPaid || 0);
      if (amount <= 0) return { success: false, error: 'Montant invalide' };
      if (amount > balance + 0.01) {
        return { success: false, error: `Demande (${amount.toLocaleString()} DA) supérieure au solde restant (${balance.toLocaleString()} DA).` };
      }

      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const patientName = `${plan.firstName || ''} ${plan.lastName || ''}`.trim() || 'Patient';
      const nextSession = data.sessionId
        ? await queryOne('SELECT * FROM plan_payment_sessions WHERE id = ? AND planId = ? FOR UPDATE', [data.sessionId, plan.id])
        : await queryOne(
          `SELECT * FROM plan_payment_sessions
           WHERE planId = ? AND status != 'paid'
           ORDER BY sessionNumber ASC LIMIT 1 FOR UPDATE`,
          [plan.id]
        );
      if (!nextSession) return { success: false, error: 'Séance introuvable' };
      if (nextSession.status === 'paid' || Number(nextSession.paidAmount || 0) > 0) {
        return { success: false, error: 'Cette séance est déjà payée' };
      }
      if (nextSession.status === 'requested' && nextSession.paymentRequestId) {
        const existingRequest = await queryOne(
          'SELECT id FROM user_notifications WHERE id = ? AND isRead = 0',
          [nextSession.paymentRequestId]
        );
        if (existingRequest) return { success: true, id: existingRequest.id, duplicate: true };
      }
      const sessionLabel = `Séance ${nextSession?.sessionNumber || plan.sessionsCount || 1}/${plan.sessionsCount || nextSession?.sessionNumber || 1}`;
      await run(
        `INSERT INTO user_notifications (id, type, title, message, patientId, fromUserId, toRole, data, createdAt)
         VALUES (?, 'payment_request', ?, ?, ?, ?, 'assistant', ?, ?)`,
        [
          id,
          'Paiement à collecter',
          `${patientName} • ${sessionLabel} — ${amount} DZD`,
          plan.patientId,
          data.doctorId || global.currentUser?.id || null,
          JSON.stringify({
            amount,
            patientId: plan.patientId,
            patientName,
            planId: plan.id,
            sessionId: nextSession.id,
            planTitle: plan.title,
            service: data.service || plan.title || 'Plan de traitement',
            notes: data.notes || `${sessionLabel} — ${plan.title}`,
            selectedActs: Array.isArray(data.selectedActs) ? data.selectedActs : [],
            sessionLabel
          }),
          now
        ]
      );
      await run(
        `UPDATE plan_payment_sessions SET status = 'requested', paymentRequestId = ? WHERE id = ?`,
        [id, nextSession.id]
      );
      return { success: true, id, patientId: plan.patientId };
      });
      if (result?.success && !result.duplicate) {
        broadcastRealtimeEvent({ type: 'payment-request:new', id: result.id, patientId: result.patientId }, { role: 'assistant' });
        broadcastRealtimeEvent({ type: 'plan:updated', planId: data.planId, patientId: result.patientId });
      }
      return result;
    } catch (err) {
      console.error('Error requesting plan payment:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('plans:addEquipment', async (event, data) => {
    try {
      if (!data?.planId || (!data?.inventoryId && !data?.equipmentId)) {
        return { success: false, error: 'Plan et équipement requis' };
      }
      const existing = await queryOne(
        `SELECT id FROM plan_equipment_usage
         WHERE planId = ? AND ((equipmentId = ? AND ? IS NOT NULL) OR (inventoryId = ? AND ? IS NOT NULL))`,
        [data.planId, data.equipmentId || null, data.equipmentId || null, data.inventoryId || null, data.inventoryId || null]
      );
      if (existing?.id) return { success: true, id: existing.id, existing: true };
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      await run(
        `INSERT INTO plan_equipment_usage (id, planId, inventoryId, equipmentId, usageDate, notes, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, data.planId, data.inventoryId || null, data.equipmentId || null, now, data.notes || null, now]
      );
      return { success: true, id };
    } catch (err) {
      console.error('Error adding equipment:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('plans:removeEquipment', async (event, id) => {
    try {
      await run(`DELETE FROM plan_equipment_usage WHERE id = ?`, [id]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  console.log('Treatment plan events registered');
}

export { recalculatePlanTotals };
