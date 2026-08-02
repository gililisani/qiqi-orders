--
-- PostgreSQL database dump
--

\restrict QidjqDjuDpgm6CoiiDBNqL8SlUZnq75FQFR9QALLj4FX2J4FYs1Ic1h89pfVE7c

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: dam_asset_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dam_asset_type AS ENUM (
    'image',
    'video',
    'document',
    'audio',
    'archive',
    'other'
);


--
-- Name: dam_processing_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dam_processing_status AS ENUM (
    'pending',
    'processing',
    'complete',
    'failed'
);


--
-- Name: auth_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_company_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT company_id FROM public.clients
  WHERE id = auth.uid() AND enabled = true
  LIMIT 1;
$$;


--
-- Name: auth_has_permission(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_has_permission(p_perm text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
     WHERE id = auth.uid()
       AND enabled = true
       AND p_perm = ANY(permissions)
  )
  OR EXISTS (
    SELECT 1 FROM public.clients
     WHERE id = auth.uid()
       AND enabled = true
       AND p_perm = ANY(permissions)
  );
$$;


--
-- Name: FUNCTION auth_has_permission(p_perm text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.auth_has_permission(p_perm text) IS 'Returns true if the calling auth.uid() has the named permission in either admins.permissions or clients.permissions. Used in RLS policies and via callable from the application (granted to authenticated).';


--
-- Name: auth_is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid() AND enabled = true
  );
$$;


--
-- Name: calculate_target_period_progress(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_target_period_progress(p_company_id uuid, p_start_date date, p_end_date date) RETURNS numeric
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  total_amount DECIMAL(15,2);
BEGIN
  -- Calculate total from DONE orders (excluding cancelled) within the date range
  -- Exclude support funds from the calculation
  SELECT COALESCE(SUM(total_value - COALESCE(support_fund_used, 0)), 0)
  INTO total_amount
  FROM orders
  WHERE company_id = p_company_id
    AND status = 'Done'
    AND created_at::DATE >= p_start_date
    AND created_at::DATE <= p_end_date;
  
  RETURN total_amount;
END;
$$;


--
-- Name: consume_rate_limit(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_rate_limit(p_key text, p_window_seconds integer, p_limit integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: FUNCTION consume_rate_limit(p_key text, p_window_seconds integer, p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.consume_rate_limit(p_key text, p_window_seconds integer, p_limit integer) IS 'Increments counter for key in current window; returns allowed and retry_after_seconds.';


--
-- Name: create_client_profile(uuid, text, text, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_client_profile(p_user_id uuid, p_name text, p_email text, p_company_id uuid, p_enabled boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: FUNCTION create_client_profile(p_user_id uuid, p_name text, p_email text, p_company_id uuid, p_enabled boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_client_profile(p_user_id uuid, p_name text, p_email text, p_company_id uuid, p_enabled boolean) IS 'Atomically validates company and inserts a clients row. Auth user must already exist.';


--
-- Name: dam_job_queue_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dam_job_queue_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: dam_set_current_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dam_set_current_version() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  UPDATE dam_assets
  SET current_version_id = NEW.id,
      updated_at = now()
  WHERE id = NEW.asset_id;

  RETURN NEW;
END;
$$;


--
-- Name: dam_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dam_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: dam_update_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dam_update_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce((SELECT da.title FROM dam_assets da WHERE da.id = NEW.asset_id), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.extracted_text, '')), 'B');
  RETURN NEW;
END;
$$;


--
-- Name: delete_user_cascade(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_user_cascade(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: FUNCTION delete_user_cascade(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.delete_user_cascade(p_user_id uuid) IS 'Atomically nullifies user FKs and deletes the clients row. Caller must then delete auth.users.';


--
-- Name: generate_sli_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_sli_number() RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  next_number INTEGER;
BEGIN
  -- Get the highest SLI number and add 1, starting from 100000
  SELECT COALESCE(MAX(sli_number), 99999) + 1 INTO next_number
  FROM standalone_slis;
  
  RETURN next_number;
END;
$$;


--
-- Name: get_countries_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_countries_list() RETURNS TABLE(country_code character varying, country_name character varying)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 'AD'::VARCHAR(2) as country_code, 'Andorra'::VARCHAR(100) as country_name
  UNION ALL SELECT 'AE', 'United Arab Emirates'
  UNION ALL SELECT 'AF', 'Afghanistan'
  UNION ALL SELECT 'AG', 'Antigua and Barbuda'
  UNION ALL SELECT 'AI', 'Anguilla'
  UNION ALL SELECT 'AL', 'Albania'
  UNION ALL SELECT 'AM', 'Armenia'
  UNION ALL SELECT 'AO', 'Angola'
  UNION ALL SELECT 'AQ', 'Antarctica'
  UNION ALL SELECT 'AR', 'Argentina'
  UNION ALL SELECT 'AS', 'American Samoa'
  UNION ALL SELECT 'AT', 'Austria'
  UNION ALL SELECT 'AU', 'Australia'
  UNION ALL SELECT 'AW', 'Aruba'
  UNION ALL SELECT 'AX', 'Åland Islands'
  UNION ALL SELECT 'AZ', 'Azerbaijan'
  UNION ALL SELECT 'BA', 'Bosnia and Herzegovina'
  UNION ALL SELECT 'BB', 'Barbados'
  UNION ALL SELECT 'BD', 'Bangladesh'
  UNION ALL SELECT 'BE', 'Belgium'
  UNION ALL SELECT 'BF', 'Burkina Faso'
  UNION ALL SELECT 'BG', 'Bulgaria'
  UNION ALL SELECT 'BH', 'Bahrain'
  UNION ALL SELECT 'BI', 'Burundi'
  UNION ALL SELECT 'BJ', 'Benin'
  UNION ALL SELECT 'BL', 'Saint Barthélemy'
  UNION ALL SELECT 'BM', 'Bermuda'
  UNION ALL SELECT 'BN', 'Brunei'
  UNION ALL SELECT 'BO', 'Bolivia'
  UNION ALL SELECT 'BQ', 'Caribbean Netherlands'
  UNION ALL SELECT 'BR', 'Brazil'
  UNION ALL SELECT 'BS', 'Bahamas'
  UNION ALL SELECT 'BT', 'Bhutan'
  UNION ALL SELECT 'BV', 'Bouvet Island'
  UNION ALL SELECT 'BW', 'Botswana'
  UNION ALL SELECT 'BY', 'Belarus'
  UNION ALL SELECT 'BZ', 'Belize'
  UNION ALL SELECT 'CA', 'Canada'
  UNION ALL SELECT 'CC', 'Cocos Islands'
  UNION ALL SELECT 'CD', 'Democratic Republic of the Congo'
  UNION ALL SELECT 'CF', 'Central African Republic'
  UNION ALL SELECT 'CG', 'Republic of the Congo'
  UNION ALL SELECT 'CH', 'Switzerland'
  UNION ALL SELECT 'CI', 'Côte d''Ivoire'
  UNION ALL SELECT 'CK', 'Cook Islands'
  UNION ALL SELECT 'CL', 'Chile'
  UNION ALL SELECT 'CM', 'Cameroon'
  UNION ALL SELECT 'CN', 'China'
  UNION ALL SELECT 'CO', 'Colombia'
  UNION ALL SELECT 'CR', 'Costa Rica'
  UNION ALL SELECT 'CU', 'Cuba'
  UNION ALL SELECT 'CV', 'Cape Verde'
  UNION ALL SELECT 'CW', 'Curaçao'
  UNION ALL SELECT 'CX', 'Christmas Island'
  UNION ALL SELECT 'CY', 'Cyprus'
  UNION ALL SELECT 'CZ', 'Czech Republic'
  UNION ALL SELECT 'DE', 'Germany'
  UNION ALL SELECT 'DJ', 'Djibouti'
  UNION ALL SELECT 'DK', 'Denmark'
  UNION ALL SELECT 'DM', 'Dominica'
  UNION ALL SELECT 'DO', 'Dominican Republic'
  UNION ALL SELECT 'DZ', 'Algeria'
  UNION ALL SELECT 'EC', 'Ecuador'
  UNION ALL SELECT 'EE', 'Estonia'
  UNION ALL SELECT 'EG', 'Egypt'
  UNION ALL SELECT 'EH', 'Western Sahara'
  UNION ALL SELECT 'ER', 'Eritrea'
  UNION ALL SELECT 'ES', 'Spain'
  UNION ALL SELECT 'ET', 'Ethiopia'
  UNION ALL SELECT 'FI', 'Finland'
  UNION ALL SELECT 'FJ', 'Fiji'
  UNION ALL SELECT 'FK', 'Falkland Islands'
  UNION ALL SELECT 'FM', 'Micronesia'
  UNION ALL SELECT 'FO', 'Faroe Islands'
  UNION ALL SELECT 'FR', 'France'
  UNION ALL SELECT 'GA', 'Gabon'
  UNION ALL SELECT 'GB', 'United Kingdom'
  UNION ALL SELECT 'GD', 'Grenada'
  UNION ALL SELECT 'GE', 'Georgia'
  UNION ALL SELECT 'GF', 'French Guiana'
  UNION ALL SELECT 'GG', 'Guernsey'
  UNION ALL SELECT 'GH', 'Ghana'
  UNION ALL SELECT 'GI', 'Gibraltar'
  UNION ALL SELECT 'GL', 'Greenland'
  UNION ALL SELECT 'GM', 'Gambia'
  UNION ALL SELECT 'GN', 'Guinea'
  UNION ALL SELECT 'GP', 'Guadeloupe'
  UNION ALL SELECT 'GQ', 'Equatorial Guinea'
  UNION ALL SELECT 'GR', 'Greece'
  UNION ALL SELECT 'GS', 'South Georgia and the South Sandwich Islands'
  UNION ALL SELECT 'GT', 'Guatemala'
  UNION ALL SELECT 'GU', 'Guam'
  UNION ALL SELECT 'GW', 'Guinea-Bissau'
  UNION ALL SELECT 'GY', 'Guyana'
  UNION ALL SELECT 'HK', 'Hong Kong'
  UNION ALL SELECT 'HM', 'Heard Island and McDonald Islands'
  UNION ALL SELECT 'HN', 'Honduras'
  UNION ALL SELECT 'HR', 'Croatia'
  UNION ALL SELECT 'HT', 'Haiti'
  UNION ALL SELECT 'HU', 'Hungary'
  UNION ALL SELECT 'ID', 'Indonesia'
  UNION ALL SELECT 'IE', 'Ireland'
  UNION ALL SELECT 'IL', 'Israel'
  UNION ALL SELECT 'IM', 'Isle of Man'
  UNION ALL SELECT 'IN', 'India'
  UNION ALL SELECT 'IO', 'British Indian Ocean Territory'
  UNION ALL SELECT 'IQ', 'Iraq'
  UNION ALL SELECT 'IR', 'Iran'
  UNION ALL SELECT 'IS', 'Iceland'
  UNION ALL SELECT 'IT', 'Italy'
  UNION ALL SELECT 'JE', 'Jersey'
  UNION ALL SELECT 'JM', 'Jamaica'
  UNION ALL SELECT 'JO', 'Jordan'
  UNION ALL SELECT 'JP', 'Japan'
  UNION ALL SELECT 'KE', 'Kenya'
  UNION ALL SELECT 'KG', 'Kyrgyzstan'
  UNION ALL SELECT 'KH', 'Cambodia'
  UNION ALL SELECT 'KI', 'Kiribati'
  UNION ALL SELECT 'KM', 'Comoros'
  UNION ALL SELECT 'KN', 'Saint Kitts and Nevis'
  UNION ALL SELECT 'KP', 'North Korea'
  UNION ALL SELECT 'KR', 'South Korea'
  UNION ALL SELECT 'KW', 'Kuwait'
  UNION ALL SELECT 'KY', 'Cayman Islands'
  UNION ALL SELECT 'KZ', 'Kazakhstan'
  UNION ALL SELECT 'LA', 'Laos'
  UNION ALL SELECT 'LB', 'Lebanon'
  UNION ALL SELECT 'LC', 'Saint Lucia'
  UNION ALL SELECT 'LI', 'Liechtenstein'
  UNION ALL SELECT 'LK', 'Sri Lanka'
  UNION ALL SELECT 'LR', 'Liberia'
  UNION ALL SELECT 'LS', 'Lesotho'
  UNION ALL SELECT 'LT', 'Lithuania'
  UNION ALL SELECT 'LU', 'Luxembourg'
  UNION ALL SELECT 'LV', 'Latvia'
  UNION ALL SELECT 'LY', 'Libya'
  UNION ALL SELECT 'MA', 'Morocco'
  UNION ALL SELECT 'MC', 'Monaco'
  UNION ALL SELECT 'MD', 'Moldova'
  UNION ALL SELECT 'ME', 'Montenegro'
  UNION ALL SELECT 'MF', 'Saint Martin'
  UNION ALL SELECT 'MG', 'Madagascar'
  UNION ALL SELECT 'MH', 'Marshall Islands'
  UNION ALL SELECT 'MK', 'North Macedonia'
  UNION ALL SELECT 'ML', 'Mali'
  UNION ALL SELECT 'MM', 'Myanmar'
  UNION ALL SELECT 'MN', 'Mongolia'
  UNION ALL SELECT 'MO', 'Macao'
  UNION ALL SELECT 'MP', 'Northern Mariana Islands'
  UNION ALL SELECT 'MQ', 'Martinique'
  UNION ALL SELECT 'MR', 'Mauritania'
  UNION ALL SELECT 'MS', 'Montserrat'
  UNION ALL SELECT 'MT', 'Malta'
  UNION ALL SELECT 'MU', 'Mauritius'
  UNION ALL SELECT 'MV', 'Maldives'
  UNION ALL SELECT 'MW', 'Malawi'
  UNION ALL SELECT 'MX', 'Mexico'
  UNION ALL SELECT 'MY', 'Malaysia'
  UNION ALL SELECT 'MZ', 'Mozambique'
  UNION ALL SELECT 'NA', 'Namibia'
  UNION ALL SELECT 'NC', 'New Caledonia'
  UNION ALL SELECT 'NE', 'Niger'
  UNION ALL SELECT 'NF', 'Norfolk Island'
  UNION ALL SELECT 'NG', 'Nigeria'
  UNION ALL SELECT 'NI', 'Nicaragua'
  UNION ALL SELECT 'NL', 'Netherlands'
  UNION ALL SELECT 'NO', 'Norway'
  UNION ALL SELECT 'NP', 'Nepal'
  UNION ALL SELECT 'NR', 'Nauru'
  UNION ALL SELECT 'NU', 'Niue'
  UNION ALL SELECT 'NZ', 'New Zealand'
  UNION ALL SELECT 'OM', 'Oman'
  UNION ALL SELECT 'PA', 'Panama'
  UNION ALL SELECT 'PE', 'Peru'
  UNION ALL SELECT 'PF', 'French Polynesia'
  UNION ALL SELECT 'PG', 'Papua New Guinea'
  UNION ALL SELECT 'PH', 'Philippines'
  UNION ALL SELECT 'PK', 'Pakistan'
  UNION ALL SELECT 'PL', 'Poland'
  UNION ALL SELECT 'PM', 'Saint Pierre and Miquelon'
  UNION ALL SELECT 'PN', 'Pitcairn Islands'
  UNION ALL SELECT 'PR', 'Puerto Rico'
  UNION ALL SELECT 'PS', 'Palestine'
  UNION ALL SELECT 'PT', 'Portugal'
  UNION ALL SELECT 'PW', 'Palau'
  UNION ALL SELECT 'PY', 'Paraguay'
  UNION ALL SELECT 'QA', 'Qatar'
  UNION ALL SELECT 'RE', 'Réunion'
  UNION ALL SELECT 'RO', 'Romania'
  UNION ALL SELECT 'RS', 'Serbia'
  UNION ALL SELECT 'RU', 'Russia'
  UNION ALL SELECT 'RW', 'Rwanda'
  UNION ALL SELECT 'SA', 'Saudi Arabia'
  UNION ALL SELECT 'SB', 'Solomon Islands'
  UNION ALL SELECT 'SC', 'Seychelles'
  UNION ALL SELECT 'SD', 'Sudan'
  UNION ALL SELECT 'SE', 'Sweden'
  UNION ALL SELECT 'SG', 'Singapore'
  UNION ALL SELECT 'SH', 'Saint Helena'
  UNION ALL SELECT 'SI', 'Slovenia'
  UNION ALL SELECT 'SJ', 'Svalbard and Jan Mayen'
  UNION ALL SELECT 'SK', 'Slovakia'
  UNION ALL SELECT 'SL', 'Sierra Leone'
  UNION ALL SELECT 'SM', 'San Marino'
  UNION ALL SELECT 'SN', 'Senegal'
  UNION ALL SELECT 'SO', 'Somalia'
  UNION ALL SELECT 'SR', 'Suriname'
  UNION ALL SELECT 'SS', 'South Sudan'
  UNION ALL SELECT 'ST', 'São Tomé and Príncipe'
  UNION ALL SELECT 'SV', 'El Salvador'
  UNION ALL SELECT 'SX', 'Sint Maarten'
  UNION ALL SELECT 'SY', 'Syria'
  UNION ALL SELECT 'SZ', 'Eswatini'
  UNION ALL SELECT 'TC', 'Turks and Caicos Islands'
  UNION ALL SELECT 'TD', 'Chad'
  UNION ALL SELECT 'TF', 'French Southern Territories'
  UNION ALL SELECT 'TG', 'Togo'
  UNION ALL SELECT 'TH', 'Thailand'
  UNION ALL SELECT 'TJ', 'Tajikistan'
  UNION ALL SELECT 'TK', 'Tokelau'
  UNION ALL SELECT 'TL', 'Timor-Leste'
  UNION ALL SELECT 'TM', 'Turkmenistan'
  UNION ALL SELECT 'TN', 'Tunisia'
  UNION ALL SELECT 'TO', 'Tonga'
  UNION ALL SELECT 'TR', 'Turkey'
  UNION ALL SELECT 'TT', 'Trinidad and Tobago'
  UNION ALL SELECT 'TV', 'Tuvalu'
  UNION ALL SELECT 'TW', 'Taiwan'
  UNION ALL SELECT 'TZ', 'Tanzania'
  UNION ALL SELECT 'UA', 'Ukraine'
  UNION ALL SELECT 'UG', 'Uganda'
  UNION ALL SELECT 'UM', 'United States Minor Outlying Islands'
  UNION ALL SELECT 'US', 'United States'
  UNION ALL SELECT 'UY', 'Uruguay'
  UNION ALL SELECT 'UZ', 'Uzbekistan'
  UNION ALL SELECT 'VA', 'Vatican City'
  UNION ALL SELECT 'VC', 'Saint Vincent and the Grenadines'
  UNION ALL SELECT 'VE', 'Venezuela'
  UNION ALL SELECT 'VG', 'British Virgin Islands'
  UNION ALL SELECT 'VI', 'United States Virgin Islands'
  UNION ALL SELECT 'VN', 'Vietnam'
  UNION ALL SELECT 'VU', 'Vanuatu'
  UNION ALL SELECT 'WF', 'Wallis and Futuna'
  UNION ALL SELECT 'WS', 'Samoa'
  UNION ALL SELECT 'YE', 'Yemen'
  UNION ALL SELECT 'YT', 'Mayotte'
  UNION ALL SELECT 'ZA', 'South Africa'
  UNION ALL SELECT 'ZM', 'Zambia'
  UNION ALL SELECT 'ZW', 'Zimbabwe'
  ORDER BY country_name;
END;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admins a
    WHERE a.id = auth.uid()
  );
$$;


--
-- Name: list_client_dam_assets_entitled(uuid, text, text, uuid, uuid, text, text, text, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_client_dam_assets_entitled(p_user_id uuid, p_q text DEFAULT ''::text, p_type text DEFAULT ''::text, p_asset_type_id uuid DEFAULT NULL::uuid, p_asset_subtype_id uuid DEFAULT NULL::uuid, p_product_line text DEFAULT ''::text, p_product_name text DEFAULT ''::text, p_locale_code text DEFAULT ''::text, p_region_code text DEFAULT ''::text, p_tag text DEFAULT ''::text, p_page integer DEFAULT 1, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid;
  v_offset int;
  v_asset_type_slug text;
BEGIN
  v_offset := GREATEST(0, (GREATEST(1, COALESCE(p_page, 1)) - 1) * GREATEST(1, COALESCE(p_limit, 50)));

  SELECT c.company_id
    INTO v_company_id
  FROM clients c
  WHERE c.id = p_user_id
    AND c.enabled = true
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('assets', '[]'::jsonb, 'total', 0);
  END IF;

  -- Resolve asset type slug so UUID-based UI filters also match legacy rows that only have `asset_type`.
  v_asset_type_slug := NULL;
  IF p_asset_type_id IS NOT NULL THEN
    SELECT t.slug
      INTO v_asset_type_slug
    FROM dam_asset_types t
    WHERE t.id = p_asset_type_id
    LIMIT 1;
  END IF;

  RETURN (
    WITH base AS (
      SELECT
        a.id,
        a.title,
        a.description,
        a.asset_type,
        a.asset_type_id,
        a.asset_subtype_id,
        a.product_line,
        a.product_name,
        a.sku,
        a.vimeo_video_id,
        a.vimeo_download_1080p,
        a.vimeo_download_720p,
        a.vimeo_download_480p,
        a.vimeo_download_360p,
        a.created_at,
        a.search_tags
      FROM dam_assets a
      WHERE a.is_archived = false
        AND (COALESCE(p_type, '') = '' OR a.asset_type::text = p_type)
        AND (
          p_asset_type_id IS NULL
          OR a.asset_type_id = p_asset_type_id
          OR (COALESCE(v_asset_type_slug, '') <> '' AND a.asset_type::text = v_asset_type_slug)
        )
        AND (p_asset_subtype_id IS NULL OR a.asset_subtype_id = p_asset_subtype_id)
        AND (COALESCE(p_product_line, '') = '' OR a.product_line ILIKE ('%' || p_product_line || '%'))
        AND (COALESCE(p_product_name, '') = '' OR a.product_name ILIKE ('%' || p_product_name || '%'))
        AND (
          COALESCE(p_q, '') = '' OR
          a.title ILIKE ('%' || p_q || '%') OR
          a.description ILIKE ('%' || p_q || '%') OR
          a.product_line ILIKE ('%' || p_q || '%') OR
          a.product_name ILIKE ('%' || p_q || '%') OR
          a.sku ILIKE ('%' || p_q || '%')
        )
        -- Optional UI filters (applied here so pagination remains correct)
        AND (
          COALESCE(p_locale_code, '') = '' OR EXISTS (
            SELECT 1
            FROM dam_asset_locale_map alm
            WHERE alm.asset_id = a.id AND alm.locale_code = p_locale_code
          )
        )
        AND (
          COALESCE(p_region_code, '') = '' OR EXISTS (
            SELECT 1
            FROM dam_asset_region_map arm
            WHERE arm.asset_id = a.id AND arm.region_code = p_region_code
          )
        )
        AND (
          COALESCE(p_tag, '') = '' OR EXISTS (
            SELECT 1
            FROM dam_asset_tag_map atm
            JOIN dam_tags dt ON dt.id = atm.tag_id
            WHERE atm.asset_id = a.id AND dt.label ILIKE ('%' || p_tag || '%')
          )
        )
    ),
    latest_version AS (
      SELECT DISTINCT ON (v.asset_id)
        v.asset_id,
        v.id,
        v.version_number,
        v.storage_path,
        v.thumbnail_path,
        v.mime_type,
        v.file_size,
        v.processing_status,
        v.created_at,
        v.duration_seconds,
        v.width,
        v.height,
        v.extracted_text
      FROM dam_asset_versions v
      JOIN base b ON b.id = v.asset_id
      ORDER BY v.asset_id, v.version_number DESC
    ),
    rows AS (
      SELECT
        b.*,
        jsonb_build_object(
          'id', lv.id,
          'version_number', lv.version_number,
          'storage_path', lv.storage_path,
          'thumbnail_path', lv.thumbnail_path,
          'mime_type', lv.mime_type,
          'file_size', lv.file_size,
          'processing_status', COALESCE(lv.processing_status, 'complete'),
          'created_at', lv.created_at,
          'duration_seconds', lv.duration_seconds,
          'width', lv.width,
          'height', lv.height,
          'extracted_text', lv.extracted_text
        ) AS current_version,
        COUNT(*) OVER() AS total_count
      FROM base b
      LEFT JOIN latest_version lv ON lv.asset_id = b.id
      ORDER BY b.created_at DESC
      OFFSET v_offset
      LIMIT GREATEST(1, COALESCE(p_limit, 50))
    )
    SELECT jsonb_build_object(
      'assets', COALESCE(jsonb_agg(to_jsonb(rows) - 'total_count'), '[]'::jsonb),
      'total', COALESCE(MAX(rows.total_count), 0)
    )
    FROM rows
  );
END;
$$;


--
-- Name: refresh_executive_reports(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_executive_reports() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_sales;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_company_sales;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_product_sales;
END;
$$;


--
-- Name: update_all_target_periods_progress(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_all_target_periods_progress() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  -- Update progress for all target periods of the company
  UPDATE target_periods
  SET current_progress = calculate_target_period_progress(
    COALESCE(NEW.company_id, OLD.company_id),
    start_date,
    end_date
  )
  WHERE company_id = COALESCE(NEW.company_id, OLD.company_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_historical_sales_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_historical_sales_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_standalone_slis_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_standalone_slis_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Locations" (
    location_name text,
    country text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    netsuite_id text,
    subsidiary_id uuid
);


--
-- Name: COLUMN "Locations".subsidiary_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Locations".subsidiary_id IS 'The subsidiary that owns this location. Used by push-SO to detect cross-subsidiary fulfillment: when the order''s company.subsidiary_id differs from location.subsidiary_id, push-SO sets per-line location in the NetSuite SO payload so NS auto-populates the inventory subsidiary.';


--
-- Name: Products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Products" (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    picture_url text,
    item_name text,
    netsuite_name text,
    sku text,
    upc text,
    size text,
    case_pack integer NOT NULL,
    price_international numeric,
    price_americas numeric,
    enable boolean,
    list_in_support_funds boolean,
    visible_to_americas boolean DEFAULT true,
    visible_to_international boolean DEFAULT true,
    qualifies_for_credit_earning boolean DEFAULT true NOT NULL,
    case_weight numeric(10,2),
    hs_code text,
    made_in text,
    sort_order integer DEFAULT 0,
    category_id integer,
    out_of_stock boolean DEFAULT false NOT NULL,
    CONSTRAINT products_case_pack_positive CHECK ((case_pack > 0))
);


--
-- Name: COLUMN "Products".netsuite_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Products".netsuite_name IS 'Optional NetSuite item name override. If null, the SKU is used to resolve the NS item.';


--
-- Name: COLUMN "Products".case_weight; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Products".case_weight IS 'Weight of one case in kilograms (for packing list calculations)';


--
-- Name: COLUMN "Products".hs_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Products".hs_code IS 'Harmonized System Code for international customs and shipping';


--
-- Name: COLUMN "Products".made_in; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Products".made_in IS 'Country of origin/manufacture for customs documentation';


--
-- Name: COLUMN "Products".sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Products".sort_order IS 'Display order for products in Order Form (lower numbers appear first)';


--
-- Name: COLUMN "Products".category_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Products".category_id IS 'Foreign key reference to categories table';


--
-- Name: COLUMN "Products".out_of_stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Products".out_of_stock IS 'If true, product is out of stock and should display "Out of Stock" message in order forms.';


--
-- Name: Products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."Products" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Products_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: admin_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    content text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE admin_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.admin_notes IS 'Admin-only internal notes about companies';


--
-- Name: admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    totp_secret text,
    recovery_codes text[],
    two_factor_enabled boolean DEFAULT false,
    two_factor_verified_at timestamp with time zone,
    permissions text[] DEFAULT ARRAY[]::text[] NOT NULL
);


--
-- Name: COLUMN admins.totp_secret; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admins.totp_secret IS 'TOTP secret key for 2FA authentication';


--
-- Name: COLUMN admins.recovery_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admins.recovery_codes IS 'Array of recovery codes for 2FA backup';


--
-- Name: COLUMN admins.two_factor_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admins.two_factor_enabled IS 'Whether 2FA is enabled for this admin';


--
-- Name: COLUMN admins.two_factor_verified_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admins.two_factor_verified_at IS 'When 2FA was last verified';


--
-- Name: COLUMN admins.permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admins.permissions IS 'Atomic, area-scoped permission strings (e.g. dam, orders, admins:manage). See lib/permissions.ts for the canonical vocabulary. Empty array = no access. Empty by default; backfilled to ALL permissions for existing rows below.';


--
-- Name: amazon_fba_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.amazon_fba_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period text NOT NULL,
    status text DEFAULT 'pushing'::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    ns_refs jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'csv'::text NOT NULL,
    audit jsonb,
    CONSTRAINT amazon_fba_batches_source_check CHECK ((source = ANY (ARRAY['csv'::text, 'api'::text]))),
    CONSTRAINT amazon_fba_batches_status_check CHECK ((status = ANY (ARRAY['prepared'::text, 'pushing'::text, 'pushed'::text, 'failed'::text])))
);


--
-- Name: TABLE amazon_fba_batches; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.amazon_fba_batches IS 'One row per Amazon month pushed to NetSuite. UNIQUE(period) is the first idempotency layer; NS external IDs (AMAZON-FBA-*) are the second.';


--
-- Name: COLUMN amazon_fba_batches.audit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.amazon_fba_batches.audit IS 'Latest CSV verification: { verified_at, verified_by, verified_by_name, all_green, rows: [{label, csv, ns, match}] }. See docs/AMAZON_CSV_VERIFICATION.md.';


--
-- Name: amazon_fba_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.amazon_fba_config (
    id smallint DEFAULT 1 NOT NULL,
    customer_ns_id text DEFAULT ''::text NOT NULL,
    vendor_ns_id text DEFAULT ''::text NOT NULL,
    subsidiary_ns_id text DEFAULT ''::text NOT NULL,
    location_ns_id text DEFAULT ''::text NOT NULL,
    currency_ns_id text DEFAULT ''::text NOT NULL,
    class_name text DEFAULT ''::text NOT NULL,
    bank_account_ns_id text DEFAULT ''::text NOT NULL,
    platform_fees_account_ns_id text DEFAULT ''::text NOT NULL,
    advertising_account_ns_id text DEFAULT ''::text NOT NULL,
    writeoff_account_ns_id text DEFAULT ''::text NOT NULL,
    refund_item_ns_id text DEFAULT ''::text NOT NULL,
    discount_item_ns_id text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_push boolean DEFAULT false NOT NULL,
    notify_email text DEFAULT 'billing@qiqiglobal.com'::text NOT NULL,
    CONSTRAINT amazon_fba_config_id_check CHECK ((id = 1))
);


--
-- Name: TABLE amazon_fba_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.amazon_fba_config IS 'NetSuite internal IDs used by the Amazon FBA import. Empty string = not yet resolved; the settings panel fills gaps once role permissions allow.';


--
-- Name: COLUMN amazon_fba_config.auto_push; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.amazon_fba_config.auto_push IS 'When TRUE the monthly cron pushes a prepared month to NetSuite automatically — but only when it reconciles, all SKUs are mapped, and config is complete. Otherwise it always waits for admin approval.';


--
-- Name: COLUMN amazon_fba_config.notify_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.amazon_fba_config.notify_email IS 'Where the monthly cron sends its prepared/pushed/failed notifications.';


--
-- Name: amazon_item_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.amazon_item_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    amazon_name text NOT NULL,
    ns_item_id text NOT NULL,
    ns_item_name text NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT amazon_item_map_unit_price_check CHECK ((unit_price > (0)::numeric))
);


--
-- Name: TABLE amazon_item_map; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.amazon_item_map IS 'Maps Amazon report product names (often truncated) to NetSuite items. unit_price infers quantity: qty = product charge / unit_price.';


--
-- Name: api_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_rate_limits (
    key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    request_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE api_rate_limits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.api_rate_limits IS 'Fixed-window counters for API rate limiting; keys are application-defined.';


--
-- Name: campaign_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_assets (
    campaign_id uuid NOT NULL,
    asset_id uuid NOT NULL
);


--
-- Name: TABLE campaign_assets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.campaign_assets IS 'Junction table linking campaigns to assets';


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    thumbnail_asset_id uuid,
    product_line text,
    start_date date,
    end_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT campaigns_product_line_check CHECK ((product_line = ANY (ARRAY['ProCtrl'::text, 'SelfCtrl'::text, 'Both'::text, 'None'::text])))
);


--
-- Name: TABLE campaigns; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.campaigns IS 'Campaigns are named groups of assets';


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    visible_to_americas boolean DEFAULT true,
    visible_to_international boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    image_url text
);


--
-- Name: TABLE categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.categories IS 'Product categories for organizing products in order forms and packing lists';


--
-- Name: COLUMN categories.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.name IS 'Category name (e.g., ProCtrl, SelfCtrl, KITS, Accessories)';


--
-- Name: COLUMN categories.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.description IS 'Optional description of the category';


--
-- Name: COLUMN categories.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.sort_order IS 'Display order of categories (lower numbers appear first)';


--
-- Name: COLUMN categories.visible_to_americas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.visible_to_americas IS 'Whether this category is visible to Americas clients';


--
-- Name: COLUMN categories.visible_to_international; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.visible_to_international IS 'Whether this category is visible to International clients';


--
-- Name: COLUMN categories.image_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.image_url IS 'URL of the category image for visual display in order forms and admin interfaces';


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    name text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: client_note_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_note_views (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    client_id uuid NOT NULL,
    note_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE client_note_views; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.client_note_views IS 'Tracks which company notes have been viewed by each client user. Used to show new note indicators.';


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true,
    company_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    totp_secret text,
    recovery_codes text[],
    two_factor_enabled boolean DEFAULT false,
    two_factor_verified_at timestamp with time zone,
    password_changed boolean DEFAULT false,
    permissions text[] DEFAULT ARRAY[]::text[] NOT NULL
);


--
-- Name: COLUMN clients.totp_secret; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.totp_secret IS 'TOTP secret key for 2FA authentication';


--
-- Name: COLUMN clients.recovery_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.recovery_codes IS 'Array of recovery codes for 2FA backup';


--
-- Name: COLUMN clients.two_factor_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.two_factor_enabled IS 'Whether 2FA is enabled for this client';


--
-- Name: COLUMN clients.two_factor_verified_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.two_factor_verified_at IS 'When 2FA was last verified';


--
-- Name: COLUMN clients.permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.permissions IS 'Atomic, area-scoped permission strings. See lib/permissions.ts. Empty by default; backfilled to [orders, dam] for existing rows below. A DAM-only external user has [dam]; a typical client has [orders, dam].';


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    company_name text,
    netsuite_number text,
    support_fund_id uuid,
    subsidiary_id uuid,
    class_id uuid,
    location_id uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_terms text,
    incoterm text,
    ship_to text,
    incoterm_id integer,
    payment_terms_id integer,
    company_address text,
    company_email text,
    company_phone text,
    company_tax_number text,
    ship_to_contact_name text,
    ship_to_contact_email text,
    ship_to_contact_phone text,
    ship_to_street_line_1 text,
    ship_to_street_line_2 text,
    ship_to_city text,
    ship_to_state text,
    ship_to_postal_code text,
    ship_to_country text,
    contract_execution_date date,
    contract_duration_months integer DEFAULT 36,
    annual_target_amount numeric(15,2),
    contract_status text DEFAULT 'active'::text,
    current_annual_progress numeric(15,2) DEFAULT 0,
    netsuite_internal_id text,
    cross_subsidiary_fulfillment boolean DEFAULT false NOT NULL,
    enable_credit_card_payments boolean DEFAULT false NOT NULL,
    credit_card_fee_percent numeric(5,2),
    stripe_customer_id text,
    CONSTRAINT companies_contract_status_check CHECK ((contract_status = ANY (ARRAY['active'::text, 'expired'::text, 'suspended'::text, 'terminated'::text]))),
    CONSTRAINT companies_incoterm_check CHECK ((incoterm = ANY (ARRAY['Ex Works'::text, 'FOB'::text]))),
    CONSTRAINT companies_payment_terms_check CHECK ((payment_terms = ANY (ARRAY['Cash'::text, '30'::text, '45'::text])))
);


--
-- Name: COLUMN companies.ship_to; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.ship_to IS 'Multi-line shipping address and instructions';


--
-- Name: COLUMN companies.incoterm_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.incoterm_id IS 'Reference to incoterms table for shipping terms';


--
-- Name: COLUMN companies.payment_terms_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.payment_terms_id IS 'Reference to payment_terms table for payment conditions';


--
-- Name: COLUMN companies.company_address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.company_address IS 'Company main address';


--
-- Name: COLUMN companies.company_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.company_email IS 'Company main email address';


--
-- Name: COLUMN companies.company_phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.company_phone IS 'Company main phone number';


--
-- Name: COLUMN companies.company_tax_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.company_tax_number IS 'Company tax/VAT number';


--
-- Name: COLUMN companies.ship_to_contact_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.ship_to_contact_name IS 'Shipping contact person name';


--
-- Name: COLUMN companies.ship_to_contact_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.ship_to_contact_email IS 'Shipping contact email';


--
-- Name: COLUMN companies.ship_to_contact_phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.ship_to_contact_phone IS 'Shipping contact phone number';


--
-- Name: COLUMN companies.ship_to_street_line_1; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.ship_to_street_line_1 IS 'Ship-to address street line 1 (for 3PL export)';


--
-- Name: COLUMN companies.ship_to_street_line_2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.ship_to_street_line_2 IS 'Ship-to address street line 2 (for 3PL export)';


--
-- Name: COLUMN companies.ship_to_city; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.ship_to_city IS 'Ship-to city (for 3PL export)';


--
-- Name: COLUMN companies.ship_to_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.ship_to_state IS 'Ship-to state/province (for 3PL export)';


--
-- Name: COLUMN companies.ship_to_postal_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.ship_to_postal_code IS 'Ship-to postal/zip code (for 3PL export)';


--
-- Name: COLUMN companies.ship_to_country; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.ship_to_country IS 'Ship-to country (for 3PL export)';


--
-- Name: COLUMN companies.contract_execution_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.contract_execution_date IS 'Date when the contract was signed';


--
-- Name: COLUMN companies.contract_duration_months; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.contract_duration_months IS 'Contract duration in months (typically 36-72)';


--
-- Name: COLUMN companies.annual_target_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.annual_target_amount IS 'Annual sales target amount';


--
-- Name: COLUMN companies.contract_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.contract_status IS 'Status: active, expired, suspended, terminated';


--
-- Name: COLUMN companies.current_annual_progress; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.current_annual_progress IS 'Current progress towards annual target';


--
-- Name: COLUMN companies.enable_credit_card_payments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.enable_credit_card_payments IS 'When true, this company can pay orders by credit card (Stripe). Drives the "Send for Payment" button.';


--
-- Name: COLUMN companies.credit_card_fee_percent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.credit_card_fee_percent IS 'Per-company card surcharge percent (e.g. 3.00, 4.50). Applied to (items + shipping) on the invoice and the Stripe charge.';


--
-- Name: COLUMN companies.stripe_customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.stripe_customer_id IS 'Cached Stripe Customer id for this company.';


--
-- Name: company_dam_audiences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_dam_audiences (
    company_id uuid NOT NULL,
    audience_id uuid NOT NULL
);


--
-- Name: company_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    content text NOT NULL,
    note_type text NOT NULL,
    meeting_date date,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    visible_to_client boolean DEFAULT true NOT NULL,
    CONSTRAINT company_notes_note_type_check CHECK ((note_type = ANY (ARRAY['meeting'::text, 'webinar'::text, 'event'::text, 'feedback'::text, 'general_note'::text, 'internal_note'::text])))
);


--
-- Name: TABLE company_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_notes IS 'Admin-created notes visible to company users';


--
-- Name: COLUMN company_notes.visible_to_client; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_notes.visible_to_client IS 'If true, note is visible to clients. If false, note is only visible to admins.';


--
-- Name: company_territories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_territories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    country_code character varying(2) NOT NULL,
    country_name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE company_territories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_territories IS 'Stores exclusive territories for each company';


--
-- Name: dam_asset_audience_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_asset_audience_map (
    asset_id uuid NOT NULL,
    audience_id uuid NOT NULL
);


--
-- Name: dam_asset_locale_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_asset_locale_map (
    asset_id uuid NOT NULL,
    locale_code text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL
);


--
-- Name: dam_asset_region_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_asset_region_map (
    asset_id uuid NOT NULL,
    region_code text NOT NULL
);


--
-- Name: dam_asset_renditions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_asset_renditions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    asset_id uuid NOT NULL,
    version_id uuid,
    kind text NOT NULL,
    storage_bucket text DEFAULT 'dam-assets'::text NOT NULL,
    storage_path text NOT NULL,
    width integer,
    height integer,
    file_size bigint,
    mime_type text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: dam_asset_subtypes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_asset_subtypes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    asset_type_id uuid NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dam_asset_tag_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_asset_tag_map (
    asset_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: dam_asset_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_asset_types (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dam_asset_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_asset_versions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    asset_id uuid NOT NULL,
    version_number integer NOT NULL,
    storage_bucket text DEFAULT 'dam-assets'::text NOT NULL,
    storage_path text NOT NULL,
    file_size bigint,
    checksum text,
    mime_type text,
    width integer,
    height integer,
    duration_seconds numeric,
    page_count integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    preview_path text,
    thumbnail_path text,
    extracted_text text,
    search_vector tsvector,
    processing_status public.dam_processing_status DEFAULT 'pending'::public.dam_processing_status NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dam_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_assets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    description text,
    asset_type public.dam_asset_type NOT NULL,
    product_line text,
    sku text,
    is_archived boolean DEFAULT false NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    current_version_id uuid,
    search_tags text[] DEFAULT ARRAY[]::text[],
    vimeo_video_id text,
    vimeo_download_1080p text,
    vimeo_download_720p text,
    vimeo_download_480p text,
    vimeo_download_360p text,
    asset_type_id uuid,
    asset_subtype_id uuid,
    product_name text,
    use_title_as_filename boolean DEFAULT false
);


--
-- Name: COLUMN dam_assets.use_title_as_filename; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dam_assets.use_title_as_filename IS 'If true, use asset title as download filename. If false, use original uploaded filename.';


--
-- Name: dam_audiences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_audiences (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dam_download_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_download_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    asset_id uuid NOT NULL,
    version_id uuid,
    rendition_id uuid,
    downloaded_by uuid,
    download_method text,
    user_agent text,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dam_job_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_job_queue (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    job_name text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    run_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_at timestamp with time zone,
    locked_by text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dam_locales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_locales (
    code text NOT NULL,
    label text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    active boolean DEFAULT true
);


--
-- Name: dam_product_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_product_lines (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: dam_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_regions (
    code text NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dam_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dam_tags (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: highlighted_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.highlighted_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id integer NOT NULL,
    is_new boolean DEFAULT false,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--
-- Name: historical_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historical_sales (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    sale_date date NOT NULL,
    amount numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: incoterms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incoterms (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE incoterms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.incoterms IS 'International Commercial Terms for shipping and delivery';


--
-- Name: incoterms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.incoterms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: incoterms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.incoterms_id_seq OWNED BY public.incoterms.id;


--
-- Name: inv_inv_dated_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_inv_dated_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    as_of_date date NOT NULL,
    item_code text NOT NULL,
    location_name text NOT NULL,
    qoh numeric NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inv_inv_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_inv_items (
    item_code text NOT NULL,
    ns_item_id text,
    item_name text,
    item_type text,
    date_min date,
    date_max date,
    last_refreshed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    corrections jsonb,
    snapshots_applied boolean
);


--
-- Name: inv_inv_negative_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_inv_negative_windows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_code text NOT NULL,
    ns_item_id text,
    item_name text,
    location_ns_id text NOT NULL,
    location_name text,
    start_date date NOT NULL,
    end_date date,
    min_balance numeric NOT NULL,
    duration_days integer NOT NULL,
    builds_during integer DEFAULT 0 NOT NULL,
    other_outbound_during integer DEFAULT 0 NOT NULL,
    status text NOT NULL,
    crossed_closed_period boolean DEFAULT false NOT NULL,
    tier integer NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    verified boolean
);


--
-- Name: inv_inv_opening_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_inv_opening_balances (
    item_code text NOT NULL,
    location_ns_id text NOT NULL,
    location_name text,
    opening_qty numeric DEFAULT 0 NOT NULL,
    current_qoh numeric DEFAULT 0 NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inv_inv_opening_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_inv_opening_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cutoff_date date NOT NULL,
    item_code text NOT NULL,
    location_name text NOT NULL,
    qty numeric NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inv_inv_plan_markers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_inv_plan_markers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_code text NOT NULL,
    ns_transaction_id text NOT NULL,
    planned_action text,
    proposed_value text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inv_inv_residuals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_inv_residuals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_code text NOT NULL,
    ns_item_id text,
    item_name text,
    location_ns_id text NOT NULL,
    location_name text,
    current_qoh numeric NOT NULL,
    tx_sum numeric NOT NULL,
    residual numeric NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inv_inv_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_inv_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_code text NOT NULL,
    ns_transaction_id text NOT NULL,
    line_id text NOT NULL,
    doc_number text,
    tran_date date NOT NULL,
    tran_type text NOT NULL,
    ns_type text,
    location_ns_id text NOT NULL,
    location_name text,
    signed_qty numeric NOT NULL,
    transfer_group text,
    transfer_leg text,
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subsidiary_name text,
    chain_role text,
    chain_partner_tx_id text,
    ns_type_code text
);


--
-- Name: inv_inv_trusted_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_inv_trusted_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_code text NOT NULL,
    location_name text NOT NULL,
    as_of_date date NOT NULL,
    qty numeric NOT NULL,
    source text DEFAULT 'negatives_page'::text NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inv_inv_worklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_inv_worklist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_code text NOT NULL,
    ns_item_id text,
    item_name text,
    location_ns_id text NOT NULL,
    location_name text,
    depth numeric NOT NULL,
    since date,
    recommended_action text NOT NULL,
    suspect_ns_transaction_id text,
    suspect_doc text,
    suspect_type text,
    suspect_date date,
    change_from text,
    change_to text,
    confidence text NOT NULL,
    notes text,
    status text DEFAULT 'todo'::text NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    tier integer,
    recommendation_type text,
    edits_required jsonb,
    prerequisite_summary text,
    is_broken_chain boolean DEFAULT false NOT NULL,
    options jsonb,
    feed_status text,
    verified boolean
);


--
-- Name: inv_inv_worklist_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inv_inv_worklist_meta (
    id integer DEFAULT 1 NOT NULL,
    computed_at timestamp with time zone,
    items_scanned integer,
    cases integer,
    clean_count integer,
    duration_ms integer,
    CONSTRAINT inv_inv_worklist_meta_single CHECK ((id = 1))
);


--
-- Name: inventory_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_levels (
    product_id integer NOT NULL,
    location_id uuid NOT NULL,
    quantity_on_hand numeric DEFAULT 0,
    quantity_available numeric DEFAULT 0,
    synced_at timestamp with time zone DEFAULT now()
);


--
-- Name: login_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE login_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.login_codes IS '6-digit one-time login codes for clients. Hashed at rest, 10-minute expiry, max 5 verification attempts.';


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    company_id uuid,
    status text,
    total_value numeric,
    support_fund_used numeric,
    po_number text,
    credit_earned numeric(10,2) DEFAULT 0.00,
    packing_slip_generated boolean DEFAULT false,
    packing_slip_generated_at timestamp with time zone,
    packing_slip_generated_by uuid,
    invoice_number character varying(255),
    so_number character varying(255),
    number_of_pallets integer,
    netsuite_so_id text,
    netsuite_invoice_id text,
    netsuite_invoice_date date,
    netsuite_invoice_status text,
    location_id uuid,
    invoice_amount_remaining numeric,
    invoice_due_date date,
    shipping_amount numeric(12,2),
    stripe_invoice_id text,
    stripe_invoice_number text,
    stripe_hosted_url text,
    payment_status text,
    paid_at timestamp with time zone,
    ns_customer_payment_id text,
    fulfillment_provider text,
    external_fulfillment_id text,
    external_fulfillment_legacy_id text,
    fulfillment_status text,
    fulfillment_synced_at timestamp with time zone,
    tracking_number text,
    tracking_carrier text,
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Open'::text, 'In Process'::text, 'Ready'::text, 'Done'::text, 'Cancelled'::text])))
);


--
-- Name: COLUMN orders.credit_earned; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.credit_earned IS 'Amount of support fund credit earned from this order based on qualifying products and company support fund percentage';


--
-- Name: COLUMN orders.number_of_pallets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.number_of_pallets IS 'Number of pallets for the order, required when status changes to Ready';


--
-- Name: COLUMN orders.location_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.location_id IS 'Snapshot of the fulfilling location at order creation time. Decouples historical orders from later changes to companies.location_id. Read this instead of joining through company when displaying or pushing orders.';


--
-- Name: COLUMN orders.invoice_amount_remaining; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.invoice_amount_remaining IS 'Cached from NetSuite invoice.amountRemaining at create-invoice / sync-invoice time. NULL = unknown (no invoice yet, or sync never ran). 0 = paid in full.';


--
-- Name: COLUMN orders.invoice_due_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.invoice_due_date IS 'Cached from NetSuite invoice.dueDate. NULL = unknown. ISO date.';


--
-- Name: COLUMN orders.shipping_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.shipping_amount IS 'Admin-only shipping charge in the order currency. NULL/0 = none. Included in the effective order total and pushed to the NS SO + Invoice as the mapped shipping item.';


--
-- Name: COLUMN orders.stripe_invoice_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.stripe_invoice_id IS 'Stripe Invoice id for this order''s card payment request.';


--
-- Name: COLUMN orders.stripe_hosted_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.stripe_hosted_url IS 'Stripe hosted invoice page URL — the client''s "Pay Now" link.';


--
-- Name: COLUMN orders.payment_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.payment_status IS 'Card payment state: NULL (none) | pending | paid. Separate from order status.';


--
-- Name: COLUMN orders.paid_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.paid_at IS 'When the Stripe payment was confirmed (webhook).';


--
-- Name: COLUMN orders.ns_customer_payment_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.ns_customer_payment_id IS 'NetSuite Customer Payment internal id recorded when the Stripe payment settled.';


--
-- Name: COLUMN orders.fulfillment_provider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.fulfillment_provider IS 'Which fulfillment adapter owns this order (e.g. ''shiphero''). NULL = not pushed to a WMS.';


--
-- Name: COLUMN orders.external_fulfillment_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.external_fulfillment_id IS 'Provider order id returned by the WMS (ShipHero global id). Used to match inbound webhooks.';


--
-- Name: COLUMN orders.fulfillment_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.fulfillment_status IS 'Normalized fulfillment state: pending | ready_for_pickup | shipped | cancelled | unknown. For ExWorks pickup orders, ready_for_pickup is the meaningful signal.';


--
-- Name: mv_company_sales; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_company_sales AS
 WITH windows AS (
         SELECT '30d'::text AS window_key,
            (now() - '30 days'::interval) AS since
        UNION ALL
         SELECT '90d'::text AS text,
            (now() - '90 days'::interval)
        UNION ALL
         SELECT 'ytd'::text AS text,
            date_trunc('year'::text, now()) AS date_trunc
        ), from_orders AS (
         SELECT o.company_id,
            w.window_key,
            'orders'::text AS source,
            (count(*))::integer AS orders,
            COALESCE(sum(o.total_value), (0)::numeric) AS revenue,
            COALESCE(sum(o.support_fund_used), (0)::numeric) AS support_fund_used,
            max(o.created_at) AS last_activity_at
           FROM (public.orders o
             CROSS JOIN windows w)
          WHERE ((o.status <> ALL (ARRAY['Draft'::text, 'Cancelled'::text])) AND (o.created_at >= w.since) AND (o.company_id IS NOT NULL))
          GROUP BY o.company_id, w.window_key
        ), from_historical AS (
         SELECT h.company_id,
            w.window_key,
            'historical'::text AS source,
            0 AS orders,
            COALESCE(sum(h.amount), (0)::numeric) AS revenue,
            (0)::numeric AS support_fund_used,
            max((h.sale_date)::timestamp with time zone) AS last_activity_at
           FROM (public.historical_sales h
             CROSS JOIN windows w)
          WHERE (h.sale_date >= (w.since)::date)
          GROUP BY h.company_id, w.window_key
        )
 SELECT from_orders.company_id,
    from_orders.window_key,
    from_orders.source,
    from_orders.orders,
    from_orders.revenue,
    from_orders.support_fund_used,
    from_orders.last_activity_at
   FROM from_orders
UNION ALL
 SELECT from_historical.company_id,
    from_historical.window_key,
    from_historical.source,
    from_historical.orders,
    from_historical.revenue,
    from_historical.support_fund_used,
    from_historical.last_activity_at
   FROM from_historical
  WITH NO DATA;


--
-- Name: mv_daily_sales; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_daily_sales AS
 WITH from_orders AS (
         SELECT ((orders.created_at AT TIME ZONE 'UTC'::text))::date AS day,
            'orders'::text AS source,
            (count(*))::integer AS orders,
            COALESCE(sum(orders.total_value), (0)::numeric) AS revenue,
            COALESCE(sum(orders.support_fund_used), (0)::numeric) AS support_fund_used,
            COALESCE(sum(orders.credit_earned), (0)::numeric) AS credit_earned
           FROM public.orders
          WHERE (orders.status <> ALL (ARRAY['Draft'::text, 'Cancelled'::text]))
          GROUP BY (((orders.created_at AT TIME ZONE 'UTC'::text))::date)
        ), from_historical AS (
         SELECT historical_sales.sale_date AS day,
            'historical'::text AS source,
            0 AS orders,
            COALESCE(sum(historical_sales.amount), (0)::numeric) AS revenue,
            (0)::numeric AS support_fund_used,
            (0)::numeric AS credit_earned
           FROM public.historical_sales
          GROUP BY historical_sales.sale_date
        )
 SELECT from_orders.day,
    from_orders.source,
    from_orders.orders,
    from_orders.revenue,
    from_orders.support_fund_used,
    from_orders.credit_earned
   FROM from_orders
UNION ALL
 SELECT from_historical.day,
    from_historical.source,
    from_historical.orders,
    from_historical.revenue,
    from_historical.support_fund_used,
    from_historical.credit_earned
   FROM from_historical
  WITH NO DATA;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id bigint NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    line_total numeric(12,2) GENERATED ALWAYS AS (((quantity)::numeric * unit_price)) STORED,
    total_price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_support_fund_item boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0,
    case_qty bigint DEFAULT '0'::bigint,
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: COLUMN order_items.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_items.sort_order IS 'Display order of products in the order (0 = first, higher numbers = later)';


--
-- Name: mv_product_sales; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_product_sales AS
 WITH windows AS (
         SELECT '30d'::text AS window_key,
            (now() - '30 days'::interval) AS since
        UNION ALL
         SELECT '90d'::text AS text,
            (now() - '90 days'::interval)
        UNION ALL
         SELECT 'ytd'::text AS text,
            date_trunc('year'::text, now()) AS date_trunc
        )
 SELECT oi.product_id,
    w.window_key,
    (COALESCE(sum(oi.quantity), (0)::bigint))::numeric AS units,
    COALESCE(sum(oi.total_price), (0)::numeric) AS revenue,
    (count(DISTINCT oi.order_id))::integer AS orders
   FROM ((public.order_items oi
     JOIN public.orders o ON ((o.id = oi.order_id)))
     CROSS JOIN windows w)
  WHERE ((o.status <> ALL (ARRAY['Draft'::text, 'Cancelled'::text])) AND (o.created_at >= w.since) AND (oi.product_id IS NOT NULL))
  GROUP BY oi.product_id, w.window_key
  WITH NO DATA;


--
-- Name: netsuite_item_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.netsuite_item_map (
    purpose text NOT NULL,
    ns_id text NOT NULL,
    ns_name text,
    allowed_on text DEFAULT 'so_and_invoice'::text NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT netsuite_item_map_allowed_on_chk CHECK ((allowed_on = ANY (ARRAY['so_and_invoice'::text, 'invoice_only'::text])))
);


--
-- Name: TABLE netsuite_item_map; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.netsuite_item_map IS 'Config map of NetSuite item internal IDs by purpose. Read server-side only (service role). allowed_on enforces where each item may be placed.';


--
-- Name: note_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    file_name character varying(255) NOT NULL,
    file_path text NOT NULL,
    file_size integer,
    file_type character varying(100),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE note_attachments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.note_attachments IS 'File attachments for company notes';


--
-- Name: note_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_replies (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    note_id uuid NOT NULL,
    content text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE note_replies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.note_replies IS 'Replies/responses to Internal Notes (notes where visible_to_client = false). Only admins can create replies.';


--
-- Name: order_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    document_type text NOT NULL,
    filename text NOT NULL,
    file_path text NOT NULL,
    file_size bigint NOT NULL,
    mime_type text NOT NULL,
    uploaded_by_id uuid NOT NULL,
    uploaded_by_name text NOT NULL,
    uploaded_by_role text NOT NULL,
    description text,
    is_public boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE order_documents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.order_documents IS 'File storage metadata for order-related documents';


--
-- Name: COLUMN order_documents.document_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_documents.document_type IS 'Document category: invoice, sales_order, other';


--
-- Name: COLUMN order_documents.file_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_documents.file_path IS 'Path in Supabase Storage bucket';


--
-- Name: COLUMN order_documents.is_public; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_documents.is_public IS 'Whether clients can view this document';


--
-- Name: order_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    action_type text NOT NULL,
    status_from text,
    status_to text,
    document_type text,
    document_filename text,
    notes text,
    changed_by_id uuid,
    changed_by_name text,
    changed_by_role text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE order_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.order_history IS 'Audit log for all order-related activities';


--
-- Name: COLUMN order_history.action_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_history.action_type IS 'Type of action: status_change, document_uploaded, packing_slip_created, order_created, order_updated';


--
-- Name: COLUMN order_history.document_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_history.document_type IS 'Type of document when action_type is document_uploaded';


--
-- Name: COLUMN order_history.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.order_history.metadata IS 'Additional structured data as JSON';


--
-- Name: packing_slips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packing_slips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    invoice_number character varying(255) NOT NULL,
    shipping_method character varying(50) NOT NULL,
    netsuite_reference character varying(255),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    contact_name text,
    contact_email text,
    contact_phone text,
    vat_number text
);


--
-- Name: COLUMN packing_slips.contact_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packing_slips.contact_name IS 'Contact person name for shipping';


--
-- Name: COLUMN packing_slips.contact_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packing_slips.contact_email IS 'Contact person email for shipping';


--
-- Name: COLUMN packing_slips.contact_phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packing_slips.contact_phone IS 'Contact person phone number for shipping';


--
-- Name: COLUMN packing_slips.vat_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.packing_slips.vat_number IS 'VAT number for shipping documentation';


--
-- Name: password_setup_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_setup_tokens (
    token text NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    attempts integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE password_setup_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.password_setup_tokens IS 'Long random tokens emailed to users for password setup/reset. Owned by application code, not Supabase auth.';


--
-- Name: payment_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_terms (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE payment_terms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payment_terms IS 'Payment terms and conditions for companies';


--
-- Name: payment_terms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_terms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_terms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_terms_id_seq OWNED BY public.payment_terms.id;


--
-- Name: sli_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sli_config (
    id smallint DEFAULT 1 NOT NULL,
    usppi_name text DEFAULT ''::text NOT NULL,
    usppi_address_line1 text DEFAULT ''::text NOT NULL,
    usppi_address_line2 text DEFAULT ''::text NOT NULL,
    usppi_country text DEFAULT ''::text NOT NULL,
    usppi_ein text DEFAULT ''::text NOT NULL,
    freight_location_name text DEFAULT ''::text NOT NULL,
    freight_location_address_line1 text DEFAULT ''::text NOT NULL,
    freight_location_address_line2 text DEFAULT ''::text NOT NULL,
    freight_location_country text DEFAULT ''::text NOT NULL,
    state_of_origin text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sli_config_id_check CHECK ((id = 1))
);


--
-- Name: TABLE sli_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sli_config IS 'Singleton config for SLI documents: USPPI block (boxes 1-2, 7), freight location (boxes 3-4), state of origin (box 14). Edited at /admin/sli/settings.';


--
-- Name: sli_signers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sli_signers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    signature_url text DEFAULT ''::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE sli_signers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sli_signers IS 'Authorized SLI signees (boxes 42-46). signature_url is an app path or data: URL. One default enforced by partial unique index.';


--
-- Name: slis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slis (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    order_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    forwarding_agent_line1 text,
    forwarding_agent_line2 text,
    forwarding_agent_line3 text,
    forwarding_agent_line4 text,
    date_of_export date,
    in_bond_code text,
    instructions_to_forwarder text,
    checkbox_states jsonb DEFAULT '{"checkbox_39": false, "checkbox_40": false, "checkbox_48": false, "insurance_no": false, "insurance_yes": false, "tib_carnet_no": false, "tib_carnet_yes": false, "payment_collect": false, "payment_prepaid": false, "routed_export_no": false, "routed_export_yes": false, "hazardous_material_no": false, "related_party_related": false, "hazardous_material_yes": false, "consignee_type_reseller": false, "consignee_type_government": false, "related_party_non_related": false, "consignee_type_other_unknown": false, "consignee_type_direct_consumer": false}'::jsonb,
    signature_image_url text,
    signature_date date,
    pdf_url text,
    consignee_name text,
    consignee_address_line1 text,
    consignee_address_line2 text,
    consignee_address_line3 text,
    consignee_country text,
    invoice_number text,
    sli_date date,
    sli_type text DEFAULT 'order'::text,
    manual_products jsonb DEFAULT '[]'::jsonb,
    signer_id uuid,
    CONSTRAINT slis_sli_type_check CHECK ((sli_type = ANY (ARRAY['order'::text, 'standalone'::text])))
);


--
-- Name: TABLE slis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.slis IS 'Stores Shipper''s Letter of Instruction data for orders';


--
-- Name: standalone_slis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.standalone_slis (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    sli_number integer NOT NULL,
    company_id uuid,
    consignee_name text NOT NULL,
    consignee_address_line1 text NOT NULL,
    consignee_address_line2 text,
    consignee_address_line3 text,
    consignee_country text NOT NULL,
    invoice_number text NOT NULL,
    sli_date date NOT NULL,
    date_of_export date,
    forwarding_agent_line1 text,
    forwarding_agent_line2 text,
    forwarding_agent_line3 text,
    forwarding_agent_line4 text,
    in_bond_code text,
    instructions_to_forwarder text,
    selected_products jsonb DEFAULT '[]'::jsonb NOT NULL,
    checkbox_states jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pdf_url text,
    signer_id uuid
);


--
-- Name: subsidiaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subsidiaries (
    name text,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ship_from_address text,
    company_address text,
    phone text,
    email text,
    footer_text text,
    netsuite_id text
);


--
-- Name: COLUMN subsidiaries.ship_from_address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.subsidiaries.ship_from_address IS 'Full shipping address for this subsidiary';


--
-- Name: COLUMN subsidiaries.company_address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.subsidiaries.company_address IS 'Company address for this subsidiary';


--
-- Name: COLUMN subsidiaries.phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.subsidiaries.phone IS 'Phone number for this subsidiary';


--
-- Name: COLUMN subsidiaries.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.subsidiaries.email IS 'Email address for this subsidiary';


--
-- Name: support_fund_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_fund_levels (
    percent numeric,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: target_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.target_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    period_name character varying(100) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    target_amount numeric(15,2) NOT NULL,
    current_progress numeric(15,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE target_periods; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.target_periods IS 'Multiple annual target periods for each company';


--
-- Name: COLUMN target_periods.period_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.target_periods.period_name IS 'Human-readable name for the target period';


--
-- Name: COLUMN target_periods.start_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.target_periods.start_date IS 'Start date of the target period';


--
-- Name: COLUMN target_periods.end_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.target_periods.end_date IS 'End date of the target period';


--
-- Name: COLUMN target_periods.target_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.target_periods.target_amount IS 'Target amount for this period';


--
-- Name: COLUMN target_periods.current_progress; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.target_periods.current_progress IS 'Current progress towards this period target';


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: incoterms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoterms ALTER COLUMN id SET DEFAULT nextval('public.incoterms_id_seq'::regclass);


--
-- Name: payment_terms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_terms ALTER COLUMN id SET DEFAULT nextval('public.payment_terms_id_seq'::regclass);


--
-- Name: Locations Locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Locations"
    ADD CONSTRAINT "Locations_pkey" PRIMARY KEY (id);


--
-- Name: Products Products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Products"
    ADD CONSTRAINT "Products_pkey" PRIMARY KEY (id);


--
-- Name: admin_notes admin_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notes
    ADD CONSTRAINT admin_notes_pkey PRIMARY KEY (id);


--
-- Name: admins admins_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- Name: amazon_fba_batches amazon_fba_batches_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amazon_fba_batches
    ADD CONSTRAINT amazon_fba_batches_period_key UNIQUE (period);


--
-- Name: amazon_fba_batches amazon_fba_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amazon_fba_batches
    ADD CONSTRAINT amazon_fba_batches_pkey PRIMARY KEY (id);


--
-- Name: amazon_fba_config amazon_fba_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amazon_fba_config
    ADD CONSTRAINT amazon_fba_config_pkey PRIMARY KEY (id);


--
-- Name: amazon_item_map amazon_item_map_amazon_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amazon_item_map
    ADD CONSTRAINT amazon_item_map_amazon_name_key UNIQUE (amazon_name);


--
-- Name: amazon_item_map amazon_item_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amazon_item_map
    ADD CONSTRAINT amazon_item_map_pkey PRIMARY KEY (id);


--
-- Name: api_rate_limits api_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_rate_limits
    ADD CONSTRAINT api_rate_limits_pkey PRIMARY KEY (key, window_start);


--
-- Name: campaign_assets campaign_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_assets
    ADD CONSTRAINT campaign_assets_pkey PRIMARY KEY (campaign_id, asset_id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: categories categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: client_note_views client_note_views_client_id_note_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_note_views
    ADD CONSTRAINT client_note_views_client_id_note_id_key UNIQUE (client_id, note_id);


--
-- Name: client_note_views client_note_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_note_views
    ADD CONSTRAINT client_note_views_pkey PRIMARY KEY (id);


--
-- Name: clients clients_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_email_key UNIQUE (email);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: companies companies_netsuite_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_netsuite_number_unique UNIQUE (netsuite_number);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_dam_audiences company_dam_audiences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_dam_audiences
    ADD CONSTRAINT company_dam_audiences_pkey PRIMARY KEY (company_id, audience_id);


--
-- Name: company_notes company_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_notes
    ADD CONSTRAINT company_notes_pkey PRIMARY KEY (id);


--
-- Name: company_territories company_territories_company_id_country_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_territories
    ADD CONSTRAINT company_territories_company_id_country_code_key UNIQUE (company_id, country_code);


--
-- Name: company_territories company_territories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_territories
    ADD CONSTRAINT company_territories_pkey PRIMARY KEY (id);


--
-- Name: dam_asset_audience_map dam_asset_audience_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_audience_map
    ADD CONSTRAINT dam_asset_audience_map_pkey PRIMARY KEY (asset_id, audience_id);


--
-- Name: dam_asset_locale_map dam_asset_locale_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_locale_map
    ADD CONSTRAINT dam_asset_locale_map_pkey PRIMARY KEY (asset_id, locale_code);


--
-- Name: dam_asset_region_map dam_asset_region_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_region_map
    ADD CONSTRAINT dam_asset_region_map_pkey PRIMARY KEY (asset_id, region_code);


--
-- Name: dam_asset_renditions dam_asset_renditions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_renditions
    ADD CONSTRAINT dam_asset_renditions_pkey PRIMARY KEY (id);


--
-- Name: dam_asset_renditions dam_asset_renditions_unique_per_version_kind; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_renditions
    ADD CONSTRAINT dam_asset_renditions_unique_per_version_kind UNIQUE (version_id, kind);


--
-- Name: dam_asset_subtypes dam_asset_subtypes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_subtypes
    ADD CONSTRAINT dam_asset_subtypes_pkey PRIMARY KEY (id);


--
-- Name: dam_asset_subtypes dam_asset_subtypes_unique_per_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_subtypes
    ADD CONSTRAINT dam_asset_subtypes_unique_per_type UNIQUE (asset_type_id, slug);


--
-- Name: dam_asset_tag_map dam_asset_tag_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_tag_map
    ADD CONSTRAINT dam_asset_tag_map_pkey PRIMARY KEY (asset_id, tag_id);


--
-- Name: dam_asset_types dam_asset_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_types
    ADD CONSTRAINT dam_asset_types_name_key UNIQUE (name);


--
-- Name: dam_asset_types dam_asset_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_types
    ADD CONSTRAINT dam_asset_types_pkey PRIMARY KEY (id);


--
-- Name: dam_asset_types dam_asset_types_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_types
    ADD CONSTRAINT dam_asset_types_slug_key UNIQUE (slug);


--
-- Name: dam_asset_versions dam_asset_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_versions
    ADD CONSTRAINT dam_asset_versions_pkey PRIMARY KEY (id);


--
-- Name: dam_asset_versions dam_asset_versions_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_versions
    ADD CONSTRAINT dam_asset_versions_version_unique UNIQUE (asset_id, version_number);


--
-- Name: dam_assets dam_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_assets
    ADD CONSTRAINT dam_assets_pkey PRIMARY KEY (id);


--
-- Name: dam_audiences dam_audiences_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_audiences
    ADD CONSTRAINT dam_audiences_code_key UNIQUE (code);


--
-- Name: dam_audiences dam_audiences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_audiences
    ADD CONSTRAINT dam_audiences_pkey PRIMARY KEY (id);


--
-- Name: dam_download_events dam_download_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_download_events
    ADD CONSTRAINT dam_download_events_pkey PRIMARY KEY (id);


--
-- Name: dam_job_queue dam_job_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_job_queue
    ADD CONSTRAINT dam_job_queue_pkey PRIMARY KEY (id);


--
-- Name: dam_locales dam_locales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_locales
    ADD CONSTRAINT dam_locales_pkey PRIMARY KEY (code);


--
-- Name: dam_product_lines dam_product_lines_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_product_lines
    ADD CONSTRAINT dam_product_lines_code_key UNIQUE (code);


--
-- Name: dam_product_lines dam_product_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_product_lines
    ADD CONSTRAINT dam_product_lines_pkey PRIMARY KEY (id);


--
-- Name: dam_product_lines dam_product_lines_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_product_lines
    ADD CONSTRAINT dam_product_lines_slug_key UNIQUE (slug);


--
-- Name: dam_regions dam_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_regions
    ADD CONSTRAINT dam_regions_pkey PRIMARY KEY (code);


--
-- Name: dam_tags dam_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_tags
    ADD CONSTRAINT dam_tags_pkey PRIMARY KEY (id);


--
-- Name: dam_tags dam_tags_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_tags
    ADD CONSTRAINT dam_tags_slug_key UNIQUE (slug);


--
-- Name: highlighted_products highlighted_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.highlighted_products
    ADD CONSTRAINT highlighted_products_pkey PRIMARY KEY (id);


--
-- Name: highlighted_products highlighted_products_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.highlighted_products
    ADD CONSTRAINT highlighted_products_product_id_key UNIQUE (product_id);


--
-- Name: historical_sales historical_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historical_sales
    ADD CONSTRAINT historical_sales_pkey PRIMARY KEY (id);


--
-- Name: incoterms incoterms_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoterms
    ADD CONSTRAINT incoterms_name_key UNIQUE (name);


--
-- Name: incoterms incoterms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incoterms
    ADD CONSTRAINT incoterms_pkey PRIMARY KEY (id);


--
-- Name: inv_inv_dated_snapshots inv_inv_dated_snapshots_as_of_date_item_code_location_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_dated_snapshots
    ADD CONSTRAINT inv_inv_dated_snapshots_as_of_date_item_code_location_name_key UNIQUE (as_of_date, item_code, location_name);


--
-- Name: inv_inv_dated_snapshots inv_inv_dated_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_dated_snapshots
    ADD CONSTRAINT inv_inv_dated_snapshots_pkey PRIMARY KEY (id);


--
-- Name: inv_inv_items inv_inv_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_items
    ADD CONSTRAINT inv_inv_items_pkey PRIMARY KEY (item_code);


--
-- Name: inv_inv_negative_windows inv_inv_negative_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_negative_windows
    ADD CONSTRAINT inv_inv_negative_windows_pkey PRIMARY KEY (id);


--
-- Name: inv_inv_opening_balances inv_inv_opening_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_opening_balances
    ADD CONSTRAINT inv_inv_opening_balances_pkey PRIMARY KEY (item_code, location_ns_id);


--
-- Name: inv_inv_opening_snapshots inv_inv_opening_snapshots_item_code_location_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_opening_snapshots
    ADD CONSTRAINT inv_inv_opening_snapshots_item_code_location_name_key UNIQUE (item_code, location_name);


--
-- Name: inv_inv_opening_snapshots inv_inv_opening_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_opening_snapshots
    ADD CONSTRAINT inv_inv_opening_snapshots_pkey PRIMARY KEY (id);


--
-- Name: inv_inv_plan_markers inv_inv_plan_markers_item_code_ns_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_plan_markers
    ADD CONSTRAINT inv_inv_plan_markers_item_code_ns_transaction_id_key UNIQUE (item_code, ns_transaction_id);


--
-- Name: inv_inv_plan_markers inv_inv_plan_markers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_plan_markers
    ADD CONSTRAINT inv_inv_plan_markers_pkey PRIMARY KEY (id);


--
-- Name: inv_inv_residuals inv_inv_residuals_item_code_location_ns_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_residuals
    ADD CONSTRAINT inv_inv_residuals_item_code_location_ns_id_key UNIQUE (item_code, location_ns_id);


--
-- Name: inv_inv_residuals inv_inv_residuals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_residuals
    ADD CONSTRAINT inv_inv_residuals_pkey PRIMARY KEY (id);


--
-- Name: inv_inv_transactions inv_inv_transactions_ns_transaction_id_line_id_location_ns__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_transactions
    ADD CONSTRAINT inv_inv_transactions_ns_transaction_id_line_id_location_ns__key UNIQUE (ns_transaction_id, line_id, location_ns_id);


--
-- Name: inv_inv_transactions inv_inv_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_transactions
    ADD CONSTRAINT inv_inv_transactions_pkey PRIMARY KEY (id);


--
-- Name: inv_inv_trusted_points inv_inv_trusted_points_item_code_location_name_as_of_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_trusted_points
    ADD CONSTRAINT inv_inv_trusted_points_item_code_location_name_as_of_date_key UNIQUE (item_code, location_name, as_of_date);


--
-- Name: inv_inv_trusted_points inv_inv_trusted_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_trusted_points
    ADD CONSTRAINT inv_inv_trusted_points_pkey PRIMARY KEY (id);


--
-- Name: inv_inv_worklist_meta inv_inv_worklist_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_worklist_meta
    ADD CONSTRAINT inv_inv_worklist_meta_pkey PRIMARY KEY (id);


--
-- Name: inv_inv_worklist inv_inv_worklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_worklist
    ADD CONSTRAINT inv_inv_worklist_pkey PRIMARY KEY (id);


--
-- Name: inventory_levels inventory_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_levels
    ADD CONSTRAINT inventory_levels_pkey PRIMARY KEY (product_id, location_id);


--
-- Name: login_codes login_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_codes
    ADD CONSTRAINT login_codes_pkey PRIMARY KEY (id);


--
-- Name: netsuite_item_map netsuite_item_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.netsuite_item_map
    ADD CONSTRAINT netsuite_item_map_pkey PRIMARY KEY (purpose);


--
-- Name: note_attachments note_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_attachments
    ADD CONSTRAINT note_attachments_pkey PRIMARY KEY (id);


--
-- Name: note_replies note_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_replies
    ADD CONSTRAINT note_replies_pkey PRIMARY KEY (id);


--
-- Name: order_documents order_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_documents
    ADD CONSTRAINT order_documents_pkey PRIMARY KEY (id);


--
-- Name: order_history order_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_history
    ADD CONSTRAINT order_history_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: packing_slips packing_slips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packing_slips
    ADD CONSTRAINT packing_slips_pkey PRIMARY KEY (id);


--
-- Name: password_setup_tokens password_setup_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_setup_tokens
    ADD CONSTRAINT password_setup_tokens_pkey PRIMARY KEY (token);


--
-- Name: payment_terms payment_terms_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_terms
    ADD CONSTRAINT payment_terms_name_key UNIQUE (name);


--
-- Name: payment_terms payment_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_terms
    ADD CONSTRAINT payment_terms_pkey PRIMARY KEY (id);


--
-- Name: sli_config sli_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sli_config
    ADD CONSTRAINT sli_config_pkey PRIMARY KEY (id);


--
-- Name: sli_signers sli_signers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sli_signers
    ADD CONSTRAINT sli_signers_pkey PRIMARY KEY (id);


--
-- Name: slis slis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slis
    ADD CONSTRAINT slis_pkey PRIMARY KEY (id);


--
-- Name: standalone_slis standalone_slis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standalone_slis
    ADD CONSTRAINT standalone_slis_pkey PRIMARY KEY (id);


--
-- Name: standalone_slis standalone_slis_sli_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standalone_slis
    ADD CONSTRAINT standalone_slis_sli_number_key UNIQUE (sli_number);


--
-- Name: subsidiaries subsidiaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subsidiaries
    ADD CONSTRAINT subsidiaries_pkey PRIMARY KEY (id);


--
-- Name: support_fund_levels support_fund_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_fund_levels
    ADD CONSTRAINT support_fund_levels_pkey PRIMARY KEY (id);


--
-- Name: target_periods target_periods_company_id_start_date_end_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_periods
    ADD CONSTRAINT target_periods_company_id_start_date_end_date_key UNIQUE (company_id, start_date, end_date);


--
-- Name: target_periods target_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_periods
    ADD CONSTRAINT target_periods_pkey PRIMARY KEY (id);


--
-- Name: slis unique_sli_per_order; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slis
    ADD CONSTRAINT unique_sli_per_order UNIQUE (order_id);


--
-- Name: idx_admin_notes_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_notes_company_id ON public.admin_notes USING btree (company_id);


--
-- Name: idx_admins_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admins_id ON public.admins USING btree (id);


--
-- Name: idx_admins_two_factor_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admins_two_factor_enabled ON public.admins USING btree (two_factor_enabled);


--
-- Name: idx_api_rate_limits_window_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_rate_limits_window_start ON public.api_rate_limits USING btree (window_start);


--
-- Name: idx_campaign_assets_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_assets_asset_id ON public.campaign_assets USING btree (asset_id);


--
-- Name: idx_campaign_assets_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_assets_campaign_id ON public.campaign_assets USING btree (campaign_id);


--
-- Name: idx_campaigns_thumbnail_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_thumbnail_asset_id ON public.campaigns USING btree (thumbnail_asset_id);


--
-- Name: idx_categories_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_sort_order ON public.categories USING btree (sort_order);


--
-- Name: idx_categories_visibility_americas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_visibility_americas ON public.categories USING btree (visible_to_americas);


--
-- Name: idx_categories_visibility_international; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_visibility_international ON public.categories USING btree (visible_to_international);


--
-- Name: idx_client_note_views_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_note_views_client_id ON public.client_note_views USING btree (client_id);


--
-- Name: idx_client_note_views_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_note_views_note_id ON public.client_note_views USING btree (note_id);


--
-- Name: idx_client_note_views_viewed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_note_views_viewed_at ON public.client_note_views USING btree (viewed_at);


--
-- Name: idx_clients_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_company_id ON public.clients USING btree (company_id);


--
-- Name: idx_clients_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_id ON public.clients USING btree (id);


--
-- Name: idx_clients_two_factor_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_two_factor_enabled ON public.clients USING btree (two_factor_enabled);


--
-- Name: idx_companies_incoterm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_incoterm_id ON public.companies USING btree (incoterm_id);


--
-- Name: idx_companies_payment_terms_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_payment_terms_id ON public.companies USING btree (payment_terms_id);


--
-- Name: idx_company_dam_audiences_audience_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_dam_audiences_audience_id ON public.company_dam_audiences USING btree (audience_id);


--
-- Name: idx_company_notes_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_notes_company_id ON public.company_notes USING btree (company_id);


--
-- Name: idx_company_notes_meeting_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_notes_meeting_date ON public.company_notes USING btree (meeting_date);


--
-- Name: idx_company_notes_note_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_notes_note_type ON public.company_notes USING btree (note_type);


--
-- Name: idx_company_territories_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_territories_company_id ON public.company_territories USING btree (company_id);


--
-- Name: idx_company_territories_country_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_territories_country_code ON public.company_territories USING btree (country_code);


--
-- Name: idx_dam_asset_audience_map_audience_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_audience_map_audience_id ON public.dam_asset_audience_map USING btree (audience_id);


--
-- Name: idx_dam_asset_locale_map_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_locale_map_asset_id ON public.dam_asset_locale_map USING btree (asset_id);


--
-- Name: idx_dam_asset_locale_map_locale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_locale_map_locale ON public.dam_asset_locale_map USING btree (locale_code);


--
-- Name: idx_dam_asset_locale_map_locale_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_locale_map_locale_code ON public.dam_asset_locale_map USING btree (locale_code);


--
-- Name: idx_dam_asset_region_map_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_region_map_asset_id ON public.dam_asset_region_map USING btree (asset_id);


--
-- Name: idx_dam_asset_region_map_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_region_map_region ON public.dam_asset_region_map USING btree (region_code);


--
-- Name: idx_dam_asset_region_map_region_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_region_map_region_code ON public.dam_asset_region_map USING btree (region_code);


--
-- Name: idx_dam_asset_renditions_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_renditions_asset_id ON public.dam_asset_renditions USING btree (asset_id);


--
-- Name: idx_dam_asset_renditions_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_renditions_kind ON public.dam_asset_renditions USING btree (kind);


--
-- Name: idx_dam_asset_renditions_version_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_renditions_version_id ON public.dam_asset_renditions USING btree (version_id);


--
-- Name: idx_dam_asset_subtypes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_subtypes_active ON public.dam_asset_subtypes USING btree (active);


--
-- Name: idx_dam_asset_subtypes_asset_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_subtypes_asset_type_id ON public.dam_asset_subtypes USING btree (asset_type_id);


--
-- Name: idx_dam_asset_tag_map_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_tag_map_asset_id ON public.dam_asset_tag_map USING btree (asset_id);


--
-- Name: idx_dam_asset_tag_map_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_tag_map_tag_id ON public.dam_asset_tag_map USING btree (tag_id);


--
-- Name: idx_dam_asset_types_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_types_active ON public.dam_asset_types USING btree (active);


--
-- Name: idx_dam_asset_versions_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_versions_asset_id ON public.dam_asset_versions USING btree (asset_id);


--
-- Name: idx_dam_asset_versions_asset_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_versions_asset_version ON public.dam_asset_versions USING btree (asset_id, version_number DESC);


--
-- Name: idx_dam_asset_versions_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_versions_search ON public.dam_asset_versions USING gin (search_vector);


--
-- Name: idx_dam_asset_versions_thumbnail_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_asset_versions_thumbnail_path ON public.dam_asset_versions USING btree (thumbnail_path) WHERE (thumbnail_path IS NOT NULL);


--
-- Name: idx_dam_assets_asset_subtype_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_assets_asset_subtype_id ON public.dam_assets USING btree (asset_subtype_id);


--
-- Name: idx_dam_assets_asset_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_assets_asset_type ON public.dam_assets USING btree (asset_type);


--
-- Name: idx_dam_assets_asset_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_assets_asset_type_id ON public.dam_assets USING btree (asset_type_id);


--
-- Name: idx_dam_assets_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_assets_created_at ON public.dam_assets USING btree (created_at DESC);


--
-- Name: idx_dam_assets_is_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_assets_is_archived ON public.dam_assets USING btree (is_archived) WHERE (is_archived = false);


--
-- Name: idx_dam_assets_product_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_assets_product_line ON public.dam_assets USING btree (product_line);


--
-- Name: idx_dam_assets_product_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_assets_product_name ON public.dam_assets USING btree (product_name);


--
-- Name: idx_dam_assets_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_assets_sku ON public.dam_assets USING btree (sku);


--
-- Name: idx_dam_assets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_assets_type ON public.dam_assets USING btree (asset_type);


--
-- Name: idx_dam_assets_type_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_assets_type_created_at ON public.dam_assets USING btree (asset_type_id, created_at DESC);


--
-- Name: idx_dam_assets_vimeo_video_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_assets_vimeo_video_id ON public.dam_assets USING btree (vimeo_video_id) WHERE (vimeo_video_id IS NOT NULL);


--
-- Name: idx_dam_download_events_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_download_events_asset_id ON public.dam_download_events USING btree (asset_id);


--
-- Name: idx_dam_download_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_download_events_created_at ON public.dam_download_events USING btree (created_at DESC);


--
-- Name: idx_dam_download_events_downloaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_download_events_downloaded_by ON public.dam_download_events USING btree (downloaded_by);


--
-- Name: idx_dam_job_queue_run_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_job_queue_run_at ON public.dam_job_queue USING btree (run_at);


--
-- Name: idx_dam_job_queue_status_run_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_job_queue_status_run_at ON public.dam_job_queue USING btree (status, run_at);


--
-- Name: idx_dam_locales_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_locales_active ON public.dam_locales USING btree (active);


--
-- Name: idx_dam_product_lines_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_product_lines_active ON public.dam_product_lines USING btree (active);


--
-- Name: idx_dam_product_lines_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dam_product_lines_code ON public.dam_product_lines USING btree (code);


--
-- Name: idx_highlighted_products_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_highlighted_products_display_order ON public.highlighted_products USING btree (display_order);


--
-- Name: idx_highlighted_products_is_new; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_highlighted_products_is_new ON public.highlighted_products USING btree (is_new);


--
-- Name: idx_highlighted_products_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_highlighted_products_product_id ON public.highlighted_products USING btree (product_id);


--
-- Name: idx_historical_sales_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historical_sales_company_date ON public.historical_sales USING btree (company_id, sale_date);


--
-- Name: idx_historical_sales_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_historical_sales_unique ON public.historical_sales USING btree (company_id, sale_date);


--
-- Name: idx_login_codes_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_codes_expires ON public.login_codes USING btree (expires_at);


--
-- Name: idx_login_codes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_codes_user ON public.login_codes USING btree (user_id);


--
-- Name: idx_note_attachments_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_attachments_note_id ON public.note_attachments USING btree (note_id);


--
-- Name: idx_note_replies_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_replies_created_at ON public.note_replies USING btree (created_at);


--
-- Name: idx_note_replies_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_replies_created_by ON public.note_replies USING btree (created_by);


--
-- Name: idx_note_replies_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_replies_note_id ON public.note_replies USING btree (note_id);


--
-- Name: idx_order_documents_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_documents_order_id ON public.order_documents USING btree (order_id);


--
-- Name: idx_order_documents_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_documents_public ON public.order_documents USING btree (is_public);


--
-- Name: idx_order_documents_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_documents_type ON public.order_documents USING btree (document_type);


--
-- Name: idx_order_history_action_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_history_action_type ON public.order_history USING btree (action_type);


--
-- Name: idx_order_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_history_created_at ON public.order_history USING btree (created_at DESC);


--
-- Name: idx_order_history_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_history_order_id ON public.order_history USING btree (order_id);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_product_id ON public.order_items USING btree (product_id);


--
-- Name: idx_order_items_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_sort_order ON public.order_items USING btree (order_id, sort_order);


--
-- Name: idx_orders_external_fulfillment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_external_fulfillment_id ON public.orders USING btree (external_fulfillment_id) WHERE (external_fulfillment_id IS NOT NULL);


--
-- Name: idx_orders_invoice_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_invoice_number ON public.orders USING btree (invoice_number);


--
-- Name: idx_orders_so_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_so_number ON public.orders USING btree (so_number);


--
-- Name: idx_password_setup_tokens_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_setup_tokens_expires ON public.password_setup_tokens USING btree (expires_at);


--
-- Name: idx_password_setup_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_setup_tokens_user ON public.password_setup_tokens USING btree (user_id);


--
-- Name: idx_products_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category_id ON public."Products" USING btree (category_id);


--
-- Name: idx_products_hs_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_hs_code ON public."Products" USING btree (hs_code);


--
-- Name: idx_products_made_in; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_made_in ON public."Products" USING btree (made_in);


--
-- Name: idx_products_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_sort_order ON public."Products" USING btree (sort_order, enable);


--
-- Name: idx_slis_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_slis_created_by ON public.slis USING btree (created_by);


--
-- Name: idx_slis_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_slis_order_id ON public.slis USING btree (order_id);


--
-- Name: idx_standalone_slis_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_standalone_slis_company_id ON public.standalone_slis USING btree (company_id);


--
-- Name: idx_standalone_slis_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_standalone_slis_created_at ON public.standalone_slis USING btree (created_at DESC);


--
-- Name: idx_standalone_slis_sli_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_standalone_slis_sli_number ON public.standalone_slis USING btree (sli_number);


--
-- Name: idx_target_periods_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_target_periods_company_id ON public.target_periods USING btree (company_id);


--
-- Name: idx_target_periods_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_target_periods_dates ON public.target_periods USING btree (start_date, end_date);


--
-- Name: inv_inv_dated_snapshots_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inv_inv_dated_snapshots_item_idx ON public.inv_inv_dated_snapshots USING btree (item_code, location_name, as_of_date);


--
-- Name: inv_inv_neg_windows_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inv_inv_neg_windows_item_idx ON public.inv_inv_negative_windows USING btree (item_code, location_ns_id);


--
-- Name: inv_inv_neg_windows_tier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inv_inv_neg_windows_tier_idx ON public.inv_inv_negative_windows USING btree (tier, status);


--
-- Name: inv_inv_opening_snapshots_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inv_inv_opening_snapshots_lookup_idx ON public.inv_inv_opening_snapshots USING btree (item_code, location_name);


--
-- Name: inv_inv_residuals_abs_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inv_inv_residuals_abs_idx ON public.inv_inv_residuals USING btree (residual);


--
-- Name: inv_inv_transactions_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inv_inv_transactions_item_idx ON public.inv_inv_transactions USING btree (item_code, location_ns_id, tran_date);


--
-- Name: inv_inv_transactions_nstx_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inv_inv_transactions_nstx_idx ON public.inv_inv_transactions USING btree (ns_transaction_id);


--
-- Name: inv_inv_trusted_points_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inv_inv_trusted_points_item_idx ON public.inv_inv_trusted_points USING btree (item_code, as_of_date);


--
-- Name: inv_inv_worklist_depth_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inv_inv_worklist_depth_idx ON public.inv_inv_worklist USING btree (depth);


--
-- Name: inv_inv_worklist_item_loc_since_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inv_inv_worklist_item_loc_since_idx ON public.inv_inv_worklist USING btree (item_code, location_ns_id, since);


--
-- Name: locations_subsidiary_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_subsidiary_id_idx ON public."Locations" USING btree (subsidiary_id);


--
-- Name: mv_company_sales_pk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mv_company_sales_pk_idx ON public.mv_company_sales USING btree (company_id, window_key, source);


--
-- Name: mv_company_sales_window_revenue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mv_company_sales_window_revenue_idx ON public.mv_company_sales USING btree (window_key, revenue DESC);


--
-- Name: mv_daily_sales_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mv_daily_sales_day_idx ON public.mv_daily_sales USING btree (day);


--
-- Name: mv_daily_sales_pk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mv_daily_sales_pk_idx ON public.mv_daily_sales USING btree (day, source);


--
-- Name: mv_product_sales_pk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mv_product_sales_pk_idx ON public.mv_product_sales USING btree (product_id, window_key);


--
-- Name: mv_product_sales_window_revenue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mv_product_sales_window_revenue_idx ON public.mv_product_sales USING btree (window_key, revenue DESC);


--
-- Name: orders_location_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_location_id_idx ON public.orders USING btree (location_id);


--
-- Name: sli_signers_single_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sli_signers_single_default ON public.sli_signers USING btree (is_default) WHERE is_default;


--
-- Name: dam_asset_versions dam_asset_versions_set_current; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dam_asset_versions_set_current AFTER INSERT ON public.dam_asset_versions FOR EACH ROW EXECUTE FUNCTION public.dam_set_current_version();


--
-- Name: dam_asset_versions dam_asset_versions_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dam_asset_versions_touch_updated_at BEFORE UPDATE ON public.dam_asset_versions FOR EACH ROW EXECUTE FUNCTION public.dam_touch_updated_at();


--
-- Name: dam_asset_versions dam_asset_versions_update_search_vector; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dam_asset_versions_update_search_vector BEFORE INSERT OR UPDATE ON public.dam_asset_versions FOR EACH ROW EXECUTE FUNCTION public.dam_update_search_vector();


--
-- Name: dam_assets dam_assets_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dam_assets_touch_updated_at BEFORE UPDATE ON public.dam_assets FOR EACH ROW EXECUTE FUNCTION public.dam_touch_updated_at();


--
-- Name: dam_job_queue dam_job_queue_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dam_job_queue_touch BEFORE UPDATE ON public.dam_job_queue FOR EACH ROW EXECUTE FUNCTION public.dam_job_queue_touch_updated_at();


--
-- Name: admin_notes update_admin_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_admin_notes_updated_at BEFORE UPDATE ON public.admin_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: company_notes update_company_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_company_notes_updated_at BEFORE UPDATE ON public.company_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: highlighted_products update_highlighted_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_highlighted_products_updated_at BEFORE UPDATE ON public.highlighted_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: historical_sales update_historical_sales_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_historical_sales_updated_at BEFORE UPDATE ON public.historical_sales FOR EACH ROW EXECUTE FUNCTION public.update_historical_sales_updated_at();


--
-- Name: order_documents update_order_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_order_documents_updated_at BEFORE UPDATE ON public.order_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: slis update_slis_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_slis_updated_at BEFORE UPDATE ON public.slis FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: standalone_slis update_standalone_slis_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_standalone_slis_updated_at BEFORE UPDATE ON public.standalone_slis FOR EACH ROW EXECUTE FUNCTION public.update_standalone_slis_updated_at();


--
-- Name: target_periods update_target_periods_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_target_periods_updated_at BEFORE UPDATE ON public.target_periods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: orders update_target_progress_on_order_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_target_progress_on_order_change AFTER INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_all_target_periods_progress();


--
-- Name: Locations Locations_subsidiary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Locations"
    ADD CONSTRAINT "Locations_subsidiary_id_fkey" FOREIGN KEY (subsidiary_id) REFERENCES public.subsidiaries(id);


--
-- Name: Products Products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Products"
    ADD CONSTRAINT "Products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: admin_notes admin_notes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notes
    ADD CONSTRAINT admin_notes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: admin_notes admin_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notes
    ADD CONSTRAINT admin_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: admins admins_auth_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_auth_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: amazon_fba_batches amazon_fba_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.amazon_fba_batches
    ADD CONSTRAINT amazon_fba_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admins(id) ON DELETE SET NULL;


--
-- Name: campaign_assets campaign_assets_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_assets
    ADD CONSTRAINT campaign_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.dam_assets(id) ON DELETE CASCADE;


--
-- Name: campaign_assets campaign_assets_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_assets
    ADD CONSTRAINT campaign_assets_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaigns campaigns_thumbnail_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_thumbnail_asset_id_fkey FOREIGN KEY (thumbnail_asset_id) REFERENCES public.dam_assets(id) ON DELETE SET NULL;


--
-- Name: client_note_views client_note_views_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_note_views
    ADD CONSTRAINT client_note_views_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_note_views client_note_views_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_note_views
    ADD CONSTRAINT client_note_views_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.company_notes(id) ON DELETE CASCADE;


--
-- Name: clients clients_auth_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_auth_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: clients clients_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: companies companies_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: companies companies_incoterm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_incoterm_id_fkey FOREIGN KEY (incoterm_id) REFERENCES public.incoterms(id);


--
-- Name: companies companies_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_location_id_fkey FOREIGN KEY (location_id) REFERENCES public."Locations"(id);


--
-- Name: companies companies_payment_terms_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_payment_terms_id_fkey FOREIGN KEY (payment_terms_id) REFERENCES public.payment_terms(id);


--
-- Name: companies companies_subsidiary_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_subsidiary_id_fkey FOREIGN KEY (subsidiary_id) REFERENCES public.subsidiaries(id);


--
-- Name: companies companies_support_fund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_support_fund_id_fkey FOREIGN KEY (support_fund_id) REFERENCES public.support_fund_levels(id);


--
-- Name: company_dam_audiences company_dam_audiences_audience_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_dam_audiences
    ADD CONSTRAINT company_dam_audiences_audience_id_fkey FOREIGN KEY (audience_id) REFERENCES public.dam_audiences(id) ON DELETE CASCADE;


--
-- Name: company_dam_audiences company_dam_audiences_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_dam_audiences
    ADD CONSTRAINT company_dam_audiences_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_notes company_notes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_notes
    ADD CONSTRAINT company_notes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_notes company_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_notes
    ADD CONSTRAINT company_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: company_territories company_territories_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_territories
    ADD CONSTRAINT company_territories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: dam_asset_audience_map dam_asset_audience_map_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_audience_map
    ADD CONSTRAINT dam_asset_audience_map_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.dam_assets(id) ON DELETE CASCADE;


--
-- Name: dam_asset_audience_map dam_asset_audience_map_audience_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_audience_map
    ADD CONSTRAINT dam_asset_audience_map_audience_id_fkey FOREIGN KEY (audience_id) REFERENCES public.dam_audiences(id) ON DELETE CASCADE;


--
-- Name: dam_asset_locale_map dam_asset_locale_map_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_locale_map
    ADD CONSTRAINT dam_asset_locale_map_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.dam_assets(id) ON DELETE CASCADE;


--
-- Name: dam_asset_locale_map dam_asset_locale_map_locale_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_locale_map
    ADD CONSTRAINT dam_asset_locale_map_locale_code_fkey FOREIGN KEY (locale_code) REFERENCES public.dam_locales(code) ON DELETE CASCADE;


--
-- Name: dam_asset_region_map dam_asset_region_map_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_region_map
    ADD CONSTRAINT dam_asset_region_map_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.dam_assets(id) ON DELETE CASCADE;


--
-- Name: dam_asset_region_map dam_asset_region_map_region_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_region_map
    ADD CONSTRAINT dam_asset_region_map_region_code_fkey FOREIGN KEY (region_code) REFERENCES public.dam_regions(code) ON DELETE CASCADE;


--
-- Name: dam_asset_renditions dam_asset_renditions_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_renditions
    ADD CONSTRAINT dam_asset_renditions_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.dam_assets(id) ON DELETE CASCADE;


--
-- Name: dam_asset_renditions dam_asset_renditions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_renditions
    ADD CONSTRAINT dam_asset_renditions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: dam_asset_renditions dam_asset_renditions_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_renditions
    ADD CONSTRAINT dam_asset_renditions_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.dam_asset_versions(id) ON DELETE SET NULL;


--
-- Name: dam_asset_subtypes dam_asset_subtypes_asset_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_subtypes
    ADD CONSTRAINT dam_asset_subtypes_asset_type_id_fkey FOREIGN KEY (asset_type_id) REFERENCES public.dam_asset_types(id) ON DELETE CASCADE;


--
-- Name: dam_asset_tag_map dam_asset_tag_map_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_tag_map
    ADD CONSTRAINT dam_asset_tag_map_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.dam_assets(id) ON DELETE CASCADE;


--
-- Name: dam_asset_tag_map dam_asset_tag_map_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_tag_map
    ADD CONSTRAINT dam_asset_tag_map_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.dam_tags(id) ON DELETE CASCADE;


--
-- Name: dam_asset_versions dam_asset_versions_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_versions
    ADD CONSTRAINT dam_asset_versions_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.dam_assets(id) ON DELETE CASCADE;


--
-- Name: dam_asset_versions dam_asset_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_asset_versions
    ADD CONSTRAINT dam_asset_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: dam_assets dam_assets_asset_subtype_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_assets
    ADD CONSTRAINT dam_assets_asset_subtype_id_fkey FOREIGN KEY (asset_subtype_id) REFERENCES public.dam_asset_subtypes(id) ON DELETE SET NULL;


--
-- Name: dam_assets dam_assets_asset_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_assets
    ADD CONSTRAINT dam_assets_asset_type_id_fkey FOREIGN KEY (asset_type_id) REFERENCES public.dam_asset_types(id) ON DELETE SET NULL;


--
-- Name: dam_assets dam_assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_assets
    ADD CONSTRAINT dam_assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: dam_assets dam_assets_current_version_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_assets
    ADD CONSTRAINT dam_assets_current_version_fk FOREIGN KEY (current_version_id) REFERENCES public.dam_asset_versions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;


--
-- Name: dam_assets dam_assets_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_assets
    ADD CONSTRAINT dam_assets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: dam_download_events dam_download_events_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_download_events
    ADD CONSTRAINT dam_download_events_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.dam_assets(id) ON DELETE CASCADE;


--
-- Name: dam_download_events dam_download_events_downloaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_download_events
    ADD CONSTRAINT dam_download_events_downloaded_by_fkey FOREIGN KEY (downloaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: dam_download_events dam_download_events_rendition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_download_events
    ADD CONSTRAINT dam_download_events_rendition_id_fkey FOREIGN KEY (rendition_id) REFERENCES public.dam_asset_renditions(id) ON DELETE SET NULL;


--
-- Name: dam_download_events dam_download_events_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dam_download_events
    ADD CONSTRAINT dam_download_events_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.dam_asset_versions(id) ON DELETE SET NULL;


--
-- Name: highlighted_products highlighted_products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.highlighted_products
    ADD CONSTRAINT highlighted_products_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admins(id);


--
-- Name: highlighted_products highlighted_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.highlighted_products
    ADD CONSTRAINT highlighted_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public."Products"(id) ON DELETE CASCADE;


--
-- Name: historical_sales historical_sales_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historical_sales
    ADD CONSTRAINT historical_sales_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: historical_sales historical_sales_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historical_sales
    ADD CONSTRAINT historical_sales_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admins(id);


--
-- Name: inv_inv_opening_balances inv_inv_opening_balances_item_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_opening_balances
    ADD CONSTRAINT inv_inv_opening_balances_item_code_fkey FOREIGN KEY (item_code) REFERENCES public.inv_inv_items(item_code) ON DELETE CASCADE;


--
-- Name: inv_inv_transactions inv_inv_transactions_item_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inv_inv_transactions
    ADD CONSTRAINT inv_inv_transactions_item_code_fkey FOREIGN KEY (item_code) REFERENCES public.inv_inv_items(item_code) ON DELETE CASCADE;


--
-- Name: inventory_levels inventory_levels_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_levels
    ADD CONSTRAINT inventory_levels_location_id_fkey FOREIGN KEY (location_id) REFERENCES public."Locations"(id) ON DELETE CASCADE;


--
-- Name: inventory_levels inventory_levels_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_levels
    ADD CONSTRAINT inventory_levels_product_id_fkey FOREIGN KEY (product_id) REFERENCES public."Products"(id) ON DELETE CASCADE;


--
-- Name: login_codes login_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_codes
    ADD CONSTRAINT login_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: note_attachments note_attachments_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_attachments
    ADD CONSTRAINT note_attachments_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.company_notes(id) ON DELETE CASCADE;


--
-- Name: note_replies note_replies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_replies
    ADD CONSTRAINT note_replies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admins(id);


--
-- Name: note_replies note_replies_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_replies
    ADD CONSTRAINT note_replies_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.company_notes(id) ON DELETE CASCADE;


--
-- Name: order_documents order_documents_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_documents
    ADD CONSTRAINT order_documents_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_documents order_documents_uploaded_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_documents
    ADD CONSTRAINT order_documents_uploaded_by_id_fkey FOREIGN KEY (uploaded_by_id) REFERENCES auth.users(id);


--
-- Name: order_history order_history_changed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_history
    ADD CONSTRAINT order_history_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES auth.users(id);


--
-- Name: order_history order_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_history
    ADD CONSTRAINT order_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public."Products"(id) ON DELETE RESTRICT;


--
-- Name: orders orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: orders orders_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_location_id_fkey FOREIGN KEY (location_id) REFERENCES public."Locations"(id);


--
-- Name: orders orders_packing_slip_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_packing_slip_generated_by_fkey FOREIGN KEY (packing_slip_generated_by) REFERENCES auth.users(id);


--
-- Name: packing_slips packing_slips_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packing_slips
    ADD CONSTRAINT packing_slips_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: packing_slips packing_slips_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packing_slips
    ADD CONSTRAINT packing_slips_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: password_setup_tokens password_setup_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_setup_tokens
    ADD CONSTRAINT password_setup_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: slis slis_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slis
    ADD CONSTRAINT slis_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admins(id);


--
-- Name: slis slis_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slis
    ADD CONSTRAINT slis_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: slis slis_signer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slis
    ADD CONSTRAINT slis_signer_id_fkey FOREIGN KEY (signer_id) REFERENCES public.sli_signers(id) ON DELETE SET NULL;


--
-- Name: standalone_slis standalone_slis_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standalone_slis
    ADD CONSTRAINT standalone_slis_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: standalone_slis standalone_slis_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standalone_slis
    ADD CONSTRAINT standalone_slis_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.admins(id);


--
-- Name: standalone_slis standalone_slis_signer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.standalone_slis
    ADD CONSTRAINT standalone_slis_signer_id_fkey FOREIGN KEY (signer_id) REFERENCES public.sli_signers(id) ON DELETE SET NULL;


--
-- Name: target_periods target_periods_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_periods
    ADD CONSTRAINT target_periods_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: slis Admins can create SLIs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create SLIs" ON public.slis FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: campaign_assets Admins can create campaign_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create campaign_assets" ON public.campaign_assets FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = auth.uid()) AND (admins.enabled = true)))));


--
-- Name: campaigns Admins can create campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create campaigns" ON public.campaigns FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = auth.uid()) AND (admins.enabled = true)))));


--
-- Name: slis Admins can delete SLIs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete SLIs" ON public.slis FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: campaign_assets Admins can delete campaign_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete campaign_assets" ON public.campaign_assets FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = auth.uid()) AND (admins.enabled = true)))));


--
-- Name: campaigns Admins can delete campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete campaigns" ON public.campaigns FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = auth.uid()) AND (admins.enabled = true)))));


--
-- Name: order_documents Admins can delete order documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete order documents" ON public.order_documents FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: order_documents Admins can insert order documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert order documents" ON public.order_documents FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: order_history Admins can insert order history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert order history" ON public.order_history FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: admin_notes Admins can manage admin notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage admin notes" ON public.admin_notes USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: slis Admins can manage all SLIs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all SLIs" ON public.slis TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: company_notes Admins can manage company notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage company notes" ON public.company_notes USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: company_territories Admins can manage company territories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage company territories" ON public.company_territories USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: highlighted_products Admins can manage highlighted products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage highlighted products" ON public.highlighted_products USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: historical_sales Admins can manage historical sales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage historical sales" ON public.historical_sales USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: incoterms Admins can manage incoterms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage incoterms" ON public.incoterms TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: note_attachments Admins can manage note attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage note attachments" ON public.note_attachments USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: payment_terms Admins can manage payment terms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage payment terms" ON public.payment_terms TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: dam_product_lines Admins can manage product lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage product lines" ON public.dam_product_lines USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = auth.uid()) AND (admins.enabled = true)))));


--
-- Name: target_periods Admins can manage target periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage target periods" ON public.target_periods USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: slis Admins can update SLIs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update SLIs" ON public.slis FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: campaigns Admins can update campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update campaigns" ON public.campaigns FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = auth.uid()) AND (admins.enabled = true)))));


--
-- Name: order_documents Admins can update order documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update order documents" ON public.order_documents FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: slis Admins can view all SLIs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all SLIs" ON public.slis FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: clients Admins can view all clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all clients" ON public.clients FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: order_documents Admins can view all order documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all order documents" ON public.order_documents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: order_history Admins can view all order history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all order history" ON public.order_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: dam_product_lines Admins can view all product lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all product lines" ON public.dam_product_lines FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = auth.uid()) AND (admins.enabled = true)))));


--
-- Name: campaign_assets Admins can view campaign_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view campaign_assets" ON public.campaign_assets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = auth.uid()) AND (admins.enabled = true)))));


--
-- Name: campaigns Admins can view campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view campaigns" ON public.campaigns FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = auth.uid()) AND (admins.enabled = true)))));


--
-- Name: packing_slips Admins full access to packing slips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access to packing slips" ON public.packing_slips USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: inventory_levels Admins manage inventory_levels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage inventory_levels" ON public.inventory_levels USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: categories Allow admins to update categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow admins to update categories" ON public.categories FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: categories Allow authenticated read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated read" ON public.categories FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: packing_slips Clients can access their packing slips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can access their packing slips" ON public.packing_slips TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.orders
     JOIN public.clients ON ((orders.company_id = clients.company_id)))
  WHERE ((orders.id = packing_slips.order_id) AND (clients.id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.orders
     JOIN public.clients ON ((orders.company_id = clients.company_id)))
  WHERE ((orders.id = packing_slips.order_id) AND (clients.id = auth.uid())))));


