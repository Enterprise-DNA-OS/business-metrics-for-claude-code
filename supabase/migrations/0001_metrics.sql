CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TABLE metrics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL CHECK(code ~ '^[A-Z][A-Z0-9_-]+$'),
 name text NOT NULL CHECK(length(trim(name))>0), unit text NOT NULL, kind text NOT NULL CHECK(kind IN ('sum','ratio')),
 direction text NOT NULL CHECK(direction IN ('higher','lower')), owner text NOT NULL, definition text NOT NULL,
 personal boolean NOT NULL DEFAULT false, purpose text NOT NULL DEFAULT '', review_on date, reviewed_at timestamptz,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind<>'ratio' OR unit='percent')
);
CREATE TABLE imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fingerprint text UNIQUE NOT NULL, source text NOT NULL, scope text NOT NULL,
 csv_text text NOT NULL, mapping jsonb NOT NULL, actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), metric_id uuid NOT NULL REFERENCES metrics(id),
 period date NOT NULL CHECK(extract(day from period)=1), segment text NOT NULL CHECK(length(trim(segment))>0),
 numerator numeric(20,4) NOT NULL, denominator numeric(20,4), source text NOT NULL, row_key text NOT NULL,
 evidence text NOT NULL, raw jsonb NOT NULL DEFAULT '{}', import_id uuid REFERENCES imports(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(metric_id,source,row_key), CHECK(denominator IS NULL OR denominator>0)
);
CREATE TABLE targets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), metric_id uuid NOT NULL REFERENCES metrics(id),
 period date NOT NULL CHECK(extract(day from period)=1), segment text NOT NULL, value numeric(20,4) NOT NULL,
 note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(metric_id,period,segment)
);
CREATE TABLE actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, metric_id uuid NOT NULL REFERENCES metrics(id),
 title text NOT NULL, owner text NOT NULL, due_on date NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 resolution text, closed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='open' AND closed_at IS NULL AND resolution IS NULL) OR (status='closed' AND closed_at IS NOT NULL AND length(trim(resolution))>0))
);
CREATE TABLE events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), metric_id uuid NOT NULL REFERENCES metrics(id), actor text NOT NULL,
 event text NOT NULL, detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only evidence'; END $$;
CREATE FUNCTION validate_observation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text;
BEGIN SELECT kind INTO k FROM metrics WHERE id=NEW.metric_id;
 IF k='ratio' AND NEW.denominator IS NULL THEN RAISE EXCEPTION 'Ratio requires a positive denominator'; END IF;
 IF k='sum' AND NEW.denominator IS NOT NULL THEN RAISE EXCEPTION 'Sum has no denominator'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER observation_shape BEFORE INSERT ON observations FOR EACH ROW EXECUTE FUNCTION validate_observation();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['metrics','imports','observations','targets','actions','events'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['imports','observations','events'] LOOP
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION immutable_record()',t);
 END LOOP;
END $$;
CREATE INDEX observation_period ON observations(metric_id,period,segment);
CREATE VIEW v_actuals AS
 SELECT m.id metric_id,o.period,o.segment,
 CASE WHEN m.kind='ratio' THEN round(sum(o.numerator)/NULLIF(sum(o.denominator),0)*100,4) ELSE sum(o.numerator) END actual,
 count(*) samples, max(o.created_at) loaded_at
 FROM observations o JOIN metrics m ON m.id=o.metric_id GROUP BY m.id,o.period,o.segment;
CREATE VIEW v_scorecard AS
 SELECT m.id metric_id,m.code,m.name,m.unit,m.direction,COALESCE(a.period,t.period) period,COALESCE(a.segment,t.segment) segment,
 a.actual,t.value target, a.actual-t.value variance,
 CASE WHEN t.value IS NULL OR t.value=0 OR a.actual IS NULL THEN NULL ELSE round((a.actual-t.value)/abs(t.value)*100,2) END variance_percent,
 CASE WHEN a.actual IS NULL THEN 'missing actual' WHEN t.value IS NULL THEN 'missing target'
 WHEN (m.direction='higher' AND a.actual<t.value) OR (m.direction='lower' AND a.actual>t.value) THEN 'off target' ELSE 'on target' END status,
 COALESCE(a.samples,0) samples,m.owner
 FROM v_actuals a FULL JOIN targets t ON t.metric_id=a.metric_id AND t.period=a.period AND t.segment=a.segment
 JOIN metrics m ON m.id=COALESCE(a.metric_id,t.metric_id);
CREATE VIEW v_latest AS SELECT DISTINCT ON(metric_id,segment) * FROM v_scorecard ORDER BY metric_id,segment,period DESC;
CREATE VIEW v_trends AS
 SELECT s.*,lag(actual) OVER(PARTITION BY metric_id,segment ORDER BY period) previous_actual,
 lag(period) OVER(PARTITION BY metric_id,segment ORDER BY period) previous_period,
 actual-lag(actual) OVER(PARTITION BY metric_id,segment ORDER BY period) change
 FROM v_scorecard s;
CREATE VIEW v_attention AS
 SELECT code,name,segment,period,status reason,owner FROM v_latest WHERE status<>'on target'
 UNION ALL SELECT code,name,segment,period,'stale period',owner FROM v_latest WHERE period<date_trunc('month',current_date)-interval '1 month'
 UNION ALL SELECT code,name,'All',NULL::date,'definition review overdue',owner FROM metrics WHERE review_on IS NULL OR review_on<current_date
 UNION ALL SELECT m.code,m.name,'All',NULL::date,'no observations',m.owner FROM metrics m WHERE NOT EXISTS(SELECT 1 FROM observations o WHERE o.metric_id=m.id)
 UNION ALL SELECT m.code,m.name,'All',a.due_on,'action overdue: '||a.code,a.owner FROM actions a JOIN metrics m ON m.id=a.metric_id WHERE a.status='open' AND a.due_on<current_date;
CREATE VIEW v_compliance AS
 SELECT code,'NZ-IPP9' rule,'Personal metric needs purpose and review date' finding FROM metrics WHERE personal AND (length(trim(purpose))=0 OR review_on IS NULL OR review_on<current_date)
 UNION ALL SELECT code,'NZ-IPP8','Review evidence missing or review overdue' FROM metrics WHERE personal AND (reviewed_at IS NULL OR review_on IS NULL OR review_on<current_date)
 UNION ALL SELECT code,'LOCAL-DEFINITION','Owner or definition missing' FROM metrics WHERE length(trim(owner))=0 OR length(trim(definition))=0
 UNION ALL SELECT m.code,'LOCAL-EVIDENCE','Observation evidence missing' FROM observations o JOIN metrics m ON m.id=o.metric_id WHERE length(trim(evidence))=0;
REVOKE ALL ON v_actuals,v_scorecard,v_latest,v_trends,v_attention,v_compliance FROM PUBLIC;
