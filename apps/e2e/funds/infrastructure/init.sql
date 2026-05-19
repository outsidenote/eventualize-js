-- Account leaderboard read model
CREATE TABLE IF NOT EXISTS account_leaderboard (
  account_id       TEXT PRIMARY KEY,
  currency         TEXT        NOT NULL DEFAULT 'USD',
  total_deposited  NUMERIC     NOT NULL DEFAULT 0,
  total_withdrawn  NUMERIC     NOT NULL DEFAULT 0,
  last_balance     NUMERIC     NOT NULL DEFAULT 0,
  deposit_count    INTEGER     NOT NULL DEFAULT 0,
  withdrawal_count INTEGER     NOT NULL DEFAULT 0,
  last_activity    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
