/**
 * Simple login session persistence for Electron app.
 *
 * Goal:
 * - Keep the user logged in across app restarts during the same OS boot.
 * - Force re-login after PC restart/shutdown (new OS boot).
 *
 * We store the minimal user identity + a boot-time signature in userData.
 */

import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SESSION_FILENAME = 'auth-session.json';
const BOOT_TOLERANCE_MS = 2 * 60 * 1000;

function getSessionFilePath() {
  return path.join(app.getPath('userData'), SESSION_FILENAME);
}

export function getCurrentBootTimeMs() {
  // Approximate system boot time (epoch ms). Stable during the same boot.
  return Date.now() - (os.uptime() * 1000);
}

export function isSameBoot(storedBootTimeMs, currentBootTimeMs = getCurrentBootTimeMs()) {
  if (!Number.isFinite(storedBootTimeMs) || !Number.isFinite(currentBootTimeMs)) {
    return false;
  }
  return Math.abs(storedBootTimeMs - currentBootTimeMs) <= BOOT_TOLERANCE_MS;
}

export function readLoginSession() {
  try {
    const sessionPath = getSessionFilePath();
    if (!fs.existsSync(sessionPath)) {
      return null;
    }
    const raw = fs.readFileSync(sessionPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (!parsed.user || !parsed.user.id) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Unable to read auth session file:', error?.message || error);
    return null;
  }
}

export function persistLoginSession(user) {
  if (!user || !user.id) {
    return;
  }

  try {
    const sessionPath = getSessionFilePath();
    const payload = {
      bootTimeMs: getCurrentBootTimeMs(),
      savedAt: new Date().toISOString(),
      user: {
        id: String(user.id),
        username: String(user.username || ''),
        role: String(user.role || ''),
        isAdmin: !!user.isAdmin,
        isSuperAdmin: !!user.isSuperAdmin
      }
    };

    fs.writeFileSync(sessionPath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    console.warn('Unable to persist auth session file:', error?.message || error);
  }
}

export function clearLoginSession() {
  try {
    const sessionPath = getSessionFilePath();
    fs.rmSync(sessionPath, { force: true });
  } catch (error) {
    // Ignore.
  }
}

