-- 001_initial_schema.sql
-- Create extensions, types, tables, indexes, triggers

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Attempt to enable PostGIS if available on the system
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    BEGIN
      CREATE EXTENSION postgis;
    EXCEPTION
      WHEN undefined_file THEN
        RAISE NOTICE 'PostGIS extension not available in PostgreSQL installation. Spatial features will fall back to lat/lng columns.';
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Insufficient privileges to create PostGIS extension. Proceeding with spatial fallback.';
    END;
  END IF;
END $$;

-- Trigger Function for Auto-updating updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(20) NOT NULL CHECK (role IN ('farmer', 'buyer', 'admin')),
  name VARCHAR(255) NOT NULL,
  name_hi VARCHAR(255),
  phone VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(255) UNIQUE,
  password VARCHAR(255) NOT NULL,
  avatar VARCHAR(255),
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER set_timestamp_users
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. FARMER PROFILES
CREATE TABLE IF NOT EXISTS farmer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  village VARCHAR(255),
  district VARCHAR(255),
  state VARCHAR(255),
  land_acres NUMERIC(6, 2) DEFAULT 0,
  crops TEXT[] DEFAULT '{}',
  rating NUMERIC(3, 2) DEFAULT 0.0 CHECK (rating >= 0 AND rating <= 5),
  total_sales INT DEFAULT 0,
  latitude NUMERIC(10, 6),
  longitude NUMERIC(10, 6),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER set_timestamp_farmer_profiles
BEFORE UPDATE ON farmer_profiles
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE INDEX IF NOT EXISTS idx_farmer_profiles_user_id ON farmer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_farmer_profiles_state ON farmer_profiles(state);

-- 3. BUYER PROFILES
CREATE TABLE IF NOT EXISTS buyer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company VARCHAR(255),
  city VARCHAR(255),
  district VARCHAR(255),
  state VARCHAR(255),
  gstin VARCHAR(50),
  rating NUMERIC(3, 2) DEFAULT 0.0 CHECK (rating >= 0 AND rating <= 5),
  total_purchases INT DEFAULT 0,
  latitude NUMERIC(10, 6),
  longitude NUMERIC(10, 6),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER set_timestamp_buyer_profiles
BEFORE UPDATE ON buyer_profiles
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE INDEX IF NOT EXISTS idx_buyer_profiles_user_id ON buyer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_city ON buyer_profiles(city);

-- 4. PRODUCE LISTINGS
CREATE TABLE IF NOT EXISTS produce_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop VARCHAR(100) NOT NULL,
  crop_hi VARCHAR(100),
  emoji VARCHAR(10),
  variety VARCHAR(100),
  quantity NUMERIC(10, 2) NOT NULL CHECK (quantity >= 0),
  unit VARCHAR(20) DEFAULT 'kg',
  grade VARCHAR(10) NOT NULL CHECK (grade IN ('A', 'B', 'C', 'Other')),
  asking_price NUMERIC(10, 2) NOT NULL CHECK (asking_price >= 0),
  market_ref_price NUMERIC(10, 2),
  ai_suggested_price NUMERIC(10, 2),
  description TEXT,
  location_address VARCHAR(255),
  latitude NUMERIC(10, 6),
  longitude NUMERIC(10, 6),
  images TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'sold', 'deleted', 'draft')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER set_timestamp_produce_listings
BEFORE UPDATE ON produce_listings
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE INDEX IF NOT EXISTS idx_listings_farmer_id ON produce_listings(farmer_id);
CREATE INDEX IF NOT EXISTS idx_listings_crop ON produce_listings(crop);
CREATE INDEX IF NOT EXISTS idx_listings_status ON produce_listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_grade ON produce_listings(grade);
CREATE INDEX IF NOT EXISTS idx_listings_price ON produce_listings(asking_price);

