import fs from 'fs';
import path from 'path';
import process from 'process';
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';

const DEFAULTS = {
  patients: 1500,
  consultations: 6000,
  prescriptions: 3500,
  payments: 3500,
  appointments: 5000,
  documents: 1800,
  inventory: 400
};

const FIRST_NAMES = [
  'Mohamed', 'Ahmed', 'Yacine', 'Islam', 'Imene', 'Asma', 'Aya', 'Lina', 'Nour', 'Sarra',
  'Rania', 'Amine', 'Sofiane', 'Walid', 'Meriem', 'Abir', 'Samir', 'Nadia', 'Khaled', 'Nesrine'
];

const LAST_NAMES = [
  'Bounouala', 'Tektak', 'Messaoudi', 'Benali', 'Bouzid', 'Khelifi', 'Saadi', 'Amrani', 'Brahimi',
  'Mekki', 'Hamidi', 'Talbi', 'Belaid', 'Ouali', 'Cherifi', 'Haddad', 'Kaci', 'Aouadi', 'Ferhat', 'Guerfi'
];

const CITIES = ['Drean', 'El Tarf', 'Annaba', 'Skikda', 'Constantine', 'Alger', 'Oran', 'Setif'];
const GENDERS = ['Homme', 'Femme'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'O+', 'O-'];
const CONSULTATION_TYPES = ['Consultation', 'Controle', 'Urgence', 'Suivi', 'Premiere visite'];
const APPOINTMENT_TYPES = ['Consultation', 'Controle', 'Reeducation', 'Bilan', 'Suivi'];
const APPOINTMENT_STATUS = ['scheduled', 'confirmed', 'completed', 'pending'];
const PAYMENT_METHODS = ['Especes', 'Carte', 'Virement'];
const DOCUMENT_CATEGORIES = ['facture', 'rapport', 'orientation', 'faire-svp', 'certificat'];
const INVENTORY_CATEGORIES = [
  'Consommables medicaux',
  'Equipements de reeducation',
  'Materiel de bureau',
  'Produits d hygiene',
  'Medicaments locaux',
  'Electrotherapie'
];

