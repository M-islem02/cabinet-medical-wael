/**
 * Module de génération de PDF pour ordonnances et arrêts de travail
 */


import PDFDocument from 'pdfkit';
import { ipcMain } from 'electron';
import moment from 'moment';
import { queryOne, query } from '../database-unified.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getScopedSettings } from '../services/settings-scope-service.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_PATH = path.join(__dirname, '../../renderer/assets/logo.png');
const PAGE_MARGIN = 32;
const OUTER_FRAME_PADDING = 12;
const INNER_FRAME_PADDING = OUTER_FRAME_PADDING + 8;


function formatCurrencyAmount(value = 0) {
  const numericValue = Number(value);
  const amount = Number.isFinite(numericValue) ? numericValue : 0;
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DA`;
}


function formatDateValue(value, includeTime = false) {
  if (!value) return '-';
  const m = moment(value);
  if (!m.isValid()) return '-';
  return m.format(includeTime ? 'DD/MM/YYYY HH:mm' : 'DD/MM/YYYY');
}


function safeText(value, fallback = '-') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return value;
}


function calculateAge(date) {
  if (!date) return null;
  const m = moment(date);
  if (!m.isValid()) return null;
  return moment().diff(m, 'years');
}


async function resolveDocumentPayload({ patientId, consultationId, documentType, providedData, documentId }) {
  if (providedData && Object.keys(providedData).length > 0) {
    return providedData;
  }


  let documentRow = null;
  if (documentId) {
    documentRow = await queryOne('SELECT payload FROM documents WHERE id = ?', [documentId]);
  }


  if (!documentRow && patientId) {
    documentRow = await queryOne(
      'SELECT payload FROM documents WHERE patientId = ? AND documentType = ?',
      [patientId, documentType]
    );
  }


  if (!documentRow && consultationId) {
    documentRow = await queryOne(
      'SELECT payload FROM documents WHERE consultationId = ? AND documentType = ?',
      [consultationId, documentType]
    );
  }


  if (documentRow?.payload) {
    try {
      return JSON.parse(documentRow.payload);
    } catch (error) {
      console.warn('Impossible de parser le payload document:', error);
    }
  }
  return {};
}


function drawSectionTitle(doc, title, margin = PAGE_MARGIN) {
  const width = doc.page.width - margin * 2;
  doc.moveDown(0.3);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text(title.toUpperCase(), margin, doc.y, { width });
  const underlineY = doc.y + 2;
  doc.moveTo(margin, underlineY).lineTo(margin + width, underlineY).strokeColor('#e5e5e5').lineWidth(0.8).stroke();
  doc.moveDown(0.3);
}


function drawFramedCanvas(doc) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const outerX = OUTER_FRAME_PADDING;
  const outerY = OUTER_FRAME_PADDING;
  const outerWidth = pageWidth - outerX * 2;
  const outerHeight = pageHeight - outerY * 2;

  doc.save();
  doc.roundedRect(outerX, outerY, outerWidth, outerHeight, 18).fillAndStroke('#ffffff', '#d4d4d8');
  doc.restore();

  const innerX = INNER_FRAME_PADDING;
  const innerY = INNER_FRAME_PADDING;
  const innerWidth = pageWidth - innerX * 2;
  const innerHeight = pageHeight - innerY * 2;

  doc.save();
  doc.dash(4, { space: 4 });
  doc.roundedRect(innerX, innerY, innerWidth, innerHeight, 12).strokeColor('#e4e4e7').lineWidth(0.9).stroke();
  doc.undash();
  doc.restore();

  return {
    contentX: innerX + 16,
    contentWidth: innerWidth - 32,
    contentTop: innerY + 16,
    contentBottom: innerY + innerHeight - 16
  };
}


function drawInfoGrid(doc, layout, items = [], options = {}) {
  if (!items.length) return;
  const gap = options.gap ?? 8;
  const rowHeight = options.rowHeight ?? 40;
  const columnWidth = (layout.bodyWidth - gap * (items.length - 1)) / items.length;
  const top = doc.y;

  items.forEach((item, index) => {
    const colX = layout.margin + index * (columnWidth + gap);
    doc.roundedRect(colX, top, columnWidth, rowHeight, 8).lineWidth(1).strokeColor('#d4d4d8').stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(item.label.toUpperCase(), colX + 8, top + 6, { width: columnWidth - 16 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text(item.value || '-', colX + 8, top + 18, { width: columnWidth - 16, align: 'left' });
  });

  doc.y = top + rowHeight + (options.marginBottom ?? 18);
}


function drawTextPanel(doc, layout, { label, text, minHeight = 70, align = 'justify' }) {
  const panelX = layout.margin;
  const panelWidth = layout.bodyWidth;
  const top = doc.y;
  const content = text || '';
  const textOptions = { width: panelWidth - 24, align, lineGap: 3 };
  const measured = doc.heightOfString(content, textOptions);
  const panelHeight = Math.max(minHeight, measured + 32);

  doc.roundedRect(panelX, top, panelWidth, panelHeight, 12).lineWidth(1).strokeColor('#d4d4d8').stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#6b7280').text(label.toUpperCase(), panelX + 12, top + 10, { width: panelWidth - 24 });
  doc.font('Helvetica').fontSize(10).fillColor('#111827').text(content, panelX + 12, top + 24, textOptions);
  doc.y = top + panelHeight + 20;
}


function buildDocumentLayout(doc, settings, patient, referenceDate, titleText, subtitleText = '') {
  const frame = drawFramedCanvas(doc);
  const { contentX, contentWidth, contentTop, contentBottom } = frame;

  const gap = 16;
  const rightBoxWidth = Math.min(195, contentWidth * 0.34);
  const logoBlockWidth = 90;
  const leftColWidth = contentWidth - rightBoxWidth - logoBlockWidth - gap * 2;
  const leftX = contentX;
  const centerX = leftX + leftColWidth + gap;
  const rightX = centerX + logoBlockWidth + gap;
  const headerTop = contentTop;

  const doctorName = (settings?.doctorName || 'Docteur').toUpperCase();
  const specialtyLine = (settings?.doctorSpecialty || 'Spécialité non renseignée').toUpperCase();
  const orderNumber = settings?.doctorRPPS || '-';

  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(`DR. ${doctorName}`, leftX, headerTop, { width: leftColWidth });
  doc.font('Helvetica-Bold').fontSize(9).text('MÉDECIN SPÉCIALISTE EN', leftX, doc.y + 2, { width: leftColWidth });
  doc.font('Helvetica-Bold').fontSize(9).text(specialtyLine, leftX, doc.y, { width: leftColWidth });
  doc.font('Helvetica').fontSize(8).text('•', leftX, doc.y + 4);
  doc.font('Helvetica-Bold').fontSize(9).text(`NUMÉRO D'ORDRE: ${orderNumber}`, leftX, doc.y + 2, { width: leftColWidth });
  const leftBottom = doc.y;

  if (fs.existsSync(LOGO_PATH)) {
    const logoSize = 74;
    const logoY = headerTop + 4;
    doc.image(LOGO_PATH, centerX + (logoBlockWidth - logoSize) / 2, logoY, { width: logoSize, height: logoSize });
  } else {
    doc.circle(centerX + logoBlockWidth / 2, headerTop + 40, 30).strokeColor('#d4d4d8').lineWidth(1).stroke();
  }

  const boxHeight = 96;
  const boxY = headerTop;
  doc.roundedRect(rightX, boxY, rightBoxWidth, boxHeight, 12).lineWidth(1).strokeColor('#d4d4d8').fillColor('#f8fafc').fillAndStroke('#f8fafc', '#d4d4d8');

  const labelFont = () => doc.font('Helvetica').fontSize(7).fillColor('#6b7280');
  const valueFont = () => doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827');
  let fieldY = boxY + 10;
  const infoRows = [
    { label: 'DATE', value: referenceDate ? moment(referenceDate).format('DD/MM/YYYY') : moment().format('DD/MM/YYYY') },
    { label: 'NOM', value: (patient?.lastName || '').toUpperCase() },
    { label: 'PRÉNOM', value: (patient?.firstName || '').toUpperCase() },
    { label: 'ÂGE', value: patient?.dateOfBirth ? `${calculateAge(patient.dateOfBirth) ?? ''} ANS` : '-' }
  ];
  infoRows.forEach(row => {
    labelFont();
    doc.text(row.label, rightX + 12, fieldY);
    doc.moveTo(rightX + 12, fieldY + 11).lineTo(rightX + rightBoxWidth - 12, fieldY + 11).strokeColor('#e4e4e7').lineWidth(0.8).stroke();
    valueFont();
    doc.text(row.value || '...............', rightX + 12, fieldY + 2, { width: rightBoxWidth - 24, align: 'right' });
    fieldY += 22;
  });

  const headerBottom = Math.max(leftBottom, boxY + boxHeight);
  const dividerY = headerBottom + 18;
  doc.moveTo(contentX, dividerY).lineTo(contentX + contentWidth, dividerY).strokeColor('#0f172a').lineWidth(1.2).stroke();

  doc.font('Helvetica-Bold').fontSize(22).fillColor('#0f172a').text(titleText.toUpperCase(), contentX, dividerY + 10, { width: contentWidth, align: 'center' });
  if (subtitleText) {
    doc.font('Helvetica').fontSize(11).fillColor('#6b7280').text(subtitleText.toUpperCase(), contentX, doc.y - 2, { width: contentWidth, align: 'center' });
  }

  const titleBottom = doc.y;
  const footerStartY = contentBottom - 90;
  const bodyEndY = footerStartY - 20;
  const bodyStartY = Math.min(titleBottom + 24, bodyEndY - 40);

  return { margin: contentX, bodyWidth: contentWidth, bodyStartY, bodyEndY, footerStartY };
}