--
-- Name: order_history Clients can insert order history for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can insert order history for their company" ON public.order_history FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.orders o
     JOIN public.clients c ON ((c.company_id = o.company_id)))
  WHERE ((o.id = order_history.order_id) AND (c.id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid())))));


--
-- Name: highlighted_products Clients can view highlighted products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view highlighted products" ON public.highlighted_products FOR SELECT USING (true);


--
-- Name: clients Clients can view own data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view own data" ON public.clients FOR SELECT USING ((auth.uid() = id));


--
-- Name: order_documents Clients can view public documents for their orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view public documents for their orders" ON public.order_documents FOR SELECT USING (((is_public = true) AND (EXISTS ( SELECT 1
   FROM (public.orders
     JOIN public.clients ON ((orders.user_id = clients.id)))
  WHERE ((orders.id = order_documents.order_id) AND (clients.id = auth.uid()))))));


--
-- Name: slis Clients can view their company SLIs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view their company SLIs" ON public.slis FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.clients
     JOIN public.orders ON ((orders.company_id = clients.company_id)))
  WHERE ((clients.id = auth.uid()) AND (slis.order_id = orders.id) AND (slis.sli_type = 'order'::text)))));


--
-- Name: note_attachments Clients can view their company note attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view their company note attachments" ON public.note_attachments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.clients
     JOIN public.company_notes ON ((company_notes.company_id = clients.company_id)))
  WHERE ((clients.id = auth.uid()) AND (company_notes.id = note_attachments.note_id)))));


