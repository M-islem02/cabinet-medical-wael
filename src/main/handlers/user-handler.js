/**
 * Gestionnaire IPC pour les utilisateurs (login)
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import moment from 'moment';
import { clearLoginSession } from '../session-manager.js';

// Helper pour convertir les valeurs vides en null (MariaDB compatibility)
const toNullIfEmpty = (val) => (val === '' || val === undefined) ? null : val;

function isPractitionerRole(role) {
  return role === 'doctor' || role === 'dentist';
}

function normalizeLegacyRole(role) {
  return role === 'director' ? 'doctor' : role;
}

async function normalizeUserPrivileges(user) {
  if (!user?.id) return user;

  const normalizedRole = user.isSuperAdmin ? 'admin' : normalizeLegacyRole(user.role || 'doctor');
  const normalizedIsSuperAdmin = user.isSuperAdmin ? 1 : 0;
  const normalizedIsAdmin = (normalizedRole === 'admin' || normalizedIsSuperAdmin) ? 1 : 0;

  if (
    normalizedRole !== user.role
    || Number(user.isAdmin || 0) !== normalizedIsAdmin
    || Number(user.isSuperAdmin || 0) !== normalizedIsSuperAdmin
  ) {
    await run(
      `UPDATE users
       SET role = ?, isAdmin = ?, isSuperAdmin = ?
       WHERE id = ?`,
      [normalizedRole, normalizedIsAdmin, normalizedIsSuperAdmin, user.id]
    );
  }

  return {
    ...user,
    role: normalizedRole,
    isAdmin: normalizedIsAdmin,
    isSuperAdmin: normalizedIsSuperAdmin
  };
}

async function normalizeAllUsersPrivileges() {
  await run(`UPDATE users SET role = 'doctor' WHERE role = 'director'`);
  await run(`UPDATE users SET role = 'admin' WHERE isSuperAdmin = 1 AND role <> 'admin'`);
  await run(`UPDATE users SET isAdmin = CASE WHEN role = 'admin' OR isSuperAdmin = 1 THEN 1 ELSE 0 END`);
}

/**
 * Hash le mot de passe avec SHA256
 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Get default color for role
 */
function getDefaultColorForRole(role) {
  const colors = {
    admin: '#ef4444',
    doctor: '#3b82f6',
    dentist: '#0ea5e9',
    kinesitherapeute: '#8b5cf6',
    ergotherapeute: '#06b6d4',
    orthophoniste: '#f59e0b',
    nurse: '#10b981',
    assistant: '#6b7280'
  };
  return colors[role] || '#6b7280';
}

const SYSTEM_ACCOUNT_DEFAULTS = {
  admin: {
    username: 'admin',
    password: 'admin2024',
    fullName: 'Administrateur Système',
    isSuperAdmin: 0
  },
  superadmin: {
    username: 'superadmin',
    password: 'MedPro@2024!',
    fullName: 'Super Administrateur',
    isSuperAdmin: 1
  }
};

async function repairSystemAccount(username) {
  const account = SYSTEM_ACCOUNT_DEFAULTS[username];
  if (!account) return null;

  const passwordHash = hashPassword(account.password);
  const now = moment().format('YYYY-MM-DD HH:mm:ss');
  const existing = await queryOne('SELECT id FROM users WHERE username = ?', [account.username]);

  if (existing?.id) {
    await run(
      `UPDATE users
       SET password = ?,
           fullName = COALESCE(NULLIF(fullName, ''), ?),
           role = 'admin',
           isAdmin = 1,
           isSuperAdmin = ?,
           isActive = 1
       WHERE username = ?`,
      [passwordHash, account.fullName, account.isSuperAdmin, account.username]
    );
    return existing.id;
  }

  const id = uuidv4();
  await run(
    `INSERT INTO users (id, username, password, fullName, role, isAdmin, isSuperAdmin, isActive, createdAt)
     VALUES (?, ?, ?, ?, 'admin', 1, ?, 1, ?)`,
    [id, account.username, passwordHash, account.fullName, account.isSuperAdmin, now]
  );

  return id;
}

