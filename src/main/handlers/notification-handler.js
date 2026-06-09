/**
 * Gestionnaire IPC pour les notifications et plans de traitement
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

// Helper pour convertir les valeurs vides en null (MariaDB compatibility)
const toNullIfEmpty = (val) => (val === '' || val === undefined) ? null : val;

export function handleNotificationEvents() {
  // ========== NOTIFICATIONS ==========

  // Créer une notification
  ipcMain.handle('notification:create', async (event, data) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `INSERT INTO notifications 
         (id, userId, type, title, message, relatedType, relatedId, scheduledFor, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          toNullIfEmpty(data.userId),
          toNullIfEmpty(data.type),
          toNullIfEmpty(data.title),
          toNullIfEmpty(data.message),
          toNullIfEmpty(data.relatedType),
          toNullIfEmpty(data.relatedId),
          toNullIfEmpty(data.scheduledFor),
          now
        ]
      );

      return { success: true, id };
    } catch (error) {
      console.error('❌ Erreur création notification:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer les notifications d'un utilisateur
  ipcMain.handle('notification:getByUser', async (event, userId) => {
    try {
      const notifications = await query(
        `SELECT * FROM notifications 
         WHERE userId = ? OR userId IS NULL
         ORDER BY createdAt DESC
         LIMIT 50`,
        [userId]
      );
      return { success: true, data: notifications };
    } catch (error) {
      console.error('❌ Erreur récupération notifications:', error);
      return { success: false, error: error.message };
    }
  });

  // Notifications non lues
  ipcMain.handle('notification:getUnread', async (event, userId) => {
    try {
      const notifications = await query(
        `SELECT * FROM notifications 
         WHERE (userId = ? OR userId IS NULL) AND isRead = 0
         ORDER BY createdAt DESC`,
        [userId]
      );
      return { success: true, data: notifications };
    } catch (error) {
      console.error('❌ Erreur récupération notifications non lues:', error);
      return { success: false, error: error.message };
    }
  });

  // Marquer comme lu
  ipcMain.handle('notification:markAsRead', async (event, id) => {
    try {
      await run('UPDATE notifications SET isRead = 1 WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur marquage notification:', error);
      return { success: false, error: error.message };
    }
  });

  // Marquer toutes comme lues
  ipcMain.handle('notification:markAllAsRead', async (event, userId) => {
    try {
      await run('UPDATE notifications SET isRead = 1 WHERE userId = ? OR userId IS NULL', [userId]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur marquage notifications:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer une notification
  ipcMain.handle('notification:delete', async (event, id) => {
    try {
      await run('DELETE FROM notifications WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur suppression notification:', error);
      return { success: false, error: error.message };
    }
  });

  // Notifications pour les RDV du jour
  ipcMain.handle('notification:getTodayAppointments', async () => {
    try {
      const today = moment().format('YYYY-MM-DD');
      const appointments = await query(
        `SELECT a.*, p.firstName, p.lastName, p.phone
         FROM appointments a
         LEFT JOIN patients p ON a.patientId = p.id
         WHERE date(a.appointmentDateTime) = ?
         ORDER BY a.appointmentDateTime ASC`,
        [today]
      );
      return { success: true, data: appointments };
    } catch (error) {
      console.error('❌ Erreur récupération RDV du jour:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== PLANS DE TRAITEMENT ==========

  // Créer un plan de traitement
  ipcMain.handle('treatmentPlan:create', async (event, data) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `INSERT INTO treatment_plans 
         (id, patientId, consultationId, title, description, startDate, endDate, 
          sessions, frequency, status, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        [
          id,
          data.patientId,
          data.consultationId || null,
          data.title,
          data.description,
          data.startDate,
          data.endDate,
          data.sessions || 1,
          data.frequency,
          data.notes,
          now,
          now
        ]
      );

      // Créer les séances si demandé
      if (data.createSessions && data.sessions > 0) {
        const startDate = moment(data.startDate);
        const frequencyDays = parseFrequencyToDays(data.frequency);
        
        for (let i = 1; i <= data.sessions; i++) {
          const sessionDate = startDate.clone().add((i - 1) * frequencyDays, 'days');
          await run(
            `INSERT INTO treatment_sessions 
             (id, treatmentPlanId, sessionNumber, scheduledDate, status, createdAt)
             VALUES (?, ?, ?, ?, 'scheduled', ?)`,
            [uuidv4(), id, i, sessionDate.format('YYYY-MM-DD'), now]
          );
        }
      }

      return { success: true, id };
    } catch (error) {
      console.error('❌ Erreur création plan traitement:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer les plans d'un patient
  ipcMain.handle('treatmentPlan:getByPatient', async (event, patientId) => {
    try {
      const plans = await query(
        `SELECT * FROM treatment_plans WHERE patientId = ? ORDER BY startDate DESC`,
        [patientId]
      );
      return { success: true, data: plans };
    } catch (error) {
      console.error('❌ Erreur récupération plans:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer un plan par ID avec ses séances
  ipcMain.handle('treatmentPlan:getById', async (event, id) => {
    try {
      const plan = await queryOne('SELECT * FROM treatment_plans WHERE id = ?', [id]);
      if (plan) {
        const sessions = await query(
          'SELECT * FROM treatment_sessions WHERE treatmentPlanId = ? ORDER BY sessionNumber',
          [id]
        );
        plan.sessions_list = sessions;
      }
      return { success: true, data: plan };
    } catch (error) {
      console.error('❌ Erreur récupération plan:', error);
      return { success: false, error: error.message };
    }
  });

  // Mettre à jour un plan
  ipcMain.handle('treatmentPlan:update', async (event, id, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `UPDATE treatment_plans 
         SET title = ?, description = ?, endDate = ?, frequency = ?, status = ?, notes = ?, updatedAt = ?
         WHERE id = ?`,
        [data.title, data.description, data.endDate, data.frequency, data.status, data.notes, now, id]
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Erreur mise à jour plan:', error);
      return { success: false, error: error.message };
    }
  });

  // Compléter une séance
  ipcMain.handle('treatmentSession:complete', async (event, sessionId, notes) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      // Mettre à jour la séance
      await run(
        `UPDATE treatment_sessions 
         SET status = 'completed', completedDate = ?, notes = ?
         WHERE id = ?`,
        [now, notes, sessionId]
      );

      // Mettre à jour le compteur du plan
      const session = await queryOne('SELECT treatmentPlanId FROM treatment_sessions WHERE id = ?', [sessionId]);
      if (session) {
        await run(
          `UPDATE treatment_plans 
           SET completedSessions = completedSessions + 1, updatedAt = ?
           WHERE id = ?`,
          [now, session.treatmentPlanId]
        );

        // Vérifier si toutes les séances sont complétées
        const plan = await queryOne('SELECT sessions, completedSessions FROM treatment_plans WHERE id = ?', [session.treatmentPlanId]);
        if (plan && plan.completedSessions >= plan.sessions) {
          await run('UPDATE treatment_plans SET status = \'completed\', updatedAt = ? WHERE id = ?', [now, session.treatmentPlanId]);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Erreur complétion séance:', error);
      return { success: false, error: error.message };
    }
  });

  // Annuler une séance
  ipcMain.handle('treatmentSession:cancel', async (event, sessionId, reason) => {
    try {
      await run(
        `UPDATE treatment_sessions SET status = 'cancelled', notes = ? WHERE id = ?`,
        [reason, sessionId]
      );
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur annulation séance:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer un plan
  ipcMain.handle('treatmentPlan:delete', async (event, id) => {
    try {
      await run('DELETE FROM treatment_sessions WHERE treatmentPlanId = ?', [id]);
      await run('DELETE FROM treatment_plans WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur suppression plan:', error);
      return { success: false, error: error.message };
    }
  });

  // Plans actifs
  ipcMain.handle('treatmentPlan:getActive', async () => {
    try {
      const plans = await query(
        `SELECT tp.*, p.firstName, p.lastName
         FROM treatment_plans tp
         LEFT JOIN patients p ON tp.patientId = p.id
         WHERE tp.status = 'active'
         ORDER BY tp.startDate DESC`
      );
      return { success: true, data: plans };
    } catch (error) {
      console.error('❌ Erreur récupération plans actifs:', error);
      return { success: false, error: error.message };
    }
  });

  // Séances à venir
  ipcMain.handle('treatmentSession:getUpcoming', async (event, days = 7) => {
    try {
      const endDate = moment().add(days, 'days').format('YYYY-MM-DD');
      const today = moment().format('YYYY-MM-DD');
      
      const sessions = await query(
        `SELECT ts.*, tp.title as planTitle, tp.patientId, p.firstName, p.lastName
         FROM treatment_sessions ts
         LEFT JOIN treatment_plans tp ON ts.treatmentPlanId = tp.id
         LEFT JOIN patients p ON tp.patientId = p.id
         WHERE ts.status = 'scheduled' AND ts.scheduledDate BETWEEN ? AND ?
         ORDER BY ts.scheduledDate ASC`,
        [today, endDate]
      );
      return { success: true, data: sessions };
    } catch (error) {
      console.error('❌ Erreur récupération séances à venir:', error);
      return { success: false, error: error.message };
    }
  });
}

// Helper pour convertir la fréquence en jours
function parseFrequencyToDays(frequency) {
  if (!frequency) return 7;
  const freq = frequency.toLowerCase();
  if (freq.includes('jour') || freq.includes('daily')) return 1;
  if (freq.includes('2 fois') || freq.includes('twice')) return 3;
  if (freq.includes('semaine') || freq.includes('weekly')) return 7;
  if (freq.includes('2 semaine') || freq.includes('biweekly')) return 14;
  if (freq.includes('mois') || freq.includes('monthly')) return 30;
  return 7;
}
