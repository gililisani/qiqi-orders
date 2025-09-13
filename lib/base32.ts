// lib/base32.ts
// Base32 encoding/decoding utilities for TOTP

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): any {
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
  
  // Convert to CryptoJS WordArray format
  const wordArray = {
    words: [],
    sigBytes: bytes.length
  };
  
  // Convert bytes to words (4 bytes per word)
  for (let i = 0; i < bytes.length; i += 4) {
    let word = 0;
    for (let j = 0; j < 4 && i + j < bytes.length; j++) {
      word |= (bytes[i + j] << (24 - j * 8));
    }
    wordArray.words.push(word);
  }
  
  return wordArray;
}

export function base32Encode(input: any): string {
  const bits: number[] = [];
  
  // Convert WordArray to bits
  if (input.words && input.sigBytes) {
    // CryptoJS WordArray format
    for (let i = 0; i < input.sigBytes; i++) {
      const wordIndex = Math.floor(i / 4);
      const byteIndex = i % 4;
      const byte = (input.words[wordIndex] >>> (24 - byteIndex * 8)) & 0xff;
      for (let j = 7; j >= 0; j--) {
        bits.push((byte >> j) & 1);
      }
    }
  } else {
    // Uint8Array format
    for (let i = 0; i < input.length; i++) {
      for (let j = 7; j >= 0; j--) {
        bits.push((input[i] >> j) & 1);
      }
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
