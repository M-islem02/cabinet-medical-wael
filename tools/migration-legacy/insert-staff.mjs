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

async function addUsers() {
    const connection = await pool.getConnection();
    try {
        const users = [
            { id: crypto.randomUUID(), username: 'doctor1', password: hashPassword('123456'), fullName: 'Dr. John Doe', role: 'doctor', isAdmin: 1, isActive: 1, isSuperAdmin: 0 },
            { id: crypto.randomUUID(), username: 'doctor2', password: hashPassword('123456'), fullName: 'Dr. Jane Smith', role: 'doctor', isAdmin: 1, isActive: 1, isSuperAdmin: 0 },
            { id: crypto.randomUUID(), username: 'assistant', password: hashPassword('123456'), fullName: 'Sarah Assistant', role: 'assistant', isAdmin: 0, isActive: 1, isSuperAdmin: 0 },
            { id: crypto.randomUUID(), username: 'admin', password: hashPassword('admin123'), fullName: 'Super Admin', role: 'admin', isAdmin: 1, isActive: 1, isSuperAdmin: 1 }
        ];
        
        for(let u of users) {
            const [rows] = await connection.query('SELECT username FROM users WHERE username = ?', [u.username]);
            if(rows.length === 0) {
                await connection.execute(
                    `INSERT INTO users (id, username, password, fullName, role, isAdmin, isSuperAdmin, isActive, color, specialty)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '#3b82f6', '')`,
                    [u.id, u.username, u.password, u.fullName, u.role, u.isAdmin, u.isSuperAdmin, u.isActive]
                );
            }
        }
        
        console.log('Added 2 doctors, 1 assistant and 1 admin.');
    } catch(e) {
        console.error(e);
    } finally {
        connection.release();
        await pool.end();
    }
}
addUsers();