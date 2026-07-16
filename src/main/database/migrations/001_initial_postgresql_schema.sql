-- MedCareSO 2.1.1 native PostgreSQL baseline.
-- This migration is immutable after deployment.
-- Existing supported MedCareSO databases adopt this baseline without executing it.
CREATE TABLE IF NOT EXISTS licenses (
      id VARCHAR(36) PRIMARY KEY,
      "key" VARCHAR(50) UNIQUE NOT NULL,
      clientName VARCHAR(255) NOT NULL,
      generatedDate TIMESTAMP NOT NULL,
      expirationDate TIMESTAMP,
      activated BOOLEAN DEFAULT FALSE,
      activationDate TIMESTAMP,
      machineId VARCHAR(64),
      status VARCHAR(20) DEFAULT 'pending'
    );

CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(64) NOT NULL,
      fullName VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      role VARCHAR(50) DEFAULT 'doctor',
      specialty VARCHAR(100),
      color VARCHAR(20) DEFAULT '#3b82f6',
      isAdmin BOOLEAN DEFAULT FALSE,
      isSuperAdmin BOOLEAN DEFAULT FALSE,
      isActive BOOLEAN DEFAULT TRUE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      lastLogin TIMESTAMP,
      resetCode VARCHAR(10),
      resetCodeExpiry TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS settings (
      id VARCHAR(36) PRIMARY KEY,
      cabinetName VARCHAR(255),
      cabinetAddress TEXT,
      cabinetPhone VARCHAR(50),
      cabinetEmail VARCHAR(255),
      doctorName VARCHAR(255),
      doctorRPPS VARCHAR(50),
      doctorSpecialty VARCHAR(100),
      documentColorMode VARCHAR(20) DEFAULT 'color',
      documentPrimaryColor VARCHAR(20) DEFAULT '#1a8c7e',
      documentTypeColors TEXT,
      documentTextScale INTEGER DEFAULT 100,
      documentLogoScale INTEGER DEFAULT 90,
      documentStyleVariant VARCHAR(20) DEFAULT 'classic',
      documentWatermarkOpacity INTEGER DEFAULT 5,
      documentHideSignature BOOLEAN DEFAULT FALSE,
      preferredPrinter VARCHAR(255),
      preferredScanner VARCHAR(255),
      preferredThermalPrinter VARCHAR(255),
      publicBookingEnabled BOOLEAN DEFAULT FALSE,
      publicBookingPort INTEGER DEFAULT 4580,
      publicBookingToken VARCHAR(255),
      publicBookingPublicUrl TEXT,
      publicBookingQrEnabled BOOLEAN DEFAULT TRUE,
      ownerUserId VARCHAR(36),
      cabinetLogoDataUrl TEXT,
      cabinetWatermarkLogoDataUrl TEXT,
      customTreatmentTypes TEXT,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS patients (
      id VARCHAR(36) PRIMARY KEY,
      firstName VARCHAR(100) NOT NULL,
      lastName VARCHAR(100) NOT NULL,
      primaryDoctorId VARCHAR(36),
      createdByUserId VARCHAR(36),
      dateOfBirth DATE,
      gender VARCHAR(20),
      socialSecurityNumber VARCHAR(50) UNIQUE,
      email VARCHAR(255),
      phone VARCHAR(50),
      address TEXT,
      city VARCHAR(100),
      zipCode VARCHAR(20),
      bloodType VARCHAR(10),
      allergies TEXT,
      medicalHistory TEXT,
      emergencyContact VARCHAR(255),
      emergencyPhone VARCHAR(50),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(primaryDoctorId) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(createdByUserId) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS consultations (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      doctorId VARCHAR(36),
      consultationDate TIMESTAMP NOT NULL,
      consultationType VARCHAR(50),
      reason TEXT,
      anamnesis TEXT,
      clinicalExamination TEXT,
      bloodPressure VARCHAR(20),
      temperature NUMERIC(4,1),
      weight NUMERIC(5,2),
      height NUMERIC(5,2),
      imc NUMERIC(4,2),
      diagnosis TEXT,
      cim10Code TEXT,
      treatment TEXT,
      advice TEXT,
      notes TEXT,
      acts TEXT,
      kineId VARCHAR(36),
      isUnpaid BOOLEAN DEFAULT FALSE,
      unpaidAmount NUMERIC(10,2) DEFAULT 0,
      unpaidDueDate DATE,
      attachments TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(doctorId) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS patient_attachments (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      fileName VARCHAR(255) NOT NULL,
      filePath VARCHAR(500) NOT NULL,
      mimeType VARCHAR(255),
      fileSize BIGINT DEFAULT 0,
      examFamily VARCHAR(80) DEFAULT 'Document',
      sourceType VARCHAR(50) DEFAULT 'import',
      sourceLabel VARCHAR(255),
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS prescriptions (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      prescriptionDate TIMESTAMP NOT NULL,
      medications TEXT,
      notes TEXT,
      generatedPDF BYTEA,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS sick_leaves (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      startDate DATE NOT NULL,
      endDate DATE NOT NULL,
      numberOfDays INTEGER,
      diagnosis TEXT,
      cim10Code TEXT,
      allowedOutings BOOLEAN DEFAULT FALSE,
      generatedPDF BYTEA,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS appointments (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      appointmentDateTime TIMESTAMP NOT NULL,
      appointmentType VARCHAR(50),
      reason TEXT,
      status VARCHAR(30) DEFAULT 'scheduled',
      notes TEXT,
      bookingSource VARCHAR(30) DEFAULT 'manual',
      bookingCode VARCHAR(100),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS invoices (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      invoiceDate DATE NOT NULL,
      consultationId VARCHAR(36),
      amount NUMERIC(10,2) NOT NULL,
      status VARCHAR(30) DEFAULT 'pending',
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS documents (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      documentType VARCHAR(50) NOT NULL,
      title VARCHAR(255),
      payload TEXT,
      lastPrintedAt TIMESTAMP,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      amount NUMERIC(10,2) NOT NULL,
      paymentDate DATE NOT NULL,
      paymentMethod VARCHAR(50) DEFAULT 'EspÃƒÂ¨ces',
      description TEXT,
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS activity_log (
      id VARCHAR(36) PRIMARY KEY,
      userId VARCHAR(36),
      action VARCHAR(100) NOT NULL,
      tableName VARCHAR(50),
      recordId VARCHAR(36),
      details TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS prescription_templates (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      medications TEXT NOT NULL,
      notes TEXT,
      category VARCHAR(100) DEFAULT 'GÃƒÂ©nÃƒÂ©ral',
      usageCount INTEGER DEFAULT 0,
      createdBy VARCHAR(36),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS medications (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      genericName VARCHAR(255),
      category VARCHAR(100),
      dosageForm VARCHAR(100),
      defaultDosage VARCHAR(255),
      defaultIntake VARCHAR(255),
      defaultDuration VARCHAR(100),
      defaultBoxes VARCHAR(50),
      instructions TEXT,
      contraindications TEXT,
      sideEffects TEXT,
      isActive BOOLEAN DEFAULT TRUE,
      usageCount INTEGER DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS medical_analyses (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      analysisDate TIMESTAMP NOT NULL,
      analysisType VARCHAR(100) NOT NULL,
      laboratory VARCHAR(255),
      results TEXT,
      normalValues TEXT,
      interpretation TEXT,
      status VARCHAR(30) DEFAULT 'pending',
      attachmentPath VARCHAR(500),
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS analysis_types (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(120) DEFAULT 'General',
      description TEXT,
      normalValues TEXT,
      unit VARCHAR(100),
      price NUMERIC(10,2) DEFAULT 0,
      isActive BOOLEAN DEFAULT TRUE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS expenses (
      id VARCHAR(36) PRIMARY KEY,
      expenseDate DATE NOT NULL,
      category VARCHAR(100) NOT NULL,
      description TEXT,
      amount NUMERIC(10,2) NOT NULL,
      paymentMethod VARCHAR(50) DEFAULT 'EspÃƒÂ¨ces',
      vendor VARCHAR(255),
      receiptNumber VARCHAR(100),
      notes TEXT,
      createdBy VARCHAR(36),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS expense_categories (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      isActive BOOLEAN DEFAULT TRUE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS inventory (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) DEFAULT 'GÃƒÂ©nÃƒÂ©ral',
      description TEXT,
      quantity INTEGER DEFAULT 0,
      minQuantity INTEGER DEFAULT 5,
      unit VARCHAR(50) DEFAULT 'unitÃƒÂ©',
      purchasePrice NUMERIC(10,2) DEFAULT 0,
      sellingPrice NUMERIC(10,2) DEFAULT 0,
      supplier VARCHAR(255),
      expirationDate DATE,
      location VARCHAR(255),
      notes TEXT,
      isActive BOOLEAN DEFAULT TRUE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS inventory_movements (
      id VARCHAR(36) PRIMARY KEY,
      inventoryId VARCHAR(36) NOT NULL,
      movementType VARCHAR(50) NOT NULL,
      quantity INTEGER NOT NULL,
      previousQuantity INTEGER,
      newQuantity INTEGER,
      reason TEXT,
      reference VARCHAR(100),
      createdBy VARCHAR(36),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id) ON DELETE CASCADE,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS debts (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      invoiceId VARCHAR(36),
      amount NUMERIC(10,2) NOT NULL,
      paidAmount NUMERIC(10,2) DEFAULT 0,
      remainingAmount NUMERIC(10,2) NOT NULL,
      dueDate DATE,
      status VARCHAR(30) DEFAULT 'unpaid',
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (paidAmount <= amount),
      CHECK (remainingAmount >= 0),
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(36) PRIMARY KEY,
      userId VARCHAR(36),
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT,
      relatedType VARCHAR(50),
      relatedId VARCHAR(36),
      isRead BOOLEAN DEFAULT FALSE,
      scheduledFor TIMESTAMP,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS treatment_plans (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      startDate DATE NOT NULL,
      endDate DATE,
      sessions INTEGER DEFAULT 1,
      completedSessions INTEGER DEFAULT 0,
      frequency VARCHAR(100),
      treatmentType VARCHAR(100),
      specialty VARCHAR(100) DEFAULT 'dentistry',
      totalCost NUMERIC(10,2) DEFAULT 0,
      totalPaid NUMERIC(10,2) DEFAULT 0,
      sessionsCount INTEGER DEFAULT 1,
      createdBy VARCHAR(36),
      status VARCHAR(50) DEFAULT 'active',
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (completedSessions <= sessions),
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS plan_payment_sessions (
      id VARCHAR(36) PRIMARY KEY,
      planId VARCHAR(36) NOT NULL,
      sessionNumber INTEGER NOT NULL,
      scheduledDate TIMESTAMP,
      paidDate TIMESTAMP,
      expectedAmount NUMERIC(10,2) DEFAULT 0,
      paidAmount NUMERIC(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      notes TEXT,
      recordedBy VARCHAR(36),
      paymentId VARCHAR(36),
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(planId) REFERENCES treatment_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(recordedBy) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS plan_equipment_usage (
      id VARCHAR(36) PRIMARY KEY,
      planId VARCHAR(36) NOT NULL,
      inventoryId VARCHAR(36) NOT NULL,
      usageDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(planId) REFERENCES treatment_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS treatment_sessions (
      id VARCHAR(36) PRIMARY KEY,
      treatmentPlanId VARCHAR(36) NOT NULL,
      sessionNumber INTEGER NOT NULL,
      scheduledDate DATE NOT NULL,
      completedDate DATE,
      status VARCHAR(50) DEFAULT 'scheduled',
      therapistId VARCHAR(36),
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(treatmentPlanId) REFERENCES treatment_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(therapistId) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS patient_documents (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      fileName VARCHAR(255) NOT NULL,
      fileType VARCHAR(100),
      filePath VARCHAR(500),
      fileSize INTEGER,
      description TEXT,
      category VARCHAR(100) DEFAULT 'Autre',
      uploadDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS waiting_room (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      appointmentId VARCHAR(36),
      arrivalTime TIMESTAMP NOT NULL,
      reason VARCHAR(255),
      status VARCHAR(30) DEFAULT 'waiting',
      priority INTEGER DEFAULT 0,
      assignedTo VARCHAR(36),
      notes TEXT,
      createdBy VARCHAR(36),
      calledAt TIMESTAMP,
      startedAt TIMESTAMP,
      completedAt TIMESTAMP,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(appointmentId) REFERENCES appointments(id) ON DELETE SET NULL,
      FOREIGN KEY(assignedTo) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS patient_packages (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      packageName VARCHAR(255) NOT NULL,
      totalSessions INTEGER NOT NULL,
      usedSessions INTEGER DEFAULT 0,
      remainingSessions INTEGER NOT NULL,
      pricePerSession NUMERIC(10,2) DEFAULT 0,
      totalPrice NUMERIC(10,2) DEFAULT 0,
      startDate DATE,
      expirationDate DATE,
      status VARCHAR(30) DEFAULT 'active',
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS package_config (
      id VARCHAR(36) PRIMARY KEY,
      clientName VARCHAR(255) NOT NULL,
      packageType VARCHAR(50) DEFAULT 'basic',
      maxDoctors INTEGER DEFAULT 1,
      maxAssistants INTEGER DEFAULT 0,
      featurePrescriptions BOOLEAN DEFAULT TRUE,
      featureWaitingRoom BOOLEAN DEFAULT TRUE,
      featureDailySummary BOOLEAN DEFAULT TRUE,
      featureStatistics BOOLEAN DEFAULT TRUE,
      featureInventory BOOLEAN DEFAULT TRUE,
      featureKineStaff BOOLEAN DEFAULT FALSE,
      featureRehabilitation BOOLEAN DEFAULT FALSE,
      featureDentistry BOOLEAN DEFAULT FALSE,
      featureCardiology BOOLEAN DEFAULT FALSE,
      featureMedicalImaging BOOLEAN DEFAULT TRUE,
      activeSpecialty VARCHAR(40) DEFAULT 'general',
      enabledSpecialties TEXT,
      featureDebts BOOLEAN DEFAULT TRUE,
      featureCalendar BOOLEAN DEFAULT TRUE,
      featureDocuments BOOLEAN DEFAULT TRUE,
      featureSickLeaves BOOLEAN DEFAULT TRUE,
      featureMultiPC BOOLEAN DEFAULT FALSE,
      featureAiReports BOOLEAN DEFAULT FALSE,
      featureAiChatbot BOOLEAN DEFAULT FALSE,
      featureAfterSalesSupport BOOLEAN DEFAULT TRUE,
      priceDoctor NUMERIC(10,2) DEFAULT 60000,
      priceAssistant NUMERIC(10,2) DEFAULT 15000,
      pricePrescriptions NUMERIC(10,2) DEFAULT 0,
      priceMultiPC NUMERIC(10,2) DEFAULT 0,
      priceDentistry NUMERIC(10,2) DEFAULT 12000,
      priceCardiology NUMERIC(10,2) DEFAULT 12000,
      priceAiReports NUMERIC(10,2) DEFAULT 10000,
      priceAiChatbot NUMERIC(10,2) DEFAULT 8000,
      priceAfterSales NUMERIC(10,2) DEFAULT 0,
      totalPrice NUMERIC(10,2) DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'DZD',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS kine_staff (
      id VARCHAR(36) PRIMARY KEY,
      firstName VARCHAR(100) NOT NULL,
      lastName VARCHAR(100) NOT NULL,
      phone VARCHAR(50),
      email VARCHAR(255),
      specialty VARCHAR(100) DEFAULT 'GÃƒÂ©nÃƒÂ©ral',
      sessionPrice NUMERIC(10,2) DEFAULT 1500,
      sessionDuration INTEGER DEFAULT 30,
      isActive BOOLEAN DEFAULT TRUE,
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS kine_sessions (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      kineId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      sessionDate TIMESTAMP NOT NULL,
      sessionNumber INTEGER DEFAULT 1,
      duration INTEGER DEFAULT 30,
      price NUMERIC(10,2) DEFAULT 0,
      paymentStatus VARCHAR(30) DEFAULT 'unpaid',
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(kineId) REFERENCES kine_staff(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS consultation_acts (
      id VARCHAR(36) PRIMARY KEY,
      consultationId VARCHAR(36) NOT NULL,
      actType VARCHAR(100) NOT NULL,
      quantity INTEGER DEFAULT 1,
      price NUMERIC(10,2) DEFAULT 0,
      kineId VARCHAR(36),
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE CASCADE,
      FOREIGN KEY(kineId) REFERENCES kine_staff(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS user_notifications (
      id VARCHAR(36) PRIMARY KEY,
      fromUserId VARCHAR(36),
      toUserId VARCHAR(36),
      toRole VARCHAR(50),
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT,
      patientId VARCHAR(36),
      relatedType VARCHAR(50),
      relatedId VARCHAR(36),
      data TEXT,
      isRead BOOLEAN DEFAULT FALSE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(fromUserId) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(toUserId) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS functional_evaluations (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      evaluationDate DATE NOT NULL,
      evaluatorId VARCHAR(36),

      autonomyScore INTEGER,
      autonomyNotes TEXT,

      mobilityScore INTEGER,
      mobilityNotes TEXT,
      walkingAbility VARCHAR(100),
      walkingAid VARCHAR(100),
      walkingDistance VARCHAR(255),

      balanceScore INTEGER,
      balanceNotes TEXT,

      coordinationScore INTEGER,
      coordinationNotes TEXT,

      painScore INTEGER,
      painLocation TEXT,
      painType VARCHAR(100),
      painNotes TEXT,

      spasticityScore INTEGER,
      spasticityLocation TEXT,
      spasticityNotes TEXT,
      jointRange TEXT,
      mrcScores TEXT,

      globalAssessment VARCHAR(50),
      functionalDiagnosis TEXT,
      limitations TEXT,
      activityRestrictions TEXT,
      socialParticipation TEXT,

      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(evaluatorId) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS clinical_exams (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      examDate DATE NOT NULL,
      examinerId VARCHAR(36),
      jointRanges TEXT,
      muscleStrength TEXT,
      muscleTone TEXT,
      posture TEXT,
      postureNotes TEXT,
      sensitivity TEXT,
      sensitivityNotes TEXT,
      reflexes TEXT,
      reflexNotes TEXT,
      gait TEXT,
      gaitNotes TEXT,
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(examinerId) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS medical_scales (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      evaluationId VARCHAR(36),
      evaluationDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      evaluatorId VARCHAR(36),
      scaleType VARCHAR(255) NOT NULL,
      score NUMERIC,
      maxScore NUMERIC,
      interpretation TEXT,
      details TEXT,
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(evaluationId) REFERENCES functional_evaluations(id) ON DELETE SET NULL,
      FOREIGN KEY(evaluatorId) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS rehabilitation_plans (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      createdBy VARCHAR(36),
      startDate DATE NOT NULL,
      endDate DATE,
      status VARCHAR(30) DEFAULT 'active',

      shortTermObjectives TEXT,
      mediumTermObjectives TEXT,
      longTermObjectives TEXT,

      kinesiotherapy INTEGER DEFAULT 0,
      kinesiotherapyFrequency VARCHAR(255),
      kinesiotherapyNotes TEXT,

      ergotherapy INTEGER DEFAULT 0,
      ergotherapyFrequency VARCHAR(255),
      ergotherapyNotes TEXT,

      speechTherapy INTEGER DEFAULT 0,
      speechTherapyFrequency VARCHAR(255),
      speechTherapyNotes TEXT,

      orthosis BOOLEAN DEFAULT FALSE,
      orthosisType VARCHAR(255),
      orthosisNotes TEXT,

      wheelchair BOOLEAN DEFAULT FALSE,
      wheelchairType VARCHAR(255),
      wheelchairNotes TEXT,

      prosthesis BOOLEAN DEFAULT FALSE,
      prosthesisType VARCHAR(255),
      prosthesisNotes TEXT,

      otherEquipment TEXT,
      equipmentDetails TEXT,

      hydrotherapy BOOLEAN DEFAULT FALSE,
      electrotherapy BOOLEAN DEFAULT FALSE,
      massotherapy BOOLEAN DEFAULT FALSE,

      totalSessions INTEGER DEFAULT 0,
      completedSessions INTEGER DEFAULT 0,
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS rehabilitation_sessions (
      id VARCHAR(36) PRIMARY KEY,
      rehabilitationPlanId VARCHAR(36) NOT NULL,
      patientId VARCHAR(36) NOT NULL,
      therapistId VARCHAR(36),
      sessionDate TIMESTAMP NOT NULL,
      sessionType VARCHAR(100),
      sessionNumber INTEGER DEFAULT 1,
      duration INTEGER DEFAULT 30,
      techniques TEXT,
      exercises TEXT,
      observations TEXT,
      progressNotes TEXT,
      painLevel INTEGER,
      patientFeedback TEXT,
      status VARCHAR(30) DEFAULT 'scheduled',
      billedAmount NUMERIC(10,2) DEFAULT 0,
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(rehabilitationPlanId) REFERENCES rehabilitation_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(therapistId) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS patient_progress (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      evaluationDate TIMESTAMP NOT NULL,
      evaluatorId VARCHAR(36),
      category VARCHAR(100),
      previousScore NUMERIC,
      currentScore NUMERIC,
      improvement TEXT,
      status VARCHAR(50),
      patientAdherence TEXT,
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(evaluatorId) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS patient_equipment (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      prescribedBy VARCHAR(36),
      equipmentType VARCHAR(100) NOT NULL,
      equipmentName VARCHAR(255) NOT NULL,
      description TEXT,
      prescriptionDate DATE NOT NULL,
      deliveryDate DATE,
      supplier VARCHAR(255),
      status VARCHAR(50) DEFAULT 'prescribed',
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(prescribedBy) REFERENCES users(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS dental_records (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL UNIQUE,
      generalNotes TEXT,
      allergies TEXT,
      lastExamDate DATE,
      nextExamDate DATE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS dental_teeth (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      toothNumber INTEGER NOT NULL,
      status VARCHAR(50) DEFAULT 'healthy',
      notes TEXT,
      surfaces TEXT,
      lastTreatmentDate DATE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (patientId, toothNumber),
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS dental_treatments (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      toothNumber INTEGER,
      treatmentType VARCHAR(100) NOT NULL,
      description TEXT,
      surfaces TEXT,
      material TEXT,
      color TEXT,
      cost NUMERIC(10,2) DEFAULT 0,
      isPaid BOOLEAN DEFAULT FALSE,
      dentistId VARCHAR(36),
      paid NUMERIC(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'completed',
      treatmentDate DATE NOT NULL,
      nextFollowUp DATE,
      planId VARCHAR(36),
      doctorId VARCHAR(36),
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (paid <= cost),
      CHECK (cost >= 0),
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS dental_plans (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      teeth TEXT,
      treatments TEXT,
      estimatedCost NUMERIC(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      startDate DATE,
      endDate DATE,
      notes TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS dental_xrays (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      toothNumber INTEGER,
      type VARCHAR(100),
      filePath TEXT,
      description TEXT,
      xrayDate DATE NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS sms_config (
      id VARCHAR(36) PRIMARY KEY,
      enabled BOOLEAN DEFAULT FALSE,
      mode VARCHAR(20) DEFAULT 'modem',
      port VARCHAR(100) DEFAULT '',
      baudRate INTEGER DEFAULT 9600,
      countryCode VARCHAR(10) DEFAULT '+213',
      apiProvider VARCHAR(50) DEFAULT '',
      apiUrl TEXT DEFAULT '',
      apiKey TEXT DEFAULT '',
      apiSid VARCHAR(200) DEFAULT '',
      apiToken VARCHAR(200) DEFAULT '',
      apiFrom VARCHAR(50) DEFAULT '',
      reminderTemplate TEXT,
      appointmentTemplate TEXT,
      reminderHoursBefore INTEGER DEFAULT 24,
      autoSendReminders BOOLEAN DEFAULT FALSE,
      autoSendOnCreate BOOLEAN DEFAULT TRUE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS sms_log (
      id VARCHAR(36) PRIMARY KEY,
      phoneNumber VARCHAR(30) NOT NULL,
      message TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      sentAt TIMESTAMP,
      provider VARCHAR(20) DEFAULT 'modem',
      errorMessage TEXT
    );

CREATE TABLE IF NOT EXISTS sms_reminders (
      id VARCHAR(36) PRIMARY KEY,
      appointmentId VARCHAR(36) NOT NULL,
      patientPhone VARCHAR(30),
      message TEXT,
      sent BOOLEAN DEFAULT FALSE,
      sentAt TIMESTAMP,
      FOREIGN KEY(appointmentId) REFERENCES appointments(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS cloud_sync_config (
      id VARCHAR(36) PRIMARY KEY,
      enabled BOOLEAN DEFAULT FALSE,
      provider VARCHAR(30) DEFAULT 'rest',
      apiUrl TEXT DEFAULT '',
      apiKey TEXT DEFAULT '',
      firebaseProject VARCHAR(200) DEFAULT '',
      firebaseKey TEXT DEFAULT '',
      remoteHost VARCHAR(200) DEFAULT '',
      remotePort INTEGER DEFAULT 3306,
      remoteUser VARCHAR(100) DEFAULT '',
      remotePassword VARCHAR(200) DEFAULT '',
      remoteDatabase VARCHAR(100) DEFAULT '',
      syncIntervalMinutes INTEGER DEFAULT 1440,
      lastSyncAt TIMESTAMP,
      autoSync BOOLEAN DEFAULT FALSE,
      backupEncryptionEnabled BOOLEAN DEFAULT FALSE,
      backupPassphrase TEXT DEFAULT '',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS sync_log (
      id VARCHAR(36) PRIMARY KEY,
      syncType VARCHAR(20) DEFAULT 'push',
      status VARCHAR(20) DEFAULT 'pending',
      details TEXT,
      syncedAt TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS cloud_sync_exports (
      id VARCHAR(36) PRIMARY KEY,
      exportId VARCHAR(36),
      exportedAt TIMESTAMP,
      doctorName VARCHAR(255),
      cabinetName VARCHAR(255),
      deviceId VARCHAR(255),
      hostname VARCHAR(255),
      databaseMode VARCHAR(30),
      tableCountsJson TEXT,
      jsonBackup TEXT,
      csvBackup TEXT,
      markdownBackup TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS treatmentType VARCHAR(100);

ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS specialty VARCHAR(100) DEFAULT 'dentistry';

ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS totalCost NUMERIC(10,2) DEFAULT 0;

ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS totalPaid NUMERIC(10,2) DEFAULT 0;

ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS sessionsCount INTEGER DEFAULT 1;

ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS createdBy VARCHAR(36);

UPDATE treatment_plans SET specialty = COALESCE(NULLIF(specialty, ''), 'dentistry') WHERE specialty IS NULL OR specialty = '';

UPDATE treatment_plans SET sessionsCount = COALESCE(sessionsCount, sessions, 1) WHERE sessionsCount IS NULL OR sessionsCount < 1;

UPDATE treatment_plans SET totalCost = COALESCE(totalCost, 0), totalPaid = COALESCE(totalPaid, 0);

ALTER TABLE dental_treatments ADD COLUMN IF NOT EXISTS material TEXT;

ALTER TABLE dental_treatments ADD COLUMN IF NOT EXISTS color TEXT;

ALTER TABLE dental_treatments ADD COLUMN IF NOT EXISTS isPaid BOOLEAN DEFAULT FALSE;

ALTER TABLE dental_treatments ADD COLUMN IF NOT EXISTS dentistId VARCHAR(36);

ALTER TABLE dental_treatments ADD COLUMN IF NOT EXISTS planId VARCHAR(36);

ALTER TABLE dental_treatments ADD COLUMN IF NOT EXISTS doctorId VARCHAR(36);

UPDATE dental_treatments SET isPaid = COALESCE(isPaid, paid > 0);

CREATE INDEX IF NOT EXISTS idx_consultations_patient_date ON consultations(patientId, consultationDate DESC);

CREATE INDEX IF NOT EXISTS idx_patients_primary_doctor ON patients(primaryDoctorId);

CREATE INDEX IF NOT EXISTS idx_patients_created_by_user ON patients(createdByUserId);

CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations(doctorId);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_date ON prescriptions(patientId, prescriptionDate DESC);

CREATE INDEX IF NOT EXISTS idx_sick_leaves_patient_start ON sick_leaves(patientId, startDate DESC);

CREATE INDEX IF NOT EXISTS idx_documents_patient_type ON documents(patientId, documentType);

CREATE INDEX IF NOT EXISTS idx_documents_consultation ON documents(consultationId);

CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paymentDate DESC);

CREATE INDEX IF NOT EXISTS idx_payments_consultation ON payments(consultationId);

CREATE INDEX IF NOT EXISTS idx_functional_evaluations_patient_date ON functional_evaluations(patientId, evaluationDate DESC);

CREATE INDEX IF NOT EXISTS idx_rehabilitation_plans_patient_date ON rehabilitation_plans(patientId, startDate DESC);

CREATE INDEX IF NOT EXISTS idx_rehabilitation_sessions_plan_date ON rehabilitation_sessions(rehabilitationPlanId, sessionDate DESC);
