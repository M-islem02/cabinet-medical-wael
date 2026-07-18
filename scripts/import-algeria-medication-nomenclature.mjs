import fs from 'node:fs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/import-algeria-medication-nomenclature.mjs <source.csv> <output.json>');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

const rows = parseCsv(fs.readFileSync(inputPath, 'utf8'));
const headerIndex = rows.findIndex((row) => row[0] === 'N°' && row.includes('NOM DE MARQUE'));
if (headerIndex < 0) throw new Error('En-tête de nomenclature introuvable');

const medications = rows.slice(headerIndex + 1)
  .filter((row) => row[0] && row[4])
  .map((row, index) => ({
    id: `dz_2026_${String(index + 1).padStart(5, '0')}`,
    numero_enregistrement: row[1] || '',
    code: row[2] || '',
    dci: row[3] || '',
    nom_medicament: row[4] || '',
    forme: row[5] || '',
    dosage_posologie: row[6] || '',
    conditionnement: row[7] || '',
    liste: row[8] || '',
    prise: '',
    duree: '',
    boites: '',
    instructions_observations: row[3] ? `DCI : ${row[3]}` : '',
    statut: row[17] || '',
    laboratoire: row[12] || '',
    pays: row[13] || ''
  }));

const payload = {
  specialite: 'general',
  source: 'Ministère de l’Industrie Pharmaceutique - Nomenclature nationale des produits pharmaceutiques à usage de la médecine humaine au 30 avril 2026',
  source_url: 'https://www.miph.gov.dz/fr/wp-content/uploads/2026/05/NOMENCLATURE.VERSION.AVRIL_.2026-.xlsx',
  generated_at: new Date().toISOString().slice(0, 10),
  medication_count: medications.length,
  avertissement: 'Catalogue réglementaire d’aide à la saisie. Posologie, prise et durée doivent être déterminées et vérifiées par le prescripteur.',
  medicaments: medications
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Imported ${medications.length} medications into ${outputPath}`);