-- 5. OFFERS
CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES produce_listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_price NUMERIC(10, 2) NOT NULL CHECK (offer_price > 0),
  quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(20) DEFAULT 'kg',
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  message TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'countered', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER set_timestamp_offers
BEFORE UPDATE ON offers
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE INDEX IF NOT EXISTS idx_offers_listing_id ON offers(listing_id);
CREATE INDEX IF NOT EXISTS idx_offers_buyer_id ON offers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);

-- 6. ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES produce_listings(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  farmer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  crop VARCHAR(100) NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL,
  unit VARCHAR(20) DEFAULT 'kg',
  agreed_price NUMERIC(10, 2) NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL,
  status VARCHAR(30) DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'pickup_scheduled', 'in_transit', 'delivered', 'cancelled')),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'escrowed', 'paid', 'refunded')),
  timeline JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER set_timestamp_orders
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE INDEX IF NOT EXISTS idx_orders_farmer_id ON orders(farmer_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_listing_id ON orders(listing_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 7. MARKET PRICES
CREATE TABLE IF NOT EXISTS market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commodity VARCHAR(100) NOT NULL,
  commodity_hi VARCHAR(100),
  emoji VARCHAR(10),
  market VARCHAR(255) NOT NULL,
  district VARCHAR(100),
  state VARCHAR(100),
  min_price NUMERIC(10, 2) NOT NULL,
  max_price NUMERIC(10, 2) NOT NULL,
  modal_price NUMERIC(10, 2) NOT NULL,
  price_date DATE DEFAULT CURRENT_DATE,
  trend VARCHAR(20) DEFAULT 'stable' CHECK (trend IN ('up', 'down', 'stable')),
  change_amount NUMERIC(10, 2) DEFAULT 0,
  latitude NUMERIC(10, 6),
  longitude NUMERIC(10, 6),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER set_timestamp_market_prices
BEFORE UPDATE ON market_prices
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE INDEX IF NOT EXISTS idx_market_prices_commodity ON market_prices(commodity);
CREATE INDEX IF NOT EXISTS idx_market_prices_state ON market_prices(state);
CREATE INDEX IF NOT EXISTS idx_market_prices_date ON market_prices(price_date);

-- 8. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) DEFAULT 'system' CHECK (type IN ('offer', 'price', 'order', 'ai', 'system')),
  title VARCHAR(255) NOT NULL,
  title_en VARCHAR(255),
  body TEXT NOT NULL,
  emoji VARCHAR(10),
  read BOOLEAN DEFAULT false,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- PostGIS Geometry Columns and Spatial GiST Indexes (if extension is active)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    -- Add location_geom to farmer_profiles
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farmer_profiles' AND column_name = 'location_geom') THEN
      ALTER TABLE farmer_profiles ADD COLUMN location_geom GEOMETRY(Point, 4326);
      CREATE INDEX IF NOT EXISTS idx_farmer_profiles_geom ON farmer_profiles USING GIST (location_geom);
    END IF;

    -- Add location_geom to buyer_profiles
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buyer_profiles' AND column_name = 'location_geom') THEN
      ALTER TABLE buyer_profiles ADD COLUMN location_geom GEOMETRY(Point, 4326);
      CREATE INDEX IF NOT EXISTS idx_buyer_profiles_geom ON buyer_profiles USING GIST (location_geom);
    END IF;

    -- Add location_geom to produce_listings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'produce_listings' AND column_name = 'location_geom') THEN
      ALTER TABLE produce_listings ADD COLUMN location_geom GEOMETRY(Point, 4326);
      CREATE INDEX IF NOT EXISTS idx_produce_listings_geom ON produce_listings USING GIST (location_geom);
    END IF;

    -- Add location_geom to market_prices
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_prices' AND column_name = 'location_geom') THEN
      ALTER TABLE market_prices ADD COLUMN location_geom GEOMETRY(Point, 4326);
      CREATE INDEX IF NOT EXISTS idx_market_prices_geom ON market_prices USING GIST (location_geom);
    END IF;
  END IF;
END $$;
