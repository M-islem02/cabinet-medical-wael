import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, run, withTransaction } from '../database-unified.js';
import {
  ipcError,
  registerContractHandlers
} from '../ipc/contract-handler.js';

const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const nullable = (value) => (value === '' || value === undefined ? null : value);
const numeric = (value) => {
  if (value === '' || value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const textOrJson = (value) => {
  if (value === '' || value === undefined || value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
};
const frequency = (prescription, fallback = null) => {
  if (!prescription || typeof prescription !== 'object') return fallback;
  const perWeek = Number(prescription.sessionsPerWeek || 0);
  const weeks = Number(prescription.weeks || 0);
  return `${perWeek}x/sem pendant ${weeks} sem`;
};

async function requirePatient(patientId) {
  const patient = await queryOne('SELECT id FROM patients WHERE id = ?', [patientId]);
  if (!patient) ipcError('PATIENT_NOT_FOUND', 'Patient not found');
}

async function requireRecord(table, id, code, message, lock = false) {
  const record = await queryOne(
    `SELECT * FROM ${table} WHERE id = ?${lock ? ' FOR UPDATE' : ''}`,
    [id]
  );
  if (!record) ipcError(code, message);
  return record;
}

function registerClinicalExamHandlers() {
  registerContractHandlers(ipcMain, 'clinicalExam', {
    async create(data) {
      await requirePatient(data.patientId);
      const id = uuidv4();
      const now = nowSql();
      await run(
        `INSERT INTO clinical_exams
          (id, patientId, consultationId, examDate, examinerId, jointRanges,
           muscleStrength, muscleTone, posture, postureNotes, sensitivity,
           sensitivityNotes, reflexes, reflexNotes, gait, gaitNotes, notes,
           createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.patientId, nullable(data.consultationId), data.examDate || now.slice(0, 10),
          nullable(data.examinerId), textOrJson(data.jointRanges), textOrJson(data.muscleStrength),
          textOrJson(data.muscleTone), textOrJson(data.posture), nullable(data.postureNotes),
          textOrJson(data.sensitivity), nullable(data.sensitivityNotes), textOrJson(data.reflexes),
          nullable(data.reflexNotes), textOrJson(data.gait), nullable(data.gaitNotes),
          nullable(data.notes), now, now]
      );
      return { id };
    },

    async getByPatient(patientId) {
      await requirePatient(patientId);
      return query(
        `SELECT ce.*, u.fullName AS "examinerName"
         FROM clinical_exams ce LEFT JOIN users u ON u.id=ce.examinerId
         WHERE ce.patientId=? ORDER BY ce.examDate DESC, ce.createdAt DESC`,
        [patientId]
      );
    },

    async getById(id) {
      return requireRecord('clinical_exams', id, 'CLINICAL_EXAM_NOT_FOUND', 'Clinical examination not found');
    },

    async update(id, data) {
      const current = await requireRecord('clinical_exams', id, 'CLINICAL_EXAM_NOT_FOUND', 'Clinical examination not found');
      await run(
        `UPDATE clinical_exams SET consultationId=?, examDate=?, examinerId=?, jointRanges=?,
          muscleStrength=?, muscleTone=?, posture=?, postureNotes=?, sensitivity=?,
          sensitivityNotes=?, reflexes=?, reflexNotes=?, gait=?, gaitNotes=?, notes=?, updatedAt=?
         WHERE id=?`,
        [nullable(data.consultationId ?? current.consultationId), data.examDate || current.examDate,
          nullable(data.examinerId ?? current.examinerId), textOrJson(data.jointRanges ?? current.jointRanges),
          textOrJson(data.muscleStrength ?? current.muscleStrength), textOrJson(data.muscleTone ?? current.muscleTone),
          textOrJson(data.posture ?? current.posture), nullable(data.postureNotes ?? current.postureNotes),
          textOrJson(data.sensitivity ?? current.sensitivity), nullable(data.sensitivityNotes ?? current.sensitivityNotes),
          textOrJson(data.reflexes ?? current.reflexes), nullable(data.reflexNotes ?? current.reflexNotes),
          textOrJson(data.gait ?? current.gait), nullable(data.gaitNotes ?? current.gaitNotes),
          nullable(data.notes ?? current.notes), nowSql(), id]
      );
      return { id };
    },

    async delete(id) {
      await requireRecord('clinical_exams', id, 'CLINICAL_EXAM_NOT_FOUND', 'Clinical examination not found');
      await run('DELETE FROM clinical_exams WHERE id=?', [id]);
      return { id };
    }
  });
}

function registerProgressHandlers() {
  registerContractHandlers(ipcMain, 'patientProgress', {
    async create(data) {
      await requirePatient(data.patientId);
      const id = uuidv4();
      await run(
        `INSERT INTO patient_progress
          (id, patientId, evaluationDate, evaluatorId, category, previousScore,
           currentScore, improvement, status, patientAdherence, notes, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.patientId, data.evaluationDate || nowSql(), nullable(data.evaluatorId),
          nullable(data.category), numeric(data.previousScore), numeric(data.currentScore),
          nullable(data.improvement), nullable(data.status), nullable(data.patientAdherence),
          nullable(data.notes), nowSql()]
      );
      return { id };
    },

    async getByPatient(patientId) {
      await requirePatient(patientId);
      return query(
        `SELECT pp.*, u.fullName AS "evaluatorName" FROM patient_progress pp
         LEFT JOIN users u ON u.id=pp.evaluatorId
         WHERE pp.patientId=? ORDER BY pp.evaluationDate DESC`,
        [patientId]
      );
    },

    async getLatest(patientId) {
      await requirePatient(patientId);
      return await queryOne(
        `SELECT * FROM patient_progress WHERE patientId=?
         ORDER BY evaluationDate DESC, createdAt DESC LIMIT 1`,
        [patientId]
      ) || {};
    },

    async getEvolution(patientId, startDate, endDate) {
      await requirePatient(patientId);
      const params = [patientId];
      let sql = 'SELECT * FROM patient_progress WHERE patientId=?';
      if (startDate) { sql += ' AND evaluationDate >= ?'; params.push(startDate); }
      if (endDate) { sql += ' AND evaluationDate <= ?'; params.push(endDate); }
      sql += ' ORDER BY evaluationDate ASC';
      return query(sql, params);
    }
  });
}

function registerPatientEquipmentHandlers() {
  registerContractHandlers(ipcMain, 'patientEquipment', {
    async create(data) {
      await requirePatient(data.patientId);
      const id = uuidv4();
      const now = nowSql();
      await run(
        `INSERT INTO patient_equipment
          (id, patientId, consultationId, prescribedBy, equipmentType, equipmentName,
           description, prescriptionDate, deliveryDate, supplier, status, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.patientId, nullable(data.consultationId), nullable(data.prescribedBy),
          data.equipmentType, data.equipmentName, nullable(data.description),
          data.prescriptionDate || now.slice(0, 10), nullable(data.deliveryDate),
          nullable(data.supplier), data.status || 'prescribed', nullable(data.notes), now, now]
      );
      return { id };
    },

    async getByPatient(patientId) {
      await requirePatient(patientId);
      return query(
        `SELECT pe.*, u.fullName AS "prescriberName" FROM patient_equipment pe
         LEFT JOIN users u ON u.id=pe.prescribedBy
         WHERE pe.patientId=? ORDER BY pe.prescriptionDate DESC`,
        [patientId]
      );
    },

    async getById(id) {
      return requireRecord('patient_equipment', id, 'PATIENT_EQUIPMENT_NOT_FOUND', 'Patient equipment not found');
    },

    async update(id, data) {
      const current = await requireRecord('patient_equipment', id, 'PATIENT_EQUIPMENT_NOT_FOUND', 'Patient equipment not found');
      await run(
        `UPDATE patient_equipment SET consultationId=?, prescribedBy=?, equipmentType=?,
          equipmentName=?, description=?, prescriptionDate=?, deliveryDate=?, supplier=?,
          status=?, notes=?, updatedAt=? WHERE id=?`,
        [nullable(data.consultationId ?? current.consultationId), nullable(data.prescribedBy ?? current.prescribedBy),
          data.equipmentType || current.equipmentType, data.equipmentName || current.equipmentName,
          nullable(data.description ?? current.description), data.prescriptionDate || current.prescriptionDate,
          nullable(data.deliveryDate ?? current.deliveryDate), nullable(data.supplier ?? current.supplier),
          data.status || current.status, nullable(data.notes ?? current.notes), nowSql(), id]
      );
      return { id };
    },

    async delete(id) {
      await requireRecord('patient_equipment', id, 'PATIENT_EQUIPMENT_NOT_FOUND', 'Patient equipment not found');
      await run('DELETE FROM patient_equipment WHERE id=?', [id]);
      return { id };
    }
  });
}

function registerRehabilitationGapHandlers() {
  registerContractHandlers(ipcMain, 'rehabilitationPlan', {
    async update(id, data) {
      const current = await requireRecord('rehabilitation_plans', id, 'REHABILITATION_PLAN_NOT_FOUND', 'Rehabilitation plan not found');
      const kine = data.kinePrescription;
      const ergo = data.ergoPrescription;
      const ortho = data.orthoPrescription;
      const totalSessions = [kine, ergo, ortho].reduce(
        (sum, item) => sum + (Number(item?.sessionsPerWeek || 0) * Number(item?.weeks || 0)),
        0
      );
      await run(
        `UPDATE rehabilitation_plans SET startDate=?, endDate=?, status=?, shortTermObjectives=?,
          mediumTermObjectives=?, longTermObjectives=?, kinesiotherapy=?, kinesiotherapyFrequency=?,
          ergotherapy=?, ergotherapyFrequency=?, speechTherapy=?, speechTherapyFrequency=?,
          otherEquipment=?, equipmentDetails=?, totalSessions=?, notes=?, updatedAt=? WHERE id=?`,
        [data.startDate || current.startDate, nullable(data.endDate ?? current.endDate), data.status || current.status,
          nullable(data.shortTermObjectives ?? data.objectives?.shortTerm ?? current.shortTermObjectives),
          nullable(data.mediumTermObjectives ?? data.objectives?.mediumTerm ?? current.mediumTermObjectives),
          nullable(data.longTermObjectives ?? data.objectives?.longTerm ?? current.longTermObjectives),
          kine ? Number(kine.sessionsPerWeek || 0) : current.kinesiotherapy,
          frequency(kine, current.kinesiotherapyFrequency),
          ergo ? Number(ergo.sessionsPerWeek || 0) : current.ergotherapy,
          frequency(ergo, current.ergotherapyFrequency),
          ortho ? Number(ortho.sessionsPerWeek || 0) : current.speechTherapy,
          frequency(ortho, current.speechTherapyFrequency),
          textOrJson(data.equipment ?? current.otherEquipment), nullable(data.equipmentDetails ?? current.equipmentDetails),
          kine || ergo || ortho ? totalSessions : current.totalSessions,
          nullable(data.notes ?? current.notes), nowSql(), id]
      );
      return { id };
    }
  });

  registerContractHandlers(ipcMain, 'rehabilitationSession', {
    async getByTherapist(therapistId) {
      return query(
        `SELECT rs.*, p.firstName, p.lastName FROM rehabilitation_sessions rs
         JOIN patients p ON p.id=rs.patientId
         WHERE rs.therapistId=? ORDER BY rs.sessionDate DESC`,
        [therapistId]
      );
    }
  });
}

function registerPlanGapHandlers() {
  registerContractHandlers(ipcMain, 'plans', {
    async getFinancialStats(filters = {}) {
      return withTransaction(async () => {
        const params = [];
        let where = '1=1';
        if (filters.startDate) { where += ' AND createdAt >= ?'; params.push(filters.startDate); }
        if (filters.endDate) { where += ' AND createdAt <= ?'; params.push(filters.endDate); }
        const totals = await queryOne(
          `SELECT COUNT(*)::int AS "planCount",
             COALESCE(SUM(totalCost),0) AS totalCost,
             COALESCE(SUM(totalPaid),0) AS totalPaid,
             COALESCE(SUM(totalCost-totalPaid),0) AS outstanding
           FROM treatment_plans WHERE ${where}`,
          params
        );
        const byStatus = await query(
          `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(totalCost),0) AS totalCost,
             COALESCE(SUM(totalPaid),0) AS totalPaid
           FROM treatment_plans WHERE ${where} GROUP BY status ORDER BY status`,
          params
        );
        return { ...totals, byStatus };
      }, { isolationLevel: 'REPEATABLE READ' });
    },

    async updateSessionStatus(sessionId, status) {
      return withTransaction(async () => {
        const session = await requireRecord(
          'plan_payment_sessions', sessionId,
          'PLAN_SESSION_NOT_FOUND', 'Treatment-plan session not found', true
        );
        if (status === 'paid' && Number(session.paidAmount || 0) <= 0) {
          ipcError('PAYMENT_REQUIRED', 'A positive payment is required before marking the session as paid');
        }
        await run('UPDATE plan_payment_sessions SET status=? WHERE id=?', [status, sessionId]);
        const totals = await queryOne(
          `SELECT COALESCE(SUM(paidAmount),0) AS totalPaid
           FROM plan_payment_sessions WHERE planId=?`,
          [session.planId]
        );
        await run(
          `UPDATE treatment_plans SET totalPaid=?, updatedAt=? WHERE id=?`,
          [Number(totals?.totalPaid || 0), nowSql(), session.planId]
        );
        return { id: sessionId, status };
      });
    }
  });
}

export function handleClinicalRehabilitationContractEvents() {
  registerClinicalExamHandlers();
  registerProgressHandlers();
  registerPatientEquipmentHandlers();
  registerRehabilitationGapHandlers();
  registerPlanGapHandlers();
  console.log('Clinical/rehabilitation IPC contract handlers registered');
}
