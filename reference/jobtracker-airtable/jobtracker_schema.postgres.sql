-- ============================================================
-- JobTracker — PostgreSQL schema
-- Reverse-engineered from Airtable base JobTracker2.0.xlsx
-- 471 job records, 29 source fields, 2 views.
--
-- Design notes:
--  * Airtable 'Project ID' is NOT unique (repeats across jobs), so the
--    natural key is the Airtable record id; a surrogate BIGSERIAL is the PK.
--  * Single-select fields -> lookup tables (seeded with every option,
--    including options not currently used, to mirror Airtable exactly).
--  * Multi-select fields (Division Code, Designer Name) -> join tables.
--  * 'Due Date' & 'Invoice Date' were stored as Airtable selects/text but
--    hold real dates -> DATE. 'Date Completed' holds month-year labels
--    (e.g. 'Jan 2026') -> kept as TEXT.
--  * 'Rush' (single option 'Rush') -> BOOLEAN is_rush.
--  * Financial/PO fields are empty in the source but retained for the app.
--  * Attachment URLs from Airtable EXPIRE after a few hours; store files
--    yourself and keep url only as a reference.
-- ============================================================

BEGIN;

CREATE TABLE project_id_letters (
    id   SMALLSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE
);
INSERT INTO project_id_letters (code) VALUES ('C');
INSERT INTO project_id_letters (code) VALUES ('F');
INSERT INTO project_id_letters (code) VALUES ('D');
INSERT INTO project_id_letters (code) VALUES ('E');
INSERT INTO project_id_letters (code) VALUES ('G');
INSERT INTO project_id_letters (code) VALUES ('H');
INSERT INTO project_id_letters (code) VALUES ('I');
INSERT INTO project_id_letters (code) VALUES ('J');
INSERT INTO project_id_letters (code) VALUES ('K');
INSERT INTO project_id_letters (code) VALUES ('L');
INSERT INTO project_id_letters (code) VALUES ('B');
INSERT INTO project_id_letters (code) VALUES ('A');
INSERT INTO project_id_letters (code) VALUES ('M');

