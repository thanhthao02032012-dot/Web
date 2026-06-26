/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SearchResult } from '../types';

/**
 * Converts a hex string (with or without spaces) into a Uint8Array.
 * Returns null if invalid.
 */
export function parseHexPattern(hexStr: string): Uint8Array | null {
  const clean = hexStr.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length === 0 || clean.length % 2 !== 0) return null;
  const len = clean.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Converts a binary string (e.g. "10011001 01010101") into a Uint8Array.
 * Returns null if invalid.
 */
export function parseBinaryPattern(binStr: string): Uint8Array | null {
  const clean = binStr.replace(/[^01\s]/g, '').trim();
  if (clean.length === 0) return null;
  const parts = clean.split(/\s+/);
  const bytes = new Uint8Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length > 8) return null;
    bytes[i] = parseInt(part, 2);
  }
  return bytes;
}

/**
 * Asynchronously searches for a byte pattern in a File, respecting active edits.
 * Limits matches to 500 to keep UI responsive.
 */
export async function searchPatternInFile(
  file: File,
  edits: Map<number, number>,
  pattern: Uint8Array,
  matchType: 'hex' | 'binary' | 'ascii' | 'utf8',
  matchValue: string,
  onProgress?: (percent: number) => void
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  if (pattern.length === 0) return results;

  const fileSize = file.size;
  const chunkSize = 2 * 1024 * 1024; // 2MB chunk
  const overlap = pattern.length - 1;
  const maxMatches = 500;

  let offset = 0;
  
  while (offset < fileSize && results.length < maxMatches) {
    const end = Math.min(offset + chunkSize, fileSize);
    const readLength = end - offset;
    
    // Slicing
    const slice = file.slice(offset, end);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Patch the read bytes with any edits in this chunk range
    for (let i = 0; i < readLength; i++) {
      const globalIdx = offset + i;
      if (edits.has(globalIdx)) {
        bytes[i] = edits.get(globalIdx)!;
      }
    }

    // Search inside the patched chunk
    for (let i = 0; i <= bytes.length - pattern.length; i++) {
      let isMatch = true;
      for (let p = 0; p < pattern.length; p++) {
        if (bytes[i + p] !== pattern[p]) {
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        results.push({
          offset: offset + i,
          length: pattern.length,
          matchType,
          matchValue
        });

        if (results.length >= maxMatches) break;
      }
    }

    if (onProgress) {
      onProgress(Math.floor((offset / fileSize) * 100));
    }

    // Move next chunk, overlapping to make sure we don't miss patterns across boundaries
    offset += (chunkSize - overlap);
    if (chunkSize <= overlap) {
      // Avoid infinite loop if pattern is extremely long
      offset += chunkSize;
    }
  }

  if (onProgress) onProgress(100);
  return results;
}
