/**
 * Gestionnaire IPC pour les utilisateurs (login)
 */

import { ipcMain } from 'electron';
import { query, run, queryOne } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import moment from 'moment';
import { clearLoginSession } from '../session-manager.js';
import { normalizeSpecialtyKey, parseEnabledSpecialties } from '../specialty-assets.js';

// Helper pour convertir les valeurs vides en null (MariaDB compatibility)
const toNullIfEmpty = (val) => (val === '' || val === undefined) ? null : val;

function isPractitionerRole(role) {
  return [
    'doctor', 'dentist', 'kinesitherapeute', 'ergotherapeute',
    'orthophoniste', 'nurse'
  ].includes(role);
}

function normalizeLegacyRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  const aliases = {
    director: 'doctor', medecin: 'doctor', 'médecin': 'doctor',
    dentiste: 'dentist', kine: 'kinesitherapeute', 'kiné': 'kinesitherapeute',
    infirmier: 'nurse', infirmiere: 'nurse', 'infirmière': 'nurse'
  };
  return aliases[normalized] || normalized;
}

async function resolveAllowedDoctorSpecialty(requestedSpecialty) {
  const packageConfig = await queryOne('SELECT * FROM package_config LIMIT 1');
  const enabled = parseEnabledSpecialties(packageConfig?.enabledSpecialties, packageConfig);
  const allowed = enabled.length ? enabled : ['general'];
  const normalized = normalizeSpecialtyKey(requestedSpecialty || allowed[0] || 'general');
  if (allowed.length === 1) {
    return { success: true, specialty: allowed[0], enabled: allowed };
  }
  if (!allowed.includes(normalized)) {
    return { success: false, error: 'Spécialité non activée dans la configuration du cabinet', enabled: allowed };
  }
  return { success: true, specialty: normalized, enabled: allowed };
}

