// ========== MODALS ==========
const modalStack = [];
const MODAL_BASE_Z_INDEX = 5000;
const BACKDROP_BASE_Z_INDEX = 4999;

function ensureModalBackdrop() {
  let backdrop = document.getElementById('modal-backdrop');
  if (backdrop) return backdrop;

  backdrop = document.createElement('div');
  backdrop.id = 'modal-backdrop';
  backdrop.className = 'modal-backdrop';
  backdrop.addEventListener('click', () => {
    const topModalId = modalStack[modalStack.length - 1];
    if (topModalId) {
      closeModal(topModalId);
    }
  });
  document.body.appendChild(backdrop);
  return backdrop;
}

function resetModalScrollPosition(modal) {
  if (!modal) return;

  const targets = [
    modal,
    modal.querySelector('.modal-content'),
    ...modal.querySelectorAll('.modal-body, form, .document-live-preview, textarea, .table-responsive, .table-container')
  ].filter(Boolean);

  const seen = new Set();
  targets.forEach((element) => {
    if (seen.has(element)) return;
    seen.add(element);

    element.scrollTop = 0;
    element.scrollLeft = 0;

    if (typeof element.scrollTo === 'function') {
      try {
        element.scrollTo(0, 0);
      } catch (_) {
        // Ignore scrollTo failures on unsupported elements.
      }
    }
  });
}

function enforceModalVisibility(modal) {
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.removeAttribute('hidden');

  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  modal.style.setProperty('display', 'flex', 'important');
  modal.style.setProperty('flex-direction', 'column', 'important');
  modal.style.setProperty('position', 'fixed', 'important');
  modal.style.setProperty('top', '50%', 'important');
  modal.style.setProperty('left', '50%', 'important');
  modal.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
  modal.style.setProperty('visibility', 'visible', 'important');
  modal.style.setProperty('opacity', '1', 'important');
  modal.style.setProperty('pointer-events', 'auto', 'important');

  const modalContent = modal.querySelector('.modal-content');
  if (modalContent) {
    modalContent.classList.remove('minimized');
    modalContent.classList.remove('hidden');
    modalContent.removeAttribute('hidden');
    modalContent.style.setProperty('display', 'flex', 'important');
    modalContent.style.setProperty('visibility', 'visible', 'important');
    modalContent.style.setProperty('opacity', '1', 'important');
    modalContent.style.setProperty('pointer-events', 'auto', 'important');
  }
}

function cleanupStaleActiveModals(exceptModalId = null) {
  document.querySelectorAll('.modal.active').forEach((modal) => {
    if (!modal || (exceptModalId && modal.id === exceptModalId)) {
      return;
    }

    const computed = window.getComputedStyle(modal);
    const isVisuallyHidden =
      computed.display === 'none' ||
      computed.visibility === 'hidden' ||
      Number.parseFloat(computed.opacity || '1') === 0;

    if (!isVisuallyHidden) {
      return;
    }

    modal.classList.remove('active');
    modal.classList.remove('modal-underlay');
    modal.style.removeProperty('display');
    modal.style.removeProperty('flex-direction');
    modal.style.removeProperty('position');
    modal.style.removeProperty('top');
    modal.style.removeProperty('left');
    modal.style.removeProperty('transform');
    modal.style.removeProperty('visibility');
    modal.style.removeProperty('opacity');
    modal.style.removeProperty('pointer-events');
    modal.style.removeProperty('z-index');

    const content = modal.querySelector('.modal-content');
    if (content) {
      content.classList.remove('minimized');
      content.style.removeProperty('display');
      content.style.removeProperty('visibility');
      content.style.removeProperty('opacity');
      content.style.removeProperty('pointer-events');
    }

    const stackIndex = modalStack.indexOf(modal.id);
    if (stackIndex >= 0) {
      modalStack.splice(stackIndex, 1);
    }
  });
}