function drawDocumentFooter(doc, settings, layout) {
  const { margin, bodyWidth, footerStartY } = layout;
  const signatureDate = moment().format('DD/MM/YYYY');

  doc.font('Helvetica').fontSize(10).fillColor('#111827').text(signatureDate, margin + bodyWidth - 120, footerStartY, { width: 120, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text('SIGNATURE ET CACHET DU MÉDECIN', margin, footerStartY + 16, { width: bodyWidth, align: 'center' });

  const contactLineY = footerStartY + 38;
  doc.moveTo(margin, contactLineY).lineTo(margin + bodyWidth, contactLineY).lineWidth(0.8).strokeColor('#e4e4e7').stroke();

  const phone = settings?.cabinetPhone || 'Téléphone non renseigné';
  const address = settings?.cabinetAddress || 'Adresse du cabinet non renseignée';
  const subAddress = settings?.cabinetAddress2 || '';

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text(`📞 ${phone}`, margin, contactLineY + 6, { width: bodyWidth, align: 'center' });
  doc.font('Helvetica').fontSize(8).fillColor('#374151').text(`📍 ${address}`, margin, contactLineY + 20, { width: bodyWidth, align: 'center' });
  if (subAddress) {
    doc.font('Helvetica').fontSize(7).fillColor('#6b7280').text(subAddress, margin, contactLineY + 32, { width: bodyWidth, align: 'center' });
  }
}


// Legacy header/footer helpers removed in favor of buildDocumentLayout/drawDocumentFooter


export function setupPDFHandlers() {
  // Générer une ordonnance PDF
  ipcMain.handle('pdf:generate-prescription', async (event, { patientId, consultationId, medications, prescriptionDate }) => {
    try {
      const patient = await queryOne('SELECT * FROM patients WHERE id = ?', [patientId]);
      const settings = await getScopedSettings();


      if (!patient) {
        return { success: false, error: 'Patient non trouvé' };
      }


      // Créer le PDF
      const doc = new PDFDocument({
        size: 'A5',
        margin: 30
      });


      let pdfBytes = [];
      doc.on('data', chunk => pdfBytes.push(chunk));


      const layout = buildDocumentLayout(
        doc,
        settings,
        patient,
        prescriptionDate || new Date(),
        'Ordonnance',
        'Prescription médicale'
      );
      const { bodyStartY, bodyEndY, margin, bodyWidth } = layout;
      doc.y = bodyStartY;

      const medCount = Array.isArray(medications) ? medications.length : 0;
      drawInfoGrid(doc, layout, [
        { label: 'Date', value: moment(prescriptionDate || new Date()).format('DD/MM/YYYY') },
        { label: 'Médicaments', value: medCount || '0' },
        { label: 'Consultation', value: consultationId ? `#${consultationId}` : '—' }
      ], { rowHeight: 34 });

      if (medCount > 0) {
        medications.slice(0, 5).forEach((med, index) => {
          if (doc.y > bodyEndY - 50) {
            return;
          }

          const medY = doc.y;
          const medBoxHeight = 42;
          const cardX = margin;
          const cardWidth = bodyWidth;
          doc.roundedRect(cardX, medY, cardWidth, medBoxHeight, 10).lineWidth(1).strokeColor('#e5e7eb').stroke();

          doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827');
          doc.text(`${String(index + 1).padStart(2, '0')}  ${(med.name || 'Médicament').toUpperCase()}`, cardX + 10, medY + 6, { width: cardWidth - 20 });

          const detailParts = [];
          if (med.dosage) detailParts.push(`Dosage ${med.dosage}`);
          if (med.intake) detailParts.push(`Prise ${med.intake}`);
          if (med.duration) detailParts.push(`Durée ${med.duration}`);
          if (med.boxes) detailParts.push(`Boîtes ${med.boxes}`);

          if (detailParts.length) {
            doc.font('Helvetica').fontSize(9).fillColor('#4b5563');
            doc.text(detailParts.join('   '), cardX + 10, medY + 22, { width: cardWidth - 20 });
          }

          doc.y = medY + medBoxHeight + 10;
        });
      } else {
        doc.font('Helvetica').fontSize(10).fillColor('#000000');
        doc.text('Aucun médicament prescrit', margin, doc.y, { width: bodyWidth, align: 'center' });
      }

      drawDocumentFooter(doc, settings, layout);


      doc.end();


      // Attendre que le PDF soit généré
      return new Promise((resolve) => {
        doc.on('end', () => {
          resolve({
            success: true,
            data: Buffer.concat(pdfBytes)
          });
        });
      });
    } catch (error) {
      console.error('❌ Erreur lors de la génération du PDF ordonnance:', error);
      return { success: false, error: error.message };
    }
  });


  // Générer un arrêt de travail PDF
  ipcMain.handle('pdf:generate-sick-leave', async (event, { patientId, startDate, endDate, diagnosis, cim10Code, allowedOutings }) => {
    try {
      const patient = await queryOne('SELECT * FROM patients WHERE id = ?', [patientId]);
      const settings = await getScopedSettings();


      if (!patient) {
        return { success: false, error: 'Patient non trouvé' };
      }


      // Créer le PDF
      const doc = new PDFDocument({
        size: 'A5',
        margin: 30
      });


      let pdfBytes = [];
      doc.on('data', chunk => pdfBytes.push(chunk));


      const layout = buildDocumentLayout(
        doc,
        settings,
        patient,
        startDate || new Date(),
        'Arrêt de travail',
        'Certificat médical'
      );
      const { bodyStartY } = layout;
      doc.y = bodyStartY;

      const startMoment = moment(startDate || new Date());
      const endMoment = endDate ? moment(endDate) : startMoment;
      const daysCount = Math.max(1, endMoment.diff(startMoment, 'days') + 1);

      drawInfoGrid(doc, layout, [
        { label: 'Début', value: startMoment.format('DD/MM/YYYY') },
        { label: 'Fin', value: endMoment.format('DD/MM/YYYY') },
        { label: 'Durée', value: `${daysCount} jour${daysCount > 1 ? 's' : ''}` }
      ]);

      const isSingleDay = !startMoment.isSame(endMoment, 'day') ? false : true;
      const periodLabel = isSingleDay
        ? `le ${startMoment.format('DD/MM/YYYY')}`
        : `du ${startMoment.format('DD/MM/YYYY')} au ${endMoment.format('DD/MM/YYYY')} inclus`;
      const baseSentence = `Je soussigné(e) Dr ${settings?.doctorName || 'Docteur'} certifie que l'état de santé de ${patient.firstName} ${patient.lastName} nécessite un arrêt de travail ${periodLabel}.`;
      const additional = [];
      if (diagnosis) additional.push(`Motif médical : ${diagnosis}`);
      if (cim10Code) additional.push(`Code CIM-10 : ${cim10Code}`);

      drawTextPanel(doc, layout, {
        label: 'Texte du certificat',
        text: `${baseSentence}\n\n${additional.join('\n')}`
      });

      drawDocumentFooter(doc, settings, layout);


      doc.end();


      // Attendre que le PDF soit généré
      return new Promise((resolve) => {
        doc.on('end', () => {
          resolve({
            success: true,
            data: Buffer.concat(pdfBytes)
          });
        });
      });
    } catch (error) {
      console.error('❌ Erreur lors de la génération du PDF arrêt de travail:', error);
      return { success: false, error: error.message };
    }
  });


  // Générer une facture PDF
  ipcMain.handle('pdf:generate-invoice', async (event, { patientId, consultationId, documentId, documentData }) => {
    try {
      console.log('📄 Invoice generation request:', { patientId, consultationId, documentId, hasDocumentData: !!documentData });
      
      let resolvedPatientId = patientId;
      let consultation = null;


      if (!resolvedPatientId && consultationId) {
        consultation = await queryOne('SELECT * FROM consultations WHERE id = ?', [consultationId]);
        if (consultation) {
          resolvedPatientId = consultation.patientId;
        }
      } else if (consultationId) {
        consultation = await queryOne('SELECT * FROM consultations WHERE id = ?', [consultationId]);
      }


      if (!resolvedPatientId) {
        console.error('❌ No patient ID resolved for invoice');
        return { success: false, error: 'Patient introuvable pour cette facture' };
      }


      const patient = await queryOne('SELECT * FROM patients WHERE id = ?', [resolvedPatientId]);
      if (!patient) {
        console.error('❌ Patient not found:', resolvedPatientId);
        return { success: false, error: 'Patient introuvable' };
      }
      
      console.log('✅ Patient resolved:', patient.firstName, patient.lastName);


      const settings = await getScopedSettings();
      const payments = await query('SELECT * FROM payments WHERE patientId = ? ORDER BY paymentDate ASC', [resolvedPatientId]);
      const documentPayload = await resolveDocumentPayload({ patientId: resolvedPatientId, consultationId, documentType: 'invoice', providedData: documentData, documentId });


      const doc = new PDFDocument({ size: 'A5', margin: 30 });
      let pdfBytes = [];
      doc.on('data', chunk => pdfBytes.push(chunk));


      const invoiceDate = documentPayload.invoiceDate || consultation?.consultationDate || consultation?.createdAt || new Date();
      const layout = buildDocumentLayout(
        doc,
        settings,
        patient,
        invoiceDate,
        'Facture',
        'Reçu médical'
      );
      const { bodyStartY, margin, bodyWidth } = layout;
      doc.y = bodyStartY;

      drawInfoGrid(doc, layout, [
        { label: 'Date', value: moment(invoiceDate).format('DD/MM/YYYY') },
        { label: 'Séances', value: documentPayload.numberOfSessions || '-' },
        { label: 'Rythme', value: documentPayload.rhythm || 'Selon prescription' }
      ]);


      const paymentsList = Array.isArray(payments) ? payments : [];
      const paidAmount = paymentsList.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);
      const defaultUnitFromSettings = Number.isFinite(parseFloat(settings?.defaultConsultationFee)) ? parseFloat(settings.defaultConsultationFee) : 0;


      const toNumberOrNull = (value) => {
        if (value === '' || value === null || typeof value === 'undefined') return null;
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      };


      const sessionsValue = toNumberOrNull(documentPayload.numberOfSessions);
      const rhythmValue = documentPayload.rhythm || '';
      const unitValue = toNumberOrNull(documentPayload.unitPrice);
      const totalValue = toNumberOrNull(documentPayload.totalPrice);
      const inferredUnit = Number.isFinite(totalValue) && Number.isFinite(sessionsValue) && sessionsValue > 0
        ? totalValue / sessionsValue
        : null;
      const resolvedUnitValue = Number.isFinite(unitValue)
        ? unitValue
        : (Number.isFinite(inferredUnit) ? inferredUnit : defaultUnitFromSettings);
      const resolvedTotalValue = Number.isFinite(totalValue)
        ? totalValue
        : (Number.isFinite(sessionsValue) && Number.isFinite(resolvedUnitValue)
          ? sessionsValue * resolvedUnitValue
          : (resolvedUnitValue || defaultUnitFromSettings));


      const tableColumns = [
        { label: 'Nombre de séances', value: Number.isFinite(sessionsValue) ? sessionsValue : '-' },
        { label: 'Rythme', value: rhythmValue || '-' },
        { label: 'Prix unitaire', value: formatCurrencyAmount(resolvedUnitValue || 0) },
        { label: 'Prix total', value: formatCurrencyAmount(resolvedTotalValue || 0) }
      ];


      const columnWidth = bodyWidth / tableColumns.length;
      const tableHeaderHeight = 24;
      const tableValueHeight = 34;
      const tableStartY = doc.y + 10;
      tableColumns.forEach((col, idx) => {
        const columnX = margin + idx * columnWidth;
        doc.rect(columnX, tableStartY, columnWidth, tableHeaderHeight).strokeColor('#0f172a').stroke();
        doc.rect(columnX, tableStartY + tableHeaderHeight, columnWidth, tableValueHeight).strokeColor('#0f172a').stroke();
        doc.font('Helvetica-Bold').fontSize(9).text(col.label, columnX + 4, tableStartY + 5, { width: columnWidth - 8, align: 'center' });
        doc.font('Helvetica').fontSize(12).text(col.value, columnX + 4, tableStartY + tableHeaderHeight + 8, { width: columnWidth - 8, align: 'center' });
      });


      doc.y = tableStartY + tableHeaderHeight + tableValueHeight + 16;
      doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
      const outstanding = Math.max((resolvedTotalValue || 0) - paidAmount, 0);
      doc.text(`Montant réglé: ${formatCurrencyAmount(paidAmount)}`, margin, doc.y, { width: bodyWidth });
      doc.text(`Reste dû: ${formatCurrencyAmount(outstanding)}`, margin, doc.y, { width: bodyWidth });


      if (documentPayload.notes) {
        doc.moveDown(0.4);
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#475569').text(`Notes: ${documentPayload.notes}`, margin, doc.y, { width: bodyWidth });
      }


      if (paymentsList.length) {
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(8).fillColor('#475569');
        paymentsList.forEach(payment => {
          doc.text(`• ${formatDateValue(payment.paymentDate, true)} — ${formatCurrencyAmount(payment.amount)} (${payment.paymentMethod || 'Espèces'})`, margin, doc.y, { width: bodyWidth });
        });
      }


      drawDocumentFooter(doc, settings, layout);


      doc.end();


      return new Promise((resolve) => {
        doc.on('end', () => {
          resolve({ success: true, data: Buffer.concat(pdfBytes) });
        });
      });
    } catch (error) {
      console.error('❌ Erreur lors de la génération de la facture:', error);
      return { success: false, error: error.message };
    }
  });


  // Générer un rapport médical PDF
  ipcMain.handle('pdf:generate-report', async (event, { patientId, consultationId, documentId, documentData }) => {
    try {
      console.log('📄 Report generation request:', { patientId, consultationId, documentId, hasDocumentData: !!documentData });
      
      let resolvedPatientId = patientId;
      let consultation = null;


      if (!resolvedPatientId && consultationId) {
        consultation = await queryOne('SELECT * FROM consultations WHERE id = ?', [consultationId]);
        if (consultation) {
          resolvedPatientId = consultation.patientId;
        }
      } else if (consultationId) {
        consultation = await queryOne('SELECT * FROM consultations WHERE id = ?', [consultationId]);
      }


      if (!resolvedPatientId) {
        console.error('❌ No patient ID resolved for report');
        return { success: false, error: 'Patient introuvable pour ce rapport' };
      }


      const patient = await queryOne('SELECT * FROM patients WHERE id = ?', [resolvedPatientId]);
      if (!patient) {
        console.error('❌ Patient not found:', resolvedPatientId);
        return { success: false, error: 'Patient introuvable' };
      }
      
      console.log('✅ Patient resolved:', patient.firstName, patient.lastName);


      const settings = await getScopedSettings();
      const documentPayload = await resolveDocumentPayload({ patientId: resolvedPatientId, consultationId, documentType: 'rapport', providedData: documentData, documentId });


      const doc = new PDFDocument({
        size: 'A5',
        margin: 30
      });


      let pdfBytes = [];
      doc.on('data', chunk => pdfBytes.push(chunk));


      const reportDate = new Date();
      const layout = buildDocumentLayout(
        doc,
        settings,
        patient,
        reportDate,
        'Rapport médical',
        'Synthèse clinique'
      );
      const { bodyStartY, margin, bodyWidth } = layout;
      doc.y = bodyStartY;

      const reportReference = (documentPayload.reference || consultationId || resolvedPatientId).toString().slice(-8).toUpperCase();
      drawInfoGrid(doc, layout, [
        { label: 'Date', value: moment(reportDate).format('DD/MM/YYYY') },
        { label: 'Réf', value: reportReference },
        { label: 'Consultation', value: consultation?.consultationType || consultation?.type || '—' }
      ]);


      if (consultation) {
        drawSectionTitle(doc, 'Synthèse clinique');
        doc.font('Helvetica').fontSize(10);
        doc.text(`Type: ${consultation.consultationType || consultation.type || 'Consultation médicale'}`, margin, doc.y, { width: bodyWidth });
        if (consultation.reason) doc.text(`Motif: ${safeText(consultation.reason)}`, margin, doc.y, { width: bodyWidth, align: 'justify' });
        
        const vitals = [];
        if (consultation.weight) vitals.push(`Poids: ${consultation.weight} kg`);
        if (consultation.height) vitals.push(`Taille: ${consultation.height} cm`);
        if (consultation.bloodPressure) vitals.push(`Tension: ${consultation.bloodPressure}`);
        if (consultation.temperature) vitals.push(`Température: ${consultation.temperature} °C`);
        if (vitals.length) {
          doc.text(`Signes vitaux: ${vitals.join('  •  ')}`, margin, doc.y, { width: bodyWidth });
        }
      }


      if (documentPayload.body) {
        drawSectionTitle(doc, 'Texte principal');
        doc.font('Helvetica').fontSize(10).text(documentPayload.body, margin, doc.y, { width: bodyWidth, align: 'justify' });
      }


      if (documentPayload.recommendations) {
        drawSectionTitle(doc, 'Recommandations / Conclusion');
        doc.font('Helvetica').fontSize(10).text(documentPayload.recommendations, margin, doc.y, { width: bodyWidth, align: 'justify' });
      }


      if (!documentPayload.body && !documentPayload.recommendations && consultation?.notes) {
        drawSectionTitle(doc, 'Observations');
        doc.font('Helvetica').fontSize(10).text(consultation.notes, margin, doc.y, { width: bodyWidth, align: 'justify' });
      }
      drawDocumentFooter(doc, settings, layout);


      doc.end();


      return new Promise((resolve) => {
        doc.on('end', () => {
          console.log('✅ Report PDF generated, buffer size:', Buffer.concat(pdfBytes).length);
          resolve({
            success: true,
            data: Buffer.concat(pdfBytes)
          });
        });
      });
    } catch (error) {
      console.error('❌ Erreur lors de la génération du rapport:', error);
      console.error('❌ Stack:', error.stack);
      return { success: false, error: error.message };
    }
  });


  ipcMain.handle('pdf:generate-certificate', async (event, { patientId, documentId, documentData }) => {
    try {
      if (!patientId) {
        return { success: false, error: 'Patient requis pour le certificat' };
      }


      const patient = await queryOne('SELECT * FROM patients WHERE id = ?', [patientId]);
      if (!patient) {
        return { success: false, error: 'Patient introuvable' };
      }


      const settings = await getScopedSettings();
      const documentPayload = await resolveDocumentPayload({ patientId, documentType: 'certificate', providedData: documentData, documentId });


      // Créer le PDF
      const doc = new PDFDocument({
        size: 'A5',
        margin: 30
      });


      let pdfBytes = [];
      doc.on('data', chunk => pdfBytes.push(chunk));


      const layout = buildDocumentLayout(
        doc,
        settings,
        patient,
        new Date(),
        'Certificat médical',
        'Attestation d\'examen'
      );
      const { bodyStartY } = layout;
      doc.y = bodyStartY;

      const startMoment = moment(documentPayload.startDate || new Date());
      const endMoment = documentPayload.endDate ? moment(documentPayload.endDate) : startMoment;
      const computedDurationDays = Math.max(1, endMoment.diff(startMoment, 'days') + 1);
      const durationLabel = documentPayload.duration || `${computedDurationDays} jour${computedDurationDays > 1 ? 's' : ''}`;

      drawInfoGrid(doc, layout, [
        { label: 'Début', value: startMoment.format('DD/MM/YYYY') },
        { label: 'Fin', value: endMoment.format('DD/MM/YYYY') },
        { label: 'Durée', value: durationLabel }
      ]);

      const defaultBody = `Je soussigné(e) Dr ${settings?.doctorName || 'Docteur'} certifie avoir vu et examiné le/la patient(e) sus-nommé(e) suivi(e) à notre niveau pour la prise en charge de ${documentPayload.diagnosis || '[diagnostic]'}.\n\n- Un repos médical de ${durationLabel}\n- Une IPP estimée à …`;
      drawTextPanel(doc, layout, {
        label: 'Texte du certificat',
        text: documentPayload.body || defaultBody,
        minHeight: 120,
        align: 'left'
      });

      drawDocumentFooter(doc, settings, layout);


      doc.end();


      return new Promise((resolve) => {
        doc.on('end', () => {
          resolve({ success: true, data: Buffer.concat(pdfBytes) });
        });
      });
    } catch (error) {
      console.error('❌ Erreur lors de la génération du certificat:', error);
      return { success: false, error: error.message };
    }
  });
}