--
-- Name: company_notes Clients can view their company notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view their company notes" ON public.company_notes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.clients
  WHERE ((clients.id = auth.uid()) AND (clients.company_id = company_notes.company_id)))));


--
-- Name: target_periods Clients can view their company target periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view their company target periods" ON public.target_periods FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.clients
  WHERE ((clients.id = auth.uid()) AND (clients.company_id = target_periods.company_id)))));


--
-- Name: company_territories Clients can view their company territories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view their company territories" ON public.company_territories FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.clients
  WHERE ((clients.id = auth.uid()) AND (clients.company_id = company_territories.company_id)))));


--
-- Name: order_history Clients can view their company's order history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view their company's order history" ON public.order_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.orders o
     JOIN public.clients c ON ((c.company_id = o.company_id)))
  WHERE ((o.id = order_history.order_id) AND (c.id = auth.uid())))));


--
-- Name: order_history Clients can view their own order history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view their own order history" ON public.order_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.orders
     JOIN public.clients ON ((orders.user_id = clients.id)))
  WHERE ((orders.id = order_history.order_id) AND (clients.id = auth.uid())))));


--
-- Name: incoterms Everyone can view incoterms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can view incoterms" ON public.incoterms FOR SELECT TO authenticated USING (true);


--
-- Name: payment_terms Everyone can view payment terms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can view payment terms" ON public.payment_terms FOR SELECT TO authenticated USING (true);


