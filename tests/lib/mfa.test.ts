import { describe, it, expect } from 'vitest';
import {
  MFA_MAX_AGE_DAYS,
  latestTotpTimestampSeconds,
  isTotpStale,
} from '@/lib/mfa';

const DAY_S = 24 * 60 * 60;

describe('latestTotpTimestampSeconds', () => {
  it('returns null for empty/missing amr', () => {
    expect(latestTotpTimestampSeconds(null)).toBeNull();
    expect(latestTotpTimestampSeconds(undefined)).toBeNull();
    expect(latestTotpTimestampSeconds([])).toBeNull();
  });

  it('ignores non-totp methods', () => {
    expect(
      latestTotpTimestampSeconds([{ method: 'password', timestamp: 1000 }])
    ).toBeNull();
  });

  it('picks the LATEST totp entry', () => {
    expect(
      latestTotpTimestampSeconds([
        { method: 'totp', timestamp: 1000 },
        { method: 'password', timestamp: 5000 },
        { method: 'totp', timestamp: 3000 },
      ])
    ).toBe(3000);
  });

  it('drops entries with a non-numeric timestamp', () => {
    expect(
      latestTotpTimestampSeconds([
        { method: 'totp', timestamp: 'bad' as unknown as number },
      ])
    ).toBeNull();
  });
});

describe('isTotpStale', () => {
  const nowMs = 1_800_000_000_000; // fixed "now"

  it('missing timestamp is NOT stale (soft behavior)', () => {
    expect(isTotpStale(null, nowMs)).toBe(false);
    expect(isTotpStale([{ method: 'password', timestamp: 1 }], nowMs)).toBe(false);
  });

  it('fresh verification is not stale', () => {
    const ts = nowMs / 1000 - 1 * DAY_S; // 1 day ago
    expect(isTotpStale([{ method: 'totp', timestamp: ts }], nowMs)).toBe(false);
  });

  it('just inside the window is not stale', () => {
    const ts = nowMs / 1000 - (MFA_MAX_AGE_DAYS * DAY_S - 60);
    expect(isTotpStale([{ method: 'totp', timestamp: ts }], nowMs)).toBe(false);
  });

  it('older than MFA_MAX_AGE_DAYS is stale', () => {
    const ts = nowMs / 1000 - (MFA_MAX_AGE_DAYS * DAY_S + 60);
    expect(isTotpStale([{ method: 'totp', timestamp: ts }], nowMs)).toBe(true);
  });

  it('uses the latest entry when several exist', () => {
    const oldTs = nowMs / 1000 - (MFA_MAX_AGE_DAYS + 10) * DAY_S;
    const freshTs = nowMs / 1000 - 1 * DAY_S;
    expect(
      isTotpStale(
        [
          { method: 'totp', timestamp: oldTs },
          { method: 'totp', timestamp: freshTs },
        ],
        nowMs
      )
    ).toBe(false);
  });
});
