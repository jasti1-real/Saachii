PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by TEXT REFERENCES users(id),
  country_code TEXT NOT NULL DEFAULT '+256',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended'))
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_ugx INTEGER NOT NULL DEFAULT 0 CHECK(balance_ugx >= 0),
  total_deposited_ugx INTEGER NOT NULL DEFAULT 0 CHECK(total_deposited_ugx >= 0),
  total_withdrawn_ugx INTEGER NOT NULL DEFAULT 0 CHECK(total_withdrawn_ugx >= 0),
  total_earned_ugx INTEGER NOT NULL DEFAULT 0 CHECK(total_earned_ugx >= 0),
  referral_earned_ugx INTEGER NOT NULL DEFAULT 0 CHECK(referral_earned_ugx >= 0),
  welcome_bonus_ugx INTEGER NOT NULL DEFAULT 0 CHECK(welcome_bonus_ugx >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price_ugx INTEGER NOT NULL CHECK(price_ugx > 0),
  listed_daily_income_ugx INTEGER NOT NULL CHECK(listed_daily_income_ugx >= 0),
  duration_days INTEGER NOT NULL CHECK(duration_days > 0),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
);

INSERT OR IGNORE INTO products(id,name,price_ugx,listed_daily_income_ugx,duration_days,enabled) VALUES
(1,'Machine 1',6000,2000,60,0),
(2,'Machine 2',15000,5000,45,0),
(3,'Machine 3',20000,7000,30,0),
(4,'Machine 4',60000,20000,15,0),
(5,'Machine 5',100000,50500,15,0),
(6,'Machine 6',300000,80000,15,0),
(7,'Machine 7',500000,100000,10,0),
(8,'Machine 8',1000000,400000,10,0),
(9,'Machine 9',2000000,550000,10,0),
(10,'Machine 10',5000000,800000,30,0);

CREATE TABLE IF NOT EXISTS user_products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  purchase_price_ugx INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment','active','completed','cancelled')),
  purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK(type IN ('welcome_bonus','deposit','withdrawal','product_purchase','daily_credit','referral_commission','withdrawal_tax','adjustment')),
  amount_ugx INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','successful','failed','reversed')),
  provider TEXT,
  provider_reference TEXT UNIQUE,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS referral_commissions (
  id TEXT PRIMARY KEY,
  earner_user_id TEXT NOT NULL REFERENCES users(id),
  source_user_id TEXT NOT NULL REFERENCES users(id),
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 3),
  rate_basis_points INTEGER NOT NULL,
  amount_ugx INTEGER NOT NULL CHECK(amount_ugx >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(earner_user_id, source_user_id, transaction_id, level)
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_products_user_status ON user_products(user_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_source ON users(referred_by);
