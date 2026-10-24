/**
 * Live dependencies for AP processing on this environment: the invoice reader
 * (when an AI key is configured) and the NetSuite the module posts to (when
 * its credentials are). Either can be missing — processing says so instead
 * of guessing.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNetSuiteForTarget } from '../shopify/engine/nsTarget';
import { createInvoiceReader } from './reader';
import { getApSettings } from './store';
import type { ProcessDeps } from './process';

export async function liveApDeps(db: SupabaseClient): Promise<ProcessDeps> {
  const { ns_target } = await getApSettings(db);
  let ns: ProcessDeps['ns'] = null;
  try {
    ns = createNetSuiteForTarget(ns_target);
  } catch {
    ns = null;
  }
  return { reader: await createInvoiceReader(), ns };
}
