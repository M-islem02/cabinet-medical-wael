/**
 * Gestionnaire IPC pour les patients
 */

import { ipcMain } from 'electron';
import { query, run, queryOne, withTransaction } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { determinePatientWorkflow } from '../patient-workflow.js';
import { checkPermission } from '../services/rbac-service.js';

const assistantPatientScopes = new Map();

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

// Assistants can schedule and collect payments, so they receive identity and
// contact data only. Clinical history and social-security data stay server-side.
function sanitizePatientForAssistant(patient) {
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
    emergencyContact: patient.emergencyContact,
    emergencyPhone: patient.emergencyPhone,
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
        pageSize: 15,
        doctorId: ''
      };
  }

  return {
    paginated: payload.paginated === true || payload.page !== undefined || payload.pageSize !== undefined || payload.searchTerm !== undefined,
    searchTerm: String(payload.searchTerm || '').trim(),
    medecinId: String(payload.medecinId || payload.doctorId || '').trim(),
    page: toPositiveInt(payload.page, 1),
    pageSize: Math.min(100, toPositiveInt(payload.pageSize, 15)),
    doctorId: String(payload.doctorId || '').trim()
  };
}

function normalizePatientByIdRequest(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      patientId: payload.id || payload.patientId || '',
      includeConsultations: payload.includeConsultations === true,
      consultationLimit: Math.min(50, toPositiveInt(payload.consultationLimit, 5)),
      doctorId: String(payload.doctorId || '').trim()
    };
  }

  return {
    patientId: payload,
    includeConsultations: false,
    consultationLimit: 5,
    doctorId: ''
  };
}

function normalizePatientSearchRequest(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      searchTerm: String(payload.searchTerm || payload.term || '').trim(),
      limit: Math.min(100, toPositiveInt(payload.limit, 50)),
      doctorId: String(payload.doctorId || '').trim()
    };
  }

  return {
    searchTerm: String(payload || '').trim(),
    limit: 50,
    doctorId: ''
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
  return {
    userId: global.currentUser?.id || null,
    role,
    isAdmin,
    isSuperAdmin,
    isPractitioner,
    isAssistant: role === 'assistant'
  };
}

async function getActivePractitioners() {
  return query(
    `SELECT id, fullName, username, role, specialty
     FROM users
     WHERE role IN ('doctor', 'dentist')
       AND COALESCE(isActive, TRUE) = TRUE
       AND COALESCE(isSuperAdmin, FALSE) = FALSE
     ORDER BY COALESCE(fullName, username), username`
  );
}

async function getPatientWorkflowConfiguration(practitioners) {
  const [packageConfig, assistantCountRow] = await Promise.all([
    queryOne('SELECT maxDoctors, maxAssistants FROM package_config LIMIT 1'),
    queryOne(
      `SELECT COUNT(*) AS count
       FROM users
       WHERE role = 'assistant'
         AND COALESCE(isActive, TRUE) = TRUE
         AND COALESCE(isSuperAdmin, FALSE) = FALSE`
    )
  ]);
  return determinePatientWorkflow({
    configuredDoctors: packageConfig?.maxDoctors,
    configuredAssistants: packageConfig?.maxAssistants,
    activeDoctors: practitioners.length,
    activeAssistants: assistantCountRow?.count
  });
}

async function resolvePatientScope(userContext, requestedDoctorId = '') {
  const practitioners = await getActivePractitioners();
  const workflow = await getPatientWorkflowConfiguration(practitioners);
  const singlePractitioner = practitioners.length === 1 ? practitioners[0] : null;
  let doctorId = '';

  if (userContext.isPractitioner) {
    doctorId = userContext.userId || '';
  } else if (userContext.isAssistant) {
    doctorId = requestedDoctorId
      || assistantPatientScopes.get(userContext.userId)
      || singlePractitioner?.id
      || practitioners[0]?.id
      || '';
  }

  if (doctorId && !practitioners.some((doctor) => doctor.id === doctorId)) {
    throw new Error('Médecin sélectionné introuvable ou inactif');
  }

  if (userContext.isAssistant && userContext.userId && doctorId) {
    assistantPatientScopes.set(userContext.userId, doctorId);
    global.activePatientDoctorId = doctorId;
  }

  // With one doctor, preserve the simple historical workflow: all existing
  // patients are automatically assigned and no selector is needed.
  if (singlePractitioner && !workflow.cabinetMode) {
    await run(
      `INSERT INTO patient_practitioners (patientId, practitionerId, assignedByUserId)
       SELECT p.id, ?, ? FROM patients p
       ON CONFLICT (patientId, practitionerId) DO NOTHING`,
      [singlePractitioner.id, userContext.userId || singlePractitioner.id]
    );
    doctorId = singlePractitioner.id;
  }

  return {
    practitioners,
    practitionerCount: practitioners.length,
    multiPractitioner: workflow.cabinetMode,
    cabinetMode: workflow.cabinetMode,
    workflowMode: workflow.workflowMode,
    configuredDoctors: workflow.configuredDoctors,
    configuredAssistants: workflow.configuredAssistants,
    activeAssistants: workflow.activeAssistants,
    assistantDoctorSelectorEnabled: workflow.assistantDoctorSelectorEnabled,
    doctorId
  };
}

