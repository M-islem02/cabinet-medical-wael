import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';

const endpoint = process.argv[2] || 'http://127.0.0.1:9222';
const runSectionSmoke = process.argv.includes('--smoke');
const checkUsers = process.argv.includes('--users');
const checkStatisticsApi = process.argv.includes('--statistics-api');
const loginFromAdminFile = process.argv.includes('--login-admin');
const screenshotPath = process.argv.find((argument) => argument.startsWith('--screenshot='))?.slice('--screenshot='.length) || null;
const pageId = process.argv.find((argument) => argument.startsWith('--page='))?.slice('--page='.length) || null;
const targets = await fetch(`${endpoint}/json`).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === 'page' && candidate.url.includes('/src/renderer/index.html'))
  || (loginFromAdminFile
    ? targets.find((candidate) => candidate.type === 'page' && candidate.url.includes('/src/renderer/login.html'))
    : null);
if (!target) throw new Error('MedCareSO renderer target not found');

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const errors = [];
const moduleRequests = new Set();
let nextId = 0;

socket.on('message', (buffer) => {
  const message = JSON.parse(buffer.toString());
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    return message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    errors.push({
      type: 'exception',
      text: message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Renderer exception',
      url: message.params.exceptionDetails?.url || null,
      line: message.params.exceptionDetails?.lineNumber ?? null
    });
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    errors.push({ type: 'log', text: message.params.entry.text, url: message.params.entry.url || null });
  }
  if (message.method === 'Network.requestWillBeSent' && message.params.type === 'Script') {
    const url = message.params.request.url;
    if (url.includes('/src/renderer/') && url.endsWith('.js')) moduleRequests.add(url);
  }
});

await new Promise((resolve, reject) => {
  socket.once('open', resolve);
  socket.once('error', reject);
});

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');
await send('Page.reload', { ignoreCache: true });

if (loginFromAdminFile && target.url.includes('/src/renderer/login.html')) {
  const credentialsText = fs.readFileSync(path.resolve('ADMIN_CREDENTIALS.txt'), 'utf8');
  const username = credentialsText.match(/NOM D'UTILISATEUR:\s*([^║\r\n]+)/u)?.[1]?.trim();
  const password = credentialsText.match(/MOT DE PASSE:\s*([^║\r\n]+)/u)?.[1]?.trim();
  if (!username || !password) throw new Error('Admin credentials could not be parsed');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await evaluate(`document.readyState === 'complete' && Boolean(window.api?.user?.login)`);
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await evaluate(`(() => {
    document.getElementById('username').value = ${JSON.stringify(username)};
    document.getElementById('password').value = ${JSON.stringify(password)};
    document.getElementById('login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);

  let mainTarget = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const currentTargets = await fetch(`${endpoint}/json`).then((response) => response.json());
    mainTarget = currentTargets.find((candidate) => candidate.type === 'page' && candidate.url.includes('/src/renderer/index.html'));
    if (mainTarget) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  socket.close();
  if (!mainTarget) throw new Error('Admin login did not open the main renderer');
  console.log(JSON.stringify({ login: 'success', target: mainTarget.url }, null, 2));
  process.exit(0);
}

let snapshot;
for (let attempt = 0; attempt < 100; attempt += 1) {
  snapshot = await evaluate(`(() => ({
    title: document.title,
    readyState: document.readyState,
    bootstrapped: Boolean(window.medcareApp && window.medcareApp.getLoadedSpecialtyIds),
    appReady: document.body?.classList.contains('app-ready') || false,
    specialties: window.medcareApp?.getLoadedSpecialtyIds?.() || [],
    enabledSpecialties: window.medcareApp?.packageConfigService?.getEnabledSpecialties?.() || [],
    moduleResources: 0
  }))()`);
  if (snapshot.bootstrapped && snapshot.appReady && snapshot.readyState === 'complete') break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}

await new Promise((resolve) => setTimeout(resolve, 500));
snapshot.moduleResources = moduleRequests.size;
const selectedPage = pageId ? await evaluate(`(async () => {
  const pageId = ${JSON.stringify(pageId)};
  const loaders = {
    'waiting-room': 'loadWaitingRoom',
    patients: 'loadPatients',
    'medical-imaging': 'initMedicalImaging',
    payments: 'loadPayments',
    equipment: 'initEquipment',
    statistics: 'loadStatistics'
  };
  window.showSection?.(pageId);
  const loader = window[loaders[pageId]];
  if (typeof loader === 'function') await loader();
  await new Promise((resolve) => setTimeout(resolve, 350));
  const section = document.getElementById(pageId);
  return {
    id: pageId,
    active: section?.classList.contains('active') || false,
    title: document.getElementById('page-title')?.textContent?.trim() || '',
    height: section?.getBoundingClientRect().height || 0
  };
})()`) : null;
const sections = runSectionSmoke ? await evaluate(`(async () => {
  const result = {};
  window.showSection('patients');
  await window.loadPatients?.();
  result.patients = {
    active: document.getElementById('patients')?.classList.contains('active') || false,
    rows: document.getElementById('patients-tbody')?.children.length || 0
  };

  window.showSection('appointments-calendar');
  await window.initCalendar?.();
  result.appointments = {
    active: document.getElementById('appointments-calendar')?.classList.contains('active') || false,
    period: document.getElementById('calendar-period-title')?.textContent?.trim() || ''
  };

  window.showSection('inventory');
  await window.initInventory?.();
  result.inventory = {
    active: document.getElementById('inventory')?.classList.contains('active') || false,
    rows: document.getElementById('inventory-tbody')?.children.length || 0
  };
  return result;
})()`) : null;
const smokePassed = !runSectionSmoke || (
  sections?.patients?.active && sections.patients.rows > 0 &&
  sections?.appointments?.active && sections.appointments.period &&
  sections?.inventory?.active && sections.inventory.rows > 0
);
const users = checkUsers ? await evaluate(`(async () => {
  const response = await window.api.user.getAll({
    requestingUserId: localStorage.getItem('currentUserId') || null,
    requestingUsername: localStorage.getItem('currentUsername') || '',
    requestingUserIsSuperAdmin: localStorage.getItem('currentUserIsSuperAdmin') === 'true'
  });
  window.showSection?.('settings');
  await window.loadUsersList?.();
  const tableBody = document.getElementById('users-table-body');
  return {
    success: response?.success === true,
    count: response?.data?.length || 0,
    error: response?.error || null,
    settingsActive: document.getElementById('settings')?.classList.contains('active') || false,
    renderedRows: tableBody?.children.length || 0,
    loadErrorVisible: tableBody?.textContent?.includes('Erreur de chargement') || false
  };
})()`) : null;
const statisticsApi = checkStatisticsApi ? await evaluate(`window.api.statistics.getAdvancedOverview({
  period: 'month',
  startDate: '',
  endDate: ''
})`) : null;
if (screenshotPath) {
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const resolvedScreenshotPath = path.resolve(screenshotPath);
  fs.mkdirSync(path.dirname(resolvedScreenshotPath), { recursive: true });
  fs.writeFileSync(resolvedScreenshotPath, Buffer.from(screenshot.data, 'base64'));
}
console.log(JSON.stringify({ target: { title: target.title, url: target.url }, snapshot, selectedPage, sections, users, statisticsApi, errors }, null, 2));
socket.close();
if (!snapshot?.bootstrapped || !snapshot?.appReady || (pageId && !selectedPage?.active) || !smokePassed || (checkUsers && (!users?.success || !users.settingsActive || users.loadErrorVisible)) || (checkStatisticsApi && !statisticsApi?.success) || errors.length) process.exitCode = 1;