--
-- Name: Locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Locations" ENABLE ROW LEVEL SECURITY;

--
-- Name: Products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Products" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_documents admin_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access ON public.order_documents TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE (admins.id = auth.uid()))));


--
-- Name: admin_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

--
-- Name: admins admins_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_admin_all ON public.admins TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: amazon_fba_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.amazon_fba_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: amazon_fba_batches amazon_fba_batches_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY amazon_fba_batches_admin_all ON public.amazon_fba_batches TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: amazon_fba_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.amazon_fba_config ENABLE ROW LEVEL SECURITY;

--
-- Name: amazon_fba_config amazon_fba_config_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY amazon_fba_config_admin_all ON public.amazon_fba_config TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: amazon_item_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.amazon_item_map ENABLE ROW LEVEL SECURITY;

--
-- Name: amazon_item_map amazon_item_map_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY amazon_item_map_admin_all ON public.amazon_item_map TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: api_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

--
-- Name: classes classes_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_admin_all ON public.classes TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: classes classes_client_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_client_select_own ON public.classes FOR SELECT TO authenticated USING ((id = ( SELECT companies.class_id
   FROM public.companies
  WHERE (companies.id = public.auth_company_id()))));


--
-- Name: order_documents client_delete_company_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_delete_company_documents ON public.order_documents FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.clients c
     JOIN public.orders o ON ((o.company_id = c.company_id)))
  WHERE ((c.id = auth.uid()) AND (o.id = order_documents.order_id)))));