async function patientIsAssigned(patientId, practitionerId) {
  if (!patientId || !practitionerId) return false;
  const assignment = await queryOne(
    'SELECT patientId FROM patient_practitioners WHERE patientId = ? AND practitionerId = ?',
    [patientId, practitionerId]
  );
  return !!assignment;
}

export function handlePatientEvents() {
  ipcMain.handle('patient:getScope', async (event, payload = {}) => {
    try {
      const userContext = getCurrentUserContext();
      if (userContext.isSuperAdmin) return { success: false, error: 'Accès refusé' };
      const scope = await resolvePatientScope(userContext, payload?.doctorId);
      return {
        success: true,
        data: {
          practitioners: scope.practitioners,
          practitionerCount: scope.practitionerCount,
          multiPractitioner: scope.multiPractitioner,
          cabinetMode: scope.cabinetMode,
          workflowMode: scope.workflowMode,
          configuredDoctors: scope.configuredDoctors,
          configuredAssistants: scope.configuredAssistants,
          activeAssistants: scope.activeAssistants,
          assistantDoctorSelectorEnabled: scope.assistantDoctorSelectorEnabled,
          selectedDoctorId: scope.doctorId,
          role: userContext.role
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Count patients (lightweight - avoids fetching all rows on large datasets)
  ipcMain.handle('patient:getCount', async (event, payload = {}) => {
    try {
      const userContext = getCurrentUserContext();
      const whereParts = [];
      const params = [];

      if (userContext.isSuperAdmin) return { success: false, error: 'Accès refusé' };
      const scope = await resolvePatientScope(userContext, payload?.doctorId);
      if ((userContext.isPractitioner || userContext.isAssistant) && scope.doctorId) {
        whereParts.push('EXISTS (SELECT 1 FROM patient_practitioners pp WHERE pp.patientId = patients.id AND pp.practitionerId = ?)');
        params.push(scope.doctorId);
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
      // Superadmin cannot manage patients
      if (userContext.isSuperAdmin) {
        return { success: false, error: 'Accès refusé' };
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

      await withTransaction(async () => {
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

        if (primaryDoctorId) {
          await run(
            `INSERT INTO patient_practitioners (patientId, practitionerId, assignedByUserId)
             VALUES (?, ?, ?)
             ON CONFLICT (patientId, practitionerId) DO NOTHING`,
            [id, primaryDoctorId, createdByUserId]
          );
        }
      });

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

      const scope = await resolvePatientScope(userContext, request.doctorId);
      if ((userContext.isPractitioner || userContext.isAssistant) && scope.doctorId) {
        whereParts.push('EXISTS (SELECT 1 FROM patient_practitioners pp WHERE pp.patientId = p.id AND pp.practitionerId = ?)');
        params.push(scope.doctorId);
      }

      if (request.searchTerm) {
        const searchPattern = `%${request.searchTerm}%`;
        whereParts.push('(p.firstName ILIKE ? OR p.lastName ILIKE ? OR p.email ILIKE ? OR p.phone ILIKE ? OR p.socialSecurityNumber ILIKE ?)');
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      if (request.medecinId) {
        whereParts.push('(p.id IN (SELECT patientId FROM patient_practitioners WHERE practitionerId = ?) OR p.primaryDoctorId = ?)');
        params.push(request.medecinId, request.medecinId);
      }

      const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
      const patientSelect = `SELECT p.*, COALESCE((
        SELECT string_agg(COALESCE(NULLIF(u.fullName, ''), u.username), ', ')
        FROM patient_practitioners pp JOIN users u ON u.id = pp.practitionerId
        WHERE pp.patientId = p.id
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
        scope: {
          multiPractitioner: scope.multiPractitioner,
          selectedDoctorId: scope.doctorId
        },
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

      if (userContext.isPractitioner) {
        const scope = await resolvePatientScope(userContext);
        if (!(await patientIsAssigned(request.patientId, scope.doctorId))) {
          return { success: false, error: 'Accès refusé: ce patient ne fait pas partie de votre liste' };
        }
      } else if (userContext.isAssistant) {
        const scope = await resolvePatientScope(userContext, request.doctorId);
        // In a multi-practitioner cabinet assistants use the global directory.
        // Their response is restricted to non-clinical fields below.
        if (!scope.cabinetMode && !(await patientIsAssigned(request.patientId, scope.doctorId))) {
          return { success: false, error: 'Accès refusé: patient absent de la liste du médecin sélectionné' };
        }
      }

      if (isCurrentUserDirector()) {
        return { success: true, data: sanitizePatientForDirector(patient) };
      }

      if (userContext.isAssistant) {
        return { success: true, data: sanitizePatientForAssistant(patient) };
      }

      const assignedMedecins = await query(
        `SELECT u.id, u.username, u.fullName as name, u.role, u.specialty,
                (p.primaryDoctorId = u.id) AS isPrimary, pp.assignedAt
         FROM patient_practitioners pp
         JOIN patients p ON p.id = pp.patientId
         LEFT JOIN users u ON u.id = pp.practitionerId
         WHERE pp.patientId = ?
         ORDER BY (p.primaryDoctorId = u.id) DESC, pp.assignedAt ASC`,
        [request.patientId]
      );
      const patientWithMedecins = { ...patient, assignedMedecins };

      // Récupérer aussi l'historique de consultations
      if (!request.includeConsultations) {
        return { success: true, data: patientWithMedecins };
      }

      const consultationWhereParts = ['patientId = ?'];
      const consultationParams = [request.patientId];
      if (!userContext.isAdmin && userContext.isPractitioner && userContext.userId) {
        consultationWhereParts.push('doctorId = ?');
        consultationParams.push(userContext.userId);
      }
      consultationParams.push(request.consultationLimit);

      const consultations = await query(
        `SELECT id, consultationDate as date, reason, diagnosis
         FROM consultations
         WHERE ${consultationWhereParts.join(' AND ')}
         ORDER BY consultationDate DESC
         LIMIT ?`,
        consultationParams
      );

      return { success: true, data: { ...patientWithMedecins, consultations } };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du patient:', error);
      return { success: false, error: error.message };
    }
  });

  // Cabinet-wide identity directory. It deliberately excludes clinical fields.
  ipcMain.handle('patient:getDirectory', async (event, payload = {}) => {
    try {
      const request = normalizePatientListRequest(payload);
      const userContext = getCurrentUserContext();
      if (userContext.isSuperAdmin) return { success: false, error: 'Accès refusé' };
      const scope = await resolvePatientScope(userContext, request.doctorId);
      if (!scope.cabinetMode) {
        return { success: false, error: 'Le répertoire global est réservé aux cabinets avec plusieurs médecins' };
      }
      const params = [];
      let searchClause = '';
      if (request.searchTerm) {
        const pattern = `%${request.searchTerm}%`;
        searchClause = `WHERE (p.firstName ILIKE ? OR p.lastName ILIKE ? OR p.phone ILIKE ? OR p.email ILIKE ?)`;
        params.push(pattern, pattern, pattern, pattern);
      }

      const totalRow = await queryOne(`SELECT COUNT(*) AS total FROM patients p ${searchClause}`, params);
      const pagination = buildPaginationMeta(totalRow?.total || 0, request.page, request.pageSize);
      const currentPage = Math.min(pagination.page, pagination.totalPages);
      const offset = (currentPage - 1) * pagination.pageSize;
      const rows = await query(
        `SELECT p.id, p.firstName, p.lastName, p.dateOfBirth, p.gender, p.phone,
                COALESCE(STRING_AGG(DISTINCT COALESCE(u.fullName, u.username), ', '), '') AS assignedDoctors,
                COALESCE(BOOL_OR(pp.practitionerId = ?), FALSE) AS isAssigned
         FROM patients p
         LEFT JOIN patient_practitioners pp ON pp.patientId = p.id
         LEFT JOIN users u ON u.id = pp.practitionerId
         ${searchClause}
         GROUP BY p.id, p.firstName, p.lastName, p.dateOfBirth, p.gender, p.phone
         ORDER BY p.lastName, p.firstName
         LIMIT ? OFFSET ?`,
        [scope.doctorId || null, ...params, pagination.pageSize, offset]
      );

      return {
        success: true,
        data: rows,
        pagination: { ...pagination, page: currentPage },
        scope: { selectedDoctorId: scope.doctorId, multiPractitioner: scope.multiPractitioner }
      };
    } catch (error) {
      console.error('Erreur lors du chargement du répertoire patient:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('patient:attach', async (event, payload = {}) => {
    try {
      const userContext = getCurrentUserContext();
      if (userContext.isSuperAdmin || (!userContext.isPractitioner && !userContext.isAssistant)) {
        return { success: false, error: 'Accès refusé' };
      }
      const patientId = String(payload.patientId || '').trim();
      if (!patientId || !(await queryOne('SELECT id FROM patients WHERE id = ?', [patientId]))) {
        return { success: false, error: 'Patient introuvable' };
      }
      const scope = await resolvePatientScope(userContext, payload.doctorId);
      if (!scope.doctorId) return { success: false, error: 'Aucun médecin sélectionné' };
      if (!scope.cabinetMode) {
        return { success: false, error: 'Le rattachement multiple est réservé au mode cabinet' };
      }

      await withTransaction(async () => {
        await run(
          `INSERT INTO patient_practitioners (patientId, practitionerId, assignedByUserId)
           VALUES (?, ?, ?)
           ON CONFLICT (patientId, practitionerId) DO NOTHING`,
          [patientId, scope.doctorId, userContext.userId]
        );
        await run(
          'UPDATE patients SET primaryDoctorId = COALESCE(primaryDoctorId, ?), updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
          [scope.doctorId, patientId]
        );
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('patient:detach', async (event, payload = {}) => {
    try {
      const userContext = getCurrentUserContext();
      if (userContext.isSuperAdmin || (!userContext.isPractitioner && !userContext.isAssistant)) {
        return { success: false, error: 'Accès refusé' };
      }
      const patientId = String(payload.patientId || '').trim();
      const scope = await resolvePatientScope(userContext, payload.doctorId);
      if (!patientId || !scope.doctorId) return { success: false, error: 'Patient ou médecin manquant' };
      if (!scope.multiPractitioner) {
        return { success: false, error: 'Le mode cabinet simple ne nécessite pas de séparation des patients' };
      }

      await withTransaction(async () => {
        await run('DELETE FROM patient_practitioners WHERE patientId = ? AND practitionerId = ?', [patientId, scope.doctorId]);
        const replacement = await queryOne(
          'SELECT practitionerId FROM patient_practitioners WHERE patientId = ? ORDER BY assignedAt LIMIT 1',
          [patientId]
        );
        await run(
          `UPDATE patients
           SET primaryDoctorId = CASE WHEN primaryDoctorId = ? THEN ? ELSE primaryDoctorId END,
               updatedAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [scope.doctorId, replacement?.practitionerId || null, patientId]
        );
      });
      return { success: true };
    } catch (error) {
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
      const scope = await resolvePatientScope(userContext, request.doctorId);
      if ((userContext.isPractitioner || userContext.isAssistant) && scope.doctorId) {
        whereParts.push('EXISTS (SELECT 1 FROM patient_practitioners pp WHERE pp.patientId = patients.id AND pp.practitionerId = ?)');
        params.push(scope.doctorId);
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

      if (userContext.isSuperAdmin) {
        return { success: false, error: 'Accès refusé' };
      }

      if (userContext.isPractitioner) {
        const scope = await resolvePatientScope(userContext);
        if (!(await patientIsAssigned(patientId, scope.doctorId))) {
          return { success: false, error: 'Accès refusé: patient non rattaché à votre compte médecin' };
        }
      } else if (userContext.isAssistant) {
        const scope = await resolvePatientScope(userContext, patientData.scopeDoctorId);
        if (!(await patientIsAssigned(patientId, scope.doctorId))) {
          return { success: false, error: 'Accès refusé: patient absent de la liste du médecin sélectionné' };
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

      const scope = await resolvePatientScope(userContext);
      if (scope.multiPractitioner) {
        return { success: false, error: 'Retirez le patient de votre liste au lieu de supprimer son dossier global' };
      }
      if ((userContext.isPractitioner || userContext.isAssistant)
          && !(await patientIsAssigned(patientId, scope.doctorId))) {
        return { success: false, error: 'Accès refusé: patient non rattaché au médecin sélectionné' };
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
        `SELECT u.id, u.username, u.fullName as name, u.role, u.specialty,
                (p.primaryDoctorId = u.id) AS isPrimary, pp.assignedAt
         FROM patient_practitioners pp
         JOIN patients p ON p.id = pp.patientId
         LEFT JOIN users u ON u.id = pp.practitionerId
         WHERE pp.patientId = ?
         ORDER BY (p.primaryDoctorId = u.id) DESC, pp.assignedAt ASC`,
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
      await run(
        `INSERT INTO patient_practitioners (patientId, practitionerId, assignedByUserId)
         VALUES (?, ?, ?)
         ON CONFLICT (patientId, practitionerId) DO NOTHING`,
        [patientId, medecinId, assignedBy]
      );
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
      await run('DELETE FROM patient_practitioners WHERE patientId = ? AND practitionerId = ?', [patientId, medecinId]);
      const current = await queryOne('SELECT primaryDoctorId FROM patients WHERE id = ?', [patientId]);
      if (current?.primaryDoctorId === medecinId) {
        const next = await queryOne(
          'SELECT practitionerId FROM patient_practitioners WHERE patientId = ? ORDER BY assignedAt ASC LIMIT 1',
          [patientId]
        );
        await run('UPDATE patients SET primaryDoctorId = ? WHERE id = ?', [next?.practitionerId || null, patientId]);
      }
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur unassignMedecin:', error);
      return { success: false, error: error.message };
    }
  });
}
