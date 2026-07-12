/**
 * Gestionnaire IPC pour les modèles d'ordonnances et la base de médicaments
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { normalizeSpecialtyKey, writeMergedSpecialtyMedication, readSpecialtyMedications } from '../specialty-assets.js';

function normalizeMedicationName(name) {
  return String(name || '').trim().toLowerCase();
}

function normalizeMedicationSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function specialtyMedicationMatches(entry, normalizedTerm) {
  const searchableFields = [
    entry.nom_medicament,
    entry.name,
    entry.nom_commercial,
    entry.dci,
    entry.dosage_posologie,
    entry.forme
  ];

  return searchableFields.some((field) => {
    const normalizedField = normalizeMedicationSearchText(field);
    return normalizedField.startsWith(normalizedTerm);
  });
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

        if (data.specialty || data.specialtyKey) {
          writeMergedSpecialtyMedication(normalizeSpecialtyKey(data.specialty || data.specialtyKey), {
            nom_medicament: data.name,
            dosage_posologie: data.defaultDosage,
            prise: data.defaultIntake,
            duree: data.defaultDuration,
            boites: data.defaultBoxes,
            instructions_observations: data.instructions
          });
        }

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

      if (data.specialty || data.specialtyKey) {
        writeMergedSpecialtyMedication(normalizeSpecialtyKey(data.specialty || data.specialtyKey), {
          nom_medicament: data.name,
          dosage_posologie: data.defaultDosage,
          prise: data.defaultIntake,
          duree: data.defaultDuration,
          boites: data.defaultBoxes,
          instructions_observations: data.instructions
        });
      }

      return { success: true, id };
    } catch (error) {
      console.error('❌ Erreur création médicament:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('medication:add-to-specialty-json', async (event, payload = {}) => {
    try {
      const specialty = normalizeSpecialtyKey(payload.specialty || payload.specialtyKey || 'general');
      const medication = payload.medication || payload;
      return writeMergedSpecialtyMedication(specialty, medication);
    } catch (error) {
      console.error('❌ Erreur ajout médicament JSON spécialité:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('medication:search-specialty-json', async (event, payload = {}) => {
    try {
      const normalizedTerm = normalizeMedicationSearchText(payload.term || payload.searchTerm || '');
      if (!normalizedTerm) {
        return { success: true, data: [] };
      }

      const specialty = normalizeSpecialtyKey(payload.specialty || payload.specialtyKey || 'general');
      const limit = Math.min(30, Math.max(1, Number(payload.limit) || 10));
      const { medications } = readSpecialtyMedications(specialty);
      const matches = medications
        .filter((entry) => specialtyMedicationMatches(entry, normalizedTerm))
        .slice(0, limit)
        .map((entry) => ({
          ...entry,
          specialtyKey: specialty,
          source: 'specialty-json'
        }));

      return { success: true, data: matches };
    } catch (error) {
      console.error('❌ Erreur recherche médicaments JSON spécialité:', error);
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
      const categories = await query(
        'SELECT DISTINCT category FROM medications WHERE isActive = 1 AND category IS NOT NULL ORDER BY category'
      );
      return { success: true, data: categories.map(c => c.category) };
    } catch (error) {
      console.error('❌ Erreur récupération catégories:', error);
      return { success: false, error: error.message };
    }
  });
}