CREATE TABLE project_types (
    id   SMALLSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
INSERT INTO project_types (name) VALUES ('Design');
INSERT INTO project_types (name) VALUES ('Digital Image');
INSERT INTO project_types (name) VALUES ('Podcast');
INSERT INTO project_types (name) VALUES ('Video');
INSERT INTO project_types (name) VALUES ('video');
INSERT INTO project_types (name) VALUES ('QR Code');
INSERT INTO project_types (name) VALUES ('Branding Review');

CREATE TABLE project_statuses (
    id   SMALLSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
INSERT INTO project_statuses (name) VALUES ('Completed');
INSERT INTO project_statuses (name) VALUES ('In Progress');
INSERT INTO project_statuses (name) VALUES ('On Hold');
INSERT INTO project_statuses (name) VALUES ('Canceled');
INSERT INTO project_statuses (name) VALUES ('Ongoing');
INSERT INTO project_statuses (name) VALUES ('Print Production');
INSERT INTO project_statuses (name) VALUES ('Mailing');
INSERT INTO project_statuses (name) VALUES ('In Review');
INSERT INTO project_statuses (name) VALUES ('Rush');

CREATE TABLE divisions (
    id   SMALLSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE
);
INSERT INTO divisions (code) VALUES ('BPP');
INSERT INTO divisions (code) VALUES ('ADABEI');
INSERT INTO divisions (code) VALUES ('AS');
INSERT INTO divisions (code) VALUES ('IMC');
INSERT INTO divisions (code) VALUES ('AGENCY');
INSERT INTO divisions (code) VALUES ('GOV');
INSERT INTO divisions (code) VALUES ('IT');
INSERT INTO divisions (code) VALUES ('JADA');
INSERT INTO divisions (code) VALUES ('HPI');
INSERT INTO divisions (code) VALUES ('HR');
INSERT INTO divisions (code) VALUES ('COM');
INSERT INTO divisions (code) VALUES ('COMM');
INSERT INTO divisions (code) VALUES ('EDU');
INSERT INTO divisions (code) VALUES ('ADV');
INSERT INTO divisions (code) VALUES ('PI, CE');
INSERT INTO divisions (code) VALUES ('MEM');
INSERT INTO divisions (code) VALUES ('EXP');
INSERT INTO divisions (code) VALUES ('PI');
INSERT INTO divisions (code) VALUES ('ADAF');
INSERT INTO divisions (code) VALUES ('LGL');
INSERT INTO divisions (code) VALUES ('ADA');
INSERT INTO divisions (code) VALUES ('GKAS');
INSERT INTO divisions (code) VALUES ('LIB');
INSERT INTO divisions (code) VALUES ('DSB');
INSERT INTO divisions (code) VALUES ('DCF');
INSERT INTO divisions (code) VALUES ('PPP');
INSERT INTO divisions (code) VALUES ('CE');
INSERT INTO divisions (code) VALUES ('SS26');
INSERT INTO divisions (code) VALUES ('ENT');
INSERT INTO divisions (code) VALUES ('401');

CREATE TABLE designers (
    id   SMALLSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
INSERT INTO designers (name) VALUES ('Kristin Trusco');
INSERT INTO designers (name) VALUES ('Nicole Cramlett');
INSERT INTO designers (name) VALUES ('Kristin Trusco, Emilio Vallejo');
INSERT INTO designers (name) VALUES ('Richelle Albrecht');
INSERT INTO designers (name) VALUES ('Ben Maizell, Richelle Albrecht');
INSERT INTO designers (name) VALUES ('Kristin Trusco, Nicole Cramlett');
INSERT INTO designers (name) VALUES ('Jessica Hernandez, Ben Maizell');
INSERT INTO designers (name) VALUES ('N/A');
INSERT INTO designers (name) VALUES ('Jess Hernandez');
INSERT INTO designers (name) VALUES ('Jessica Hernandez, Kristin Trusco');
INSERT INTO designers (name) VALUES ('Ben Maizell');
INSERT INTO designers (name) VALUES ('Nicole Cramlett, Richelle Albrech, Jessica Hernandez, Ben Maizell');
INSERT INTO designers (name) VALUES ('Nicole Cramlett, Jessica Hernandez');
INSERT INTO designers (name) VALUES ('Consultant: Nissa Landman');
INSERT INTO designers (name) VALUES ('Ben Maizell, Nicole Cramlett');
INSERT INTO designers (name) VALUES ('Jessica Hernandez, Ben Maizell, Kristin Trusco');
INSERT INTO designers (name) VALUES ('Jessica Hernandez, Ben Maizell, Emilio Vallejo');
INSERT INTO designers (name) VALUES ('Consultant: Jason Lavicky');
INSERT INTO designers (name) VALUES ('Nicole Cramlett, Richelle Albrecht');
INSERT INTO designers (name) VALUES ('Emilio Vallejo');
INSERT INTO designers (name) VALUES ('Jessica Hernandez, Emilio Vallejo');

CREATE TABLE jobs (
    id                   BIGSERIAL PRIMARY KEY,
    airtable_record_id   TEXT UNIQUE NOT NULL,
    project_id           INTEGER,                       -- not unique in source
    project_id_letter_id SMALLINT REFERENCES project_id_letters(id),
    project_type_id      SMALLINT REFERENCES project_types(id),
    project_status_id    SMALLINT REFERENCES project_statuses(id),
    internal_client      TEXT,
    project_name         TEXT,
    date_in              DATE,
    due_date             DATE,
    comments             TEXT,
    total_deliverables   INTEGER,
    vendor               TEXT,
    date_completed       TEXT,                          -- month-year label, e.g. 'Jan 2026'
    is_rush              BOOLEAN NOT NULL DEFAULT FALSE,
    -- financial / PO tracking (empty in source, reserved for the app)
    program_id           TEXT,
    gl_number            TEXT,
    contract_number      TEXT,
    quantity             TEXT,
    po1_number           INTEGER,
    po1_amount           NUMERIC(12,2),
    po2_number           INTEGER,
    po2_amount           NUMERIC(12,2),
    invoice_date         DATE,
    invoice_number       TEXT,
    invoice_amount       NUMERIC(12,2),
    postage_cost         NUMERIC(12,2),
    airtable_created_at  TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_divisions (
    job_id      BIGINT   NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    division_id SMALLINT NOT NULL REFERENCES divisions(id),
    PRIMARY KEY (job_id, division_id)
);

CREATE TABLE job_designers (
    job_id      BIGINT   NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    designer_id SMALLINT NOT NULL REFERENCES designers(id),
    PRIMARY KEY (job_id, designer_id)
);

CREATE TABLE attachments (
    id                     BIGSERIAL PRIMARY KEY,
    job_id                 BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    airtable_attachment_id TEXT UNIQUE,
    filename               TEXT NOT NULL,
    content_type           TEXT,
    size_bytes             BIGINT,
    storage_path           TEXT,          -- where you saved the file locally / in object storage
    source_url             TEXT           -- original Airtable URL (EXPIRES)
);

CREATE INDEX idx_jobs_project_id      ON jobs(project_id);
CREATE INDEX idx_jobs_status          ON jobs(project_status_id);
CREATE INDEX idx_jobs_type            ON jobs(project_type_id);
CREATE INDEX idx_jobs_date_in         ON jobs(date_in);
CREATE INDEX idx_jobs_due_date        ON jobs(due_date);
CREATE INDEX idx_attachments_job      ON attachments(job_id);

-- View mirroring the Airtable 'Creative Status' view
-- Filter: Project Status in (In Review, Print Production, In Progress) AND Project Type in (Design, Digital Image, Branding Review)
CREATE VIEW creative_status AS
SELECT j.*
FROM   jobs j
JOIN   project_statuses s ON s.id = j.project_status_id
JOIN   project_types    t ON t.id = j.project_type_id
WHERE  s.name IN ('In Review', 'Print Production', 'In Progress')
  AND  t.name IN ('Design', 'Digital Image', 'Branding Review');

COMMIT;

-- ------------------------------------------------------------
-- Loading the data: jobtracker_data.json has all 471 records with
-- values already resolved (selects, dates, attachments). Example loader:
--
--   import json, psycopg2
--   data = json.load(open('jobtracker_data.json'))
--   # upsert lookups, then for each record insert into jobs and the
--   # job_divisions / job_designers / attachments child rows.
-- ------------------------------------------------------------