function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    tag: `perf-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (key in options && next && !next.startsWith('--')) {
      options[key] = key === 'tag' ? next : Number(next);
      i += 1;
    }
  }

  return options;
}

function getAppDataDirectory() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return process.env.APPDATA;
  }
  if (process.env.XDG_CONFIG_HOME) {
    return process.env.XDG_CONFIG_HOME;
  }
  if (process.env.HOME) {
    return path.join(process.env.HOME, '.config');
  }
  throw new Error('Impossible de localiser le dossier AppData');
}

function loadDatabaseConfig() {
  const baseDir = path.join(getAppDataDirectory(), 'physiocare');
  const configPath = path.join(baseDir, 'database-config.json');
  const sqlitePath = path.join(baseDir, 'physiocare.db');

  if (!fs.existsSync(configPath)) {
    return { type: 'sqlite', sqlitePath };
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return {
    ...config,
    sqlitePath,
    baseDir
  };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[randomInt(0, list.length - 1)];
}

function randomDateWithinDays(daysBack = 365) {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(0, daysBack));
  date.setHours(randomInt(8, 17), pick([0, 15, 30, 45]), 0, 0);
  return date;
}

function randomFutureDateWithinDays(daysAhead = 365) {
  const date = new Date();
  date.setDate(date.getDate() + randomInt(0, daysAhead));
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function makePatient(tag, index) {
  const firstName = pick(FIRST_NAMES);
  const lastName = `${pick(LAST_NAMES)} ${index}`;
  const birthDate = new Date();
  birthDate.setFullYear(birthDate.getFullYear() - randomInt(18, 82));
  birthDate.setMonth(randomInt(0, 11), randomInt(1, 28));
  const city = pick(CITIES);

  return {
    id: crypto.randomUUID(),
    firstName,
    lastName,
    dateOfBirth: formatDate(birthDate),
    gender: pick(GENDERS),
    phone: `0${randomInt(500000000, 799999999)}`,
    email: `${tag}.patient.${index}@medcareso.local`,
    address: `${randomInt(1, 250)} cite ${city}`,
    city,
    zipCode: `${randomInt(10000, 39999)}`,
    bloodType: pick(BLOOD_TYPES),
    medicalHistory: 'Douleurs chroniques - suivi performance dataset',
    allergies: index % 7 === 0 ? 'Aucune allergie connue' : '',
    emergencyContact: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    emergencyPhone: `0${randomInt(500000000, 799999999)}`,
    createdAt: formatDateTime(randomDateWithinDays(720)),
    updatedAt: formatDateTime(new Date())
  };
}

function makeConsultation(patientId, createdAt) {
  const consultationDate = randomDateWithinDays(400);
  return {
    id: crypto.randomUUID(),
    patientId,
    consultationDate: formatDateTime(consultationDate),
    consultationType: pick(CONSULTATION_TYPES),
    reason: 'Suivi fonctionnel et evaluation clinique',
    anamnesis: 'Gene fonctionnelle progressive et douleurs mecaniques.',
    clinicalExamination: 'Examen clinique stable. Mobilite a surveiller.',
    diagnosis: pick([
      'Lombalgie chronique',
      'Cervicalgie commune',
      'Gonarthrose',
      'Tendinopathie de l epaule',
      'Sciatalgie',
      'Lomboradiculalgie'
    ]),
    treatment: 'Antalgique, reeducation et conseils posturaux',
    advice: 'Controle clinique selon evolution',
    notes: 'Donnee de test performance',
    createdAt,
    updatedAt: createdAt
  };
}

function makePrescription(patientId, consultationId, createdAt, medIndex) {
  const prescriptionDate = randomDateWithinDays(320);
  const medications = [
    {
      name: `PARACETAMOL ${500 + (medIndex % 2) * 500}MG`,
      dosage: `${500 + (medIndex % 2) * 500}mg`,
      intake: '3x/jour',
      duration: `${randomInt(3, 10)} jours`,
      boxes: '1 bt',
      instructions: 'Apres les repas'
    },
    {
      name: medIndex % 3 === 0 ? 'IBUPROFENE 400MG' : 'THIOCOLCHICOSIDE 4MG',
      dosage: medIndex % 3 === 0 ? '400mg' : '4mg',
      intake: '2x/jour',
      duration: `${randomInt(3, 7)} jours`,
      boxes: '1 bt',
      instructions: 'Selon la prescription'
    }
  ];

  return {
    id: crypto.randomUUID(),
    patientId,
    consultationId,
    prescriptionDate: formatDateTime(prescriptionDate),
    medications: JSON.stringify(medications),
    notes: 'Ordonnance generee pour test performance',
    createdAt,
    updatedAt: createdAt
  };
}

function makePayment(patientId, consultationId, createdAt) {
  const amount = pick([1500, 2000, 2500, 3000, 3500, 4000]);
  const paymentDate = randomDateWithinDays(240);
  return {
    id: crypto.randomUUID(),
    patientId,
    consultationId,
    amount,
    paymentDate: formatDate(paymentDate),
    paymentMethod: pick(PAYMENT_METHODS),
    description: 'Paiement consultation',
    notes: 'Paiement genere automatiquement',
    createdAt,
    updatedAt: createdAt
  };
}

function makeAppointment(patientId, createdAt) {
  const appointmentDate = randomDateWithinDays(180);
  appointmentDate.setDate(appointmentDate.getDate() + randomInt(-30, 60));
  appointmentDate.setHours(randomInt(8, 17), pick([0, 30]), 0, 0);
  return {
    id: crypto.randomUUID(),
    patientId,
    appointmentDateTime: formatDateTime(appointmentDate),
    appointmentType: pick(APPOINTMENT_TYPES),
    reason: 'Rendez-vous de suivi genere pour test',
    status: pick(APPOINTMENT_STATUS),
    notes: 'Creation automatique dataset performance',
    createdAt,
    updatedAt: createdAt
  };
}

function makeDocument(patientId, consultationId, index, createdAt) {
  const category = pick(DOCUMENT_CATEGORIES);
  return {
    id: crypto.randomUUID(),
    patientId,
    consultationId,
    fileName: `${category}-${index + 1}.pdf`,
    fileType: 'application/pdf',
    filePath: `virtual://${category}/${index + 1}.pdf`,
    fileSize: randomInt(50000, 350000),
    description: `Document ${category} de test performance`,
    category,
    uploadDate: createdAt,
    createdAt
  };
}

