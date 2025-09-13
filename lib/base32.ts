// lib/base32.ts
// Base32 encoding/decoding utilities for TOTP

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Uint8Array {
  // Remove padding and convert to uppercase
  const cleanInput = input.replace(/=/g, '').toUpperCase();
  
  // Convert each character to its 5-bit value
  const bits: number[] = [];
  for (let i = 0; i < cleanInput.length; i++) {
    const char = cleanInput[i];
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }
    
    // Convert to 5-bit binary and add to bits array
    for (let j = 4; j >= 0; j--) {
      bits.push((index >> j) & 1);
    }
  }
  
  // Convert bits to bytes
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    if (i + 8 <= bits.length) {
      let byte = 0;
      for (let j = 0; j < 8; j++) {
        byte = (byte << 1) | bits[i + j];
      }
      bytes.push(byte);
    }
  }
  
  return new Uint8Array(bytes);
}

export function base32Encode(input: Uint8Array): string {
  const bits: number[] = [];
  
  // Convert bytes to bits
  for (let i = 0; i < input.length; i++) {
    for (let j = 7; j >= 0; j--) {
      bits.push((input[i] >> j) & 1);
    }
  }
  
  // Convert bits to Base32 characters
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    let value = 0;
    for (let j = 0; j < 5 && i + j < bits.length; j++) {
      value = (value << 1) | bits[i + j];
    }
    result += BASE32_ALPHABET[value];
  }
  
  // Add padding
  const padding = (5 - (bits.length % 5)) % 5;
  result += '='.repeat(padding);
  
  return result;
}
