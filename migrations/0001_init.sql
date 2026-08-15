CREATE TABLE projects (
  id            TEXT PRIMARY KEY,            -- ulid
  title         TEXT NOT NULL DEFAULT 'Untitled',
  bpm           REAL NOT NULL DEFAULT 120,
  key_sig       TEXT NOT NULL DEFAULT 'C major',
  time_sig      TEXT NOT NULL DEFAULT '4/4',
  vibe          TEXT NOT NULL DEFAULT '',    -- free text; seeds caption drafting
  length_beats  REAL NOT NULL DEFAULT 128,   -- project length
  loop_start_beats REAL,                     -- NULL = loop off
  loop_end_beats   REAL,
  created_at    INTEGER NOT NULL,            -- unix ms
  updated_at    INTEGER NOT NULL
);

CREATE TABLE lanes (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('music3','acestep','synth','import','picture')),
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,              -- lanes are infinite; ordered list
  muted       INTEGER NOT NULL DEFAULT 0,
  soloed      INTEGER NOT NULL DEFAULT 0,
  volume_db   REAL NOT NULL DEFAULT 0,       -- -60..+6
  pan         REAL NOT NULL DEFAULT 0,       -- -1..1
  armed       INTEGER NOT NULL DEFAULT 0,    -- generate target; max one armed per project (enforced in Worker)
  visible     INTEGER NOT NULL DEFAULT 1,    -- picture lane show/hide
  parent_lane_id TEXT REFERENCES lanes(id),  -- set on stem child lanes
  stem_role   TEXT,                          -- vocals|drums|bass|other for stem children
  synth_config TEXT,                         -- JSON: Tone.js instrument type + params (synth lanes)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX lanes_project ON lanes(project_id, sort_order);

CREATE TABLE assets (                        -- one row per blob in R2
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('audio','video')),
  r2_key      TEXT NOT NULL,
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  duration_sec REAL,
  sample_rate INTEGER,                       -- audio only
  channels    INTEGER,
  source      TEXT NOT NULL,                 -- 'music3' | 'acestep' | 'import' | 'demucs' | 'video'
  source_job_id TEXT,                        -- provenance
  peaks_r2_key TEXT,                         -- waveform peaks sidecar, §6.2
  created_at  INTEGER NOT NULL
);

CREATE TABLE clips (
  id          TEXT PRIMARY KEY,
  lane_id     TEXT NOT NULL REFERENCES lanes(id) ON DELETE CASCADE,
  asset_id    TEXT REFERENCES assets(id),    -- NULL for synth-pattern clips
  start_beats REAL NOT NULL,                 -- timeline position, BPM grid
  length_beats REAL NOT NULL,
  cue_in_sec  REAL NOT NULL DEFAULT 0,       -- non-destructive crop into source audio
  fade_in_sec REAL NOT NULL DEFAULT 0,
  fade_out_sec REAL NOT NULL DEFAULT 0,
  gain_db     REAL NOT NULL DEFAULT 0,
  synth_pattern TEXT,                        -- JSON note list for synth clips
  label       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX clips_lane ON clips(lane_id, start_beats);

CREATE TABLE jobs (                          -- generate / explode lifecycle, §7
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lane_id     TEXT,                          -- armed lane at submit time
  kind        TEXT NOT NULL CHECK (kind IN ('music3_generate','acestep_generate','demucs_split')),
  params      TEXT NOT NULL,                 -- JSON: lyrics, caption, seed, durationSec, model / source asset id
  status      TEXT NOT NULL DEFAULT 'queued'
              CHECK (status IN ('queued','running','ingesting','succeeded','failed','cancelled')),
  bridge_job_id TEXT,
  error       TEXT,
  result_asset_ids TEXT,                     -- JSON array
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
