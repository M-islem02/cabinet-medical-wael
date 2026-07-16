import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function createElement(initial = {}) {
  return {
    value: '',
    textContent: '',
    innerHTML: '',
    required: false,
    disabled: false,
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {},
    closest() { return null; },
    focus() { this.focused = true; },
    ...initial
  };
}

test('create-and-add-another keeps the account form open and resets every field', async () => {
  const elements = new Map();
  const fieldIds = [
    'new-user-fullname',
    'new-user-phone',
    'new-username',
    'new-user-password',
    'new-user-confirm-password'
  ];

  for (const id of fieldIds) elements.set(id, createElement());
  elements.get('new-user-password').type = 'password';
  elements.get('new-user-confirm-password').type = 'password';
  elements.set('new-user-role', createElement({ value: 'doctor' }));
  elements.set('new-user-specialty', createElement({ value: 'general' }));
  elements.set('doctor-specialty-group', createElement());
  elements.set('user-form-mode', createElement({ value: 'create' }));
  elements.set('editing-user-id', createElement());
  elements.set('modal-user-title', createElement());
  elements.set('user-form-submit-btn', createElement());
  elements.set('user-form-submit-and-add-btn', createElement());
  elements.set('new-user-password-label', createElement());
  elements.set('new-user-confirm-password-label', createElement());
  elements.set('user-password-hint', createElement());
  elements.set('users-table-body', createElement());

  let resetCount = 0;
  elements.set('add-user-form', createElement({
    reset() {
      resetCount += 1;
      for (const id of fieldIds) elements.get(id).value = '';
    }
  }));

  let shownModal = '';
  let closedModal = '';
  const addedPayloads = [];
  const storage = new Map([
    ['currentUserIsSuperAdmin', 'true'],
    ['currentUserId', 'superadmin-id'],
    ['currentUsername', 'superadmin']
  ]);

  const context = {
    console,
    currentUserId: 'superadmin-id',
    currentUsername: 'superadmin',
    currentUserIsAdmin: false,
    currentUserIsSuperAdmin: true,
    document: {
      getElementById(id) { return elements.get(id) || null; },
      querySelector() { return null; }
    },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; }
    },
    requestAnimationFrame(callback) { callback(); },
    showModal(id) { shownModal = id; },
    closeModal(id) { closedModal = id; },
    showNotification() {},
    alert() {},
    confirm() { return true; },
    prompt() { return null; },
    getAvailablePracticeSpecialties() { return [{ key: 'general', label: 'Médecin généraliste' }]; },
    window: {
      toggleSpecialtyField() {},
      api: {
        user: {
          async add(payload) {
            addedPayloads.push(payload);
            return { success: true, data: { id: 'new-user-id' } };
          },
          async getAll() { return { success: true, data: [] }; }
        }
      }
    }
  };
  context.window.window = context.window;

  vm.createContext(context);
  vm.runInContext(fs.readFileSync('src/renderer/js/modules/user-management.js', 'utf8'), context);

  context.window.showAddUserModal();
  assert.equal(shownModal, 'modal-add-user');

  elements.get('new-user-fullname').value = 'Dr Deux';
  elements.get('new-user-phone').value = '0555000002';
  elements.get('new-username').value = 'dr.deux';
  elements.get('new-user-password').value = 'MotDePasse2!';
  elements.get('new-user-confirm-password').value = 'MotDePasse2!';

  await context.window.addUser({
    preventDefault() {},
    submitter: { id: 'user-form-submit-and-add-btn' }
  });

  assert.equal(addedPayloads.length, 1);
  assert.equal(addedPayloads[0].username, 'dr.deux');
  assert.equal(closedModal, '', 'the modal must stay open when another account will be added');
  assert.equal(resetCount, 2, 'the form is reset on open and after a successful creation');
  for (const id of fieldIds) assert.equal(elements.get(id).value, '');
  assert.equal(elements.get('new-user-fullname').focused, true);
  assert.equal(elements.get('user-form-submit-btn').disabled, false);
  assert.equal(elements.get('user-form-submit-and-add-btn').disabled, false);
});
