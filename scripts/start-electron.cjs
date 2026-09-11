const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const electronBinary = require('electron');

let child = null;
let timer = null;

function ensureLocalPostgres() {
  if (process.platform !== 'linux') return;
  const pgDataDir = path.join(process.env.HOME || '', 'pgdata');
  const pgCtl = '/usr/lib/postgresql/17/bin/pg_ctl';
  if (!fs.existsSync(pgDataDir) || !fs.existsSync(pgCtl)) return;

  try {
    const { execSync } = require('child_process');
    // Check if postgres is already accepting connections on port 5433
    try {
      execSync('pg_isready -p 5433 -h 127.0.0.1', { stdio: 'ignore', timeout: 1500 });
      return; // Already running
    } catch (_) {}

    // Stale PID cleanup if process is dead
    const pidFile = path.join(pgDataDir, 'postmaster.pid');
    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8').split('\n')[0].trim(), 10);
        if (pid && !isNaN(pid)) {
          try { process.kill(pid, 0); } catch (e) {
            if (e.code === 'ESRCH') fs.unlinkSync(pidFile);
          }
        }
      } catch (_) {}
    }

    const sockDir = '/tmp/pgsock';
    if (!fs.existsSync(sockDir)) {
      try { fs.mkdirSync(sockDir, { recursive: true }); } catch (_) {}
    }

    const logFile = path.join(pgDataDir, 'logfile');
    execSync(`"${pgCtl}" -D "${pgDataDir}" -o "-p 5433 -k ${sockDir} -h localhost" -l "${logFile}" start`, {
      stdio: 'ignore',
      timeout: 5000
    });
    console.log('✅ [Database] Serveur PostgreSQL local démarré sur le port 5433.');
  } catch (err) {
    console.warn('⚠️ [Database] Tentative de démarrage automatique PostgreSQL:', err.message);
  }
}

function startElectron() {
  ensureLocalPostgres();
  if (child) {
    try {
      child.kill('SIGTERM');
    } catch (e) {
      // Ignore process kill errors
    }
  }

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (process.platform === 'linux') {
    delete env.IBUS_USE_PORTAL;
    env.XMODIFIERS = '@im=none';
    env.GTK_IM_MODULE = 'simple';
    env.QT_IM_MODULE = 'simple';
    // Clean stale ibus socket files that cause GTK input freezes
    try {
      const busDir = path.join(process.env.HOME || '', '.config/ibus/bus');
      if (fs.existsSync(busDir)) {
        fs.readdirSync(busDir).forEach(f => {
          if (f.includes('-unix-0') || f.includes('-unix-1')) {
            try { fs.unlinkSync(path.join(busDir, f)); } catch (_) {}
          }
        });
      }
    } catch (_) {}
  }

  child = spawn(electronBinary, ['--disable-gtk-ime', '.', ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      if (signal === 'SIGTERM') return;
      process.kill(process.pid, signal);
      return;
    }
    if (!timer) {
      process.exit(code ?? 0);
    }
  });
}

// Watch src/main and src/preload for changes to auto-restart the Electron main process
const dirsToWatch = [
  path.join(__dirname, '../src/main'),
  path.join(__dirname, '../src/preload')
];

dirsToWatch.forEach(dir => {
  if (fs.existsSync(dir)) {
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.js') || filename.endsWith('.cjs') || filename.endsWith('.json'))) {
        console.log(`\n🔄 [Watcher] Modification détectée sur ${filename}. Redémarrage d'Electron...`);
        clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          startElectron();
        }, 400); // Debounce restarts to avoid double launches
      }
    });
  }
});

startElectron();
