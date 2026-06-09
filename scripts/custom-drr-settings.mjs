import mysql from 'mysql2/promise';
import crypto from 'crypto';

const pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3306,
    user: 'physiocare_user',
    password: 'PhysioCare2024!',
    database: 'physiocare'
});

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function addDrrAndSettings() {
    const connection = await pool.getConnection();
    try {
        const username = 'drr';
        const [rows] = await connection.query('SELECT id FROM users WHERE username = ?', [username]);
        let drrId;
        if(rows.length === 0) {
            drrId = crypto.randomUUID();
            await connection.execute(
                `INSERT INTO users (id, username, password, fullName, role, isAdmin, isSuperAdmin, isActive, color, specialty)
                 VALUES (?, ?, ?, 'Debassi Wafa', 'doctor', 1, 0, 1, '#3b82f6', 'Médecin Spécialiste en Médecine Physique et de Réadaption')`,
                [drrId, username, hashPassword('123456')]
            );
            console.log('Created user `drr`.');
        } else {
            drrId = rows[0].id;
        }
        
        // Add specific settings for this doctor
        const [existingSettings] = await connection.query('SELECT id FROM settings WHERE ownerUserId = ?', [drrId]);
        if(existingSettings.length === 0) {
            await connection.execute(
                `INSERT INTO settings (
                    id, ownerUserId, cabinetName, cabinetAddress, cabinetPhone, 
                    cabinetEmail, doctorName, doctorSpecialty, 
                    documentColorMode, documentTextScale, documentLogoScale, 
                    documentStyleVariant, documentWatermarkOpacity, documentHideSignature
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    crypto.randomUUID(),
                    drrId,
                    'MPR DEBASSI',
                    'Coopérative Aden Villa 8 RDC cité Zaafrania 2 à 100 m du CAC centre anti caner du CHU Ibn rochd - ANNABA',
                    '+213 556 95 12 82 | +213 675 81 17 86',
                    'debassiwafa@gmail.com',
                    'Debassi Wafa',
                    'Médecin Spécialiste en Médecine Physique et de Réadaption',
                    'monochrome',
                    '100',
                    '150',
                    'classic',
                    '5',
                    1
                ]
            );
            console.log('Inserted specific settings for `drr`.');
        } else {
            // Update existing settings
            await connection.execute(
                `UPDATE settings SET 
                    cabinetName = ?, cabinetAddress = ?, cabinetPhone = ?, 
                    cabinetEmail = ?, doctorName = ?, doctorSpecialty = ?, 
                    documentColorMode = ?, documentTextScale = ?, documentLogoScale = ?, 
                    documentStyleVariant = ?, documentWatermarkOpacity = ?, documentHideSignature = ?
                WHERE ownerUserId = ?`,
                [
                    'MPR DEBASSI',
                    'Coopérative Aden Villa 8 RDC cité Zaafrania 2 à 100 m du CAC centre anti caner du CHU Ibn rochd - ANNABA',
                    '+213 556 95 12 82 | +213 675 81 17 86',
                    'debassiwafa@gmail.com',
                    'Debassi Wafa',
                    'Médecin Spécialiste en Médecine Physique et de Réadaption',
                    'monochrome',
                    '100',
                    '150',
                    'classic',
                    '5',
                    1,
                    drrId
                ]
            );
            console.log('Updated specific settings for `drr`.');
        }
        
    } catch(e) {
        console.error(e);
    } finally {
        connection.release();
        await pool.end();
    }
}
addDrrAndSettings();