async function normalizeUserPrivileges(user) {
  if (!user?.id) return user;

  const normalizedRole = user.isSuperAdmin ? 'admin' : normalizeLegacyRole(user.role || 'doctor');
  const normalizedIsSuperAdmin = user.isSuperAdmin ? 1 : 0;
  const normalizedIsAdmin = normalizedIsSuperAdmin ? 0 : Number(user.isAdmin || 0);

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
  await run(`UPDATE users SET role = 'doctor', specialty = COALESCE(NULLIF(specialty, ''), 'general'), isAdmin = 1 WHERE role = 'admin' AND isSuperAdmin = 0`);
  await run(`UPDATE users SET isAdmin = 0 WHERE isSuperAdmin = 1`);
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
  superadmin: {
    username: 'superadmin',
    password: 'MedPro@2024!',
    fullName: 'Super Administrateur',
    role: 'admin',
    isAdmin: 0,
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
            role = ?,
            isAdmin = ?,
            isSuperAdmin = ?,
           isActive = 1
       WHERE username = ?`,
      [passwordHash, account.fullName, account.role, account.isAdmin, account.isSuperAdmin, account.username]
    );
    return existing.id;
  }

  const id = uuidv4();
  await run(
    `INSERT INTO users (id, username, password, fullName, role, isAdmin, isSuperAdmin, isActive, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [id, account.username, passwordHash, account.fullName, account.role, account.isAdmin, account.isSuperAdmin, now]
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
  ipcMain.handle('user:getAll', async (event, payload = {}) => {
    try {
      await normalizeAllUsersPrivileges();

      const effectiveRequesterId = global.currentUser?.id || payload.requestingUserId || null;
      const effectiveRequesterUsername = global.currentUser?.username || payload.requestingUsername || null;

      // Check requester role. Superadmin manages all accounts; doctor-admin
      // manages only normal doctors and assistants.
      let requestingUser = effectiveRequesterId
        ? await queryOne('SELECT isAdmin, isSuperAdmin, role FROM users WHERE id = ?', [effectiveRequesterId])
        : null;

      if (!requestingUser && effectiveRequesterUsername) {
        requestingUser = await queryOne('SELECT isAdmin, isSuperAdmin, role FROM users WHERE username = ?', [effectiveRequesterUsername]);
      }

      if (!requestingUser && payload.requestingUserIsSuperAdmin === true) {
        requestingUser = { isAdmin: 0, isSuperAdmin: 1, role: 'admin' };
      }
      
      const isSuperAdminRequester = !!requestingUser?.isSuperAdmin;
      const isDoctorAdminRequester = !!requestingUser?.isAdmin && !isSuperAdminRequester;

      let users;
      if (isSuperAdminRequester) {
        users = await query(
          'SELECT id, username, fullName, phone, role, specialty, isAdmin, isSuperAdmin, isActive, createdAt, lastLogin FROM users ORDER BY createdAt DESC'
        );
      } else if (isDoctorAdminRequester) {
        users = await query(
          `SELECT id, username, fullName, phone, role, specialty, isAdmin, isSuperAdmin, isActive, createdAt, lastLogin
           FROM users
           WHERE isSuperAdmin = 0
              AND (
                id = ?
                OR (isAdmin = 0 AND role IN ('doctor', 'dentist', 'assistant'))
              )
            ORDER BY createdAt DESC`,
          [effectiveRequesterId]
        );
      } else {
        users = await query(
          `SELECT id, username, fullName, phone, role, specialty, isAdmin, isSuperAdmin, isActive, createdAt, lastLogin
           FROM users
           WHERE isSuperAdmin = 0
             AND role IN ('doctor', 'dentist')
           ORDER BY createdAt DESC`
        );
      }
      return { success: true, data: users };
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
      
      const canCreateUsers = !!(requestingUser.isSuperAdmin || requestingUser.isAdmin);
      if (!canCreateUsers) {
        return { success: false, error: 'Accès refusé: création de comptes non autorisée' };
      }

      // Check if username exists
      const existing = await queryOne('SELECT id FROM users WHERE username = ?', [userData.username]);
      if (existing) {
        return { success: false, error: 'Ce nom d\'utilisateur existe déjà' };
      }

      const id = uuidv4();
      const passwordHash = hashPassword(userData.password);
      const now = moment().format('YYYY-MM-DD HH:mm:ss');

      const requestedAdmin = !!requestingUser.isSuperAdmin
        && (userData.isAdmin === true || userData.isAdmin === 1 || userData.isAdmin === '1');
      
      const validRoles = ['doctor', 'dentist', 'assistant', 'kinesitherapeute', 'ergotherapeute', 'orthophoniste', 'nurse'];
      const normalizedRequestedRole = normalizeLegacyRole(userData.role);
      const role = validRoles.includes(normalizedRequestedRole) ? normalizedRequestedRole : 'doctor';
      const newUserIsAdmin = requestedAdmin && isPractitionerRole(role) ? 1 : 0;
      const specialtyCheck = ['doctor', 'dentist'].includes(role)
        ? await resolveAllowedDoctorSpecialty(userData.specialty)
        : { success: true, specialty: null };
      if (!specialtyCheck.success) {
        return { success: false, error: specialtyCheck.error };
      }

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
          toNullIfEmpty(specialtyCheck.specialty),
          now
        ]
      );
      if (newUserIsAdmin) {
        await run(
          `UPDATE users SET isAdmin = FALSE
           WHERE id <> ? AND COALESCE(isSuperAdmin, FALSE) = FALSE`,
          [id]
        );
      }

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
      if (!requestingUser || !(requestingUser.isSuperAdmin || requestingUser.isAdmin)) {
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

      if (user.isSuperAdmin || (user.isAdmin && !requestingUser.isSuperAdmin)) {
        return { success: false, error: 'Compte protégé' };
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
      if (!requestingUser || !(requestingUser.isSuperAdmin || requestingUser.isAdmin)) {
        return { success: false, error: 'Accès refusé: modification de comptes non autorisée' };
      }

      const targetUser = await queryOne('SELECT id, role, isAdmin, isSuperAdmin FROM users WHERE id = ?', [payload.userId]);
      if (!targetUser) {
        return { success: false, error: 'Utilisateur cible introuvable' };
      }

      if (targetUser.isSuperAdmin) {
        return { success: false, error: 'Le super administrateur ne peut pas être modifié ici' };
      }

      if (targetUser.isAdmin && !requestingUser.isSuperAdmin) {
        return { success: false, error: 'Seul le super administrateur peut modifier un médecin admin' };
      }

      const validRoles = ['doctor', 'dentist', 'assistant', 'kinesitherapeute', 'ergotherapeute', 'orthophoniste', 'nurse'];
      const normalizedPayloadRole = normalizeLegacyRole(payload.role);
      const requestedRole = validRoles.includes(normalizedPayloadRole)
        ? normalizedPayloadRole
        : normalizeLegacyRole(targetUser.role);

      const username = String(payload.username || '').trim();
      if (!username.length) {
        return { success: false, error: 'Le nom d\'utilisateur est obligatoire' };
      }

      const existing = await queryOne('SELECT id FROM users WHERE username = ?', [username]);
      if (existing && existing.id !== payload.userId) {
        return { success: false, error: 'Ce nom d\'utilisateur existe déjà' };
      }

      const specialty = (requestedRole === 'doctor' || requestedRole === 'dentist')
        ? await resolveAllowedDoctorSpecialty(payload.specialty)
        : null;
      if (specialty && !specialty.success) {
        return { success: false, error: specialty.error };
      }
      const requestedAdmin = !!requestingUser.isSuperAdmin
        && (payload.isAdmin === true || payload.isAdmin === 1 || payload.isAdmin === '1');
      const normalizedIsAdmin = requestedAdmin && isPractitionerRole(requestedRole) ? 1 : 0;

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
        specialty ? toNullIfEmpty(specialty.specialty) : null,
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
      if (normalizedIsAdmin) {
        await run(
          `UPDATE users SET isAdmin = FALSE
           WHERE id <> ? AND COALESCE(isSuperAdmin, FALSE) = FALSE`,
          [payload.userId]
        );
      }

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

      if (!(requestingUser.isSuperAdmin || requestingUser.isAdmin)) {
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
        return { success: false, error: 'Seul le super administrateur peut supprimer un médecin admin' };
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

      if (!(requestingUser.isSuperAdmin || requestingUser.isAdmin)) {
        return { success: false, error: 'Accès refusé: modification non autorisée' };
      }

      const targetUser = await queryOne('SELECT role, isAdmin, isSuperAdmin FROM users WHERE id = ?', [userId]);
      if (!targetUser) {
        return { success: false, error: 'Utilisateur cible introuvable' };
      }

      if (targetUser.isAdmin && !requestingUser?.isSuperAdmin) {
        return { success: false, error: 'Seul le super administrateur peut modifier un médecin admin' };
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

      if (!(requestingUser.isSuperAdmin || requestingUser.isAdmin)) {
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
        return { success: false, error: 'Seul le super administrateur peut changer le mot de passe d\'un médecin admin' };
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
