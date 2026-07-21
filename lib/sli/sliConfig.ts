import { SupabaseClient } from '@supabase/supabase-js';

/**
 * SLI document configuration — USPPI block, freight location, state of origin
 * (sli_config table) and signers (sli_signers table).
 *
 * The DEFAULTS below are the values that were hard-coded in the renderers
 * before the config tables existed. They double as a safety net: if the
 * migration hasn't been applied yet (code deploys before SQL) or a field is
 * left empty, documents render exactly as before.
 */

export interface SLIConfig {
  usppi_name: string;
  usppi_address_line1: string;
  usppi_address_line2: string;
  usppi_country: string;
  usppi_ein: string;
  freight_location_name: string;
  freight_location_address_line1: string;
  freight_location_address_line2: string;
  freight_location_country: string;
  state_of_origin: string;
}

export interface SLISigner {
  id?: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  signature_url: string;
}

export const SLI_CONFIG_DEFAULTS: SLIConfig = {
  usppi_name: 'Qiqi INC',
  usppi_address_line1: '4625 West Nevso Drive, Suite 2',
  usppi_address_line2: 'Las Vegas, NV 89103',
  usppi_country: 'United States',
  usppi_ein: '86-2244756',
  freight_location_name: 'PACKABLE / Webb Enterprises',
  freight_location_address_line1: '1516 Motor Parkway',
  freight_location_address_line2: 'Islandia, New York, 11749',
  freight_location_country: 'United States',
  state_of_origin: 'NY',
};

export const SLI_SIGNER_DEFAULTS: SLISigner = {
  name: 'Aaron Lisani',
  title: 'CPO',
  email: 'aaron@qiqiglobal.com',
  phone: '00972-54-6248884',
  signature_url: '/templates/Sig.png',
};

/** Merge a DB row over the defaults; empty/null fields fall back per-field. */
export function mergeSLIConfig(row: Partial<SLIConfig> | null | undefined): SLIConfig {
  const merged = { ...SLI_CONFIG_DEFAULTS };
  if (!row) return merged;
  for (const key of Object.keys(merged) as (keyof SLIConfig)[]) {
    const value = row[key];
    if (typeof value === 'string' && value.trim() !== '') merged[key] = value;
  }
  return merged;
}

export function mergeSLISigner(row: Partial<SLISigner> | null | undefined): SLISigner {
  const merged = { ...SLI_SIGNER_DEFAULTS };
  if (!row) return merged;
  if (row.id) merged.id = row.id;
  for (const key of ['name', 'title', 'email', 'phone', 'signature_url'] as const) {
    const value = row[key];
    if (typeof value === 'string' && value.trim() !== '') merged[key] = value;
  }
  return merged;
}

/**
 * Load the SLI render context (config + signer) server-side.
 * signerId: the document's stored signer; falls back to the default signer,
 * then to SLI_SIGNER_DEFAULTS. Never throws — missing tables (migration not
 * yet applied) resolve to the legacy hard-coded values.
 */
export async function getSLIRenderContext(
  supabaseAdmin: SupabaseClient,
  signerId?: string | null
): Promise<{ config: SLIConfig; signer: SLISigner }> {
  let configRow: Partial<SLIConfig> | null = null;
  let signerRow: Partial<SLISigner> | null = null;

  try {
    const { data } = await supabaseAdmin.from('sli_config').select('*').eq('id', 1).maybeSingle();
    configRow = data;
  } catch {
    // table missing — use defaults
  }

  try {
    if (signerId) {
      const { data } = await supabaseAdmin
        .from('sli_signers')
        .select('*')
        .eq('id', signerId)
        .maybeSingle();
      signerRow = data;
    }
    if (!signerRow) {
      const { data } = await supabaseAdmin
        .from('sli_signers')
        .select('*')
        .eq('is_default', true)
        .maybeSingle();
      signerRow = data;
    }
  } catch {
    // table missing — use defaults
  }

  return { config: mergeSLIConfig(configRow), signer: mergeSLISigner(signerRow) };
}
