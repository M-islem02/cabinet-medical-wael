import mysql from 'mysql2/promise';
import crypto from 'crypto';

async function updateSpecifics() {
    const pool = mysql.createPool({ host: '127.0.0.1', port: 3306, user: 'physiocare_user', password: 'PhysioCare2024!', database: 'physiocare' });
    const connection = await pool.getConnection();

    try {
        const username = 'drr';
        const [rows] = await connection.query('SELECT id FROM users WHERE username = ?', [username]);
        if(rows.length > 0) {
            await connection.execute('UPDATE settings SET preferredPrinter = ?, preferredScanner = ? WHERE ownerUserId = ?', ['Microsoft Print to PDF', 'Scanner USB', rows[0].id]);
            console.log('Set printers for ' + username);
        }
        
        // Create assistant specific settings
        const assistantName = 'assistant';
        const [astRows] = await connection.query('SELECT id FROM users WHERE username = ?', [assistantName]);
        if (astRows.length > 0) {
            const astId = astRows[0].id;
            const [existing] = await connection.query('SELECT id FROM settings WHERE ownerUserId = ?', [astId]);
            if (existing.length === 0) {
                await connection.execute(
                    `INSERT INTO settings (
                        id, ownerUserId, cabinetName, cabinetAddress, cabinetPhone, 
                        cabinetEmail, doctorName, doctorSpecialty
                    ) VALUES (?, ?, ?, ?, ?, ?, '', '')`,
                    [
                        crypto.randomUUID(),
                        astId,
                        'MPR DEBASSI',
                        'Coopérative Aden Villa 8 RDC cité Zaafrania 2 à 100 m du CAC centre anti caner du CHU Ibn rochd - ANNABA',
                        '+213 556 95 12 82 | +213 675 81 17 86',
                        'debassiwafa@gmail.com'
                    ]
                );
            } else {
                await connection.execute(
                    `UPDATE settings SET cabinetName = ?, cabinetAddress = ?, cabinetPhone = ?, cabinetEmail = ?, doctorName = '', doctorSpecialty = '' WHERE ownerUserId = ?`, 
                    [
                        'MPR DEBASSI',
                        'Coopérative Aden Villa 8 RDC cité Zaafrania 2 à 100 m du CAC centre anti caner du CHU Ibn rochd - ANNABA',
                        '+213 556 95 12 82 | +213 675 81 17 86',
                        'debassiwafa@gmail.com',
                        astId
                    ]
                );
            }
            console.log('Set settings for ' + assistantName);
        }
    } catch(e) {
        console.error(e);
    } finally {
        connection.release();
        await pool.end();
    }
}
updateSpecifics();