--
-- Name: client_note_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_note_views ENABLE ROW LEVEL SECURITY;

--
-- Name: client_note_views client_note_views_self_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_note_views_self_delete ON public.client_note_views FOR DELETE TO authenticated USING ((client_id = ( SELECT auth.uid() AS uid)));


--
-- Name: client_note_views client_note_views_self_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_note_views_self_insert ON public.client_note_views FOR INSERT TO authenticated WITH CHECK ((client_id = ( SELECT auth.uid() AS uid)));


--
-- Name: client_note_views client_note_views_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_note_views_self_select ON public.client_note_views FOR SELECT TO authenticated USING (((client_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = ( SELECT auth.uid() AS uid)) AND (admins.enabled = true))))));


--
-- Name: order_documents client_update_company_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_update_company_documents ON public.order_documents FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.clients c
     JOIN public.orders o ON ((o.company_id = c.company_id)))
  WHERE ((c.id = auth.uid()) AND (o.id = order_documents.order_id)))));


--
-- Name: order_documents client_upload_company_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_upload_company_documents ON public.order_documents FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.clients c
     JOIN public.orders o ON ((o.company_id = c.company_id)))
  WHERE ((c.id = auth.uid()) AND (o.id = order_documents.order_id)))));


--
-- Name: order_documents client_view_company_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_view_company_documents ON public.order_documents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.clients c
     JOIN public.orders o ON ((o.company_id = c.company_id)))
  WHERE ((c.id = auth.uid()) AND (o.id = order_documents.order_id)))));


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: clients clients_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_admin_all ON public.clients TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: clients clients_self_or_same_company_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_self_or_same_company_select ON public.clients FOR SELECT TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR (company_id = public.auth_company_id())));


