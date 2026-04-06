-- Fixed-window rate limiting for API routes (server-side, service role only).
-- Keys are opaque strings built in application code (e.g. reset-password:ip:...:email:...).

CREATE TABLE IF NOT EXISTS api_rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window_start ON api_rate_limits (window_start);

-- Atomically increment counter for the current window and return whether the request is allowed.
CREATE OR REPLACE FUNCTION consume_rate_limit(
  p_key text,
  p_window_seconds int,
  p_limit int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window timestamptz;
  v_count int;
  v_retry_after int;
  v_mod bigint;
BEGIN
  IF p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'invalid window';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'invalid limit';
  END IF;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  ) AT TIME ZONE 'UTC';

  INSERT INTO api_rate_limits (key, window_start, request_count)
  VALUES (p_key, v_window, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET
    request_count = api_rate_limits.request_count + 1,
    updated_at = now()
  RETURNING request_count INTO v_count;

  v_mod := (extract(epoch from now())::bigint % p_window_seconds);
  v_retry_after := p_window_seconds - v_mod::int;
  IF v_retry_after = 0 THEN
    v_retry_after := p_window_seconds;
  END IF;

  IF v_count > p_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'current_count', v_count,
      'retry_after_seconds', v_retry_after
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current_count', v_count,
    'retry_after_seconds', 0
  );
END;
$$;

COMMENT ON TABLE api_rate_limits IS 'Fixed-window counters for API rate limiting; keys are application-defined.';
COMMENT ON FUNCTION consume_rate_limit(text, int, int) IS 'Increments counter for key in current window; returns allowed and retry_after_seconds.';

REVOKE ALL ON FUNCTION consume_rate_limit(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_rate_limit(text, int, int) TO service_role;
