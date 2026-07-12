import { app } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

let postgresProcess = null;

function getBundledPostgresDir() {
  const platform = process.platform;
  const candidates = [
    path.join(process.resourcesPath || '', 'postgres', platform),
    path.join(app.getAppPath(), 'resources', 'postgres', platform),
    path.join(app.getAppPath(), 'postgres', platform)
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || candidates[0];
}

function executableName(name) {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function getPostgresBinary(name) {
  return path.join(getBundledPostgresDir(), 'bin', executableName(name));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function initializeDataDir({ dataDir, user, password }) {
  if (fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    return;
  }

  ensureDir(dataDir);
  const initdb = getPostgresBinary('initdb');
  if (!fs.existsSync(initdb)) {
    throw new Error(`PostgreSQL local binaries not found. Missing: ${initdb}`);
  }

  const pwFile = path.join(dataDir, '.pgpass-init');
  fs.writeFileSync(pwFile, password || '', 'utf-8');
  try {
    const child = spawn(initdb, ['-D', dataDir, '-U', user, '--pwfile', pwFile, '-A', 'scram-sha-256'], {
      stdio: ['ignore', 'ignore', 'pipe']
    });
    await waitForExit(child, 'initdb');
  } finally {
    try { fs.unlinkSync(pwFile); } catch (_) {}
  }
}

export async function startLocalPostgres(config) {
  if (postgresProcess) {
    return postgresProcess;
  }

  const dataDir = path.join(app.getPath('userData'), 'postgres-data');
  const logDir = path.join(app.getPath('userData'), 'logs');
  ensureDir(logDir);

  await initializeDataDir({
    dataDir,
    user: config.user,
    password: config.password
  });

  const postgres = getPostgresBinary('postgres');
  if (!fs.existsSync(postgres)) {
    throw new Error(`PostgreSQL local binary not found. Missing: ${postgres}`);
  }

  const logPath = path.join(logDir, 'postgres-local.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  postgresProcess = spawn(postgres, ['-D', dataDir, '-p', String(config.port), '-h', config.host || 'localhost'], {
    stdio: ['ignore', logStream, logStream],
    windowsHide: true
  });

  postgresProcess.on('exit', () => {
    postgresProcess = null;
    try { logStream.end(); } catch (_) {}
  });

  return postgresProcess;
}

export function stopLocalPostgres() {
  if (!postgresProcess) return;
  postgresProcess.kill('SIGTERM');
  postgresProcess = null;
}
