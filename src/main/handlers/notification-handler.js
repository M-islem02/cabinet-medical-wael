/**
 * Gestionnaire IPC pour les notifications et plans de traitement
 */

import { ipcMain } from 'electron';
import { query, run } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { broadcastRealtimeEvent } from '../realtime-server.js';

// Helper pour convertir les valeurs vides en null (MariaDB compatibility)
const toNullIfEmpty = (val) => (val === '' || val === undefined) ? null : val;

export function handleNotificationEvents() {
  // ========== NOTIFICATIONS ==========

  // Créer une notification
  ipcMain.handle('notification:create', async (event, data) => {
    try {
      const isAssistantMessage = global.currentUser?.role === 'assistant'
        && String(data?.type || '').toLowerCase() === 'message';
      if (isAssistantMessage) {
        return { success: false, error: 'L’assistant ne peut pas envoyer de message au médecin' };
      }

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

      broadcastRealtimeEvent({
        type: 'notification:new',
        id,
        notificationType: data.type,
        title: data.title,
        message: data.message,
        relatedType: data.relatedType || '',
        relatedId: data.relatedId || ''
      }, data.userId ? { userId: data.userId } : {});

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

}
