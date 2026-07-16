-- Ensure every PostgreSQL cabinet has the built-in activation keys expected by
-- the renderer and license manager. Existing databases adopted at the baseline
-- may have the licenses table but no seed rows at all.
CREATE TABLE IF NOT EXISTS licenses (
  id VARCHAR(36) PRIMARY KEY,
  "key" VARCHAR(50) UNIQUE NOT NULL,
  clientname VARCHAR(255) NOT NULL,
  generateddate TIMESTAMP NOT NULL,
  expirationdate TIMESTAMP,
  activated BOOLEAN DEFAULT FALSE,
  activationdate TIMESTAMP,
  machineid VARCHAR(64),
  status VARCHAR(20) DEFAULT 'pending'
);

INSERT INTO licenses
  (id, "key", clientname, generateddate, expirationdate, activated, activationdate, machineid, status)
VALUES
  ('00000000-0000-4000-8000-000000000005', 'MEDPRO-TRIAL-5JOURS', 'Licence Essai 5 Jours', CURRENT_TIMESTAMP, NULL, FALSE, NULL, NULL, 'pending'),
  ('00000000-0000-4000-8000-000000000007', 'MEDPRO-TRIAL-7JOURS', 'Licence Essai 7 Jours', CURRENT_TIMESTAMP, NULL, FALSE, NULL, NULL, 'pending'),
  ('00000000-0000-4000-8000-000000000015', 'MEDPRO-TRIAL-15JOURS', 'Licence Essai 15 Jours', CURRENT_TIMESTAMP, NULL, FALSE, NULL, NULL, 'pending'),
  ('00000000-0000-4000-8000-000000000365', 'MEDPRO-ANNUELLE-1AN', 'Licence 1 An', CURRENT_TIMESTAMP, NULL, FALSE, NULL, NULL, 'pending'),
  ('00000000-0000-4000-8000-999999999999', 'MEDPRO-ILLIMITEE-ACTIVE', 'Licence Illimitée', CURRENT_TIMESTAMP, NULL, FALSE, NULL, NULL, 'pending')
ON CONFLICT ("key") DO NOTHING;

-- Older builds could leave the unlimited key tied to one workstation or with
-- an expiration date. An unlimited cabinet license must have neither.
UPDATE licenses
SET expirationdate = NULL,
    machineid = NULL,
    status = CASE WHEN activated THEN 'activated' ELSE 'pending' END
WHERE "key" = 'MEDPRO-ILLIMITEE-ACTIVE';