--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_admin_all ON public.companies TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: companies companies_client_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_client_select_own ON public.companies FOR SELECT TO authenticated USING ((id = public.auth_company_id()));


--
-- Name: company_dam_audiences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_dam_audiences ENABLE ROW LEVEL SECURITY;

--
-- Name: company_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: company_territories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_territories ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_asset_audience_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_asset_audience_map ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_asset_audience_map dam_asset_audience_map_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_audience_map_admin_full ON public.dam_asset_audience_map USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_asset_audience_map dam_asset_audience_map_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_audience_map_read_authenticated ON public.dam_asset_audience_map FOR SELECT USING (((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.dam_assets da
  WHERE ((da.id = dam_asset_audience_map.asset_id) AND (NOT da.is_archived))))));


--
-- Name: dam_asset_locale_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_asset_locale_map ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_asset_locale_map dam_asset_locale_map_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_locale_map_admin_full ON public.dam_asset_locale_map USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_asset_locale_map dam_asset_locale_map_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_locale_map_read_authenticated ON public.dam_asset_locale_map FOR SELECT USING (((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.dam_assets da
  WHERE ((da.id = dam_asset_locale_map.asset_id) AND (NOT da.is_archived))))));


--
-- Name: dam_asset_region_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_asset_region_map ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_asset_region_map dam_asset_region_map_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_region_map_admin_full ON public.dam_asset_region_map USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_asset_region_map dam_asset_region_map_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_region_map_read_authenticated ON public.dam_asset_region_map FOR SELECT USING (((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.dam_assets da
  WHERE ((da.id = dam_asset_region_map.asset_id) AND (NOT da.is_archived))))));


