const { spawn } = require('child_process');

const electronBinary = require('electron');
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/run-with-electron-node.cjs <script> [...args]');
  process.exit(1);
}

const child = spawn(electronBinary, args, {
  cwd: process.cwd(),
  env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
