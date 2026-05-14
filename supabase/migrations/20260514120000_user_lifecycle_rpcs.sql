-- Transactional helpers for user lifecycle (create/delete).
-- The Supabase auth.users record is created/deleted via the admin HTTP API and
-- cannot be wrapped in a database transaction. These RPCs make the *database*
-- side of each operation atomic, so callers only need to compensate for the
-- auth-side step.

-- Atomically insert a clients row after validating the company exists.
-- Returns the inserted client id.
CREATE OR REPLACE FUNCTION create_client_profile(
  p_user_id uuid,
  p_name text,
  p_email text,
  p_company_id uuid,
  p_enabled boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_exists boolean;
BEGIN
  IF p_user_id IS NULL OR p_name IS NULL OR p_email IS NULL OR p_company_id IS NULL THEN
    RAISE EXCEPTION 'missing required arguments';
  END IF;

  SELECT EXISTS(SELECT 1 FROM companies WHERE id = p_company_id) INTO v_company_exists;
  IF NOT v_company_exists THEN
    RAISE EXCEPTION 'company % not found', p_company_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO clients (id, name, email, enabled, company_id)
  VALUES (p_user_id, p_name, p_email, COALESCE(p_enabled, true), p_company_id);

  RETURN p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION create_client_profile(uuid, text, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_client_profile(uuid, text, text, uuid, boolean) TO service_role;

COMMENT ON FUNCTION create_client_profile(uuid, text, text, uuid, boolean) IS
  'Atomically validates company and inserts a clients row. Auth user must already exist.';


-- Atomically clean up all database references to a user prior to deleting the
-- auth user. Nullifies foreign refs in orders/order_history and removes the
-- clients row. The auth.users row must be deleted separately by the caller.
CREATE OR REPLACE FUNCTION delete_user_cascade(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing user id';
  END IF;

  UPDATE orders SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE order_history SET changed_by_id = NULL WHERE changed_by_id = p_user_id;
  DELETE FROM clients WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_user_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_user_cascade(uuid) TO service_role;

COMMENT ON FUNCTION delete_user_cascade(uuid) IS
  'Atomically nullifies user FKs and deletes the clients row. Caller must then delete auth.users.';