--
-- Name: dam_asset_renditions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_asset_renditions ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_asset_renditions dam_asset_renditions_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_renditions_admin_full ON public.dam_asset_renditions USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_asset_renditions dam_asset_renditions_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_renditions_read_authenticated ON public.dam_asset_renditions FOR SELECT USING (((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.dam_assets da
  WHERE ((da.id = dam_asset_renditions.asset_id) AND (NOT da.is_archived))))));


--
-- Name: dam_asset_subtypes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_asset_subtypes ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_asset_subtypes dam_asset_subtypes_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_subtypes_admin_full ON public.dam_asset_subtypes USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_asset_subtypes dam_asset_subtypes_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_subtypes_read_authenticated ON public.dam_asset_subtypes FOR SELECT USING (((auth.uid() IS NOT NULL) AND (active = true)));


--
-- Name: dam_asset_tag_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_asset_tag_map ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_asset_tag_map dam_asset_tag_map_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_tag_map_admin_full ON public.dam_asset_tag_map USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_asset_tag_map dam_asset_tag_map_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_tag_map_read_authenticated ON public.dam_asset_tag_map FOR SELECT USING (((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.dam_assets da
  WHERE ((da.id = dam_asset_tag_map.asset_id) AND (NOT da.is_archived))))));


--
-- Name: dam_asset_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_asset_types ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_asset_types dam_asset_types_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_types_admin_full ON public.dam_asset_types USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_asset_types dam_asset_types_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_types_read_authenticated ON public.dam_asset_types FOR SELECT USING (((auth.uid() IS NOT NULL) AND (active = true)));


