import { initializeDatabase, query, run, closeDatabase } from '../src/main/database-unified.js';
import { randomUUID } from 'node:crypto';

function randomId() {
  return randomUUID();
}

async function seed() {
  console.log('--- Initializing database connection for seeding ---');
  await initializeDatabase();

  console.log('--- Seeding 10 Patients ---');
  const patientData = [
    { firstName: 'Amine', lastName: 'Benali', dob: '1985-04-12', gender: 'homme', phone: '0550123456', ssn: '1850412345678', blood: 'A+', address: '12 Rue Didouche Mourad, Alger', email: 'amine.benali@gmail.com' },
    { firstName: 'Yasmina', lastName: 'Mansouri', dob: '1992-09-25', gender: 'femme', phone: '0661987654', ssn: '2920925987654', blood: 'O+', address: '45 Boulevard Mohamed V, Oran', email: 'y.mansouri@hotmail.com' },
    { firstName: 'Karim', lastName: 'Zerrouki', dob: '1978-11-03', gender: 'homme', phone: '0770456789', ssn: '1781103456789', blood: 'B+', address: 'Cité 1000 Logements, Constantine', email: 'karim.z@yahoo.fr' },
    { firstName: 'Fatima', lastName: 'Saidi', dob: '1995-02-18', gender: 'femme', phone: '0555321654', ssn: '2950218321654', blood: 'AB+', address: 'Rue Larbi Ben M\'hidi, Annaba', email: 'fatima.saidi@gmail.com' },
    { firstName: 'Omar', lastName: 'Hamdi', dob: '1965-07-30', gender: 'homme', phone: '0662112233', ssn: '1650730112233', blood: 'O-', address: 'Zone Résidentielle, Blida', email: 'o.hamdi@outook.com' },
    { firstName: 'Chaimaa', lastName: 'Touati', dob: '1998-12-05', gender: 'femme', phone: '0771889900', ssn: '2981205889900', blood: 'A-', address: 'Boulevard Zirout Youcef, Setif', email: 'chaimaa.t@gmail.com' },
    { firstName: 'Youcef', lastName: 'Belkacem', dob: '1982-06-14', gender: 'homme', phone: '0558445566', ssn: '1820614445566', blood: 'B-', address: 'Cité AADL 2000, Batna', email: 'y.belkacem@gmail.com' },
    { firstName: 'Meriem', lastName: 'Cherif', dob: '2001-01-22', gender: 'femme', phone: '0663778899', ssn: '2010122778899', blood: 'O+', address: 'Rue Hassiba Ben Bouali, Tizi Ouzou', email: 'meriem.cherif@yahoo.fr' },
    { firstName: 'Walid', lastName: 'Haddad', dob: '1990-08-09', gender: 'homme', phone: '0772334455', ssn: '1900809334455', blood: 'A+', address: 'Avenue de l\'Indépendance, Bejaia', email: 'walid.haddad@gmail.com' },
    { firstName: 'Sarah', lastName: 'Larbi', dob: '1989-10-17', gender: 'femme', phone: '0559667788', ssn: '2891017667788', blood: 'AB-', address: 'Quatier Les Pins, Chlef', email: 'sarah.larbi@gmail.com' }
  ];

  const patientIds = [];
  for (const p of patientData) {
    const existing = await query('SELECT id FROM patients WHERE socialSecurityNumber = ?', [p.ssn]);
    let pid;
    if (existing && existing.length > 0) {
      pid = existing[0].id;
    } else {
      pid = randomId();
      await run(`
        INSERT INTO patients (id, firstName, lastName, dateOfBirth, gender, socialSecurityNumber, phone, email, address, bloodType, medicalHistory, allergies)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [pid, p.firstName, p.lastName, p.dob, p.gender, p.ssn, p.phone, p.email, p.address, p.blood, 'Aucun antécédent majeur signalé', 'Pas d\'allergie connue']);
    }
    patientIds.push(pid);
  }
  console.log(`✓ Seeded ${patientIds.length} Patients`);

  console.log('--- Seeding 10 Consultations ---');
  const consultationTypes = ['Routine', 'Contrôle', 'Urgence', 'Suivi Kiné', 'Dentaire', 'Cardiologie', 'Bilan', 'Post-Opératoire', 'Première Visite', 'Examen Général'];
  const consultationIds = [];
  for (let i = 0; i < 10; i++) {
    const cid = randomId();
    const pid = patientIds[i % patientIds.length];
    await run(`
      INSERT INTO consultations (id, patientId, consultationDate, consultationType, reason, anamnesis, clinicalExamination, bloodPressure, temperature, weight, height, imc, diagnosis, treatment, notes)
      VALUES (?, CURRENT_TIMESTAMP - (INTERVAL '1 day' * ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      cid,
      i * 2,
      consultationTypes[i],
      `Consultation de ${consultationTypes[i].toLowerCase()} et bilan de santé`,
      'Patient se présente en bon état général',
      'Examen clinique normal, auscultation cardio-pulmonaire claire',
      `${110 + (i * 2)}/${70 + i}`,
      36.6 + (i * 0.1),
      65 + (i * 2),
      170 + i,
      22.5 + (i * 0.2),
      `Diagnostic pour consultation ${i + 1}: État stable, surveillance préconisée`,
      'Repos, hydratation et traitement médicamenteux habituel',
      'Patient réceptif aux conseils donnés'
    ]);
    consultationIds.push(cid);
  }
  console.log(`✓ Seeded ${consultationIds.length} Consultations`);

  console.log('--- Seeding 10 Prescriptions ---');
  const medicationsList = [
    'Paracétamol 1g (1 tab 3x/jour pendant 5 jours)',
    'Amoxicilline 1g (1 tab 2x/jour pendant 7 jours)',
    'Ibuprofène 400mg (1 tab 2x/jour si douleur)',
    'Spasfon 80mg (2 tabs 3x/jour)',
    'Oméprazole 20mg (1 gel le matin à jeun)',
    'Augmentin 1g (1 sachet 2x/jour pendant 7 jours)',
    'Doliprane 1000mg (1 gélule 3x/jour)',
    'Magné B6 (2 comp 2x/jour pendant 1 mois)',
    'Profénid 100mg (1 sup 2x/jour pendant 3 jours)',
    'Clamoxyl 500mg (2 gel 2x/jour)'
  ];
  for (let i = 0; i < 10; i++) {
    const prId = randomId();
    await run(`
      INSERT INTO prescriptions (id, patientId, consultationId, prescriptionDate, medications, notes)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP - (INTERVAL '1 day' * ?), ?, ?)
    `, [
      prId,
      patientIds[i],
      consultationIds[i],
      i * 2,
      medicationsList[i],
      'À prendre au milieu des repas avec un grand verre d\'eau'
    ]);
  }
  console.log('✓ Seeded 10 Prescriptions');

  console.log('--- Seeding 10 Appointments ---');
  const apptStatuses = ['scheduled', 'completed', 'waiting', 'scheduled', 'completed', 'scheduled', 'completed', 'waiting', 'scheduled', 'scheduled'];
  const apptTypes = ['Consultation', 'Suivi', 'Détartrage', 'Bilan Kiné', 'Urgence', 'Contrôle', 'Consultation', 'Suivi', 'Examen', 'Consultation'];
  const appointmentIds = [];
  for (let i = 0; i < 10; i++) {
    const apId = randomId();
    await run(`
      INSERT INTO appointments (id, patientId, appointmentDateTime, appointmentType, reason, status, notes)
      VALUES (?, ?, CURRENT_DATE + (INTERVAL '1 day' * ?), ?, ?, ?, ?)
    `, [
      apId,
      patientIds[i],
      i - 3,
      apptTypes[i],
      `Rendez-vous médical pour ${apptTypes[i].toLowerCase()}`,
      apptStatuses[i],
      'Patient confirmé par téléphone'
    ]);
    appointmentIds.push(apId);
  }
  console.log(`✓ Seeded ${appointmentIds.length} Appointments`);

  console.log('--- Seeding 10 Waiting Room Entries ---');
  const wrStatuses = ['waiting', 'in_consultation', 'completed', 'waiting', 'completed', 'waiting', 'in_consultation', 'completed', 'waiting', 'waiting'];
  for (let i = 0; i < 10; i++) {
    const wrId = randomId();
    await run(`
      INSERT INTO waiting_room (id, patientId, appointmentId, arrivalTime, reason, status, priority, notes)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP - (INTERVAL '10 minute' * ?), ?, ?, ?, ?)
    `, [
      wrId,
      patientIds[i],
      appointmentIds[i],
      i * 15,
      `Motif d'attente: ${apptTypes[i]}`,
      wrStatuses[i],
      i % 3,
      'Présent en salle d\'attente'
    ]);
  }
  console.log('✓ Seeded 10 Waiting Room Entries');

  console.log('--- Seeding 10 Payments & Invoices & Debts ---');
  for (let i = 0; i < 10; i++) {
    const amount = 1500 + (i * 500);
    const payId = randomId();
    const invId = randomId();
    const debtId = randomId();

    await run(`
      INSERT INTO payments (id, patientId, consultationId, amount, paymentDate, paymentMethod, description, notes)
      VALUES (?, ?, ?, ?, CURRENT_DATE - (INTERVAL '1 day' * ?), ?, ?, ?)
    `, [
      payId,
      patientIds[i],
      consultationIds[i],
      amount,
      i,
      i % 2 === 0 ? 'Espèces' : 'Carte Bancaire',
      `Règlement acte médical #${i + 1}`,
      'Paiement effectué au guichet'
    ]);

    await run(`
      INSERT INTO invoices (id, patientId, consultationId, invoiceDate, amount, status, notes)
      VALUES (?, ?, ?, CURRENT_DATE - (INTERVAL '1 day' * ?), ?, ?, ?)
    `, [
      invId,
      patientIds[i],
      consultationIds[i],
      i,
      amount,
      i % 3 === 0 ? 'pending' : 'paid',
      `Facture d'acte médical #${i + 1}`
    ]);

    await run(`
      INSERT INTO debts (id, patientId, consultationId, invoiceId, amount, paidAmount, remainingAmount, dueDate, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE + (INTERVAL '10 day' * ?), ?, ?)
    `, [
      debtId,
      patientIds[i],
      consultationIds[i],
      invId,
      amount,
      i % 3 === 0 ? 0 : amount,
      i % 3 === 0 ? amount : 0,
      i + 1,
      i % 3 === 0 ? 'unpaid' : 'paid',
      'Suivi de règlement de compte'
    ]);
  }
  console.log('✓ Seeded 10 Payments, Invoices & Debts');

  console.log('--- Seeding 10 Patient Documents ---');
  const docFiles = [
    { name: 'Radio_Panoramique_Dentaire.pdf', type: 'Radio', cat: 'Imagerie' },
    { name: 'Bilan_Sanguin_Complet.pdf', type: 'Analyse', cat: 'Laboratoire' },
    { name: 'Echo_Cardiaque_Doppler.pdf', type: 'Échographie', cat: 'Cardiologie' },
    { name: 'IRM_Rachis_Lombaire.pdf', type: 'IRM', cat: 'Imagerie' },
    { name: 'Scanner_Abdomino_Pelvien.pdf', type: 'Scanner', cat: 'Imagerie' },
    { name: 'Ordonnance_Bilan_Biologique.pdf', type: 'Ordonnance', cat: 'Prescription' },
    { name: 'Compte_Rendu_Seance_Kine.pdf', type: 'Compte Rendu', cat: 'Rééducation' },
    { name: 'Certificat_Aptitude_Sport.pdf', type: 'Certificat', cat: 'Administratif' },
    { name: 'Resultats_ECG_Repos.pdf', type: 'ECG', cat: 'Cardiologie' },
    { name: 'Fiche_Evaluation_Fonctionnelle.pdf', type: 'Bilan', cat: 'Rééducation' }
  ];

  for (let i = 0; i < 10; i++) {
    const docId = randomId();
    await run(`
      INSERT INTO patient_documents (id, patientId, consultationId, fileName, fileType, category, description, uploadDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP - (INTERVAL '1 day' * ?))
    `, [
      docId,
      patientIds[i],
      consultationIds[i],
      docFiles[i].name,
      docFiles[i].type,
      docFiles[i].cat,
      `Document médical numérisé: ${docFiles[i].name}`,
      i * 2
    ]);

    const sysDocId = randomId();
    await run(`
      INSERT INTO documents (id, patientId, consultationId, documentType, title, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      sysDocId,
      patientIds[i],
      consultationIds[i],
      docFiles[i].type,
      docFiles[i].name.replace('.pdf', ''),
      JSON.stringify({ title: docFiles[i].name, category: docFiles[i].cat, date: new Date().toISOString() })
    ]);
  }
  console.log('✓ Seeded 10 Patient Documents & System Documents');

  console.log('--- Seeding 10 Sick Leaves / Certificats ---');
  for (let i = 0; i < 10; i++) {
    const slId = randomId();
    const days = 3 + i;
    await run(`
      INSERT INTO sick_leaves (id, patientId, consultationId, startDate, endDate, numberOfDays, diagnosis, allowedOutings, documentKind)
      VALUES (?, ?, ?, CURRENT_DATE - (INTERVAL '1 day' * ?), CURRENT_DATE + (INTERVAL '1 day' * ?), ?, ?, ?, ?)
    `, [
      slId,
      patientIds[i],
      consultationIds[i],
      i,
      days,
      days,
      `Repos médical nécessaire - Syndrome grippal ou asthénie (Cas #${i + 1})`,
      i % 2 === 0,
      i % 2 === 0 ? 'certificate' : 'sick_leave'
    ]);
  }
  console.log('✓ Seeded 10 Sick Leaves');

  console.log('--- Seeding 10 Treatment Plans ---');
  const planTitles = [
    'Rééducation Fonctionnelle Épaule Right',
    'Plan de Soins Dentaires Prothétiques',
    'Programme d\'Électrostimulation Quadriceps',
    'Réadaptation Cardiaque Post-Infarctus',
    'Orthèse et Rééducation Poignet',
    'Traitement Parodontal Global',
    'Rééducation du Rachis Cervical',
    'Renforcement Musculaire des Membres Inférieurs',
    'Plan Prothétique et Implants Dentaires',
    'Rééducation à la Marche Post-AVC'
  ];

  for (let i = 0; i < 10; i++) {
    const tpId = randomId();
    const sessions = 10 + (i * 2);
    const completed = Math.floor(sessions / 2);
    const totalCost = sessions * 1500;
    const totalPaid = completed * 1500;

    await run(`
      INSERT INTO treatment_plans (id, patientId, consultationId, title, description, startDate, endDate, sessions, completedSessions, frequency, treatmentType, specialty, totalCost, totalPaid, status, notes)
      VALUES (?, ?, ?, ?, ?, CURRENT_DATE - (INTERVAL '5 day' * ?), CURRENT_DATE + (INTERVAL '15 day' * ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tpId,
      patientIds[i],
      consultationIds[i],
      planTitles[i],
      `Plan complet incluant ${sessions} séances spécialisées avec suivi hebdomadaire`,
      i,
      i,
      sessions,
      completed,
      '3 séances / semaine',
      i % 2 === 0 ? 'Kinésithérapie' : 'Soins Dentaires',
      i % 2 === 0 ? 'rehabilitation' : 'dentistry',
      totalCost,
      totalPaid,
      'active',
      'Bonne progression observée chez le patient'
    ]);
  }
  console.log('✓ Seeded 10 Treatment Plans');

  console.log('--- Seeding 10 Inventory Items & Equipment ---');
  const inventoryItems = [
    { name: 'Boîte Gants Nitrile M (100 pcs)', cat: 'Consommable', qty: 45, min: 10, buy: 1200, sell: 1800, supplier: 'MedSupply Algérie' },
    { name: 'Masques Chirurgicaux 3 Plis (50 pcs)', cat: 'Protection', qty: 80, min: 20, buy: 400, sell: 700, supplier: 'MedSupply Algérie' },
    { name: 'Seringues Stériles 5ml (100 pcs)', cat: 'Matériel Médical', qty: 30, min: 15, buy: 1500, sell: 2200, supplier: 'Pharmacie Centrale' },
    { name: 'Compresses Stériles 10x10cm', cat: 'Pansement', qty: 120, min: 30, buy: 300, sell: 500, supplier: 'PharmaPlus' },
    { name: 'Gel Échographie 5L', cat: 'Imagerie', qty: 8, min: 2, buy: 3500, sell: 5000, supplier: 'BioMed Services' },
    { name: 'Alcool Médical 70° (1L)', cat: 'Désinfectant', qty: 25, min: 5, buy: 600, sell: 900, supplier: 'Désinfection Express' },
    { name: 'Drap d\'Examen Papier (Rouleau)', cat: 'Consommable', qty: 50, min: 10, buy: 800, sell: 1200, supplier: 'MedSupply Algérie' },
    { name: 'Canules d\'Aspiration Dentaire', cat: 'Dentaire', qty: 200, min: 50, buy: 2000, sell: 3200, supplier: 'Dental Tech' },
    { name: 'Bandes de Kinesiologie (5m)', cat: 'Kinésithérapie', qty: 15, min: 5, buy: 1100, sell: 1800, supplier: 'KinéShop' },
    { name: 'Aiguilles d\'Acupuncture Stériles', cat: 'Matériel Spécialisé', qty: 60, min: 20, buy: 900, sell: 1400, supplier: 'SinoMed' }
  ];

  for (const item of inventoryItems) {
    const invId = randomId();
    await run(`
      INSERT INTO inventory (id, name, category, description, quantity, minQuantity, unit, purchasePrice, sellingPrice, supplier, expirationDate, location, isActive)
      VALUES (?, ?, ?, ?, ?, ?, 'unité', ?, ?, ?, CURRENT_DATE + INTERVAL '365 day', 'Stock Principal', TRUE)
      ON CONFLICT DO NOTHING
    `, [
      invId,
      item.name,
      item.cat,
      `Produit de qualité médicale: ${item.name}`,
      item.qty,
      item.min,
      item.buy,
      item.sell,
      item.supplier
    ]);
  }
  console.log('✓ Seeded 10 Inventory Items');

  const equipmentItems = [
    { name: 'Fauteuil Dentaire Ergonomique Pro', cat: 'Dentaire', room: 'Cabinet 1' },
    { name: 'Appareil ECG 12 Pistes Numérique', cat: 'Cardiologie', room: 'Salle Examens' },
    { name: 'Autoclave Stérilisateur Classe B 24L', cat: 'Stérilisation', room: 'Stérilisation' },
    { name: 'Échographe Doppler Couleur HD', cat: 'Imagerie', room: 'Cabinet 2' },
    { name: 'Scialytique LED Plafonnier High Lux', cat: 'Éclairage', room: 'Cabinet 1' },
    { name: 'Tensiomètre Électronique Professionnel', cat: 'Diagnostic', room: 'Accueil' },
    { name: 'Table de Kinésithérapie 3 Plans Électrique', cat: 'Kinésithérapie', room: 'Salle Kiné' },
    { name: 'Négatoscope Ultra-Mince LED', cat: 'Imagerie', room: 'Cabinet 1' },
    { name: 'Turbine Dentaire Haute Vitesse Fiber Optic', cat: 'Dentaire', room: 'Cabinet 1' },
    { name: 'Détartreur Ultrasonique Piezoélectrique', cat: 'Dentaire', room: 'Cabinet 1' }
  ];

  for (let i = 0; i < equipmentItems.length; i++) {
    const eq = equipmentItems[i];
    const eqId = randomId();
    await run(`
      INSERT INTO equipment (id, name, category, serialNumber, warrantyEnd, assignedRoom, lastMaintenanceDate, nextMaintenanceDate, specificFields)
      VALUES (?, ?, ?, ?, CURRENT_DATE + INTERVAL '730 day', ?, CURRENT_DATE - INTERVAL '30 day', CURRENT_DATE + INTERVAL '150 day', ?)
      ON CONFLICT DO NOTHING
    `, [
      eqId,
      eq.name,
      eq.cat,
      `SN-2025-${1000 + i}`,
      eq.room,
      JSON.stringify({ model: 'V2025', brand: 'MedTech Pro', serial: `SN-2025-${1000 + i}` })
    ]);
  }
  console.log('✓ Seeded 10 Equipment Devices');

  console.log('--- Seeding 10 Expenses ---');
  const expenseCategories = ['Fournitures', 'Électricité', 'Loyer', 'Maintenance', 'Télécom/Internet', 'Produits d\'Entretien', 'Formation', 'Assurance', 'Transport', 'Matériel Consommable'];
  for (let i = 0; i < 10; i++) {
    const expId = randomId();
    await run(`
      INSERT INTO expenses (id, expenseDate, category, description, amount, paymentMethod, vendor, receiptNumber, notes)
      VALUES (?, CURRENT_DATE - (INTERVAL '3 day' * ?), ?, ?, ?, 'Espèces', 'Fournisseur Médical Régional', ?, 'Facture acquittée')
    `, [
      expId,
      i,
      expenseCategories[i],
      `Achat et frais pour ${expenseCategories[i].toLowerCase()}`,
      2500 + (i * 1200),
      `REC-2025-00${i + 1}`
    ]);
  }
  console.log('✓ Seeded 10 Expenses');

  console.log('--- Seeding 10 Kiné Staff Members ---');
  const kineNames = [
    { first: 'Khaled', last: 'Boumedienne' },
    { first: 'Nour', last: 'El Houda' },
    { first: 'Abderrahmane', last: 'Taleb' },
    { first: 'Souad', last: 'Ferhat' },
    { first: 'Riad', last: 'Ghezal' },
    { first: 'Amel', last: 'Mebarki' },
    { first: 'Sofiane', last: 'Bennacer' },
    { first: 'Leila', last: 'Slimani' },
    { first: 'Tarek', last: 'Benziada' },
    { first: 'Dounia', last: 'Brahimi' }
  ];

  for (let i = 0; i < kineNames.length; i++) {
    const kId = randomId();
    await run(`
      INSERT INTO kine_staff (id, firstName, lastName, phone, email, specialty, sessionPrice, sessionDuration, isActive)
      VALUES (?, ?, ?, ?, ?, 'Kinésithérapie et Rééducation', 1800, 45, TRUE)
      ON CONFLICT DO NOTHING
    `, [
      kId,
      kineNames[i].first,
      kineNames[i].last,
      `0550${i}${i}1122`,
      `${kineNames[i].first.toLowerCase()}.${kineNames[i].last.toLowerCase()}@kine.dz`
    ]);
  }
  console.log('✓ Seeded 10 Kiné Staff Members');

  console.log('\n======================================================');
  console.log('🎉 SEEDING COMPLETED SUCCESSFULLY! 10 ITEM ENTRIES FOR EVERY MODULE CREATED.');
  console.log('======================================================');

  await closeDatabase();
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
