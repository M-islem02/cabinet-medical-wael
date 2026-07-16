export function collectPatientFormData(root = document) {
  const value = (id) => (root.getElementById(id)?.value || '').trim();
  return {
    firstName: value('patient-firstName'), lastName: value('patient-lastName'),
    dateOfBirth: value('patient-dateOfBirth'), gender: value('patient-gender'),
    socialSecurityNumber: value('patient-socialSecurityNumber') || null,
    email: value('patient-email'), phone: value('patient-phone'), address: value('patient-address'),
    city: value('patient-city'), zipCode: value('patient-zipCode'), bloodType: value('patient-bloodType'),
    allergies: value('patient-allergies'), medicalHistory: value('patient-medicalHistory'),
    emergencyContact: value('patient-emergencyContact'), emergencyPhone: value('patient-emergencyPhone')
  };
}
