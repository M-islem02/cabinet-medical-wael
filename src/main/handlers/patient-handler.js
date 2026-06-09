/**
 * Gestionnaire IPC pour les patients
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

// Helper pour convertir les valeurs vides en null (MariaDB compatibility)
const toNullIfEmpty = (val) => (val === '' || val === undefined) ? null : val;

function normalizeUserRole(role) {
  return role === 'director' ? 'doctor' : String(role || '').trim();
}

function isCurrentUserDirector() {
  return normalizeUserRole(global.currentUser?.role) === 'director';
}

function sanitizePatientForDirector(patient) {
  if (!patient) return patient;

  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth,
    gender: patient.gender,
    email: patient.email,
    phone: patient.phone,
    address: patient.address,
    city: patient.city,
    zipCode: patient.zipCode,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt
  };
}

function toPositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildPaginationMeta(total, page, pageSize) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safePageSize = Math.max(1, Number(pageSize) || 1);
  return {
    total: safeTotal,
    page,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(safeTotal / safePageSize))
  };
}

function normalizePatientListRequest(payload = null) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {
        paginated: false,
        searchTerm: '',
        page: 1,
        pageSize: 10
      };
  }

  return {
    paginated: payload.paginated === true || payload.page !== undefined || payload.pageSize !== undefined || payload.searchTerm !== undefined,
    searchTerm: String(payload.searchTerm || '').trim(),
    page: toPositiveInt(payload.page, 1),
    pageSize: Math.min(100, toPositiveInt(payload.pageSize, 10))
  };
}

function normalizePatientByIdRequest(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      patientId: payload.id || payload.patientId || '',
      includeConsultations: payload.includeConsultations === true,
      consultationLimit: Math.min(50, toPositiveInt(payload.consultationLimit, 5))
    };
  }

  return {
    patientId: payload,
    includeConsultations: false,
    consultationLimit: 5
  };
}

function normalizePatientSearchRequest(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      searchTerm: String(payload.searchTerm || payload.term || '').trim(),
      limit: Math.min(100, toPositiveInt(payload.limit, 50))
    };
  }

  return {
    searchTerm: String(payload || '').trim(),
    limit: 50
  };
}

function normalizeSocialSecurity(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function getCurrentUserContext() {
  const role = normalizeUserRole(global.currentUser?.role);
  return {
    userId: global.currentUser?.id || null,
    role,
    isAdmin: !!global.currentUser?.isAdmin,
    isPractitioner: role === 'doctor' || role === 'dentist',
    isAssistant: role === 'assistant'
  };
}

export function handlePatientEvents() {
  // Count patients (lightweight - avoids fetching all rows on large datasets)
  ipcMain.handle('patient:getCount', async () => {
    try {
      const userContext = getCurrentUserContext();
      const whereParts = [];
      const params = [];

      if (userContext.isPractitioner && userContext.userId) {
        whereParts.push('primaryDoctorId = ?');
        params.push(userContext.userId);
      }

      if (userContext.isAssistant && userContext.userId) {
        whereParts.push('createdByUserId = ?');
        params.push(userContext.userId);
      }

      const whereClause = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
      const row = await queryOne(`SELECT COUNT(*) as count FROM patients${whereClause}`, params);
      return { success: true, count: Number(row?.count || 0) };
    } catch (error) {
      console.error('❌ Erreur lors du comptage des patients:', error);
      return { success: false, error: error.message };
    }
  });

  // Créer un patient
  ipcMain.handle('patient:create', async (event, patientData) => {
    try {
      if (isCurrentUserDirector()) {
        return { success: false, error: 'Accès refusé: le directeur a un accès patient en lecture seule' };
      }

      const userContext = getCurrentUserContext();
      if (userContext.role === 'admin') {
        return { success: false, error: 'Accès refusé: un administrateur ne gère pas les patients' };
      }

      const id = uuidv4();
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      
      let primaryDoctorId = null;
      const createdByUserId = userContext.userId || null;
      if (userContext.isPractitioner) {
        primaryDoctorId = userContext.userId;
      } else if (userContext.role === 'assistant') {
        primaryDoctorId = patientData.primaryDoctorId || null;
        if (!primaryDoctorId) {
          return { success: false, error: 'Veuillez sélectionner un médecin responsable' };
        }

        const targetDoctor = await queryOne(
          'SELECT id, role, isAdmin, isSuperAdmin, isActive FROM users WHERE id = ?',
          [primaryDoctorId]
        );

        if (!targetDoctor || !targetDoctor.isActive) {
          return { success: false, error: 'Médecin cible introuvable ou inactif' };
        }

        const validPractitionerRole = targetDoctor.role === 'doctor' || targetDoctor.role === 'dentist';
        if (!validPractitionerRole || targetDoctor.isAdmin || targetDoctor.isSuperAdmin) {
          return { success: false, error: 'Le patient doit être rattaché à un compte médecin valide' };
        }
      }

      await run(
        `INSERT INTO patients 
         (id, firstName, lastName, primaryDoctorId, createdByUserId, dateOfBirth, gender, socialSecurityNumber, email, phone, 
          address, city, zipCode, bloodType, allergies, medicalHistory, emergencyContact, emergencyPhone, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          toNullIfEmpty(patientData.firstName),
          toNullIfEmpty(patientData.lastName),
          primaryDoctorId,
          createdByUserId,
          toNullIfEmpty(patientData.dateOfBirth),
          toNullIfEmpty(patientData.gender),
          normalizeSocialSecurity(patientData.socialSecurityNumber),
          toNullIfEmpty(patientData.email),
          toNullIfEmpty(patientData.phone),
          toNullIfEmpty(patientData.address),
          toNullIfEmpty(patientData.city),
          toNullIfEmpty(patientData.zipCode),
          toNullIfEmpty(patientData.bloodType),
          toNullIfEmpty(patientData.allergies),
          toNullIfEmpty(patientData.medicalHistory),
          toNullIfEmpty(patientData.emergencyContact),
          toNullIfEmpty(patientData.emergencyPhone),
          now,
          now
        ]
      );

      return { success: true, id: id };
    } catch (error) {
      console.error('❌ Erreur lors de la création du patient:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer tous les patients
  ipcMain.handle('patient:getAll', async (event, payload = null) => {
    try {
      const request = normalizePatientListRequest(payload);
      const whereParts = [];
      const params = [];
      const userContext = getCurrentUserContext();

      if (userContext.role === 'admin') {
        return { success: false, error: 'Accès refusé: un administrateur ne gère pas les patients' };
      }

      if (userContext.isPractitioner && userContext.userId) {
        whereParts.push('primaryDoctorId = ?');
        params.push(userContext.userId);
      }

      if (userContext.isAssistant && userContext.userId) {
        whereParts.push('createdByUserId = ?');
        params.push(userContext.userId);
      }

      if (request.searchTerm) {
        const searchPattern = `%${request.searchTerm}%`;
        whereParts.push('(firstName LIKE ? OR lastName LIKE ? OR email LIKE ? OR phone LIKE ? OR socialSecurityNumber LIKE ?)');
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

      if (!request.paginated) {
        const patients = await query(`SELECT * FROM patients ${whereClause} ORDER BY lastName, firstName`, params);
        if (isCurrentUserDirector()) {
          return { success: true, data: (patients || []).map(sanitizePatientForDirector) };
        }
        return { success: true, data: patients };
      }

      const totalRow = await queryOne(`SELECT COUNT(*) as total FROM patients ${whereClause}`, params);
      const pagination = buildPaginationMeta(totalRow?.total || 0, request.page, request.pageSize);
      const currentPage = Math.min(pagination.page, pagination.totalPages);
      const offset = (currentPage - 1) * pagination.pageSize;
      const patients = await query(
        `SELECT * FROM patients ${whereClause} ORDER BY lastName, firstName LIMIT ? OFFSET ?`,
        [...params, pagination.pageSize, offset]
      );

      const responseRows = isCurrentUserDirector()
        ? (patients || []).map(sanitizePatientForDirector)
        : patients;

      return {
        success: true,
        data: responseRows,
        pagination: {
          ...pagination,
          page: currentPage
        }
      };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des patients:', error);
      return { success: false, error: error.message };
    }
  });

  // Récupérer un patient par ID
  ipcMain.handle('patient:getById', async (event, payload) => {
    try {
      const request = normalizePatientByIdRequest(payload);
      const patient = await queryOne('SELECT * FROM patients WHERE id = ?', [request.patientId]);
      
      if (!patient) {
        return { success: false, error: 'Patient non trouvé' };
      }

      const userContext = getCurrentUserContext();
      
      if (userContext.role === 'admin') {
        return { success: false, error: 'Accès refusé: un administrateur ne gère pas les patients' };
      }

      if (userContext.isPractitioner && userContext.userId) {
        if (patient.primaryDoctorId && patient.primaryDoctorId !== userContext.userId) {
          return { success: false, error: 'Accès refusé: patient non rattaché à votre compte médecin' };
        }
      }

      if (userContext.isAssistant && userContext.userId) {
        if (patient.createdByUserId && patient.createdByUserId !== userContext.userId) {
          return { success: false, error: 'Accès refusé: vous ne pouvez consulter que les dossiers que vous avez créés' };
        }
      }

      if (isCurrentUserDirector()) {
        return { success: true, data: sanitizePatientForDirector(patient) };
      }

      // Récupérer aussi l'historique de consultations
      if (!request.includeConsultations) {
        return { success: true, data: patient };
      }

      const consultations = await query(
        `SELECT id, consultationDate as date, reason, diagnosis
         FROM consultations
         WHERE patientId = ?
         ORDER BY consultationDate DESC
         LIMIT ?`,
        [request.patientId, request.consultationLimit]
      );

      return { success: true, data: { ...patient, consultations } };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du patient:', error);
      return { success: false, error: error.message };
    }
  });

  // Chercher des patients
  ipcMain.handle('patient:search', async (event, payload) => {
    try {
      const request = normalizePatientSearchRequest(payload);
      if (!request.searchTerm) {
        return { success: true, data: [] };
      }

      const searchPattern = `${request.searchTerm}%`;
      const userContext = getCurrentUserContext();

      if (userContext.role === 'admin') {
        return { success: false, error: 'Accès refusé: un administrateur ne gère pas les patients' };
      }

      const whereParts = ['(firstName LIKE ? OR lastName LIKE ? OR email LIKE ? OR phone LIKE ? OR socialSecurityNumber LIKE ?)'];
      const params = [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern];

      if (userContext.isPractitioner && userContext.userId) {
        whereParts.push('primaryDoctorId = ?');
        params.push(userContext.userId);
      }

      if (userContext.isAssistant && userContext.userId) {
        whereParts.push('createdByUserId = ?');
        params.push(userContext.userId);
      }

      const patients = await query(
        `SELECT * FROM patients
         WHERE ${whereParts.join(' AND ')}
         ORDER BY lastName, firstName
         LIMIT ?`,
        [...params, request.limit]
      );

      if (isCurrentUserDirector()) {
        return { success: true, data: (patients || []).map(sanitizePatientForDirector) };
      }

      return { success: true, data: patients };
    } catch (error) {
      console.error('❌ Erreur lors de la recherche:', error);
      return { success: false, error: error.message };
    }
  });

  // Mettre à jour un patient
  ipcMain.handle('patient:update', async (event, patientId, patientData) => {
    try {
      if (isCurrentUserDirector()) {
        return { success: false, error: 'Accès refusé: le directeur ne peut pas modifier un patient' };
      }

      const userContext = getCurrentUserContext();
      
      if (userContext.role === 'admin') {
        return { success: false, error: 'Accès refusé: un administrateur ne gère pas les patients' };
      }

      if (userContext.isPractitioner && userContext.userId) {
        const existing = await queryOne('SELECT id, primaryDoctorId FROM patients WHERE id = ?', [patientId]);
        if (!existing || (existing.primaryDoctorId && existing.primaryDoctorId !== userContext.userId)) {
          return { success: false, error: 'Accès refusé: patient non rattaché à votre compte médecin' };
        }
      }

      if (userContext.isAssistant && userContext.userId) {
        const existing = await queryOne('SELECT id, createdByUserId FROM patients WHERE id = ?', [patientId]);
        if (!existing || (existing.createdByUserId && existing.createdByUserId !== userContext.userId)) {
          return { success: false, error: 'Accès refusé: vous ne pouvez modifier que les dossiers que vous avez créés' };
        }
      }

      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      await run(
        `UPDATE patients 
         SET firstName = ?, lastName = ?, dateOfBirth = ?, gender = ?, socialSecurityNumber = ?,
             email = ?, phone = ?, address = ?, city = ?, zipCode = ?, bloodType = ?,
             allergies = ?, medicalHistory = ?, emergencyContact = ?, emergencyPhone = ?, updatedAt = ?
         WHERE id = ?`,
        [
          toNullIfEmpty(patientData.firstName),
          toNullIfEmpty(patientData.lastName),
          toNullIfEmpty(patientData.dateOfBirth),
          toNullIfEmpty(patientData.gender),
          normalizeSocialSecurity(patientData.socialSecurityNumber),
          toNullIfEmpty(patientData.email),
          toNullIfEmpty(patientData.phone),
          toNullIfEmpty(patientData.address),
          toNullIfEmpty(patientData.city),
          toNullIfEmpty(patientData.zipCode),
          toNullIfEmpty(patientData.bloodType),
          toNullIfEmpty(patientData.allergies),
          toNullIfEmpty(patientData.medicalHistory),
          toNullIfEmpty(patientData.emergencyContact),
          toNullIfEmpty(patientData.emergencyPhone),
          now,
          patientId
        ]
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du patient:', error);
      return { success: false, error: error.message };
    }
  });

  // Supprimer un patient
  ipcMain.handle('patient:delete', async (event, patientId) => {
    try {
      if (isCurrentUserDirector()) {
        return { success: false, error: 'Accès refusé: le directeur ne peut pas supprimer un patient' };
      }

      const userContext = getCurrentUserContext();
      
      if (userContext.role === 'admin') {
        return { success: false, error: 'Accès refusé: un administrateur ne gère pas les patients' };
      }

      if (userContext.isPractitioner && userContext.userId) {
        const existing = await queryOne('SELECT id, primaryDoctorId FROM patients WHERE id = ?', [patientId]);
        if (!existing || (existing.primaryDoctorId && existing.primaryDoctorId !== userContext.userId)) {
          return { success: false, error: 'Accès refusé: patient non rattaché à votre compte médecin' };
        }
      }

      if (userContext.isAssistant && userContext.userId) {
        const existing = await queryOne('SELECT id, createdByUserId FROM patients WHERE id = ?', [patientId]);
        if (!existing || (existing.createdByUserId && existing.createdByUserId !== userContext.userId)) {
          return { success: false, error: 'Accès refusé: vous ne pouvez supprimer que les dossiers que vous avez créés' };
        }
      }

      await run('DELETE FROM patients WHERE id = ?', [patientId]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur lors de la suppression du patient:', error);
      return { success: false, error: error.message };
    }
  });
}
