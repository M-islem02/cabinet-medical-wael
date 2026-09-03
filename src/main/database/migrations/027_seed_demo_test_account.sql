-- Migration 027: Compte test / démo prêt à l'emploi (tous les modules)
INSERT INTO users (id, username, password, fullName, phone, role, specialty, isAdmin, isSuperAdmin, isActive, createdAt)
VALUES (
  'user-test-demo-001',
  'test',
  'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae',
  'Compte Test / Démo',
  '',
  'test',
  'general',
  FALSE,
  FALSE,
  TRUE,
  NOW()
)
ON CONFLICT (username) DO UPDATE SET
  fullName = 'Compte Test / Démo',
  role = 'test',
  specialty = 'general',
  isActive = TRUE;