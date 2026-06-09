/**
 * Gestionnaire IPC pour les analyses médicales
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

export function handleAnalysisEvents() {
  // ========== ANALYSES MÉDICALES ==========

  // Prescrire une analyse
  ipcMain.handle('analysis:create', async (event, data) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `INSERT INTO medical_analyses 
         (id, patientId, consultationId, analysisDate, analysisType, laboratory, 
          results, normalValues, interpretation, status, attachmentPath, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.patientId,
          data.consultationId || null,
          data.analysisDate || now,
          data.analysisType,
          data.laboratory,
          data.results,
          data.normalValues,
          data.interpretation,
          data.status || 'pending',
          data.attachmentPath,
          data.notes,
          now,
          now
        ]
      );

      return { success: true, id };
    } catch (error) {
      console.error('❌ Erreur création analyse:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer les analyses d'un patient
  ipcMain.handle('analysis:getByPatient', async (event, patientId) => {
    try {
      const analyses = await query(
        `SELECT a.*, p.firstName, p.lastName 
         FROM medical_analyses a
         LEFT JOIN patients p ON a.patientId = p.id
         WHERE a.patientId = ?
         ORDER BY a.analysisDate DESC`,
        [patientId]
      );
      return { success: true, data: analyses };
    } catch (error) {
      console.error('❌ Erreur récupération analyses:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer une analyse par ID
  ipcMain.handle('analysis:getById', async (event, id) => {
    try {
      const analysis = await queryOne(
        `SELECT a.*, p.firstName, p.lastName 
         FROM medical_analyses a
         LEFT JOIN patients p ON a.patientId = p.id
         WHERE a.id = ?`,
        [id]
      );
      return { success: true, data: analysis };
    } catch (error) {
      console.error('❌ Erreur récupération analyse:', error);
      return { success: false, error: error.message };
    }
  });

  // Mettre à jour une analyse (ajouter les résultats)
  ipcMain.handle('analysis:update', async (event, id, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `UPDATE medical_analyses 
         SET analysisType = ?, laboratory = ?, results = ?, normalValues = ?,
             interpretation = ?, status = ?, attachmentPath = ?, notes = ?, updatedAt = ?
         WHERE id = ?`,
        [
          data.analysisType,
          data.laboratory,
          data.results,
          data.normalValues,
          data.interpretation,
          data.status,
          data.attachmentPath,
          data.notes,
          now,
          id
        ]
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Erreur mise à jour analyse:', error);
      return { success: false, error: error.message };
    }
  });

  // Marquer une analyse comme complétée
  ipcMain.handle('analysis:complete', async (event, id, results) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `UPDATE medical_analyses 
         SET results = ?, interpretation = ?, status = 'completed', updatedAt = ?
         WHERE id = ?`,
        [results.results, results.interpretation, now, id]
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Erreur complétion analyse:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer une analyse
  ipcMain.handle('analysis:delete', async (event, id) => {
    try {
      await run('DELETE FROM medical_analyses WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur suppression analyse:', error);
      return { success: false, error: error.message };
    }
  });

  // Analyses en attente
  ipcMain.handle('analysis:getPending', async () => {
    try {
      const analyses = await query(
        `SELECT a.*, p.firstName, p.lastName 
         FROM medical_analyses a
         LEFT JOIN patients p ON a.patientId = p.id
         WHERE a.status = 'pending'
         ORDER BY a.analysisDate DESC`
      );
      return { success: true, data: analyses };
    } catch (error) {
      console.error('❌ Erreur récupération analyses en attente:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== TYPES D'ANALYSES ==========

  // Récupérer tous les types d'analyses
  ipcMain.handle('analysisType:getAll', async () => {
    try {
      const types = await query(
        'SELECT * FROM analysis_types WHERE isActive = 1 ORDER BY category, name'
      );
      return { success: true, data: types };
    } catch (error) {
      console.error('❌ Erreur récupération types analyses:', error);
      return { success: false, error: error.message };
    }
  });

  // Créer un type d'analyse
  ipcMain.handle('analysisType:create', async (event, data) => {
    try {
      const id = uuidv4();
      await run(
        `INSERT INTO analysis_types (id, name, category, description, normalValues, unit, price)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, data.name, data.category, data.description, data.normalValues, data.unit, data.price || 0]
      );
      return { success: true, id };
    } catch (error) {
      console.error('❌ Erreur création type analyse:', error);
      return { success: false, error: error.message };
    }
  });

  // Mettre à jour un type d'analyse
  ipcMain.handle('analysisType:update', async (event, id, data) => {
    try {
      await run(
        `UPDATE analysis_types 
         SET name = ?, category = ?, description = ?, normalValues = ?, unit = ?, price = ?
         WHERE id = ?`,
        [data.name, data.category, data.description, data.normalValues, data.unit, data.price, id]
      );
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur mise à jour type analyse:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer un type d'analyse (soft delete)
  ipcMain.handle('analysisType:delete', async (event, id) => {
    try {
      await run('UPDATE analysis_types SET isActive = 0 WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur suppression type analyse:', error);
      return { success: false, error: error.message };
    }
  });
}
