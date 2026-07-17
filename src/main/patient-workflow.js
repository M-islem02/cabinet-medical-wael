function toNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function determinePatientWorkflow({
  configuredDoctors = 1,
  configuredAssistants = 0,
  activeDoctors = 0,
  activeAssistants = 0
} = {}) {
  const doctorCapacity = Math.max(1, toNonNegativeInteger(configuredDoctors, 1));
  const assistantCapacity = toNonNegativeInteger(configuredAssistants, 0);
  const doctorCount = toNonNegativeInteger(activeDoctors, 0);
  const assistantCount = toNonNegativeInteger(activeAssistants, 0);
  const cabinetMode = doctorCapacity > 1 || doctorCount > 1;

  return {
    cabinetMode,
    workflowMode: cabinetMode
      ? 'cabinet'
      : (assistantCapacity > 0 || assistantCount > 0 ? 'doctor_assistant' : 'doctor_solo'),
    globalDirectoryEnabled: cabinetMode,
    assistantDoctorSelectorEnabled: cabinetMode && doctorCount > 1,
    configuredDoctors: doctorCapacity,
    configuredAssistants: assistantCapacity,
    activeDoctors: doctorCount,
    activeAssistants: assistantCount
  };
}
