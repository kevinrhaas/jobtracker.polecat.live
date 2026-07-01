import json
d=json.load(open('jobtracker_data.json'))
fields={f['name']:f for f in d['fields']}
recs=d['records']

def esc(s): return s.replace("'","''")

def choices(name):
    return fields[name].get('choices',[]) or []

# distinct values actually used for multiselects (union of choices + seen)
def used_multi(name):
    seen=set()
    for r in recs:
        v=r['fields'].get(name)
        if isinstance(v,list):
            for x in v: seen.add(x)
    # keep choice order, then any extra seen
    out=[c for c in choices(name)]
    for x in sorted(seen):
        if x not in out: out.append(x)
    return out

L=[]
w=L.append
w("-- ============================================================")
w("-- JobTracker — PostgreSQL schema")
w("-- Reverse-engineered from Airtable base JobTracker2.0.xlsx")
w("-- 471 job records, 29 source fields, 2 views.")
w("--")
w("-- Design notes:")
w("--  * Airtable 'Project ID' is NOT unique (repeats across jobs), so the")
w("--    natural key is the Airtable record id; a surrogate BIGSERIAL is the PK.")
w("--  * Single-select fields -> lookup tables (seeded with every option,")
w("--    including options not currently used, to mirror Airtable exactly).")
w("--  * Multi-select fields (Division Code, Designer Name) -> join tables.")
w("--  * 'Due Date' & 'Invoice Date' were stored as Airtable selects/text but")
w("--    hold real dates -> DATE. 'Date Completed' holds month-year labels")
w("--    (e.g. 'Jan 2026') -> kept as TEXT.")
w("--  * 'Rush' (single option 'Rush') -> BOOLEAN is_rush.")
w("--  * Financial/PO fields are empty in the source but retained for the app.")
w("--  * Attachment URLs from Airtable EXPIRE after a few hours; store files")
w("--    yourself and keep url only as a reference.")
w("-- ============================================================")
w("")
w("BEGIN;")
w("")

# ---- lookup tables ----
lookups=[
  ("project_id_letters","code","Project ID Letter"),
  ("project_types","name","Project Type"),
  ("project_statuses","name","Project Status"),
]
for tbl,col,fname in lookups:
    w(f"CREATE TABLE {tbl} (")
    w(f"    id   SMALLSERIAL PRIMARY KEY,")
    w(f"    {col} TEXT NOT NULL UNIQUE")
    w(");")
    for opt in choices(fname):
        w(f"INSERT INTO {tbl} ({col}) VALUES ('{esc(opt)}');")
    w("")

for tbl,col,fname in [("divisions","code","Division Code"),("designers","name","Designer Name")]:
    w(f"CREATE TABLE {tbl} (")
    w(f"    id   SMALLSERIAL PRIMARY KEY,")
    w(f"    {col} TEXT NOT NULL UNIQUE")
    w(");")
    for opt in used_multi(fname):
        w(f"INSERT INTO {tbl} ({col}) VALUES ('{esc(opt)}');")
    w("")

# ---- main table ----
w("CREATE TABLE jobs (")
w("    id                   BIGSERIAL PRIMARY KEY,")
w("    airtable_record_id   TEXT UNIQUE NOT NULL,")
w("    project_id           INTEGER,                       -- not unique in source")
w("    project_id_letter_id SMALLINT REFERENCES project_id_letters(id),")
w("    project_type_id      SMALLINT REFERENCES project_types(id),")
w("    project_status_id    SMALLINT REFERENCES project_statuses(id),")
w("    internal_client      TEXT,")
w("    project_name         TEXT,")
w("    date_in              DATE,")
w("    due_date             DATE,")
w("    comments             TEXT,")
w("    total_deliverables   INTEGER,")
w("    vendor               TEXT,")
w("    date_completed       TEXT,                          -- month-year label, e.g. 'Jan 2026'")
w("    is_rush              BOOLEAN NOT NULL DEFAULT FALSE,")
w("    -- financial / PO tracking (empty in source, reserved for the app)")
w("    program_id           TEXT,")
w("    gl_number            TEXT,")
w("    contract_number      TEXT,")
w("    quantity             TEXT,")
w("    po1_number           INTEGER,")
w("    po1_amount           NUMERIC(12,2),")
w("    po2_number           INTEGER,")
w("    po2_amount           NUMERIC(12,2),")
w("    invoice_date         DATE,")
w("    invoice_number       TEXT,")
w("    invoice_amount       NUMERIC(12,2),")
w("    postage_cost         NUMERIC(12,2),")
w("    airtable_created_at  TIMESTAMPTZ,")
w("    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),")
w("    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()")
w(");")
w("")

# ---- join tables ----
w("CREATE TABLE job_divisions (")
w("    job_id      BIGINT   NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,")
w("    division_id SMALLINT NOT NULL REFERENCES divisions(id),")
w("    PRIMARY KEY (job_id, division_id)")
w(");")
w("")
w("CREATE TABLE job_designers (")
w("    job_id      BIGINT   NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,")
w("    designer_id SMALLINT NOT NULL REFERENCES designers(id),")
w("    PRIMARY KEY (job_id, designer_id)")
w(");")
w("")

# ---- attachments ----
w("CREATE TABLE attachments (")
w("    id                     BIGSERIAL PRIMARY KEY,")
w("    job_id                 BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,")
w("    airtable_attachment_id TEXT UNIQUE,")
w("    filename               TEXT NOT NULL,")
w("    content_type           TEXT,")
w("    size_bytes             BIGINT,")
w("    storage_path           TEXT,          -- where you saved the file locally / in object storage")
w("    source_url             TEXT           -- original Airtable URL (EXPIRES)")
w(");")
w("")

# ---- indexes ----
w("CREATE INDEX idx_jobs_project_id      ON jobs(project_id);")
w("CREATE INDEX idx_jobs_status          ON jobs(project_status_id);")
w("CREATE INDEX idx_jobs_type            ON jobs(project_type_id);")
w("CREATE INDEX idx_jobs_date_in         ON jobs(date_in);")
w("CREATE INDEX idx_jobs_due_date        ON jobs(due_date);")
w("CREATE INDEX idx_attachments_job      ON attachments(job_id);")
w("")

# ---- view mirroring Creative Status ----
cs=[v for v in d['views'] if v['name']=='Creative Status'][0]
st=cs['filter']['conditions'][0]['values']; pt=cs['filter']['conditions'][1]['values']
w("-- View mirroring the Airtable 'Creative Status' view")
w("-- Filter: Project Status in ("+", ".join(st)+") AND Project Type in ("+", ".join(pt)+")")
w("CREATE VIEW creative_status AS")
w("SELECT j.*")
w("FROM   jobs j")
w("JOIN   project_statuses s ON s.id = j.project_status_id")
w("JOIN   project_types    t ON t.id = j.project_type_id")
w("WHERE  s.name IN ("+", ".join("'%s'"%esc(x) for x in st)+")")
w("  AND  t.name IN ("+", ".join("'%s'"%esc(x) for x in pt)+");")
w("")
w("COMMIT;")
w("")
w("-- ------------------------------------------------------------")
w("-- Loading the data: jobtracker_data.json has all 471 records with")
w("-- values already resolved (selects, dates, attachments). Example loader:")
w("--")
w("--   import json, psycopg2")
w("--   data = json.load(open('jobtracker_data.json'))")
w("--   # upsert lookups, then for each record insert into jobs and the")
w("--   # job_divisions / job_designers / attachments child rows.")
w("-- ------------------------------------------------------------")

open('jobtracker_schema.postgres.sql','w').write("\n".join(L))
print("lines:",len(L))
