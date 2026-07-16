const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const electronBinary = require('electron');

let child = null;
let timer = null;

function startElectron() {
  if (child) {
    try {
      child.kill('SIGTERM');
    } catch (e) {
      // Ignore process kill errors
    }
  }

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  child = spawn(electronBinary, ['.', ...process.argv.slice(2)], {
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
