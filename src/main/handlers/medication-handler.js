/**
 * Gestionnaire IPC pour les modèles d'ordonnances et la base de médicaments
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

function normalizeMedicationName(name) {
  return String(name || '').trim().toLowerCase();
}

export function handleMedicationEvents() {
  // ========== MODÈLES D'ORDONNANCES ==========

  // Créer un modèle d'ordonnance
  ipcMain.handle('prescriptionTemplate:create', async (event, data) => {
    try {
      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `INSERT INTO prescription_templates 
         (id, name, description, medications, notes, category, createdBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.name,
          data.description,
          typeof data.medications === 'string' ? data.medications : JSON.stringify(data.medications),
          data.notes,
          data.category || 'Général',
          data.createdBy,
          now,
          now
        ]
      );

      return { success: true, id };
    } catch (error) {
      console.error('❌ Erreur création modèle ordonnance:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer tous les modèles
  ipcMain.handle('prescriptionTemplate:getAll', async () => {
    try {
      const templates = await query(
        'SELECT * FROM prescription_templates ORDER BY usageCount DESC, name'
      );
      return { success: true, data: templates };
    } catch (error) {
      console.error('❌ Erreur récupération modèles:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer un modèle par ID
  ipcMain.handle('prescriptionTemplate:getById', async (event, id) => {
    try {
      const template = await queryOne('SELECT * FROM prescription_templates WHERE id = ?', [id]);
      return { success: true, data: template };
    } catch (error) {
      console.error('❌ Erreur récupération modèle:', error);
      return { success: false, error: error.message };
    }
  });

  // Utiliser un modèle (incrémente le compteur)
  ipcMain.handle('prescriptionTemplate:use', async (event, id) => {
    try {
      await run(
        'UPDATE prescription_templates SET usageCount = usageCount + 1, updatedAt = ? WHERE id = ?',
        [moment().format('YYYY-MM-DD HH:mm:ss'), id]
      );
      const template = await queryOne('SELECT * FROM prescription_templates WHERE id = ?', [id]);
      return { success: true, data: template };
    } catch (error) {
      console.error('❌ Erreur utilisation modèle:', error);
      return { success: false, error: error.message };
    }
  });

  // Mettre à jour un modèle
  ipcMain.handle('prescriptionTemplate:update', async (event, id, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `UPDATE prescription_templates 
         SET name = ?, description = ?, medications = ?, notes = ?, category = ?, updatedAt = ?
         WHERE id = ?`,
        [
          data.name,
          data.description,
          typeof data.medications === 'string' ? data.medications : JSON.stringify(data.medications),
          data.notes,
          data.category,
          now,
          id
        ]
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Erreur mise à jour modèle:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer un modèle
  ipcMain.handle('prescriptionTemplate:delete', async (event, id) => {
    try {
      await run('DELETE FROM prescription_templates WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur suppression modèle:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== BASE DE MÉDICAMENTS ==========

  // Créer un médicament
  ipcMain.handle('medication:create', async (event, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const normalizedName = normalizeMedicationName(data.name);

      if (!normalizedName) {
        return { success: false, error: 'Le nom du médicament est requis' };
      }

      const existingMedication = await queryOne(
        'SELECT id, isActive FROM medications WHERE LOWER(TRIM(name)) = ? LIMIT 1',
        [normalizedName]
      );

      if (existingMedication) {
        await run(
          `UPDATE medications
           SET name = ?, genericName = ?, category = ?, dosageForm = ?, defaultDosage = ?,
               defaultIntake = ?, defaultDuration = ?, defaultBoxes = ?, instructions = ?,
               contraindications = ?, sideEffects = ?, isActive = 1, updatedAt = ?
           WHERE id = ?`,
          [
            data.name,
            data.genericName,
            data.category,
            data.dosageForm,
            data.defaultDosage,
            data.defaultIntake,
            data.defaultDuration,
            data.defaultBoxes,
            data.instructions,
            data.contraindications,
            data.sideEffects,
            now,
            existingMedication.id
          ]
        );

        return { success: true, id: existingMedication.id, reused: true };
      }

      const id = uuidv4();

      await run(
        `INSERT INTO medications 
         (id, name, genericName, category, dosageForm, defaultDosage, defaultIntake, 
          defaultDuration, defaultBoxes, instructions, contraindications, sideEffects, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.name,
          data.genericName,
          data.category,
          data.dosageForm,
          data.defaultDosage,
          data.defaultIntake,
          data.defaultDuration,
          data.defaultBoxes,
          data.instructions,
          data.contraindications,
          data.sideEffects,
          now,
          now
        ]
      );

      return { success: true, id };
    } catch (error) {
      console.error('❌ Erreur création médicament:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer tous les médicaments
  ipcMain.handle('medication:getAll', async () => {
    try {
      const medications = await query(
        'SELECT * FROM medications WHERE isActive = 1 ORDER BY usageCount DESC, name'
      );
      return { success: true, data: medications };
    } catch (error) {
      console.error('❌ Erreur récupération médicaments:', error);
      return { success: false, error: error.message };
    }
  });

  // Rechercher des médicaments
  ipcMain.handle('medication:search', async (event, searchTerm) => {
    try {
      const normalizedTerm = String(searchTerm || '').trim();
      if (!normalizedTerm) {
        return { success: true, data: [] };
      }

      const prefixPattern = `${normalizedTerm}%`;
      const medications = await query(
        `SELECT id,
                name,
                genericName,
                defaultDosage,
                defaultIntake,
                defaultDuration,
                defaultBoxes,
                instructions,
                usageCount,
                updatedAt,
                CASE
                  WHEN name LIKE ? COLLATE NOCASE THEN 0
                  WHEN genericName LIKE ? COLLATE NOCASE THEN 1
                  ELSE 2
                END AS searchRank
         FROM medications 
         WHERE isActive = 1
           AND (
             name LIKE ? COLLATE NOCASE
             OR genericName LIKE ? COLLATE NOCASE
           )
         ORDER BY searchRank ASC, usageCount DESC, name COLLATE NOCASE
         LIMIT 12`,
        [prefixPattern, prefixPattern, prefixPattern, prefixPattern]
      );
      return { success: true, data: medications };
    } catch (error) {
      console.error('❌ Erreur recherche médicaments:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer un médicament par ID
  ipcMain.handle('medication:getById', async (event, id) => {
    try {
      const medication = await queryOne('SELECT * FROM medications WHERE id = ?', [id]);
      return { success: true, data: medication };
    } catch (error) {
      console.error('❌ Erreur récupération médicament:', error);
      return { success: false, error: error.message };
    }
  });

  // Incrémenter l'utilisation d'un médicament
  ipcMain.handle('medication:incrementUsage', async (event, name) => {
    try {
      await run(
        'UPDATE medications SET usageCount = usageCount + 1, updatedAt = ? WHERE name = ?',
        [moment().format('YYYY-MM-DD HH:mm:ss'), name]
      );
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur incrémentation usage:', error);
      return { success: false, error: error.message };
    }
  });

  // Mettre à jour un médicament
  ipcMain.handle('medication:update', async (event, id, data) => {
    try {
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const normalizedName = normalizeMedicationName(data.name);

      if (!normalizedName) {
        return { success: false, error: 'Le nom du médicament est requis' };
      }

      const conflictingMedication = await queryOne(
        'SELECT id FROM medications WHERE LOWER(TRIM(name)) = ? AND id <> ? LIMIT 1',
        [normalizedName, id]
      );

      if (conflictingMedication) {
        return { success: false, error: 'Un médicament avec le même nom existe déjà' };
      }

      await run(
        `UPDATE medications 
         SET name = ?, genericName = ?, category = ?, dosageForm = ?, defaultDosage = ?,
             defaultIntake = ?, defaultDuration = ?, defaultBoxes = ?, instructions = ?,
             contraindications = ?, sideEffects = ?, updatedAt = ?
         WHERE id = ?`,
        [
          data.name,
          data.genericName,
          data.category,
          data.dosageForm,
          data.defaultDosage,
          data.defaultIntake,
          data.defaultDuration,
          data.defaultBoxes,
          data.instructions,
          data.contraindications,
          data.sideEffects,
          now,
          id
        ]
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Erreur mise à jour médicament:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer un médicament (soft delete)
  ipcMain.handle('medication:delete', async (event, id) => {
    try {
      await run(
        'UPDATE medications SET isActive = 0, updatedAt = ? WHERE id = ?',
        [moment().format('YYYY-MM-DD HH:mm:ss'), id]
      );
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur suppression médicament:', error);
      return { success: false, error: error.message };
    }
  });

  // Catégories de médicaments
  ipcMain.handle('medication:getCategories', async () => {
    try {
      let categories = [];
      try {
        categories = await query('SELECT id, name FROM medication_categories ORDER BY name');
      } catch (tableError) {
        categories = [];
      }

      if (!categories || categories.length === 0) {
        const fallback = await query(
          `SELECT DISTINCT category FROM medications
           WHERE isActive = 1 AND category IS NOT NULL AND category <> ''
           ORDER BY category`
        );
        categories = fallback.map((c) => ({ id: null, name: c.category }));
      }

      return { success: true, data: categories };
    } catch (error) {
      console.error('❌ Erreur récupération catégories:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('medication:createCategory', async (event, name) => {
    try {
      const trimmed = String(name || '').trim();
      if (!trimmed) {
        return { success: false, error: 'Le nom de la catégorie est requis' };
      }

      const existing = await queryOne(
        'SELECT id FROM medication_categories WHERE LOWER(name) = ?',
        [trimmed.toLowerCase()]
      );
      if (existing) {
        return { success: false, error: 'Cette catégorie existe déjà' };
      }

      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      await run(
        'INSERT INTO medication_categories (id, name, createdAt) VALUES (?, ?, ?)',
        [id, trimmed, now]
      );

      return { success: true, id };
    } catch (error) {
      console.error('❌ Erreur création catégorie:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('medication:updateCategory', async (event, id, name) => {
    try {
      const trimmed = String(name || '').trim();
      if (!trimmed) {
        return { success: false, error: 'Le nom de la catégorie est requis' };
      }

      const category = await queryOne('SELECT name FROM medication_categories WHERE id = ?', [id]);
      if (!category) {
        return { success: false, error: 'Catégorie introuvable' };
      }

      const duplicate = await queryOne(
        'SELECT id FROM medication_categories WHERE LOWER(name) = ? AND id <> ?',
        [trimmed.toLowerCase(), id]
      );
      if (duplicate) {
        return { success: false, error: 'Ce nom est déjà utilisé' };
      }

      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      await run('BEGIN');
      try {
        await run('UPDATE medication_categories SET name = ? WHERE id = ?', [trimmed, id]);
        await run(
          'UPDATE medications SET category = ?, updatedAt = ? WHERE category = ? AND isActive = 1',
          [trimmed, now, category.name]
        );
        await run('COMMIT');
      } catch (transactionError) {
        await run('ROLLBACK');
        throw transactionError;
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Erreur mise à jour catégorie:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('medication:deleteCategory', async (event, id) => {
    try {
      const category = await queryOne('SELECT name FROM medication_categories WHERE id = ?', [id]);
      if (!category) {
        return { success: false, error: 'Catégorie introuvable' };
      }

      const usage = await queryOne(
        'SELECT COUNT(*) as count FROM medications WHERE isActive = 1 AND category = ?',
        [category.name]
      );

      if (usage && usage.count > 0) {
        return {
          success: false,
          error: `Impossible de supprimer : ${usage.count} médicament(s) utilisent cette catégorie`
        };
      }

      await run('DELETE FROM medication_categories WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur suppression catégorie:', error);
      return { success: false, error: error.message };
    }
  });
}