async function findUserForLogin(username, password) {
  const passwordHash = hashPassword(password);
  let user = await queryOne(
    'SELECT id, username, fullName, role, specialty, isAdmin, isSuperAdmin, isActive FROM users WHERE username = ? AND password = ?',
    [username, passwordHash]
  );

  if (user) {
    return normalizeUserPrivileges(user);
  }

  const systemAccount = SYSTEM_ACCOUNT_DEFAULTS[username];
  if (!systemAccount || systemAccount.password !== password) {
    return null;
  }

  await repairSystemAccount(username);
  console.warn(`System account repaired during login: ${username}`);

  user = await queryOne(
    'SELECT id, username, fullName, role, specialty, isAdmin, isSuperAdmin, isActive FROM users WHERE username = ? AND password = ?',
    [username, passwordHash]
  );

  return normalizeUserPrivileges(user);
}

export function handleUserEvents() {
  // Créer un utilisateur (setup initial - ADMIN ONLY)
  ipcMain.handle('user:create', async (event, { username, password, fullName }) => {
    console.log(`👤 user:create called for ${username}`);
    try {
      // Vérifier si un utilisateur existe déjà
      const existingUser = await queryOne('SELECT id FROM users WHERE username = ?', [username]);
      
      if (existingUser) {
        console.log('❌ User already exists');
        return { success: false, error: 'Ce nom d\'utilisateur existe déjà' };
      }
      
      const id = uuidv4();
      const passwordHash = hashPassword(password);
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      
      // First user is always ADMIN
      await run(
        `INSERT INTO users (id, username, password, fullName, role, isAdmin, createdAt)
         VALUES (?, ?, ?, ?, 'admin', 1, ?)`,
        [id, username, passwordHash, fullName || 'Administrateur', now]
      );
      
      console.log(`✅ Administrateur créé: ${username}`);
      
      return { success: true, id };
    } catch (error) {
      console.error('❌ Erreur lors de la création de l\'utilisateur:', error);
      return { success: false, error: error.message };
    }
  });

  // Login
  ipcMain.handle('user:login', async (event, { username, password }) => {
    try {
      const user = await findUserForLogin(username, password);
      
      if (!user) {
        return { success: false, error: 'Nom d\'utilisateur ou mot de passe incorrect' };
      }

      if (!user.isActive) {
        return { success: false, error: 'Ce compte est désactivé' };
      }

      // ✅ CHECK LICENSE - Les admins peuvent se connecter même sans licence activée
      const { checkLicenseAtStartup } = await import('../license-manager.js');
      const licenseCheck = await checkLicenseAtStartup();
      
      if (!licenseCheck.hasActiveLicense) {
        if (user.isAdmin || user.isSuperAdmin) {
          console.log('🔑 Admin connecté - Aucune licence active, accès autorisé pour gestion de licence');
          return {
            success: true,
            needsLicenseManagement: true,
            user: {
              id: user.id,
              username: user.username,
              fullName: user.fullName,
              role: user.role,
              specialty: user.specialty || '',
              isAdmin: user.isAdmin,
              isSuperAdmin: user.isSuperAdmin
            }
          };
        }
        
        // Autres utilisateurs ne peuvent pas se connecter sans licence
        return {
          success: false,
          error: 'Accès bloqué: seul le compte administrateur peut se connecter pour activer ou renouveler la licence.'
        };
      }
      
      // ✅ CHECK PACKAGE CONFIG - Super admin may need to configure package
      if (user.isSuperAdmin) {
        const packageConfig = await queryOne('SELECT * FROM package_config LIMIT 1');
        if (!packageConfig || packageConfig.clientName === 'Client Non Configuré') {
          console.log('📦 Super admin - Package non configuré, redirection vers configuration');
          return {
            success: true,
            needsPackageConfig: true,
            user: {
              id: user.id,
              username: user.username,
              fullName: user.fullName,
              role: user.role,
              specialty: user.specialty || '',
              isAdmin: user.isAdmin,
              isSuperAdmin: user.isSuperAdmin
            }
          };
        }
      }

      // Update last login
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      await run('UPDATE users SET lastLogin = ? WHERE id = ?', [now, user.id]);
      
      console.log(`✅ Connexion réussie: ${username}`);
      
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          specialty: user.specialty || '',
          isAdmin: user.isAdmin,
          isSuperAdmin: user.isSuperAdmin
        }
      };
    } catch (error) {
      console.error('❌ Erreur lors de la connexion:', error);
      return { success: false, error: error.message };
    }
  });

  // Get all users (hide super admin from list for non-super-admins)
  // Supports optional pagination: { paginated: true, page, pageSize, searchTerm }
  ipcMain.handle('user:getAll', async (event, payload = {}) => {
    try {
      await normalizeAllUsersPrivileges();

      const effectiveRequesterId = global.currentUser?.id || payload.requestingUserId || null;
      const effectiveRequesterUsername = global.currentUser?.username || payload.requestingUsername || null;

      // Check if requesting user is super admin
      let requestingUser = effectiveRequesterId
        ? await queryOne('SELECT isSuperAdmin, role FROM users WHERE id = ?', [effectiveRequesterId])
        : null;

      if (!requestingUser && effectiveRequesterUsername) {
        requestingUser = await queryOne('SELECT isSuperAdmin, role FROM users WHERE username = ?', [effectiveRequesterUsername]);
      }

      if (!requestingUser && payload.requestingUserIsSuperAdmin === true) {
        requestingUser = { isSuperAdmin: 1, role: 'admin' };
      }

      const isSuperAdminRequester = !!requestingUser?.isSuperAdmin;
      const isAdminRequester = isSuperAdminRequester || requestingUser?.role === 'admin';

      let whereClause = '';
      const params = [];
      if (isSuperAdminRequester) {
        whereClause = '';
      } else if (isAdminRequester) {
        whereClause = 'WHERE isSuperAdmin = 0';
      } else {
        whereClause = "WHERE isSuperAdmin = 0 AND role <> 'admin'";
      }

      const searchTerm = String(payload.searchTerm || '').trim();
      if (searchTerm) {
        const searchPattern = `%${searchTerm}%`;
        const searchCondition = '(username LIKE ? OR fullName LIKE ? OR phone LIKE ? OR role LIKE ? OR specialty LIKE ?)';
        if (whereClause) {
          whereClause += ` AND ${searchCondition}`;
        } else {
          whereClause = `WHERE ${searchCondition}`;
        }
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      const baseSql = `SELECT id, username, fullName, phone, role, specialty, isAdmin, isSuperAdmin, isActive, createdAt, lastLogin FROM users ${whereClause} ORDER BY createdAt DESC`;

      if (!payload.paginated) {
        const users = await query(baseSql, params);
        return { success: true, data: users };
      }

      const pageSize = Math.max(1, Math.min(100, Number(payload.pageSize) || 20));
      const totalRow = await queryOne(`SELECT COUNT(*) as total FROM users ${whereClause}`, params);
      const total = Number(totalRow?.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const requestedPage = Math.max(1, Number(payload.page) || 1);
      const page = Math.min(requestedPage, totalPages);
      const offset = (page - 1) * pageSize;

      const users = await query(`${baseSql} LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
      return {
        success: true,
        data: users,
        pagination: { page, pageSize, total, totalPages }
      };
    } catch (error) {
      console.error('❌ Error getting users:', error);
      return { success: false, error: error.message };
    }
  });

  // Add new user (ADMIN ONLY)
  ipcMain.handle('user:add', async (event, userData) => {
    try {
      await normalizeAllUsersPrivileges();

      const effectiveRequesterId = global.currentUser?.id || userData.requestingUserId || null;

      // Verify that the requesting user is an admin only
      if (!effectiveRequesterId) {
        return { success: false, error: 'Utilisateur non identifié' };
      }

      const requestingUser = await queryOne('SELECT isAdmin, isSuperAdmin, role FROM users WHERE id = ?', [effectiveRequesterId]);
      if (!requestingUser) {
        return { success: false, error: 'Utilisateur non trouvé' };
      }
      
      const isAdmin = !!requestingUser.isAdmin;
      const canCreateUsers = requestingUser.role === 'admin' || !!requestingUser.isSuperAdmin;
      if (!canCreateUsers) {
        return { success: false, error: 'Seuls les administrateurs peuvent ajouter des utilisateurs' };
      }

      // Check if username exists
      const existing = await queryOne('SELECT id FROM users WHERE username = ?', [userData.username]);
      if (existing) {
        return { success: false, error: 'Ce nom d\'utilisateur existe déjà' };
      }

      const id = uuidv4();
      const passwordHash = hashPassword(userData.password);
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      const newUserIsAdmin = userData.isAdmin && isAdmin ? 1 : 0;
      
      // Validate role (admin, doctor, assistant, kinesitherapeute, ergotherapeute, orthophoniste, nurse)
      const validRoles = ['admin', 'doctor', 'assistant', 'kinesitherapeute', 'ergotherapeute', 'orthophoniste', 'nurse', 'dentist'];
      const role = normalizeLegacyRole(validRoles.includes(userData.role) ? userData.role : 'doctor');

      await run(
        `INSERT INTO users (id, username, password, fullName, phone, role, isAdmin, color, specialty, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userData.username,
          passwordHash,
          toNullIfEmpty(userData.fullName),
          toNullIfEmpty(userData.phone),
          role,
          newUserIsAdmin,
          userData.color || getDefaultColorForRole(role),
          toNullIfEmpty(userData.specialty),
          now
        ]
      );

      console.log(`✅ Utilisateur ajouté: ${userData.username} (role: ${role}, isAdmin: ${newUserIsAdmin})`);

      return {
        success: true,
        id,
        userMeta: {
          isPractitionerAdmin: Boolean(newUserIsAdmin && isPractitionerRole(role))
        }
      };
    } catch (error) {
      console.error('❌ Error adding user:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('user:getById', async (event, { userId, requestingUserId } = {}) => {
    try {
      await normalizeAllUsersPrivileges();

      const effectiveRequesterId = global.currentUser?.id || requestingUserId || null;
      if (!effectiveRequesterId) {
        return { success: false, error: 'Utilisateur non identifié' };
      }

      const requestingUser = await queryOne('SELECT role, isAdmin, isSuperAdmin FROM users WHERE id = ?', [effectiveRequesterId]);
      if (!requestingUser || (requestingUser.role !== 'admin' && !requestingUser.isSuperAdmin)) {
        return { success: false, error: 'Accès refusé' };
      }

      const user = await queryOne(
        `SELECT id, username, fullName, phone, role, specialty, isAdmin, isSuperAdmin, isActive
         FROM users
         WHERE id = ?`,
        [userId]
      );

      if (!user) {
        return { success: false, error: 'Utilisateur introuvable' };
      }

      if (user.isSuperAdmin && !requestingUser.isSuperAdmin) {
        return { success: false, error: 'Le super administrateur est protégé' };
      }

      return { success: true, data: user };
    } catch (error) {
      console.error('❌ Error getting user by id:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('user:update', async (event, payload = {}) => {
    try {
      await normalizeAllUsersPrivileges();

      const effectiveRequesterId = global.currentUser?.id || payload.requestingUserId || null;
      if (!effectiveRequesterId) {
        return { success: false, error: 'Utilisateur non identifié' };
      }

      const requestingUser = await queryOne('SELECT role, isAdmin, isSuperAdmin FROM users WHERE id = ?', [effectiveRequesterId]);
      if (!requestingUser || (requestingUser.role !== 'admin' && !requestingUser.isSuperAdmin)) {
        return { success: false, error: 'Seuls les administrateurs peuvent modifier des comptes' };
      }

      const targetUser = await queryOne('SELECT id, role, isAdmin, isSuperAdmin FROM users WHERE id = ?', [payload.userId]);
      if (!targetUser) {
        return { success: false, error: 'Utilisateur cible introuvable' };
      }

      if (targetUser.isSuperAdmin) {
        return { success: false, error: 'Le super administrateur ne peut pas être modifié ici' };
      }

      if (targetUser.role === 'admin' && !requestingUser.isSuperAdmin) {
        return { success: false, error: 'Le compte administrateur principal est protégé' };
      }

      const validRoles = ['admin', 'doctor', 'assistant', 'dentist'];
      const requestedRole = normalizeLegacyRole(validRoles.includes(payload.role) ? payload.role : targetUser.role);
      if (requestedRole === 'admin' && !requestingUser.isSuperAdmin) {
        return { success: false, error: 'Modification en administrateur non autorisée' };
      }

      const username = String(payload.username || '').trim();
      if (!username.length) {
        return { success: false, error: 'Le nom d\'utilisateur est obligatoire' };
      }

      const existing = await queryOne('SELECT id FROM users WHERE username = ?', [username]);
      if (existing && existing.id !== payload.userId) {
        return { success: false, error: 'Ce nom d\'utilisateur existe déjà' };
      }

      const specialty = (requestedRole === 'doctor' || requestedRole === 'dentist')
        ? toNullIfEmpty(payload.specialty)
        : null;
      const normalizedIsAdmin = requestedRole === 'admin' ? 1 : 0;

      const updateFields = [
        'username = ?',
        'fullName = ?',
        'phone = ?',
        'role = ?',
        'specialty = ?',
        'isAdmin = ?',
        'color = ?'
      ];
      const updateValues = [
        username,
        toNullIfEmpty(payload.fullName),
        toNullIfEmpty(payload.phone),
        requestedRole,
        specialty,
        normalizedIsAdmin,
        payload.color || getDefaultColorForRole(requestedRole)
      ];

      if (payload.password && String(payload.password).trim().length) {
        updateFields.push('password = ?');
        updateValues.push(hashPassword(String(payload.password)));
      }

      updateValues.push(payload.userId);

      await run(
        `UPDATE users
         SET ${updateFields.join(', ')}
         WHERE id = ?`,
        updateValues
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Error updating user:', error);
      return { success: false, error: error.message };
    }
  });

  // Delete user (ADMIN only)
  ipcMain.handle('user:delete', async (event, { userId, requestingUserId }) => {
    try {
      await normalizeAllUsersPrivileges();

      const effectiveRequesterId = global.currentUser?.id || requestingUserId || null;

      // Verify requesting user rights
      const requestingUser = await queryOne('SELECT isAdmin, isSuperAdmin, role FROM users WHERE id = ?', [effectiveRequesterId]);
      if (!requestingUser) {
        return { success: false, error: 'Utilisateur demandeur introuvable' };
      }

      const isAdmin = !!requestingUser.isAdmin;
      if (!isAdmin && !requestingUser.isSuperAdmin) {
        return { success: false, error: 'Accès refusé: suppression non autorisée' };
      }

      // Check target user details
      const targetUser = await queryOne('SELECT isSuperAdmin, isAdmin, role FROM users WHERE id = ?', [userId]);
      if (!targetUser) {
        return { success: false, error: 'Utilisateur cible introuvable' };
      }

      // Check if target user is super admin
      if (targetUser?.isSuperAdmin) {
        return { success: false, error: 'Le super administrateur ne peut pas être supprimé' };
      }

      if (targetUser?.isAdmin && !requestingUser?.isSuperAdmin) {
        return { success: false, error: 'Seul le super administrateur peut supprimer un administrateur' };
      }

      // Don't allow deleting the last admin (except super admin check)
      const admins = await query('SELECT id FROM users WHERE isAdmin = 1 AND isSuperAdmin = 0');
      if (admins.length === 1 && admins[0].id === userId) {
        return { success: false, error: 'Impossible de supprimer le dernier administrateur' };
      }

      await run('DELETE FROM users WHERE id = ?', [userId]);
      console.log('✅ Utilisateur supprimé par admin');
      return { success: true };
    } catch (error) {
      console.error('❌ Error deleting user:', error);
      return { success: false, error: error.message };
    }
  });

  // Change password
  ipcMain.handle('user:changePassword', async (event, { userId, currentPassword, newPassword }) => {
    try {
      const currentHash = hashPassword(currentPassword);
      const user = await queryOne('SELECT id FROM users WHERE id = ? AND password = ?', [userId, currentHash]);

      if (!user) {
        return { success: false, error: 'Mot de passe actuel incorrect' };
      }

      const newHash = hashPassword(newPassword);
      await run('UPDATE users SET password = ? WHERE id = ?', [newHash, userId]);

      return { success: true };
    } catch (error) {
      console.error('❌ Error changing password:', error);
      return { success: false, error: error.message };
    }
  });

  // Toggle user active status (ADMIN only)
  ipcMain.handle('user:toggleActive', async (event, { userId, requestingUserId }) => {
    try {
      await normalizeAllUsersPrivileges();

      const effectiveRequesterId = global.currentUser?.id || requestingUserId || null;

      // Verify requesting user rights
      const requestingUser = await queryOne('SELECT isAdmin, isSuperAdmin, role FROM users WHERE id = ?', [effectiveRequesterId]);
      if (!requestingUser) {
        return { success: false, error: 'Utilisateur demandeur introuvable' };
      }

      const isAdmin = !!requestingUser.isAdmin;
      if (!isAdmin && !requestingUser.isSuperAdmin) {
        return { success: false, error: 'Accès refusé: modification non autorisée' };
      }

      const targetUser = await queryOne('SELECT role, isAdmin, isSuperAdmin FROM users WHERE id = ?', [userId]);
      if (!targetUser) {
        return { success: false, error: 'Utilisateur cible introuvable' };
      }

      if (targetUser.isAdmin && !requestingUser?.isSuperAdmin) {
        return { success: false, error: 'Seul le super administrateur peut modifier un administrateur' };
      }

      await run('UPDATE users SET isActive = NOT isActive WHERE id = ?', [userId]);
      console.log('✅ Statut utilisateur modifié par admin');
      return { success: true };
    } catch (error) {
      console.error('❌ Error toggling user status:', error);
      return { success: false, error: error.message };
    }
  });

  // Manager reset password (admin only)
  ipcMain.handle('user:managerResetPassword', async (event, { userId, requestingUserId, newPassword }) => {
    try {
      await normalizeAllUsersPrivileges();

      const effectiveRequesterId = global.currentUser?.id || requestingUserId || null;

      if (!newPassword || !String(newPassword).trim().length) {
        return { success: false, error: 'Le mot de passe ne peut pas être vide' };
      }

      const requestingUser = await queryOne('SELECT isAdmin, isSuperAdmin, role FROM users WHERE id = ?', [effectiveRequesterId]);
      if (!requestingUser) {
        return { success: false, error: 'Utilisateur demandeur introuvable' };
      }

      const isAdmin = !!requestingUser.isAdmin;
      if (!isAdmin && !requestingUser.isSuperAdmin) {
        return { success: false, error: 'Accès refusé: réinitialisation non autorisée' };
      }

      const targetUser = await queryOne('SELECT isSuperAdmin, isAdmin, role FROM users WHERE id = ?', [userId]);
      if (!targetUser) {
        return { success: false, error: 'Utilisateur cible introuvable' };
      }

      if (targetUser.isSuperAdmin) {
        return { success: false, error: 'Le super administrateur ne peut pas être modifié' };
      }

      if (targetUser.isAdmin && !requestingUser?.isSuperAdmin) {
        return { success: false, error: 'Seul le super administrateur peut changer le mot de passe d\'un administrateur' };
      }

      const newHash = hashPassword(newPassword);
      await run('UPDATE users SET password = ? WHERE id = ?', [newHash, userId]);
      return { success: true };
    } catch (error) {
      console.error('❌ Error resetting user password by manager:', error);
      return { success: false, error: error.message };
    }
  });

  // Vérifier si un utilisateur existe
  ipcMain.handle('user:exists', async () => {
    try {
      const user = await queryOne('SELECT id FROM users LIMIT 1');
      return { exists: !!user };
    } catch (error) {
      console.error('❌ Erreur lors de la vérification utilisateur:', error);
      return { exists: false };
    }
  });

  // Logout (pour les logs) - Now also signals main process to show login window
  ipcMain.handle('user:logout', (event) => {
    console.log('👤 Utilisateur déconnecté');
    // Clear global user
    global.currentUser = null;
    clearLoginSession();
    return { success: true, shouldShowLoginWindow: true };
  });

  // Request password reset - Step 1: Verify phone and generate code
  ipcMain.handle('user:requestPasswordReset', async (event, { phone }) => {
    try {
      if (!phone || phone.trim().length < 6) {
        return { success: false, error: 'Numéro de téléphone invalide' };
      }

      const user = await queryOne('SELECT id, username, fullName FROM users WHERE phone = ?', [phone.trim()]);
      
      if (!user) {
        return { success: false, error: 'Aucun compte trouvé avec ce numéro de téléphone' };
      }

      // Generate a 6-digit reset code
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = moment().add(15, 'minutes').format('YYYY-MM-DD HH:mm:ss');

      await run(
        'UPDATE users SET resetCode = ?, resetCodeExpiry = ? WHERE id = ?',
        [resetCode, expiry, user.id]
      );

      console.log(`🔐 Code de réinitialisation généré pour ${user.username}: ${resetCode}`);

      // In production, you would send an SMS here
      // For now, we return the code (for testing purposes)
      return {
        success: true,
        message: 'Code de réinitialisation envoyé',
        userId: user.id,
        username: user.username,
        // IMPORTANT: Remove this in production - only for testing
        _testCode: resetCode
      };
    } catch (error) {
      console.error('❌ Error requesting password reset:', error);
      return { success: false, error: error.message };
    }
  });

  // Verify reset code - Step 2
  ipcMain.handle('user:verifyResetCode', async (event, { phone, code }) => {
    try {
      const user = await queryOne(
        'SELECT id, username, resetCode, resetCodeExpiry FROM users WHERE phone = ?',
        [phone.trim()]
      );

      if (!user) {
        return { success: false, error: 'Utilisateur non trouvé' };
      }

      if (!user.resetCode || user.resetCode !== code) {
        return { success: false, error: 'Code de réinitialisation incorrect' };
      }

      const expiry = moment(user.resetCodeExpiry);
      if (moment().isAfter(expiry)) {
        return { success: false, error: 'Le code a expiré. Veuillez en demander un nouveau.' };
      }

      return {
        success: true,
        userId: user.id,
        username: user.username
      };
    } catch (error) {
      console.error('❌ Error verifying reset code:', error);
      return { success: false, error: error.message };
    }
  });

  // Reset password with code - Step 3
  ipcMain.handle('user:resetPasswordWithCode', async (event, { phone, code, newPassword }) => {
    try {
      const user = await queryOne(
        'SELECT id, resetCode, resetCodeExpiry FROM users WHERE phone = ?',
        [phone.trim()]
      );

      if (!user) {
        return { success: false, error: 'Utilisateur non trouvé' };
      }

      if (!user.resetCode || user.resetCode !== code) {
        return { success: false, error: 'Code de réinitialisation incorrect' };
      }

      const expiry = moment(user.resetCodeExpiry);
      if (moment().isAfter(expiry)) {
        return { success: false, error: 'Le code a expiré' };
      }

      if (!newPassword || !String(newPassword).trim().length) {
        return { success: false, error: 'Le mot de passe ne peut pas être vide' };
      }

      const newHash = hashPassword(newPassword);
      await run(
        'UPDATE users SET password = ?, resetCode = NULL, resetCodeExpiry = NULL WHERE id = ?',
        [newHash, user.id]
      );

      console.log(`✅ Mot de passe réinitialisé pour l'utilisateur ${user.id}`);

      return { success: true, message: 'Mot de passe réinitialisé avec succès' };
    } catch (error) {
      console.error('❌ Error resetting password:', error);
      return { success: false, error: error.message };
    }
  });
}
