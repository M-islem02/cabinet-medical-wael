-- Ticket printing must be explicitly enabled by the practice administrator.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS autoPrintAppointmentTicket BOOLEAN DEFAULT FALSE;
