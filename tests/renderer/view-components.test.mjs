import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPatientRows } from '../../src/renderer/features/patients/patient-list.js';
import { renderAppointmentPatientOptions } from '../../src/renderer/features/appointments/patient-selector.js';
import { renderInventoryPaginationView } from '../../src/renderer/features/inventory/inventory-pagination.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this.textContent = '';
    this.className = '';
    this.disabled = false;
    this.attributes = {};
  }

  get firstChild() { return this.children[0] || null; }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...children) { children.forEach((child) => this.appendChild(child)); }

  removeChild(child) {
    this.children.splice(this.children.indexOf(child), 1);
    return child;
  }

  setAttribute(name, value) { this.attributes[name] = value; }

  addEventListener(name, handler) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(handler);
    this.listeners.set(name, listeners);
  }

  dispatch(name) {
    const event = { stopPropagation() {} };
    for (const handler of this.listeners.get(name) || []) handler(event);
  }
}

globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };
globalThis.window = { formatDateToDDMMYYYY: (value) => value };

test('patient rows render untrusted names as text and expose one action listener', () => {
  const tbody = new FakeElement('tbody');
  const opened = [];
  renderPatientRows({
    tbody,
    patients: [{ id: 7, lastName: '<img src=x onerror=alert(1)>', firstName: 'Sara' }],
    onOpen: (id) => opened.push(id),
    onEdit() {},
    onDelete() {}
  });

  assert.equal(tbody.children.length, 1);
  assert.equal(tbody.children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(tbody.children[0].children[0].children.length, 0);
  assert.equal(tbody.children[0].listeners.get('click').length, 1);
  tbody.children[0].dispatch('click');
  assert.deepEqual(opened, [7]);
});

test('appointment selector renders safe options and selects the expected patient', () => {
  const dropdown = new FakeElement('div');
  const selected = [];
  const patient = { id: 12, lastName: '<script>bad()</script>', firstName: 'Nora' };
  renderAppointmentPatientOptions({ dropdown, patients: [patient], onSelect: (...args) => selected.push(args) });

  assert.equal(dropdown.children[0].textContent, '<script>bad()</script> Nora');
  assert.equal(dropdown.children[0].children.length, 0);
  assert.equal(dropdown.children[0].dataset.patientId, '12');
  dropdown.children[0].dispatch('click');
  assert.deepEqual(selected, [[patient, '<script>bad()</script> Nora']]);
});

test('inventory pagination hides small results and sends relative page changes', () => {
  const container = new FakeElement('div');
  renderInventoryPaginationView({ container, pagination: { page: 1, pageSize: 20, total: 5 }, onPageChange() {} });
  assert.equal(container.style.display, 'none');

  const changes = [];
  renderInventoryPaginationView({
    container,
    pagination: { page: 2, pageSize: 20, total: 60, totalPages: 3 },
    onPageChange: (delta) => changes.push(delta)
  });
  assert.equal(container.style.display, 'flex');
  const actions = container.children[1];
  actions.children[0].dispatch('click');
  actions.children[2].dispatch('click');
  assert.deepEqual(changes, [-1, 1]);
});