function syncModalStackLayers() {
  const backdrop = ensureModalBackdrop();

  const activeModalIds = modalStack.filter((modalId) => document.getElementById(modalId)?.classList.contains('active'));
  document.querySelectorAll('.modal.active[id]').forEach((modal) => {
    const modalId = modal.id;
    if (modalId && !activeModalIds.includes(modalId)) {
      activeModalIds.push(modalId);
    }
  });
  const hasActiveModals = activeModalIds.length > 0;
  document.documentElement.classList.toggle('modal-open', hasActiveModals);
  document.body?.classList.toggle('modal-open', hasActiveModals);

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.classList.remove('modal-underlay');
    modal.style.removeProperty('z-index');
  });

  if (!hasActiveModals) {
    backdrop.classList.remove('active');
    backdrop.style.removeProperty('display');
    backdrop.style.removeProperty('visibility');
    backdrop.style.removeProperty('opacity');
    backdrop.style.removeProperty('pointer-events');
    backdrop.style.removeProperty('z-index');
    return;
  }

  activeModalIds.forEach((modalId, index) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.setProperty('z-index', String(MODAL_BASE_Z_INDEX + (index * 2)), 'important');
    if (index < activeModalIds.length - 1) {
      modal.classList.add('modal-underlay');
    }
  });

  backdrop.classList.add('active');
  backdrop.classList.remove('hidden');
  backdrop.removeAttribute('hidden');
  backdrop.style.setProperty('display', 'block', 'important');
  backdrop.style.setProperty('visibility', 'visible', 'important');
  backdrop.style.setProperty('opacity', '1', 'important');
  backdrop.style.setProperty('pointer-events', 'auto', 'important');
  backdrop.style.setProperty('z-index', String(BACKDROP_BASE_Z_INDEX + ((activeModalIds.length - 1) * 2)), 'important');
}

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  ensureModalBackdrop();
  cleanupStaleActiveModals(modalId);

  const existingIndex = modalStack.indexOf(modalId);
  if (existingIndex >= 0) {
    modalStack.splice(existingIndex, 1);
  }

  modalStack.push(modalId);
  modal.classList.add('active');
  enforceModalVisibility(modal);
  syncModalStackLayers();
  resetModalScrollPosition(modal);
  if (typeof repairUiMojibake === 'function') {
    repairUiMojibake(modal);
  }

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      resetModalScrollPosition(modal);
      if (typeof repairUiMojibake === 'function') {
        repairUiMojibake(modal);
      }
      const firstInput = modal.querySelector('input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])');
      if (firstInput && typeof firstInput.focus === 'function') {
        try { firstInput.focus(); } catch (_) {}
      }
    });
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.remove('active');
  modal.classList.remove('modal-underlay');
  modal.style.removeProperty('display');
  modal.style.removeProperty('flex-direction');
  modal.style.removeProperty('position');
  modal.style.removeProperty('top');
  modal.style.removeProperty('left');
  modal.style.removeProperty('transform');
  modal.style.removeProperty('visibility');
  modal.style.removeProperty('opacity');
  modal.style.removeProperty('pointer-events');
  modal.style.removeProperty('z-index');

  const existingIndex = modalStack.indexOf(modalId);
  if (existingIndex >= 0) {
    modalStack.splice(existingIndex, 1);
  }
  
  // Remove minimized state if any
  const modalContent = modal.querySelector('.modal-content');
  if (modalContent) {
    modalContent.classList.remove('minimized');
    modalContent.style.removeProperty('display');
    modalContent.style.removeProperty('visibility');
    modalContent.style.removeProperty('opacity');
    modalContent.style.removeProperty('pointer-events');
  }

  resetModalScrollPosition(modal);

  syncModalStackLayers();
}

function minimizeModal(modalId) {
  const modal = document.getElementById(modalId);
  const modalContent = modal.querySelector('.modal-content');
  
  if (modalContent) {
    if (modalContent.classList.contains('minimized')) {
      // Restore
      modalContent.classList.remove('minimized');
    } else {
      // Minimize
      modalContent.classList.add('minimized');
    }
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(modal => {
    resetModalScrollPosition(modal);
    modal.classList.remove('active');
    modal.classList.remove('modal-underlay');
    modal.style.removeProperty('display');
    modal.style.removeProperty('flex-direction');
    modal.style.removeProperty('position');
    modal.style.removeProperty('top');
    modal.style.removeProperty('left');
    modal.style.removeProperty('transform');
    modal.style.removeProperty('visibility');
    modal.style.removeProperty('opacity');
    modal.style.removeProperty('pointer-events');
    modal.style.removeProperty('z-index');

    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.classList.remove('minimized');
      modalContent.style.removeProperty('display');
      modalContent.style.removeProperty('visibility');
      modalContent.style.removeProperty('opacity');
      modalContent.style.removeProperty('pointer-events');
    }
  });
  modalStack.length = 0;
  syncModalStackLayers();
}

// Export functions
window.showModal = showModal;
window.openModal = showModal; // Alias for compatibility
window.closeModal = closeModal;
window.minimizeModal = minimizeModal;
window.closeAllModals = closeAllModals;
