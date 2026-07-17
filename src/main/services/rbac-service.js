const PRACTITIONER_ROLES = new Set(['doctor', 'dentist']);

export function getRbacContext(user = global.currentUser || {}) {
  const role = user.role === 'director' ? 'doctor' : String(user.role || 'doctor');
  return {
    userId: user.id || null,
    role,
    isSuperAdmin: user.isSuperAdmin === true || user.isSuperAdmin === 1,
    isAssistant: role === 'assistant',
    isPractitioner: PRACTITIONER_ROLES.has(role)
  };
}

export function checkPermission(user, action) {
  const context = getRbacContext(user);
  if (context.isSuperAdmin) return action.startsWith('accounts:') || action.startsWith('config:');
  if (context.isAssistant) return ['patients:read', 'patients:write', 'waiting-room:manage', 'users:list'].includes(action);
  if (context.isPractitioner) return ['patients:read', 'patients:write-assigned', 'waiting-room:manage'].includes(action);
  return false;
}

export function canAccessAssignedPatient(user, assignedDoctorIds = []) {
  const context = getRbacContext(user);
  return context.isAssistant || (!context.isSuperAdmin && context.isPractitioner && assignedDoctorIds.includes(context.userId));
}
