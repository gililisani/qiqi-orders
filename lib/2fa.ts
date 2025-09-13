// lib/2fa.ts
// 2FA utilities using crypto-js for TOTP generation

import CryptoJS from 'crypto-js';
import { base32Decode, base32Encode } from './base32';

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
  
  // Create 8-byte time buffer in big-endian format
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(0, 0, false); // High 4 bytes = 0
  timeView.setUint32(4, timeStep, false); // Low 4 bytes = timeStep
  
  // Convert to CryptoJS WordArray
  const timeBytes = new Uint8Array(timeBuffer);
  const timeWordArray = CryptoJS.lib.WordArray.create(timeBytes);
  
  // Generate HMAC-SHA1
  const hmac = CryptoJS.HmacSHA1(timeWordArray, key);
  const hmacHex = hmac.toString(CryptoJS.enc.Hex);
  
  // Dynamic truncation (RFC 4226)
  const offset = parseInt(hmacHex.slice(-1), 16);
  const truncated = parseInt(hmacHex.slice(offset * 2, offset * 2 + 8), 16);
  const code = (truncated & 0x7fffffff) % 1000000;
  
  return code.toString().padStart(6, '0');
}

/**
 * Verify TOTP code with tolerance for clock skew
 */
export function verifyTOTPCode(secret: string, code: string, tolerance: number = 2): boolean {
  const currentTime = Math.floor(Date.now() / 1000);
  const currentTimeStep = Math.floor(currentTime / 30);
  
  console.log('TOTP Verification Debug:', {
    secret: secret.substring(0, 8) + '...',
    secretLength: secret.length,
    code,
    currentTime,
    currentTimeStep,
    tolerance
  });
  
  // Debug: Check if secret is valid Base32
  try {
    const decoded = base32Decode(secret);
    console.log('Secret decode test:', {
      originalLength: secret.length,
      decodedLength: decoded.length,
      firstBytes: Array.from(decoded.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    });
  } catch (e) {
    console.error('Secret decode error:', e);
  }
  
  // Check current time step and adjacent time steps for tolerance
  for (let i = -tolerance; i <= tolerance; i++) {
    const timeStep = currentTimeStep + i;
    const expectedCode = generateTOTPCode(secret, timeStep * 30);
    console.log(`Time step ${timeStep}: expected=${expectedCode}, received=${code}, match=${expectedCode === code}`);
    
    if (expectedCode === code) {
      console.log('TOTP verification successful!');
      return true;
    }
  }
  
  console.log('TOTP verification failed - no matching codes found');
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
 * Generate a human-readable secret for display
 */
export function formatSecretForDisplay(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') || secret;
}

/**
 * Test TOTP implementation with a known secret and time
 * This is for debugging purposes
 */
export function testTOTPImplementation(providedSecret?: string): void {
  console.log('Testing TOTP implementation...');
  
  // Use provided secret or fall back to test secret
  const testSecret = providedSecret || 'JBSWY3DPEHPK3PXP';
  const currentTime = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(currentTime / 30);
  
  console.log('Test parameters:', {
    secret: testSecret,
    currentTime,
    timeStep,
    usingProvidedSecret: !!providedSecret
  });
  
  // Generate code for current time
  const code = generateTOTPCode(testSecret, currentTime);
  console.log('Generated code:', code);
  
  // Verify the code
  const isValid = verifyTOTPCode(testSecret, code);
  console.log('Verification result:', isValid);
  
  // Test with wrong code
  const wrongCode = '123456';
  const isWrongValid = verifyTOTPCode(testSecret, wrongCode);
  console.log('Wrong code verification:', isWrongValid);
}
