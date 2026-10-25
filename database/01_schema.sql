-- ============================================================
-- 商业大陆 · 商业模拟挑战赛 —— 数据库结构（第 1 步 / 共 4 步）
-- 在 WorkBuddy 云服务（或任何兼容 Supabase 的 Postgres）的 SQL 编辑器里
-- 按顺序执行：01_schema.sql → 02_policies.sql → 03_functions.sql → 04_seed.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS wbs_bonds (
  id bigint NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  issuer_id text NOT NULL,
  issuer_name text NOT NULL,
  face numeric DEFAULT 100,
  coupon numeric DEFAULT 0.06,
  rating text DEFAULT 'A'::text,
  total numeric DEFAULT 0,
  subscribed numeric DEFAULT 0,
  issue_fy integer DEFAULT 1,
  mature_fy integer DEFAULT 3,
  status text DEFAULT 'pending'::text,
  reason text,
  note text,
  paid_fy integer,
  approved_by text,
  created_at timestamp with time zone DEFAULT now(),
  issued_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS wbs_collateral (
  id bigint NOT NULL,
  loan_id bigint NOT NULL,
  owner_id text,
  kind text,
  item_code text,
  qty numeric,
  status text DEFAULT 'locked'::text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_deliveries (
  id bigint NOT NULL,
  owner_id text NOT NULL,
  company_name text,
  kind text DEFAULT 'product'::text,
  item_code text NOT NULL,
  qty numeric NOT NULL,
  filled numeric DEFAULT 0,
  price numeric NOT NULL,
  note text,
  status text DEFAULT 'open'::text,
  fiscal_year integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_demand (
  id bigint NOT NULL,
  fiscal_year integer NOT NULL,
  market text NOT NULL,
  product_code text NOT NULL,
  demand_total numeric NOT NULL,
  demand_left numeric NOT NULL,
  price numeric NOT NULL
);
CREATE TABLE IF NOT EXISTS wbs_futures (
  id bigint DEFAULT nextval('wbs_futures_id_seq'::regclass),
  owner_id text NOT NULL,
  company_name text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  side text DEFAULT 'long'::text,
  qty numeric NOT NULL,
  strike numeric NOT NULL,
  open_price numeric NOT NULL,
  margin numeric NOT NULL,
  settle_year integer NOT NULL,
  status text DEFAULT 'open'::text,
  pnl numeric DEFAULT 0,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  settled_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS wbs_fx (
  currency text NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL,
  rate numeric DEFAULT 1,
  sort_order integer DEFAULT 0
);
CREATE TABLE IF NOT EXISTS wbs_game (
  id integer DEFAULT 1,
  fiscal_year integer DEFAULT 0,
  phase text DEFAULT 'prepare'::text,
  exchange_rate numeric DEFAULT 1.00,
  tariff_rate numeric DEFAULT 0.10,
  announcement text,
  updated_at timestamp with time zone DEFAULT now(),
  gov_cash numeric DEFAULT 0,
  gov_cash_a numeric DEFAULT 0,
  gov_cash_b numeric DEFAULT 0,
  gov_reserve jsonb DEFAULT '{}'::jsonb,
  gov_income numeric DEFAULT 0,
  gov_spend numeric DEFAULT 0,
  gov_budget_fy integer DEFAULT 0,
  is_trial boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS wbs_index (
  code text NOT NULL,
  name text,
  base numeric DEFAULT 1000,
  value numeric DEFAULT 1000,
  prev numeric DEFAULT 1000,
  open numeric DEFAULT 1000,
  high numeric DEFAULT 1000,
  low numeric DEFAULT 1000,
  tick integer DEFAULT 0,
  fiscal_year integer,
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_ledger (
  id bigint NOT NULL,
  owner_id text DEFAULT auth.uid(),
  fiscal_year integer DEFAULT 0,
  kind text NOT NULL,
  detail text,
  amount numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_licenses (
  id bigint NOT NULL,
  product_code text NOT NULL,
  product_name text,
  licensor_id text NOT NULL,
  licensor_name text,
  licensee_id text NOT NULL,
  licensee_name text,
  fee_per_unit numeric DEFAULT 0,
  upfront numeric DEFAULT 0,
  start_year integer DEFAULT 1,
  expire_year integer DEFAULT 2,
  status text DEFAULT 'active'::text,
  note text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_listings (
  id bigint NOT NULL,
  ticker text NOT NULL,
  name text NOT NULL,
  owner_id text NOT NULL,
  company_name text NOT NULL,
  shares_total numeric DEFAULT 0,
  shares_float numeric DEFAULT 0,
  ipo_price numeric DEFAULT 0,
  raise_goal numeric DEFAULT 0,
  listed_fy integer DEFAULT 1,
  status text DEFAULT 'pending'::text,
  basis text,
  note text,
  approved_by text,
  created_at timestamp with time zone DEFAULT now(),
  listed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS wbs_loans (
  id bigint NOT NULL,
  owner_id text DEFAULT auth.uid(),
  company_name text,
  side text DEFAULT 'lend'::text,
  target_owner text,
  target_name text,
  principal numeric NOT NULL,
  rate numeric DEFAULT 10,
  term_years integer DEFAULT 1,
  start_year integer,
  due_year integer,
  collateral_kind text DEFAULT 'none'::text,
  collateral_item text,
  collateral_qty numeric DEFAULT 0,
  collateral_value numeric DEFAULT 0,
  borrower_id text,
  borrower_name text,
  lender_id text,
  lender_name text,
  note text,
  gov_note text,
  status text DEFAULT 'open'::text,
  fiscal_year integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_mail (
  id bigint NOT NULL,
  sender_id text,
  sender_name text,
  recipient_id text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  body text,
  is_read boolean DEFAULT false,
  kind text DEFAULT 'mail'::text,
  fiscal_year integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_materials (
  code text NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL,
  supply_total integer DEFAULT 0,
  supply_left integer DEFAULT 0,
  sort_order integer DEFAULT 0
);
CREATE TABLE IF NOT EXISTS wbs_news (
  id bigint NOT NULL,
  owner_id text DEFAULT auth.uid(),
  author text,
  title text NOT NULL,
  body text,
  kind text DEFAULT 'news'::text,
  fiscal_year integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  impact_code text,
  impact_pct numeric
);
CREATE TABLE IF NOT EXISTS wbs_notices (
  id bigint DEFAULT nextval('wbs_notices_id_seq'::regclass),
  kind text DEFAULT 'general'::text,
  title text NOT NULL,
  body text,
  fiscal_year integer,
  tick integer,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_oem (
  id bigint NOT NULL,
  buyer_id text NOT NULL,
  buyer_name text,
  factory_id text NOT NULL,
  factory_name text,
  product_code text NOT NULL,
  product_name text,
  qty numeric DEFAULT 0,
  fee_per_unit numeric DEFAULT 0,
  fee_total numeric DEFAULT 0,
  materials jsonb DEFAULT '{}'::jsonb,
  mat_value numeric DEFAULT 0,
  status text DEFAULT 'open'::text,
  fiscal_year integer DEFAULT 1,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  done_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS wbs_offers (
  id bigint NOT NULL,
  owner_id text DEFAULT auth.uid(),
  company_name text,
  fiscal_year integer DEFAULT 0,
  side text NOT NULL,
  item_code text NOT NULL,
  qty numeric NOT NULL,
  price numeric NOT NULL,
  target_role text,
  status text DEFAULT 'open'::text,
  counterparty_id text,
  counterparty_name text,
  created_at timestamp with time zone DEFAULT now(),
  target_owner text,
  target_name text,
  kind text DEFAULT 'product'::text,
  note text
);
CREATE TABLE IF NOT EXISTS wbs_orders (
  id bigint DEFAULT nextval('wbs_orders_id_seq'::regclass),
  owner_id text NOT NULL,
  company_name text,
  seat text,
  code text NOT NULL,
  name text,
  kind text NOT NULL,
  item_code text NOT NULL,
  side text NOT NULL,
  otype text DEFAULT 'limit'::text,
  price numeric NOT NULL,
  qty numeric NOT NULL,
  filled numeric DEFAULT 0,
  escrow numeric DEFAULT 0,
  status text DEFAULT 'open'::text,
  fiscal_year integer,
  tick integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_pitch (
  id bigint NOT NULL,
  owner_id text DEFAULT auth.uid(),
  company_name text,
  fiscal_year integer DEFAULT 0,
  title text NOT NULL,
  pitch_text text,
  link text,
  product_code text NOT NULL,
  qty numeric NOT NULL,
  ask_price numeric NOT NULL,
  status text DEFAULT 'submitted'::text,
  quote_price numeric,
  quote_currency text,
  quote_qty numeric,
  sold_qty numeric DEFAULT 0,
  revenue_a numeric DEFAULT 0,
  revenue_b numeric DEFAULT 0,
  gov_note text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_players (
  id bigint NOT NULL,
  owner_id text DEFAULT auth.uid(),
  company_name text NOT NULL,
  role text DEFAULT 'manufacturer'::text,
  cash numeric DEFAULT 2000,
  total_asset numeric DEFAULT 2000,
  created_at timestamp with time zone DEFAULT now(),
  cash_a numeric DEFAULT 0,
  cash_b numeric DEFAULT 0,
  credit_score integer DEFAULT 100,
  seat text,
  status text DEFAULT 'active'::text,
  ban_reason text,
  ban_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS wbs_policies (
  id bigint DEFAULT nextval('wbs_policies_id_seq'::regclass),
  fiscal_year integer DEFAULT 1,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  product_code text,
  rate numeric DEFAULT 0,
  amount numeric DEFAULT 0,
  cost numeric DEFAULT 0,
  status text DEFAULT 'active'::text,
  created_by text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_post_interest (
  id bigint NOT NULL,
  post_id bigint NOT NULL,
  owner_id text DEFAULT auth.uid(),
  company_name text,
  note text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_posts (
  id bigint NOT NULL,
  owner_id text DEFAULT auth.uid(),
  company_name text,
  role text,
  fiscal_year integer DEFAULT 0,
  kind text DEFAULT 'coop'::text,
  title text,
  body text,
  want_role text,
  status text DEFAULT 'open'::text,
  pinned boolean DEFAULT false,
  interest_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_procure (
  id bigint DEFAULT nextval('wbs_procure_id_seq'::regclass),
  fiscal_year integer DEFAULT 1,
  product_code text NOT NULL,
  qty numeric DEFAULT 0,
  filled numeric DEFAULT 0,
  unit_price numeric DEFAULT 0,
  currency text DEFAULT 'G'::text,
  target_owner text,
  status text DEFAULT 'open'::text,
  note text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_production (
  id bigint DEFAULT nextval('wbs_production_id_seq'::regclass),
  owner_id text DEFAULT auth.uid(),
  company_name text DEFAULT ''::text,
  product_code text NOT NULL,
  product_name text DEFAULT ''::text,
  qty numeric DEFAULT 0,
  mat_value numeric DEFAULT 0,
  status text DEFAULT 'running'::text,
  fiscal_year integer DEFAULT 1,
  seconds integer DEFAULT 10,
  started_at timestamp with time zone DEFAULT now(),
  finish_at timestamp with time zone DEFAULT now(),
  done_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  listed boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS wbs_products (
  code text NOT NULL,
  name text NOT NULL,
  recipe jsonb NOT NULL,
  ref_price numeric NOT NULL,
  sort_order integer DEFAULT 0,
  owner_id text,
  rd_id bigint,
  prod_sec numeric DEFAULT 0,
  max_qty integer
);
CREATE TABLE IF NOT EXISTS wbs_quotes (
  id bigint DEFAULT nextval('wbs_quotes_id_seq'::regclass),
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  price numeric NOT NULL,
  prev numeric NOT NULL,
  base numeric NOT NULL,
  volume numeric DEFAULT 0,
  drift numeric DEFAULT 0,
  fiscal_year integer DEFAULT 1,
  phase text DEFAULT 'open'::text,
  at timestamp with time zone DEFAULT now(),
  tick integer DEFAULT 0
);
CREATE TABLE IF NOT EXISTS wbs_quotes_live (
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  base numeric NOT NULL,
  price numeric NOT NULL,
  prev numeric NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  volume numeric DEFAULT 0,
  tick integer DEFAULT 0,
  fiscal_year integer DEFAULT 1,
  note text,
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_rd (
  id bigint NOT NULL,
  owner_id text DEFAULT auth.uid(),
  company_name text,
  fiscal_year integer DEFAULT 0,
  product_name text NOT NULL,
  product_desc text,
  recipe jsonb NOT NULL,
  unit_cost numeric DEFAULT 0,
  status text DEFAULT 'pending'::text,
  gov_note text,
  product_code text,
  apply_qty integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  plan_seconds numeric DEFAULT 0,
  expect_qty integer
);
CREATE TABLE IF NOT EXISTS wbs_sanctions (
  id bigint NOT NULL,
  owner_id text DEFAULT auth.uid(),
  company_name text,
  target_id text,
  target_name text,
  kind text DEFAULT 'tariff'::text,
  rate numeric DEFAULT 10,
  until_year integer,
  reason text,
  status text DEFAULT 'active'::text,
  fiscal_year integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  approve_status text DEFAULT 'pending'::text,
  approve_note text,
  approved_by text,
  start_year integer,
  counter_of bigint
);
CREATE TABLE IF NOT EXISTS wbs_scores (
  id bigint NOT NULL,
  owner_id text NOT NULL,
  company_name text NOT NULL,
  role text NOT NULL,
  fiscal_year integer NOT NULL,
  revenue numeric DEFAULT 0,
  cost numeric DEFAULT 0,
  profit numeric DEFAULT 0,
  stock_value numeric DEFAULT 0,
  net_worth numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_settings (
  key text NOT NULL,
  value text NOT NULL,
  label text,
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_shorts (
  id bigint DEFAULT nextval('wbs_shorts_id_seq'::regclass),
  owner_id text NOT NULL,
  company_name text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  qty numeric NOT NULL,
  entry numeric NOT NULL,
  margin numeric NOT NULL,
  status text DEFAULT 'open'::text,
  pnl numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS wbs_spot (
  id bigint DEFAULT nextval('wbs_spot_id_seq'::regclass),
  owner_id text NOT NULL,
  company_name text NOT NULL,
  kind text NOT NULL,
  item_code text NOT NULL,
  side text NOT NULL,
  qty numeric NOT NULL,
  filled numeric DEFAULT 0,
  price numeric NOT NULL,
  status text DEFAULT 'open'::text,
  fiscal_year integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_stock (
  id bigint NOT NULL,
  owner_id text DEFAULT auth.uid(),
  kind text NOT NULL,
  item_code text NOT NULL,
  qty numeric DEFAULT 0
);
CREATE TABLE IF NOT EXISTS wbs_ticks (
  id bigint DEFAULT nextval('wbs_ticks_id_seq'::regclass),
  code text NOT NULL,
  name text,
  kind text,
  tick integer NOT NULL,
  price numeric,
  volume numeric DEFAULT 0,
  fiscal_year integer,
  at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_trades (
  id bigint DEFAULT nextval('wbs_trades_id_seq'::regclass),
  code text NOT NULL,
  name text,
  kind text,
  item_code text,
  price numeric NOT NULL,
  qty numeric NOT NULL,
  amount numeric NOT NULL,
  fee numeric DEFAULT 0,
  buy_order_id bigint,
  sell_order_id bigint,
  buyer_id text,
  buyer_name text,
  buyer_seat text,
  seller_id text,
  seller_name text,
  seller_seat text,
  taker text,
  tick integer,
  fiscal_year integer,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_war_orders (
  id bigint NOT NULL,
  war_id bigint NOT NULL,
  side text NOT NULL,
  owner_id text NOT NULL,
  owner_name text,
  kind text NOT NULL,
  item_code text NOT NULL,
  item_name text,
  qty numeric DEFAULT 0,
  filled numeric DEFAULT 0,
  unit_price numeric DEFAULT 0,
  escrow numeric DEFAULT 0,
  status text DEFAULT 'open'::text,
  fiscal_year integer DEFAULT 1,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_war_supply (
  id bigint NOT NULL,
  war_id bigint NOT NULL,
  owner_id text NOT NULL,
  company_name text,
  side text NOT NULL,
  kind text NOT NULL,
  item_code text NOT NULL,
  qty numeric DEFAULT 0,
  value numeric DEFAULT 0,
  fiscal_year integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS wbs_wars (
  id bigint NOT NULL,
  attacker_id text,
  attacker_name text,
  defender_id text,
  defender_name text,
  stake numeric NOT NULL,
  defender_stake numeric DEFAULT 0,
  attacker_loss numeric DEFAULT 0,
  defender_loss numeric DEFAULT 0,
  loot_cash numeric DEFAULT 0,
  loot_note text,
  cause text,
  status text DEFAULT 'declared'::text,
  result text,
  gov_note text,
  fiscal_year integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  approve_status text DEFAULT 'pending'::text,
  approve_note text,
  approved_by text,
  rounds integer DEFAULT 3,
  round integer DEFAULT 0,
  round_log jsonb DEFAULT '[]'::jsonb,
  war_tax numeric DEFAULT 0,
  attacker_spent numeric DEFAULT 0,
  defender_spent numeric DEFAULT 0,
  attacker_supply numeric DEFAULT 0,
  defender_supply numeric DEFAULT 0,
  aid_attacker numeric DEFAULT 0,
  aid_defender numeric DEFAULT 0,
  war_shock numeric DEFAULT 0
);

-- 自增序列（id 为 GENERATED / IDENTITY 或 serial 的表）
CREATE SEQUENCE IF NOT EXISTS wbs_futures_id_seq OWNED BY wbs_futures.id;
CREATE SEQUENCE IF NOT EXISTS wbs_notices_id_seq OWNED BY wbs_notices.id;
CREATE SEQUENCE IF NOT EXISTS wbs_orders_id_seq OWNED BY wbs_orders.id;
CREATE SEQUENCE IF NOT EXISTS wbs_policies_id_seq OWNED BY wbs_policies.id;
CREATE SEQUENCE IF NOT EXISTS wbs_procure_id_seq OWNED BY wbs_procure.id;
CREATE SEQUENCE IF NOT EXISTS wbs_production_id_seq OWNED BY wbs_production.id;
CREATE SEQUENCE IF NOT EXISTS wbs_quotes_id_seq OWNED BY wbs_quotes.id;
CREATE SEQUENCE IF NOT EXISTS wbs_shorts_id_seq OWNED BY wbs_shorts.id;
CREATE SEQUENCE IF NOT EXISTS wbs_spot_id_seq OWNED BY wbs_spot.id;
CREATE SEQUENCE IF NOT EXISTS wbs_ticks_id_seq OWNED BY wbs_ticks.id;
CREATE SEQUENCE IF NOT EXISTS wbs_trades_id_seq OWNED BY wbs_trades.id;
SELECT setval('wbs_futures_id_seq', COALESCE((SELECT max(id) FROM wbs_futures), 1));
SELECT setval('wbs_notices_id_seq', COALESCE((SELECT max(id) FROM wbs_notices), 1));
SELECT setval('wbs_orders_id_seq', COALESCE((SELECT max(id) FROM wbs_orders), 1));
SELECT setval('wbs_policies_id_seq', COALESCE((SELECT max(id) FROM wbs_policies), 1));
SELECT setval('wbs_procure_id_seq', COALESCE((SELECT max(id) FROM wbs_procure), 1));
SELECT setval('wbs_production_id_seq', COALESCE((SELECT max(id) FROM wbs_production), 1));
SELECT setval('wbs_quotes_id_seq', COALESCE((SELECT max(id) FROM wbs_quotes), 1));
SELECT setval('wbs_shorts_id_seq', COALESCE((SELECT max(id) FROM wbs_shorts), 1));
SELECT setval('wbs_spot_id_seq', COALESCE((SELECT max(id) FROM wbs_spot), 1));
SELECT setval('wbs_ticks_id_seq', COALESCE((SELECT max(id) FROM wbs_ticks), 1));
SELECT setval('wbs_trades_id_seq', COALESCE((SELECT max(id) FROM wbs_trades), 1));

-- 主键 / 唯一约束
ALTER TABLE wbs_bonds ADD CONSTRAINT wbs_bonds_code_key UNIQUE (code);
ALTER TABLE wbs_bonds ADD CONSTRAINT wbs_bonds_pkey PRIMARY KEY (id);
ALTER TABLE wbs_collateral ADD CONSTRAINT wbs_collateral_pkey PRIMARY KEY (id);
ALTER TABLE wbs_deliveries ADD CONSTRAINT wbs_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE wbs_demand ADD CONSTRAINT wbs_demand_fiscal_year_market_product_code_key UNIQUE (fiscal_year, market, product_code);
ALTER TABLE wbs_demand ADD CONSTRAINT wbs_demand_pkey PRIMARY KEY (id);
ALTER TABLE wbs_futures ADD CONSTRAINT wbs_futures_pkey PRIMARY KEY (id);
ALTER TABLE wbs_fx ADD CONSTRAINT wbs_fx_pkey PRIMARY KEY (currency);
ALTER TABLE wbs_game ADD CONSTRAINT wbs_game_pkey PRIMARY KEY (id);
ALTER TABLE wbs_index ADD CONSTRAINT wbs_index_pkey PRIMARY KEY (code);
ALTER TABLE wbs_ledger ADD CONSTRAINT wbs_ledger_pkey PRIMARY KEY (id);
ALTER TABLE wbs_licenses ADD CONSTRAINT wbs_licenses_pkey PRIMARY KEY (id);
ALTER TABLE wbs_listings ADD CONSTRAINT wbs_listings_pkey PRIMARY KEY (id);
ALTER TABLE wbs_listings ADD CONSTRAINT wbs_listings_ticker_key UNIQUE (ticker);
ALTER TABLE wbs_loans ADD CONSTRAINT wbs_loans_pkey PRIMARY KEY (id);
ALTER TABLE wbs_mail ADD CONSTRAINT wbs_mail_pkey PRIMARY KEY (id);
ALTER TABLE wbs_materials ADD CONSTRAINT wbs_materials_pkey PRIMARY KEY (code);
ALTER TABLE wbs_news ADD CONSTRAINT wbs_news_pkey PRIMARY KEY (id);
ALTER TABLE wbs_notices ADD CONSTRAINT wbs_notices_pkey PRIMARY KEY (id);
ALTER TABLE wbs_oem ADD CONSTRAINT wbs_oem_pkey PRIMARY KEY (id);
ALTER TABLE wbs_offers ADD CONSTRAINT wbs_offers_pkey PRIMARY KEY (id);
ALTER TABLE wbs_orders ADD CONSTRAINT wbs_orders_pkey PRIMARY KEY (id);
ALTER TABLE wbs_pitch ADD CONSTRAINT wbs_pitch_pkey PRIMARY KEY (id);
ALTER TABLE wbs_players ADD CONSTRAINT wbs_players_owner_id_key UNIQUE (owner_id);
ALTER TABLE wbs_players ADD CONSTRAINT wbs_players_pkey PRIMARY KEY (id);
ALTER TABLE wbs_policies ADD CONSTRAINT wbs_policies_pkey PRIMARY KEY (id);
ALTER TABLE wbs_post_interest ADD CONSTRAINT wbs_post_interest_post_id_owner_id_key UNIQUE (post_id, owner_id);
ALTER TABLE wbs_post_interest ADD CONSTRAINT wbs_post_interest_pkey PRIMARY KEY (id);
ALTER TABLE wbs_posts ADD CONSTRAINT wbs_posts_pkey PRIMARY KEY (id);
ALTER TABLE wbs_procure ADD CONSTRAINT wbs_procure_pkey PRIMARY KEY (id);
ALTER TABLE wbs_production ADD CONSTRAINT wbs_production_pkey PRIMARY KEY (id);
ALTER TABLE wbs_products ADD CONSTRAINT wbs_products_pkey PRIMARY KEY (code);
ALTER TABLE wbs_quotes ADD CONSTRAINT wbs_quotes_pkey PRIMARY KEY (id);
ALTER TABLE wbs_quotes_live ADD CONSTRAINT wbs_quotes_live_pkey PRIMARY KEY (code);
ALTER TABLE wbs_rd ADD CONSTRAINT wbs_rd_pkey PRIMARY KEY (id);
ALTER TABLE wbs_sanctions ADD CONSTRAINT wbs_sanctions_pkey PRIMARY KEY (id);
ALTER TABLE wbs_scores ADD CONSTRAINT wbs_scores_owner_id_fiscal_year_key UNIQUE (owner_id, fiscal_year);
ALTER TABLE wbs_scores ADD CONSTRAINT wbs_scores_pkey PRIMARY KEY (id);
ALTER TABLE wbs_settings ADD CONSTRAINT wbs_settings_pkey PRIMARY KEY (key);
ALTER TABLE wbs_shorts ADD CONSTRAINT wbs_shorts_pkey PRIMARY KEY (id);
ALTER TABLE wbs_spot ADD CONSTRAINT wbs_spot_pkey PRIMARY KEY (id);
ALTER TABLE wbs_stock ADD CONSTRAINT wbs_stock_owner_id_kind_item_code_key UNIQUE (owner_id, kind, item_code);
ALTER TABLE wbs_stock ADD CONSTRAINT wbs_stock_pkey PRIMARY KEY (id);
ALTER TABLE wbs_ticks ADD CONSTRAINT wbs_ticks_pkey PRIMARY KEY (id);
ALTER TABLE wbs_trades ADD CONSTRAINT wbs_trades_pkey PRIMARY KEY (id);
ALTER TABLE wbs_war_orders ADD CONSTRAINT wbs_war_orders_pkey PRIMARY KEY (id);
ALTER TABLE wbs_war_supply ADD CONSTRAINT wbs_war_supply_pkey PRIMARY KEY (id);
ALTER TABLE wbs_wars ADD CONSTRAINT wbs_wars_pkey PRIMARY KEY (id);
