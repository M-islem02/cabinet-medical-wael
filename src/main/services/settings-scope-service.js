import { queryOne } from '../database-unified.js';

const PRACTITIONER_ROLES = new Set([
  'doctor',
  'dentist',
  'kinesitherapeute',
  'ergotherapeute',
  'orthophoniste',
  'nurse'
]);

export function getCurrentSettingsOwnerUserId() {
  const currentUser = global.currentUser || null;
  if (!currentUser?.id) return null;
  return PRACTITIONER_ROLES.has(String(currentUser.role || '').trim())
    ? String(currentUser.id)
    : null;
}

export async function getScopedSettings(ownerUserId = getCurrentSettingsOwnerUserId()) {
  if (ownerUserId) {
    const scoped = await queryOne(
      'SELECT * FROM settings WHERE ownerUserId = ? ORDER BY updatedAt DESC LIMIT 1',
      [ownerUserId]
    );
    if (scoped) return scoped;
  }

  const shared = await queryOne(
    'SELECT * FROM settings WHERE ownerUserId IS NULL ORDER BY updatedAt DESC LIMIT 1'
  );
  if (shared) return shared;

  return await queryOne('SELECT * FROM settings ORDER BY updatedAt DESC LIMIT 1');
}

export async function getScopedSettingsId(ownerUserId = getCurrentSettingsOwnerUserId()) {
  if (ownerUserId) {
    const scoped = await queryOne(
      'SELECT id FROM settings WHERE ownerUserId = ? ORDER BY updatedAt DESC LIMIT 1',
      [ownerUserId]
    );
    if (scoped?.id) return scoped;
  }

  const shared = await queryOne(
    'SELECT id FROM settings WHERE ownerUserId IS NULL ORDER BY updatedAt DESC LIMIT 1'
  );
  if (shared?.id) return shared;

  return await queryOne('SELECT id FROM settings ORDER BY updatedAt DESC LIMIT 1');
}
