-- ================================================================
-- PHYSIOCARE / MEDCARESO - CONFIGURATION POSTGRESQL
-- Base:          cabinet_db
-- Utilisateur:   cabinet_app
-- Port attendu:  5432
-- ================================================================
--
-- A executer avec psql en administrateur PostgreSQL:
--   psql -U postgres -f SETUP_WINDOWS/SCRIPT_POSTGRESQL_COMPLET.sql
-- Le mot de passe sera demande sans etre stocke dans ce fichier.
-- En automatisation: psql -U postgres -v app_password="..." -f ...
--
-- IMPORTANT:
-- PostgreSQL utilise 5432 par defaut.
-- Ce script cree uniquement le role, la base et les droits. Au premier
-- demarrage, MedCareSO applique automatiquement les migrations SQL versionnees.

\set ON_ERROR_STOP on
\if :{?app_password}
\else
\prompt 'Mot de passe du role cabinet_app: ' app_password
\endif

SELECT format('CREATE ROLE cabinet_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cabinet_app')\gexec

SELECT format('ALTER ROLE cabinet_app WITH LOGIN PASSWORD %L', :'app_password')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cabinet_app')\gexec

SELECT 'CREATE DATABASE cabinet_db OWNER cabinet_app ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'cabinet_db')\gexec

GRANT ALL PRIVILEGES ON DATABASE cabinet_db TO cabinet_app;

\connect cabinet_db

GRANT USAGE, CREATE ON SCHEMA public TO cabinet_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cabinet_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cabinet_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL PRIVILEGES ON TABLES TO cabinet_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL PRIVILEGES ON SEQUENCES TO cabinet_app;

SELECT
  current_database() AS database,
  'cabinet_app' AS application_user,
  'PostgreSQL configuration OK' AS status;
