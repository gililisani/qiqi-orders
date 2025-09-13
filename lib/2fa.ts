// lib/2fa.ts
// 2FA utilities using crypto-js for TOTP generation

import CryptoJS from 'crypto-js';

// Base32 alphabet for TOTP secret encoding
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generate a random TOTP secret key
 */
export function generateTOTPSecret(): string {
  const randomBytes = CryptoJS.lib.WordArray.random(20); // 160 bits
  return base32Encode(randomBytes);
}

/**
 * Generate recovery codes for 2FA backup
 */
export function generateRecoveryCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const randomBytes = CryptoJS.lib.WordArray.random(4); // 32 bits
    const code = base32Encode(randomBytes).substring(0, 8).toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * Generate TOTP code from secret and timestamp
 */
export function generateTOTPCode(secret: string, timestamp?: number): string {
  const time = timestamp || Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(time / 30); // 30-second time step
  
  const key = base32Decode(secret);
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(4, timeStep, false); // Big-endian
  
  const timeBytes = new Uint8Array(timeBuffer);
  const timeWordArray = CryptoJS.lib.WordArray.create(timeBytes);
  
  const hmac = CryptoJS.HmacSHA1(timeWordArray, key);
  const hmacBytes = hmac.toString(CryptoJS.enc.Hex);
  
  // Dynamic truncation
  const offset = parseInt(hmacBytes.slice(-1), 16);
  const truncated = parseInt(hmacBytes.slice(offset * 2, offset * 2 + 8), 16);
  const code = (truncated & 0x7fffffff) % 1000000;
  
  return code.toString().padStart(6, '0');
}

/**
 * Verify TOTP code with tolerance for clock skew
 */
export function verifyTOTPCode(secret: string, code: string, tolerance: number = 1): boolean {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // Check current time step and adjacent time steps for tolerance
  for (let i = -tolerance; i <= tolerance; i++) {
    const timeStep = Math.floor(currentTime / 30) + i;
    const expectedCode = generateTOTPCode(secret, timeStep * 30);
    if (expectedCode === code) {
      return true;
    }
  }
  
  return false;
}

/**
 * Verify recovery code
 */
export function verifyRecoveryCode(recoveryCodes: string[], code: string): boolean {
  return recoveryCodes.includes(code.toUpperCase());
}

/**
 * Generate QR code data URL for authenticator app setup
 */
export function generateQRCodeDataURL(secret: string, email: string, issuer: string = 'Qiqi Orders'): string {
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
  
  // For now, return the OTPAUTH URL - in production, you'd use a QR code library
  // This can be used with a QR code generator service or library
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;
}

/**
 * Base32 encoding
 */
function base32Encode(wordArray: CryptoJS.lib.WordArray): string {
  const bytes = wordArray.toString(CryptoJS.enc.Hex);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 2) {
    binary += parseInt(bytes.substr(i, 2), 16).toString(2).padStart(8, '0');
  }
  
  // Pad to multiple of 5
  while (binary.length % 5 !== 0) {
    binary += '0';
  }
  
  let result = '';
  for (let i = 0; i < binary.length; i += 5) {
    const chunk = binary.substr(i, 5);
    const index = parseInt(chunk, 2);
    result += BASE32_ALPHABET[index];
  }
  
  return result;
}

/**
 * Base32 decoding
 */
function base32Decode(encoded: string): CryptoJS.lib.WordArray {
  const clean = encoded.replace(/[^A-Z2-7]/g, '').toUpperCase();
  let binary = '';
  
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    binary += index.toString(2).padStart(5, '0');
  }
  
  // Convert binary to bytes
  const bytes: number[] = [];
  for (let i = 0; i < binary.length; i += 8) {
    const chunk = binary.substr(i, 8);
    if (chunk.length === 8) {
      bytes.push(parseInt(chunk, 2));
    }
  }
  
  return CryptoJS.lib.WordArray.create(bytes);
}

/**
 * Generate a human-readable secret for display
 */
export function formatSecretForDisplay(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') || secret;
}
