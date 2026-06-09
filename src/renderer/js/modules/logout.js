// ========== LOGOUT ==========
async function logout() {
  if (!confirm('Voulez-vous vraiment vous déconnecter ?')) {
    return;
  }
  
  console.log('=== LOGOUT DEBUG ===');
  console.log('Before logout - localStorage values:');
  console.log('  - currentUserId:', localStorage.getItem('currentUserId'));
  console.log('  - currentUsername:', localStorage.getItem('currentUsername'));
  console.log('  - currentUserIsAdmin:', localStorage.getItem('currentUserIsAdmin'));
  
  try {
    // Call logout API
    await window.api.user.logout();
    
    // Clear localStorage
    localStorage.removeItem('currentUserId');
    localStorage.removeItem('currentUsername');
    localStorage.removeItem('currentUserIsAdmin');
    localStorage.removeItem('currentUserIsSuperAdmin');
    localStorage.removeItem('currentUserRole');
    localStorage.removeItem('currentUserSpecialty');
    
    console.log('After clearing - localStorage values:');
    console.log('  - currentUserId:', localStorage.getItem('currentUserId'));
    console.log('  - currentUsername:', localStorage.getItem('currentUsername'));
    console.log('  - currentUserIsAdmin:', localStorage.getItem('currentUserIsAdmin'));
    console.log('  - currentUserIsSuperAdmin:', localStorage.getItem('currentUserIsSuperAdmin'));
    console.log('  - currentUserRole:', localStorage.getItem('currentUserRole'));
    console.log('Requesting main process to show login window...');
    
    // Ask main process to close main window and show login window
    await window.api.user.showLoginWindow();
  } catch (error) {
    console.error('Error during logout:', error);
    showNotification('Erreur lors de la déconnexion', 'error');
  }
}

// Make logout function global
window.logout = logout;

