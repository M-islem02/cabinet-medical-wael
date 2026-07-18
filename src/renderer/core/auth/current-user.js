export function loadCurrentUser() {
  const role = localStorage.getItem('currentUserRole') || 'doctor';
  return Object.freeze({
    id: localStorage.getItem('currentUserId') || null,
    username: localStorage.getItem('currentUsername') || 'Utilisateur',
    role: role === 'director' ? 'doctor' : role,
    specialty: localStorage.getItem('currentUserSpecialty') || '',
    isAdmin: localStorage.getItem('currentUserIsAdmin') === 'true',
    isSuperAdmin: localStorage.getItem('currentUserIsSuperAdmin') === 'true'
  });
}
