import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SLI_CHECKBOXES,
  normalizeSLICheckboxStates,
} from '@/lib/sli/checkboxStates';

describe('normalizeSLICheckboxStates', () => {
  it('returns defaults for null/undefined/empty', () => {
    expect(normalizeSLICheckboxStates(null)).toEqual(DEFAULT_SLI_CHECKBOXES);
    expect(normalizeSLICheckboxStates(undefined)).toEqual(DEFAULT_SLI_CHECKBOXES);
    expect(normalizeSLICheckboxStates({})).toEqual(DEFAULT_SLI_CHECKBOXES);
  });

  it('maps the legacy standalone-form keys onto the canonical PDF keys', () => {
    // Pre-consolidation standalone rows: Box 24/40/48 stored under names the
    // PDF never read — the exact bug that rendered them unchecked.
    const normalized = normalizeSLICheckboxStates({
      deliver_to_checkbox: true,
      declaration_statement_checkbox: true,
      signature_checkbox: false,
    });
    expect(normalized.deliver_to).toBe(true);
    expect(normalized.checkbox_40).toBe(true);
    expect(normalized.checkbox_48).toBe(false); // explicit false wins over default true
  });

  it('keeps explicitly stored canonical values, including false', () => {
    const normalized = normalizeSLICheckboxStates({
      related_party_non_related: false, // default is true
      hazardous_material_yes: true,
      checkbox_40: false, // default is true
    });
    expect(normalized.related_party_non_related).toBe(false);
    expect(normalized.hazardous_material_yes).toBe(true);
    expect(normalized.checkbox_40).toBe(false);
  });

  it('fills keys absent from storage with defaults', () => {
    const normalized = normalizeSLICheckboxStates({ insurance_yes: true });
    expect(normalized.insurance_yes).toBe(true);
    expect(normalized.consignee_type_reseller).toBe(true); // default
    expect(normalized.checkbox_48).toBe(true); // default
  });

  it('drops unknown keys and non-boolean values', () => {
    const normalized = normalizeSLICheckboxStates({
      not_a_real_box: true,
      checkbox_40: 'yes' as unknown as boolean,
    });
    expect('not_a_real_box' in normalized).toBe(false);
    expect(normalized.checkbox_40).toBe(true); // default kept, string ignored
  });

  it('never mutates the exported defaults', () => {
    const before = { ...DEFAULT_SLI_CHECKBOXES };
    const normalized = normalizeSLICheckboxStates({ deliver_to_checkbox: true });
    normalized.checkbox_39 = true;
    expect(DEFAULT_SLI_CHECKBOXES).toEqual(before);
  });
});