function makeInventoryItem(index, createdAt) {
  const quantity = randomInt(0, 120);
  const minQuantity = randomInt(3, 20);
  const purchasePrice = randomInt(200, 15000);
  return {
    id: crypto.randomUUID(),
    name: `Article performance ${index + 1}`,
    category: pick(INVENTORY_CATEGORIES),
    description: 'Article genere pour test de pagination et de recherche',
    quantity,
    minQuantity,
    unit: pick(['unite', 'bt', 'pcs', 'pack']),
    purchasePrice,
    sellingPrice: purchasePrice + randomInt(50, 5000),
    supplier: `Fournisseur ${randomInt(1, 30)}`,
    expirationDate: index % 4 === 0 ? formatDate(randomFutureDateWithinDays(365)) : null,
    location: `Zone ${randomInt(1, 8)} / Rayon ${randomInt(1, 12)}`,
    notes: 'Genere automatiquement',
    isActive: 1,
    createdAt,
    updatedAt: createdAt
  };
}

async function seedMariaDb(config, options) {
  const mariadbConfig = config.mariadb || config;
  const pool = mysql.createPool({
    host: mariadbConfig.host,
    port: mariadbConfig.port,
    user: mariadbConfig.user,
    password: mariadbConfig.password,
    database: mariadbConfig.database
  });

  const connection = await pool.getConnection();
  const summary = { inserted: {} };

  try {
    const likeTag = `${options.tag}.patient.%@medcareso.local`;
    const [existing] = await connection.query(
      'SELECT COUNT(*) AS c FROM patients WHERE email LIKE ?',
      [likeTag]
    );
    if (Number(existing[0]?.c || 0) > 0) {
      throw new Error(`Le tag ${options.tag} existe deja dans la base`);
    }

    await connection.beginTransaction();

    const patientIds = [];
    for (let i = 0; i < options.patients; i += 1) {
      const createdAt = formatDateTime(randomDateWithinDays(720));
      const patient = makePatient(options.tag, i + 1);
      patient.createdAt = createdAt;
      patient.updatedAt = createdAt;
      await connection.execute(
        `INSERT INTO patients
         (id, firstName, lastName, dateOfBirth, gender, email, phone, address, city, zipCode, bloodType, allergies, medicalHistory, emergencyContact, emergencyPhone, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          patient.id, patient.firstName, patient.lastName, patient.dateOfBirth, patient.gender,
          patient.email, patient.phone, patient.address, patient.city, patient.zipCode,
          patient.bloodType, patient.allergies, patient.medicalHistory, patient.emergencyContact,
          patient.emergencyPhone, patient.createdAt, patient.updatedAt
        ]
      );
      patientIds.push(patient.id);
    }
    summary.inserted.patients = patientIds.length;

    const consultationIds = [];
    for (let i = 0; i < options.consultations; i += 1) {
      const patientId = patientIds[i % patientIds.length];
      const createdAt = formatDateTime(randomDateWithinDays(400));
      const item = makeConsultation(patientId, createdAt);
      await connection.execute(
        `INSERT INTO consultations
         (id, patientId, consultationDate, consultationType, reason, anamnesis, clinicalExamination, diagnosis, treatment, advice, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id, item.patientId, item.consultationDate, item.consultationType, item.reason,
          item.anamnesis, item.clinicalExamination, item.diagnosis, item.treatment, item.advice,
          item.notes, item.createdAt, item.updatedAt
        ]
      );
      consultationIds.push(item.id);
    }
    summary.inserted.consultations = consultationIds.length;

    const prescriptionIds = [];
    for (let i = 0; i < options.prescriptions; i += 1) {
      const patientId = patientIds[i % patientIds.length];
      const consultationId = consultationIds[i % consultationIds.length];
      const createdAt = formatDateTime(randomDateWithinDays(320));
      const item = makePrescription(patientId, consultationId, createdAt, i);
      await connection.execute(
        `INSERT INTO prescriptions
         (id, patientId, consultationId, prescriptionDate, medications, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id, item.patientId, item.consultationId, item.prescriptionDate,
          item.medications, item.notes, item.createdAt, item.updatedAt
        ]
      );
      prescriptionIds.push(item.id);
    }
    summary.inserted.prescriptions = prescriptionIds.length;

    const paymentIds = [];
    for (let i = 0; i < options.payments; i += 1) {
      const patientId = patientIds[i % patientIds.length];
      const consultationId = consultationIds[i % consultationIds.length];
      const createdAt = formatDateTime(randomDateWithinDays(240));
      const item = makePayment(patientId, consultationId, createdAt);
      await connection.execute(
        `INSERT INTO payments
         (id, patientId, consultationId, amount, paymentDate, paymentMethod, notes, createdAt, updatedAt, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id, item.patientId, item.consultationId, item.amount, item.paymentDate,
          item.paymentMethod, item.notes, item.createdAt, item.updatedAt, item.description
        ]
      );
      paymentIds.push(item.id);
    }
    summary.inserted.payments = paymentIds.length;

    const appointmentIds = [];
    for (let i = 0; i < options.appointments; i += 1) {
      const patientId = patientIds[i % patientIds.length];
      const createdAt = formatDateTime(randomDateWithinDays(180));
      const item = makeAppointment(patientId, createdAt);
      await connection.execute(
        `INSERT INTO appointments
         (id, patientId, appointmentDateTime, appointmentType, reason, status, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id, item.patientId, item.appointmentDateTime, item.appointmentType,
          item.reason, item.status, item.notes, item.createdAt, item.updatedAt
        ]
      );
      appointmentIds.push(item.id);
    }
    summary.inserted.appointments = appointmentIds.length;

    const documentIds = [];
    for (let i = 0; i < options.documents; i += 1) {
      const patientId = patientIds[i % patientIds.length];
      const consultationId = consultationIds[i % consultationIds.length];
      const createdAt = formatDateTime(randomDateWithinDays(200));
      const item = makeDocument(patientId, consultationId, i, createdAt);
      await connection.execute(
        `INSERT INTO patient_documents
         (id, patientId, consultationId, fileName, fileType, filePath, fileSize, description, category, uploadDate, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id, item.patientId, item.consultationId, item.fileName, item.fileType,
          item.filePath, item.fileSize, item.description, item.category, item.uploadDate, item.createdAt
        ]
      );
      documentIds.push(item.id);
    }
    summary.inserted.patient_documents = documentIds.length;

    const inventoryIds = [];
    for (let i = 0; i < options.inventory; i += 1) {
      const createdAt = formatDateTime(randomDateWithinDays(90));
      const item = makeInventoryItem(i, createdAt);
      await connection.execute(
        `INSERT INTO inventory
         (id, name, category, description, quantity, minQuantity, unit, purchasePrice, sellingPrice, supplier, expirationDate, location, notes, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id, item.name, item.category, item.description, item.quantity, item.minQuantity,
          item.unit, item.purchasePrice, item.sellingPrice, item.supplier, item.expirationDate,
          item.location, item.notes, item.isActive, item.createdAt, item.updatedAt
        ]
      );
      inventoryIds.push(item.id);
    }
    summary.inserted.inventory = inventoryIds.length;

    await connection.commit();
    return summary;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

function seedSqlite(config, options) {
  const db = new Database(config.sqlitePath);
  const summary = { inserted: {} };

  try {
    const existing = db.prepare('SELECT COUNT(*) AS c FROM patients WHERE email LIKE ?').get(`${options.tag}.patient.%@medcareso.local`);
    if (Number(existing?.c || 0) > 0) {
      throw new Error(`Le tag ${options.tag} existe deja dans la base`);
    }

    const insertPatient = db.prepare(
      `INSERT INTO patients
       (id, firstName, lastName, dateOfBirth, gender, email, phone, address, city, zipCode, bloodType, allergies, medicalHistory, emergencyContact, emergencyPhone, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertConsultation = db.prepare(
      `INSERT INTO consultations
       (id, patientId, consultationDate, consultationType, reason, anamnesis, clinicalExamination, diagnosis, treatment, advice, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertPrescription = db.prepare(
      `INSERT INTO prescriptions
       (id, patientId, consultationId, prescriptionDate, medications, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertPayment = db.prepare(
      `INSERT INTO payments
       (id, patientId, consultationId, amount, paymentDate, paymentMethod, notes, createdAt, updatedAt, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertAppointment = db.prepare(
      `INSERT INTO appointments
       (id, patientId, appointmentDateTime, appointmentType, reason, status, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertDocument = db.prepare(
      `INSERT INTO patient_documents
       (id, patientId, consultationId, fileName, fileType, filePath, fileSize, description, category, uploadDate, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertInventory = db.prepare(
      `INSERT INTO inventory
       (id, name, category, description, quantity, minQuantity, unit, purchasePrice, sellingPrice, supplier, expirationDate, location, notes, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const seedTransaction = db.transaction(() => {
      const patientIds = [];
      for (let i = 0; i < options.patients; i += 1) {
        const createdAt = formatDateTime(randomDateWithinDays(720));
        const patient = makePatient(options.tag, i + 1);
        patient.createdAt = createdAt;
        patient.updatedAt = createdAt;
        insertPatient.run(
          patient.id, patient.firstName, patient.lastName, patient.dateOfBirth, patient.gender,
          patient.email, patient.phone, patient.address, patient.city, patient.zipCode,
          patient.bloodType, patient.allergies, patient.medicalHistory, patient.emergencyContact,
          patient.emergencyPhone, patient.createdAt, patient.updatedAt
        );
        patientIds.push(patient.id);
      }
      summary.inserted.patients = patientIds.length;

      const consultationIds = [];
      for (let i = 0; i < options.consultations; i += 1) {
        const createdAt = formatDateTime(randomDateWithinDays(400));
        const item = makeConsultation(patientIds[i % patientIds.length], createdAt);
        insertConsultation.run(
          item.id, item.patientId, item.consultationDate, item.consultationType, item.reason,
          item.anamnesis, item.clinicalExamination, item.diagnosis, item.treatment, item.advice,
          item.notes, item.createdAt, item.updatedAt
        );
        consultationIds.push(item.id);
      }
      summary.inserted.consultations = consultationIds.length;

      for (let i = 0; i < options.prescriptions; i += 1) {
        const createdAt = formatDateTime(randomDateWithinDays(320));
        const item = makePrescription(patientIds[i % patientIds.length], consultationIds[i % consultationIds.length], createdAt, i);
        insertPrescription.run(
          item.id, item.patientId, item.consultationId, item.prescriptionDate,
          item.medications, item.notes, item.createdAt, item.updatedAt
        );
      }
      summary.inserted.prescriptions = options.prescriptions;

      for (let i = 0; i < options.payments; i += 1) {
        const createdAt = formatDateTime(randomDateWithinDays(240));
        const item = makePayment(patientIds[i % patientIds.length], consultationIds[i % consultationIds.length], createdAt);
        insertPayment.run(
          item.id, item.patientId, item.consultationId, item.amount, item.paymentDate,
          item.paymentMethod, item.notes, item.createdAt, item.updatedAt, item.description
        );
      }
      summary.inserted.payments = options.payments;

      for (let i = 0; i < options.appointments; i += 1) {
        const createdAt = formatDateTime(randomDateWithinDays(180));
        const item = makeAppointment(patientIds[i % patientIds.length], createdAt);
        insertAppointment.run(
          item.id, item.patientId, item.appointmentDateTime, item.appointmentType,
          item.reason, item.status, item.notes, item.createdAt, item.updatedAt
        );
      }
      summary.inserted.appointments = options.appointments;

      for (let i = 0; i < options.documents; i += 1) {
        const createdAt = formatDateTime(randomDateWithinDays(200));
        const item = makeDocument(patientIds[i % patientIds.length], consultationIds[i % consultationIds.length], i, createdAt);
        insertDocument.run(
          item.id, item.patientId, item.consultationId, item.fileName, item.fileType,
          item.filePath, item.fileSize, item.description, item.category, item.uploadDate, item.createdAt
        );
      }
      summary.inserted.patient_documents = options.documents;

      for (let i = 0; i < options.inventory; i += 1) {
        const createdAt = formatDateTime(randomDateWithinDays(90));
        const item = makeInventoryItem(i, createdAt);
        insertInventory.run(
          item.id, item.name, item.category, item.description, item.quantity, item.minQuantity,
          item.unit, item.purchasePrice, item.sellingPrice, item.supplier, item.expirationDate,
          item.location, item.notes, item.isActive, item.createdAt, item.updatedAt
        );
      }
      summary.inserted.inventory = options.inventory;
    });

    seedTransaction();
    return summary;
  } finally {
    db.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = loadDatabaseConfig();
  const startedAt = Date.now();

  console.log(`Seeding performance dataset with tag: ${options.tag}`);
  console.log(JSON.stringify(options, null, 2));

  const summary = config.type === 'mariadb'
    ? await seedMariaDb(config, options)
    : seedSqlite(config, options);

  const finishedAt = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('\nSeed complete.');
  console.log(JSON.stringify(summary.inserted, null, 2));
  console.log(`Duration: ${finishedAt}s`);
}

main().catch(error => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
