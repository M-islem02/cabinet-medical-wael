/**
 * Gestionnaire IPC pour les patients
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { checkPermission } from '../services/rbac-service.js';

// Helper pour convertir les valeurs vides en null (MariaDB compatibility)
const toNullIfEmpty = (val) => (val === '' || val === undefined) ? null : val;

function getAssistantPatientScopeClause() {
  return '1=1';
}

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
        pageSize: 15
      };
  }

  return {
    paginated: payload.paginated === true || payload.page !== undefined || payload.pageSize !== undefined || payload.searchTerm !== undefined,
    searchTerm: String(payload.searchTerm || '').trim(),
    medecinId: String(payload.medecinId || payload.doctorId || '').trim(),
    page: toPositiveInt(payload.page, 1),
    pageSize: Math.min(100, toPositiveInt(payload.pageSize, 15))
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
  const isAdmin = !!global.currentUser?.isAdmin;
  const isSuperAdmin = !!global.currentUser?.isSuperAdmin;
  const isPractitioner = role === 'doctor' || role === 'dentist';
  // A doctor-admin (isPractitioner && isAdmin) sees the whole cabinet — same scope as assistant.
  // A normal practitioner (isPractitioner && !isAdmin) is scoped to their own patients.
  return {
    userId: global.currentUser?.id || null,
    role,
    isAdmin,
    isSuperAdmin,
    isPractitioner,
    isAssistant: role === 'assistant',
    isDoctorAdmin: isPractitioner && isAdmin
  };
}

export function handlePatientEvents() {
  // Count patients (lightweight - avoids fetching all rows on large datasets)
  ipcMain.handle('patient:getCount', async () => {
    try {
      const userContext = getCurrentUserContext();
      const whereParts = [];
      const params = [];

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
      // Superadmin cannot manage patients
      if (userContext.isSuperAdmin) {
        return { success: false, error: 'Accès refusé' };
      }

      const packageConfig = await queryOne('SELECT cabinetType FROM package_config LIMIT 1');
      if (packageConfig?.cabinetType === 'multiple' && userContext.isPractitioner && userContext.userId) {
        const assignment = await queryOne(
          'SELECT id FROM patient_medecins WHERE patientId = ? AND medecinId = ?',
          [request.patientId, userContext.userId]
        );
        if (!assignment && patient.primaryDoctorId !== userContext.userId) {
          return { success: false, error: 'Accès refusé à ce dossier patient' };
        }
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

        // Target must be a practitioner (doctor or dentist) and must not be the superadmin.
        // Doctor-admin (role='doctor', isAdmin=1) is a valid target.
        const validPractitionerRole = targetDoctor.role === 'doctor' || targetDoctor.role === 'dentist';
        if (!validPractitionerRole || targetDoctor.isSuperAdmin) {
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

      // Superadmin cannot access clinical data
      if (userContext.isSuperAdmin) {
        return { success: false, error: 'Accès refusé: le super administrateur n\'a pas accès aux dossiers cliniques' };
      }

      const packageConfig = await queryOne('SELECT cabinetType FROM package_config LIMIT 1');
      const isMultipleCabinet = packageConfig?.cabinetType === 'multiple';
      if (isMultipleCabinet && userContext.isPractitioner && userContext.userId) {
        whereParts.push('(p.id IN (SELECT patientId FROM patient_medecins WHERE medecinId = ?) OR p.primaryDoctorId = ?)');
        params.push(userContext.userId, userContext.userId);
      }

      if (request.searchTerm) {
        const searchPattern = `%${request.searchTerm}%`;
        whereParts.push('(p.firstName ILIKE ? OR p.lastName ILIKE ? OR p.email ILIKE ? OR p.phone ILIKE ? OR p.socialSecurityNumber ILIKE ?)');
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      if (request.medecinId) {
        whereParts.push('(p.id IN (SELECT patientId FROM patient_medecins WHERE medecinId = ?) OR p.primaryDoctorId = ?)');
        params.push(request.medecinId, request.medecinId);
      }

      const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
      const patientSelect = `SELECT p.*, COALESCE((
        SELECT string_agg(COALESCE(NULLIF(u.fullName, ''), u.username), ', ')
        FROM patient_medecins pm JOIN users u ON u.id = pm.medecinId
        WHERE pm.patientId = p.id
      ), '') AS assignedMedecinsLabel`;

      if (!request.paginated) {
        const patients = await query(`${patientSelect} FROM patients p ${whereClause} ORDER BY p.lastName, p.firstName`, params);
        if (isCurrentUserDirector()) {
          return { success: true, data: (patients || []).map(sanitizePatientForDirector) };
        }
        return { success: true, data: patients };
      }

      const totalRow = await queryOne(`SELECT COUNT(*) as total FROM patients p ${whereClause}`, params);
      const pagination = buildPaginationMeta(totalRow?.total || 0, request.page, request.pageSize);
      const currentPage = Math.min(pagination.page, pagination.totalPages);
      const offset = (currentPage - 1) * pagination.pageSize;
      const patients = await query(
        `${patientSelect} FROM patients p ${whereClause} ORDER BY p.lastName, p.firstName LIMIT ? OFFSET ?`,
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

      // Superadmin cannot access clinical data
      if (userContext.isSuperAdmin) {
        return { success: false, error: 'Accès refusé' };
      }

      // Doctors and assistants can view cabinet-wide patient dossiers.

      if (isCurrentUserDirector()) {
        return { success: true, data: sanitizePatientForDirector(patient) };
      }

      const assignedMedecins = await query(
        `SELECT u.id, u.username, u.fullName as name, u.role, u.specialty, pm.isPrimary, pm.assignedAt
         FROM patient_medecins pm
         LEFT JOIN users u ON u.id = pm.medecinId
         WHERE pm.patientId = ?
         ORDER BY pm.isPrimary DESC, pm.assignedAt ASC`,
        [request.patientId]
      );
      const patientWithMedecins = { ...patient, assignedMedecins };

      // Récupérer aussi l'historique de consultations
      if (!request.includeConsultations) {
        return { success: true, data: patientWithMedecins };
      }

      const consultations = await query(
        `SELECT id, consultationDate as date, reason, diagnosis
         FROM consultations
         WHERE patientId = ?
         ORDER BY consultationDate DESC
         LIMIT ?`,
        [request.patientId, request.consultationLimit]
      );

      return { success: true, data: { ...patientWithMedecins, consultations } };
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

      const searchPattern = `%${request.searchTerm}%`;
      const userContext = getCurrentUserContext();

      if (userContext.isSuperAdmin) {
        return { success: false, error: 'Accès refusé' };
      }

      const whereParts = ['(firstName ILIKE ? OR lastName ILIKE ? OR email ILIKE ? OR phone ILIKE ? OR socialSecurityNumber ILIKE ?)'];
      const params = [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern];

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

      if (userContext.isSuperAdmin) {
        return { success: false, error: 'Accès refusé' };
      }

      // Normal practitioner scoped to own patients only
      if (userContext.isPractitioner && !userContext.isDoctorAdmin && userContext.userId) {
        const existing = await queryOne('SELECT id, primaryDoctorId FROM patients WHERE id = ?', [patientId]);
        if (!existing || (existing.primaryDoctorId && existing.primaryDoctorId !== userContext.userId)) {
          return { success: false, error: 'Accès refusé: patient non rattaché à votre compte médecin' };
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

      if (userContext.isSuperAdmin) {
        return { success: false, error: 'Accès refusé' };
      }

      // Normal practitioner scoped to own patients only
      if (userContext.isPractitioner && !userContext.isDoctorAdmin && userContext.userId) {
        const existing = await queryOne('SELECT id, primaryDoctorId FROM patients WHERE id = ?', [patientId]);
        if (!existing || (existing.primaryDoctorId && existing.primaryDoctorId !== userContext.userId)) {
          return { success: false, error: 'Accès refusé: patient non rattaché à votre compte médecin' };
        }
      }

      await run('DELETE FROM patients WHERE id = ?', [patientId]);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur lors de la suppression du patient:', error);
      return { success: false, error: error.message };
    }
  });

  // ─── Patient ↔ Médecin (many-to-many) ─────────────────────────────────────

  ipcMain.handle('patient:getMedecins', async (event, patientId) => {
    try {
      const medecins = await query(
        `SELECT u.id, u.username, u.fullName as name, u.role, u.specialty, pm.isPrimary, pm.assignedAt
         FROM patient_medecins pm
         LEFT JOIN users u ON u.id = pm.medecinId
         WHERE pm.patientId = ?
         ORDER BY pm.isPrimary DESC, pm.assignedAt ASC`,
        [patientId]
      );
      return { success: true, data: medecins };
    } catch (error) {
      console.error('❌ Erreur getMedecins:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('patient:assignMedecin', async (event, payload) => {
    try {
      if (!checkPermission(global.currentUser, 'patients:write-assigned') && !checkPermission(global.currentUser, 'patients:write')) {
        return { success: false, error: 'Accès refusé' };
      }
      const patientId = payload?.patientId;
      const medecinId = payload?.medecinId;
      const isPrimary = payload?.isPrimary === true;
      const assignedBy = global.currentUser?.id || null;
      if (!patientId || !medecinId) {
        return { success: false, error: 'patientId et medecinId requis' };
      }
      const existing = await queryOne(
        'SELECT id FROM patient_medecins WHERE patientId = ? AND medecinId = ?',
        [patientId, medecinId]
      );
      if (existing) {
        await run('UPDATE patient_medecins SET isPrimary = ? WHERE id = ?', [isPrimary, existing.id]);
      } else {
        const id = uuidv4();
        await run(
          'INSERT INTO patient_medecins (id, patientId, medecinId, isPrimary, assignedBy) VALUES (?, ?, ?, ?, ?)',
          [id, patientId, medecinId, isPrimary, assignedBy]
        );
      }
      if (isPrimary) {
        await run('UPDATE patients SET primaryDoctorId = ? WHERE id = ?', [medecinId, patientId]);
      }
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur assignMedecin:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('patient:unassignMedecin', async (event, payload) => {
    try {
      if (!checkPermission(global.currentUser, 'patients:write-assigned') && !checkPermission(global.currentUser, 'patients:write')) {
        return { success: false, error: 'Accès refusé' };
      }
      const patientId = payload?.patientId;
      const medecinId = payload?.medecinId;
      if (!patientId || !medecinId) {
        return { success: false, error: 'patientId et medecinId requis' };
      }
      await run('DELETE FROM patient_medecins WHERE patientId = ? AND medecinId = ?', [patientId, medecinId]);
      const current = await queryOne('SELECT primaryDoctorId FROM patients WHERE id = ?', [patientId]);
      if (current?.primaryDoctorId === medecinId) {
        const next = await queryOne(
          'SELECT medecinId FROM patient_medecins WHERE patientId = ? ORDER BY isPrimary DESC, assignedAt ASC LIMIT 1',
          [patientId]
        );
        await run('UPDATE patients SET primaryDoctorId = ? WHERE id = ?', [next?.medecinId || null, patientId]);
      }
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur unassignMedecin:', error);
      return { success: false, error: error.message };
    }
  });
}
