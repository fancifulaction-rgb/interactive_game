-- Уникальный секрет регистрации (QR / deep link). Не угадывается как короткий code.
ALTER TABLE games ADD COLUMN IF NOT EXISTS join_token uuid;

UPDATE games SET join_token = gen_random_uuid() WHERE join_token IS NULL;

ALTER TABLE games ALTER COLUMN join_token SET DEFAULT gen_random_uuid();
ALTER TABLE games ALTER COLUMN join_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS games_join_token_unique ON games (join_token);
