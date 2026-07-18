export function resolvePublicPractitioner(practitioners = [], requestedPractitionerId = '') {
  const requestedId = String(requestedPractitionerId || '').trim();
  const selectedPractitioner = requestedId
    ? practitioners.find((practitioner) => practitioner.id === requestedId) || null
    : (practitioners.length === 1 ? practitioners[0] : null);

  return {
    selectedPractitioner,
    hasPractitioners: practitioners.length > 0,
    selectionRequired: practitioners.length > 1 && !selectedPractitioner,
    requestedPractitionerUnavailable: !!requestedId && !selectedPractitioner
  };
}
