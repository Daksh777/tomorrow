create table if not exists places (
  place_id text primary key,
  name text not null,
  archetype text not null default 'cafe',
  area_type text not null default 'residential',
  lat double precision not null,
  lng double precision not null,
  city text not null,
  country text,
  timezone text not null default 'Asia/Kolkata',
  radius_km double precision not null default 2,
  leagues text[] not null default '{}',
  baseline jsonb not null,           -- { "monday": [0..23 values], ... }
  baseline_source text not null default 'own', -- 'own' | 'peers'
  anchors jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists signal_cache (
  city text not null,
  date date not null,
  kind text not null,                -- events | matches:<league> | weather | news
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (city, date, kind)
);

create table if not exists forecasts (
  place_id text not null references places(place_id) on delete cascade,
  date date not null,
  hourly jsonb not null,
  buckets jsonb not null,
  pins jsonb not null,
  copy jsonb not null,
  band numeric not null,
  created_at timestamptz not null default now(),
  primary key (place_id, date)
);

create table if not exists taps (
  place_id text not null references places(place_id) on delete cascade,
  date date not null,
  value smallint not null check (value between -1 and 1),
  daypart text,
  primary key (place_id, date)
);

create table if not exists weights (
  place_id text not null references places(place_id) on delete cascade,
  signal_kind text not null,
  w double precision not null default 1.0,
  primary key (place_id, signal_kind)
);

-- The project was created with "Automatically expose new tables" off, so grant the server role access.
-- (anon/authenticated get nothing; the app only talks to Supabase with the secret key.)
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Owner overrides: true when the owner set this weight by hand (vs learned from morning taps).
alter table weights add column if not exists owner_set boolean not null default false;

-- Neighbourhood (e.g. "Connaught Place"), used for local disruption news.
alter table places add column if not exists area text;

-- Indian state, for regional festivals (Durga Puja, Karva Chauth, Chhath, Garba).
alter table places add column if not exists state text;
