export function setSectionAvailability(sectionId, available) {
  const isTestAccount = typeof window.isDemoOrTestAccount === 'function'
    ? window.isDemoOrTestAccount()
    : (String(localStorage.getItem('currentUsername') || '').trim().toLowerCase() === 'test'
        || localStorage.getItem('currentUserRole') === 'test');

  if (isTestAccount) {
    available = true;
  }

  const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
  const section = document.getElementById(sectionId);

  if (navItem) {
    navItem.dataset.featureDisabled = available ? '0' : '1';
    navItem.classList.toggle('feature-disabled', !available);
    if (available) {
      navItem.style.display = '';
      navItem.classList.remove('hidden', 'role-hidden');
    } else {
      navItem.style.display = 'none';
      navItem.classList.add('hidden', 'role-hidden');
    }
  }

  if (section) {
    section.dataset.featureDisabled = available ? '0' : '1';
    section.classList.toggle('feature-disabled', !available);
    if (available) {
      section.classList.remove('role-hidden', 'feature-disabled');
      if (section.classList.contains('active')) {
        section.style.display = 'block';
      } else {
        section.style.display = '';
      }
    } else {
      section.style.display = 'none';
    }
  }
}

export function initializeCoreNavigation() {
  document.addEventListener('medcare:navigate', (event) => {
    if (typeof window.showSection === 'function') window.showSection(event.detail?.sectionId);
  });
}
