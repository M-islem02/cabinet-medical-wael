export function setSectionAvailability(sectionId, available) {
  const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
  const section = document.getElementById(sectionId);
  for (const element of [navItem, section]) {
    if (!element) continue;
    element.dataset.featureDisabled = available ? '0' : '1';
    element.classList.toggle('feature-disabled', !available);
    element.style.display = available ? '' : 'none';
  }
}

export function initializeCoreNavigation() {
  document.addEventListener('medcare:navigate', (event) => {
    if (typeof window.showSection === 'function') window.showSection(event.detail?.sectionId);
  });
}
