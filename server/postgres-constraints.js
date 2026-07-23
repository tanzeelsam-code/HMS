export const APPEND_ONLY_CONSTRAINTS_SQL = `
CREATE OR REPLACE FUNCTION nexushos_reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_reject_mutation ON audit_events;
CREATE TRIGGER audit_events_reject_mutation
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION nexushos_reject_immutable_mutation();
`;

export const WEBHOOK_CONSTRAINTS_SQL = `
CREATE OR REPLACE FUNCTION nexushos_reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS webhook_events_reject_mutation ON webhook_events;
CREATE TRIGGER webhook_events_reject_mutation
BEFORE UPDATE OR DELETE ON webhook_events
FOR EACH ROW EXECUTE FUNCTION nexushos_reject_immutable_mutation();
`;

export const WORKFLOW_CONSTRAINTS_SQL = `
CREATE OR REPLACE FUNCTION nexushos_reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS workflow_audit_events_reject_mutation ON workflow_audit_events;
CREATE TRIGGER workflow_audit_events_reject_mutation
BEFORE UPDATE OR DELETE ON workflow_audit_events
FOR EACH ROW EXECUTE FUNCTION nexushos_reject_immutable_mutation();

CREATE OR REPLACE FUNCTION nexushos_reject_workflow_request_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    OLD.template_id, OLD.template_version, OLD.template_snapshot,
    OLD.idempotency_key, OLD.request_fingerprint, OLD.risk_level,
    OLD.approval_required, OLD.context, OLD.requested_by, OLD.requested_at
  ) IS DISTINCT FROM ROW(
    NEW.template_id, NEW.template_version, NEW.template_snapshot,
    NEW.idempotency_key, NEW.request_fingerprint, NEW.risk_level,
    NEW.approval_required, NEW.context, NEW.requested_by, NEW.requested_at
  ) THEN
    RAISE EXCEPTION 'workflow run request evidence is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflow_runs_immutable_request ON workflow_runs;
CREATE TRIGGER workflow_runs_immutable_request
BEFORE UPDATE ON workflow_runs
FOR EACH ROW EXECUTE FUNCTION nexushos_reject_workflow_request_rewrite();
`;
