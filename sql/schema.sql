-- Schema + sample data (PostgreSQL-compatible; also runs unchanged on SQLite/MySQL)
CREATE TABLE subscribers (
  id              VARCHAR(10) PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  plan            VARCHAR(20)  NOT NULL,
  activation_date DATE         NOT NULL
);

CREATE TABLE usage (
  subscriber_id VARCHAR(10)  NOT NULL REFERENCES subscribers (id),
  call_minutes  INTEGER      NOT NULL,
  sms_count     INTEGER      NOT NULL,
  data_usage_mb NUMERIC(12,2) NOT NULL,
  recorded_at   TIMESTAMP    NOT NULL
);

INSERT INTO subscribers (id, name, plan, activation_date) VALUES
  ('SUB01', 'Amir', 'Basic',   '2023-01-12'),
  ('SUB02', 'Sari', 'Premium', '2022-05-03'),
  ('SUB03', 'Budi', 'Basic',   '2024-09-20'),
  ('SUB04', 'Dewi', 'Family',  '2021-02-15'),
  ('SUB05', 'Rian', 'Premium', '2023-08-08'),
  ('SUB06', 'Nia',  'Basic',   '2024-11-30');

INSERT INTO usage (subscriber_id, call_minutes, sms_count, data_usage_mb, recorded_at) VALUES
  ('SUB01',  40, 10, 1500, '2025-08-01 08:00:00'),
  ('SUB01',  35,  8, 1200, '2025-08-01 12:00:00'),
  ('SUB02',  90, 20, 6000, '2025-08-01 08:00:00'),
  ('SUB02',  85, 18, 5800, '2025-08-01 12:00:00'),
  ('SUB03',  20,  5,  500, '2025-08-01 08:00:00'),
  ('SUB04', 150, 30, 9000, '2025-08-01 08:00:00'),
  ('SUB05',  70, 15, 5000, '2025-08-01 08:00:00'),
  ('SUB06',  25,  6,  700, '2025-08-01 08:00:00');