--
-- Name: dam_asset_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_asset_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_asset_versions dam_asset_versions_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_versions_admin_full ON public.dam_asset_versions USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_asset_versions dam_asset_versions_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_asset_versions_read_authenticated ON public.dam_asset_versions FOR SELECT USING (((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.dam_assets da
  WHERE ((da.id = dam_asset_versions.asset_id) AND (NOT da.is_archived))))));


--
-- Name: dam_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_assets dam_assets_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_assets_admin_full ON public.dam_assets USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_assets dam_assets_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_assets_read_authenticated ON public.dam_assets FOR SELECT USING (((NOT is_archived) AND (auth.uid() IS NOT NULL)));


--
-- Name: dam_audiences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_audiences ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_audiences dam_audiences_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_audiences_admin_full ON public.dam_audiences USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_audiences dam_audiences_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_audiences_read_authenticated ON public.dam_audiences FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: dam_download_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_download_events ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_download_events dam_download_events_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_download_events_admin_full ON public.dam_download_events USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_download_events dam_download_events_user_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_download_events_user_insert ON public.dam_download_events FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: dam_download_events dam_download_events_user_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_download_events_user_read_own ON public.dam_download_events FOR SELECT USING ((auth.uid() = downloaded_by));


--
-- Name: dam_job_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_job_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_job_queue dam_job_queue_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_job_queue_modify ON public.dam_job_queue USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_job_queue dam_job_queue_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_job_queue_read ON public.dam_job_queue FOR SELECT USING (true);


--
-- Name: dam_locales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_locales ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_locales dam_locales_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_locales_admin_full ON public.dam_locales USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_locales dam_locales_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_locales_read_authenticated ON public.dam_locales FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: dam_product_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_product_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_regions ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_regions dam_regions_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_regions_admin_full ON public.dam_regions USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_regions dam_regions_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_regions_read_authenticated ON public.dam_regions FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: dam_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dam_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: dam_tags dam_tags_admin_full; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_tags_admin_full ON public.dam_tags USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: dam_tags dam_tags_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dam_tags_read_authenticated ON public.dam_tags FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: highlighted_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.highlighted_products ENABLE ROW LEVEL SECURITY;

--
-- Name: historical_sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.historical_sales ENABLE ROW LEVEL SECURITY;

--
-- Name: incoterms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incoterms ENABLE ROW LEVEL SECURITY;

--
-- Name: inv_inv_dated_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inv_inv_dated_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: inv_inv_dated_snapshots inv_inv_dated_snapshots_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inv_inv_dated_snapshots_admin_all ON public.inv_inv_dated_snapshots TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: inv_inv_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inv_inv_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inv_inv_items inv_inv_items_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inv_inv_items_admin_all ON public.inv_inv_items TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: inv_inv_negative_windows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inv_inv_negative_windows ENABLE ROW LEVEL SECURITY;

--
-- Name: inv_inv_negative_windows inv_inv_negative_windows_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inv_inv_negative_windows_admin_all ON public.inv_inv_negative_windows TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: inv_inv_opening_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inv_inv_opening_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: inv_inv_opening_balances inv_inv_opening_balances_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inv_inv_opening_balances_admin_all ON public.inv_inv_opening_balances TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: inv_inv_opening_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inv_inv_opening_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: inv_inv_opening_snapshots inv_inv_opening_snapshots_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inv_inv_opening_snapshots_admin_all ON public.inv_inv_opening_snapshots TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: inv_inv_plan_markers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inv_inv_plan_markers ENABLE ROW LEVEL SECURITY;

--
-- Name: inv_inv_plan_markers inv_inv_plan_markers_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inv_inv_plan_markers_admin_all ON public.inv_inv_plan_markers TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: inv_inv_residuals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inv_inv_residuals ENABLE ROW LEVEL SECURITY;

--
-- Name: inv_inv_residuals inv_inv_residuals_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inv_inv_residuals_admin_all ON public.inv_inv_residuals TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: inv_inv_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inv_inv_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: inv_inv_transactions inv_inv_transactions_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inv_inv_transactions_admin_all ON public.inv_inv_transactions TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: inv_inv_trusted_points; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inv_inv_trusted_points ENABLE ROW LEVEL SECURITY;

--
-- Name: inv_inv_trusted_points inv_inv_trusted_points_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inv_inv_trusted_points_admin_all ON public.inv_inv_trusted_points TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: inv_inv_worklist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inv_inv_worklist ENABLE ROW LEVEL SECURITY;

--
-- Name: inv_inv_worklist inv_inv_worklist_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inv_inv_worklist_admin_all ON public.inv_inv_worklist TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: inv_inv_worklist_meta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inv_inv_worklist_meta ENABLE ROW LEVEL SECURITY;

--
-- Name: inv_inv_worklist_meta inv_inv_worklist_meta_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inv_inv_worklist_meta_admin_all ON public.inv_inv_worklist_meta TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: inventory_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_levels ENABLE ROW LEVEL SECURITY;

--
-- Name: Locations locations_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_admin_all ON public."Locations" TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: Locations locations_client_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_client_select_own ON public."Locations" FOR SELECT TO authenticated USING ((id = ( SELECT companies.location_id
   FROM public.companies
  WHERE (companies.id = public.auth_company_id()))));


--
-- Name: login_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: netsuite_item_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.netsuite_item_map ENABLE ROW LEVEL SECURITY;

--
-- Name: netsuite_item_map netsuite_item_map_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY netsuite_item_map_admin_all ON public.netsuite_item_map TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: note_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: note_replies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: note_replies note_replies_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY note_replies_admin_all ON public.note_replies TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = ( SELECT auth.uid() AS uid)) AND (admins.enabled = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = ( SELECT auth.uid() AS uid)) AND (admins.enabled = true)))));


--
-- Name: note_replies note_replies_client_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY note_replies_client_insert ON public.note_replies FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (public.company_notes n
     JOIN public.clients c ON ((c.company_id = n.company_id)))
  WHERE ((n.id = note_replies.note_id) AND (n.visible_to_client = true) AND (c.id = ( SELECT auth.uid() AS uid)) AND (c.enabled = true))))));


--
-- Name: note_replies note_replies_client_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY note_replies_client_select ON public.note_replies FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.company_notes n
     JOIN public.clients c ON ((c.company_id = n.company_id)))
  WHERE ((n.id = note_replies.note_id) AND (n.visible_to_client = true) AND (c.id = ( SELECT auth.uid() AS uid)) AND (c.enabled = true)))));


--
-- Name: order_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: order_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_admin_all ON public.order_items TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: order_items order_items_client_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_client_delete ON public.order_items FOR DELETE TO authenticated USING ((public.auth_has_permission('orders'::text) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.company_id = public.auth_company_id()) AND (o.status = ANY (ARRAY['Draft'::text, 'Open'::text])))))));


--
-- Name: order_items order_items_client_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_client_insert ON public.order_items FOR INSERT TO authenticated WITH CHECK ((public.auth_has_permission('orders'::text) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.company_id = public.auth_company_id()) AND (o.status = ANY (ARRAY['Draft'::text, 'Open'::text])))))));


--
-- Name: order_items order_items_client_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_client_select ON public.order_items FOR SELECT TO authenticated USING ((public.auth_has_permission('orders'::text) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.company_id = public.auth_company_id()))))));


--
-- Name: order_items order_items_client_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_client_update ON public.order_items FOR UPDATE TO authenticated USING ((public.auth_has_permission('orders'::text) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.company_id = public.auth_company_id()) AND (o.status = ANY (ARRAY['Draft'::text, 'Open'::text]))))))) WITH CHECK ((public.auth_has_permission('orders'::text) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.company_id = public.auth_company_id()) AND (o.status = ANY (ARRAY['Draft'::text, 'Open'::text])))))));


--
-- Name: order_items order_items_client_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_client_write ON public.order_items TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.company_id = public.auth_company_id()) AND (o.status = ANY (ARRAY['Draft'::text, 'Open'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.company_id = public.auth_company_id()) AND (o.status = ANY (ARRAY['Draft'::text, 'Open'::text]))))));


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_admin_all ON public.orders TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: orders orders_client_delete_cancelled; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_client_delete_cancelled ON public.orders FOR DELETE TO authenticated USING (((company_id = public.auth_company_id()) AND (status = 'Cancelled'::text) AND public.auth_has_permission('orders'::text)));


--
-- Name: orders orders_client_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_client_insert ON public.orders FOR INSERT TO authenticated WITH CHECK (((company_id = public.auth_company_id()) AND (status = ANY (ARRAY['Draft'::text, 'Open'::text])) AND public.auth_has_permission('orders'::text)));


--
-- Name: orders orders_client_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_client_select ON public.orders FOR SELECT TO authenticated USING (((company_id = public.auth_company_id()) AND public.auth_has_permission('orders'::text)));


--
-- Name: orders orders_client_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_client_update ON public.orders FOR UPDATE TO authenticated USING (((company_id = public.auth_company_id()) AND (status = ANY (ARRAY['Draft'::text, 'Open'::text])) AND public.auth_has_permission('orders'::text))) WITH CHECK (((company_id = public.auth_company_id()) AND (status = ANY (ARRAY['Draft'::text, 'Open'::text])) AND public.auth_has_permission('orders'::text)));


--
-- Name: packing_slips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.packing_slips ENABLE ROW LEVEL SECURITY;

--
-- Name: password_setup_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_setup_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_terms ENABLE ROW LEVEL SECURITY;

--
-- Name: Products products_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_admin_all ON public."Products" TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: Products products_authenticated_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_authenticated_select ON public."Products" FOR SELECT TO authenticated USING (true);


--
-- Name: sli_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sli_config ENABLE ROW LEVEL SECURITY;

--
-- Name: sli_config sli_config_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sli_config_admin_all ON public.sli_config TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: sli_signers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sli_signers ENABLE ROW LEVEL SECURITY;

--
-- Name: sli_signers sli_signers_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sli_signers_admin_all ON public.sli_signers TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: slis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.slis ENABLE ROW LEVEL SECURITY;

--
-- Name: standalone_slis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.standalone_slis ENABLE ROW LEVEL SECURITY;

--
-- Name: standalone_slis standalone_slis_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY standalone_slis_admin_all ON public.standalone_slis TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = ( SELECT auth.uid() AS uid)) AND (admins.enabled = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins
  WHERE ((admins.id = ( SELECT auth.uid() AS uid)) AND (admins.enabled = true)))));


--
-- Name: subsidiaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subsidiaries ENABLE ROW LEVEL SECURITY;

--
-- Name: subsidiaries subsidiaries_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subsidiaries_admin_all ON public.subsidiaries TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: subsidiaries subsidiaries_client_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subsidiaries_client_select_own ON public.subsidiaries FOR SELECT TO authenticated USING ((id = ( SELECT companies.subsidiary_id
   FROM public.companies
  WHERE (companies.id = public.auth_company_id()))));


--
-- Name: support_fund_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_fund_levels ENABLE ROW LEVEL SECURITY;

--
-- Name: support_fund_levels support_fund_levels_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_fund_levels_admin_all ON public.support_fund_levels TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());


--
-- Name: support_fund_levels support_fund_levels_client_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY support_fund_levels_client_select_own ON public.support_fund_levels FOR SELECT TO authenticated USING ((id = ( SELECT companies.support_fund_id
   FROM public.companies
  WHERE (companies.id = public.auth_company_id()))));


--
-- Name: target_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.target_periods ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict QidjqDjuDpgm6CoiiDBNqL8SlUZnq75FQFR9QALLj4FX2J4FYs1Ic1h89pfVE7c

