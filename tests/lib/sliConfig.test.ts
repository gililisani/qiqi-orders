import { describe, it, expect } from 'vitest';
import {
  mergeSLIConfig,
  mergeSLISigner,
  SLI_CONFIG_DEFAULTS,
  SLI_SIGNER_DEFAULTS,
} from '@/lib/sli/sliConfig';
import { validateSignature } from '@/lib/sli/signatureValidation';

describe('mergeSLIConfig', () => {
  it('returns the legacy defaults when no row exists (pre-migration safety)', () => {
    expect(mergeSLIConfig(null)).toEqual(SLI_CONFIG_DEFAULTS);
    expect(mergeSLIConfig(undefined)).toEqual(SLI_CONFIG_DEFAULTS);
  });

  it('uses DB values when present', () => {
    const merged = mergeSLIConfig({
      freight_location_name: 'BrandFox 3PL',
      state_of_origin: 'CA',
    });
    expect(merged.freight_location_name).toBe('BrandFox 3PL');
    expect(merged.state_of_origin).toBe('CA');
    expect(merged.usppi_name).toBe(SLI_CONFIG_DEFAULTS.usppi_name);
  });

  it('falls back per-field on empty or whitespace-only values', () => {
    const merged = mergeSLIConfig({ usppi_ein: '', freight_location_name: '   ' });
    expect(merged.usppi_ein).toBe(SLI_CONFIG_DEFAULTS.usppi_ein);
    expect(merged.freight_location_name).toBe(SLI_CONFIG_DEFAULTS.freight_location_name);
  });
});

describe('mergeSLISigner', () => {
  it('returns the legacy default signer when no row exists', () => {
    expect(mergeSLISigner(null)).toEqual(SLI_SIGNER_DEFAULTS);
  });

  it('uses DB values and keeps the id', () => {
    const merged = mergeSLISigner({ id: 'abc', name: 'New Signer', signature_url: 'data:image/png;base64,xyz' });
    expect(merged.id).toBe('abc');
    expect(merged.name).toBe('New Signer');
    expect(merged.signature_url).toBe('data:image/png;base64,xyz');
    expect(merged.title).toBe(SLI_SIGNER_DEFAULTS.title);
  });
});

describe('validateSignature', () => {
  it('accepts empty, app-relative template paths, and image data URLs', () => {
    expect(validateSignature('')).toBeNull();
    expect(validateSignature(null)).toBeNull();
    expect(validateSignature(undefined)).toBeNull();
    expect(validateSignature('/templates/Sig.png')).toBeNull();
    expect(validateSignature('data:image/png;base64,iVBORw0KGgo=')).toBeNull();
  });

  it('rejects non-image data URLs and external URLs', () => {
    expect(validateSignature('data:text/html;base64,PGI+')).toBeTruthy();
    expect(validateSignature('https://example.com/sig.png')).toBeTruthy();
    expect(validateSignature(123)).toBeTruthy();
  });

  it('rejects oversized images', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(2_000_001);
    expect(validateSignature(big)).toBeTruthy();
  });
});
