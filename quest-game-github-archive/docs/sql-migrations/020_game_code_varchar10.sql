-- QA-B04: код игры до 10 символов (раньше VARCHAR(6))
ALTER TABLE games
  ALTER COLUMN code TYPE VARCHAR(10);
