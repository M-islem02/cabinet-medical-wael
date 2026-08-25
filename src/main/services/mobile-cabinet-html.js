/**
 * Mobile Web Application for Cabinet Médical (MedCareSO Mobile)
 * Responsive Ant Design Mobile SPA for Smartphone / Tablet
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, 'mobile-cabinet-template.html');
let templateHtml = '';

try {
  templateHtml = fs.readFileSync(templatePath, 'utf8');
} catch (err) {
  console.error('Error reading mobile cabinet template:', err);
}

export function renderMobileCabinetHtml(shareData = {}, tokenOverride = '') {
  const token = tokenOverride || shareData.token || '';
  const cabinetName = String(shareData.cabinetName || 'Cabinet Médical').replace(/"/g, '&quot;');
  const doctorName = String(shareData.doctorName || 'Médecin').replace(/"/g, '&quot;');

  if (!templateHtml) {
    try {
      templateHtml = fs.readFileSync(templatePath, 'utf8');
    } catch (_) {}
  }

  return (templateHtml || '')
    .replaceAll('__CABINET_NAME__', cabinetName)
    .replaceAll('__DOCTOR_NAME__', doctorName)
    .replaceAll('__TOKEN__', token);
}
