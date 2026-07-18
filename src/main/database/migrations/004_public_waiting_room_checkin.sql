ALTER TABLE waiting_room
  ADD COLUMN IF NOT EXISTS publicTicketCode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS publicTrackingToken VARCHAR(64),
  ADD COLUMN IF NOT EXISTS arrivalSource VARCHAR(30) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS declaredAppointment BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_waiting_room_public_tracking_token
  ON waiting_room(publicTrackingToken)
  WHERE publicTrackingToken IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_waiting_room_public_queue
  ON waiting_room(arrivalTime, status, priority)
  WHERE publicTicketCode IS NOT NULL;

