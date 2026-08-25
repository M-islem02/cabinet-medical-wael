/**
 * Gestionnaire IPC pour les actes personnalisés (Actes Réalisés)
 * Persistés en base de données pour être disponibles sur toutes les sessions.
 */

import { ipcMain } from 'electron';
import { query, queryOne, run } from '../database-unified.js';

const ACT_ID_PATTERN = /^custom_[a-z0-9_]{1,60}$/i;

function sanitizeLabel(value) {
  return String(value || '').trim().slice(0, 255);
}

function sanitizePrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return 0;
  return Math.round(price * 100) / 100;
}

export function handleCustomActsEvents() {
  ipcMain.handle('customacts:list', async () => {
    try {
      const rows = await query(
        'SELECT id, label, price, createdAt, updatedAt FROM custom_acts ORDER BY createdAt ASC'
      );
      return { success: true, data: rows || [] };
    } catch (error) {
      console.error('Erreur lors de la lecture des actes personnalises:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('customacts:upsert', async (event, payload) => {
    try {
      const id = String(payload?.id || '').trim();
      const label = sanitizeLabel(payload?.label);
      if (!id || !ACT_ID_PATTERN.test(id)) {
        return { success: false, error: 'Identifiant d\'acte invalide' };
      }
      if (!label) {
        return { success: false, error: 'Libellé de l\'acte requis' };
      }
      const price = sanitizePrice(payload?.price);

      await run(
        `INSERT INTO custom_acts (id, label, price)
         VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           label = EXCLUDED.label,
           price = EXCLUDED.price,
           updatedAt = CURRENT_TIMESTAMP`,
        [id, label, price]
      );

      const row = await queryOne('SELECT id, label, price FROM custom_acts WHERE id = ?', [id]);
      return { success: true, data: row };
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'acte personnalisé:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('customacts:delete', async (event, actId) => {
    try {
      const id = String(actId || '').trim();
      if (!id || !ACT_ID_PATTERN.test(id)) {
        return { success: false, error: 'Identifiant d\'acte invalide' };
      }
      await run('DELETE FROM custom_acts WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'acte personnalisé:', error);
      return { success: false, error: error.message };
    }
  });
}
