/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileStats, ByteStat } from '../types';

/**
 * Calculates SHA-256 hash of a file or a slice of it.
 * For massive files (>50MB), we hash the first 50MB to prevent browser lock-ups
 * while displaying a clear indicator.
 */
export async function calculateSHA256(file: File): Promise<{ hash: string; isPartial: boolean }> {
  const maxSize = 50 * 1024 * 1024; // 50MB threshold
  let slice = file;
  let isPartial = false;

  if (file.size > maxSize) {
    slice = file.slice(0, maxSize) as File;
    isPartial = true;
  }

  try {
    const arrayBuffer = await slice.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return { hash: hashHex, isPartial };
  } catch (err) {
    console.error('SHA-256 calculation failed:', err);
    return { hash: 'Error calculating hash', isPartial: false };
  }
}

/**
 * Analyzes byte statistics and calculates Shannon Entropy.
 * Uses sampling for files > 5MB to ensure instantaneous performance.
 */
export async function analyzeFileStats(
  file: File,
  edits: Map<number, number>
): Promise<FileStats> {
  const totalSize = file.size;
  const sampleSize = Math.min(totalSize, 5 * 1024 * 1024); // 5MB sample limit
  const counts = new Uint32Array(256);
  let bitZeroCount = 0;
  let bitOneCount = 0;

  // We read the entire sample
  const slice = file.slice(0, sampleSize);
  const buffer = await slice.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Apply edits within the sample zone
  for (let i = 0; i < bytes.length; i++) {
    const originalOffset = i;
    const currentByte = edits.has(originalOffset) ? edits.get(originalOffset)! : bytes[i];
    counts[currentByte]++;
  }

  // Count bits and compile statistics
  for (let i = 0; i < 256; i++) {
    const count = counts[i];
    if (count > 0) {
      // Count bits of this byte value
      let bits1 = 0;
      for (let bit = 0; bit < 8; bit++) {
        if ((i & (1 << bit)) !== 0) bits1++;
      }
      bitOneCount += bits1 * count;
      bitZeroCount += (8 - bits1) * count;
    }
  }

  // Shannon Entropy: H = -Sum(P(xi) * log2(P(xi)))
  let entropy = 0;
  const totalSamples = bytes.length;
  const frequencyList: ByteStat[] = [];

  for (let i = 0; i < 256; i++) {
    const count = counts[i];
    const percentage = totalSamples > 0 ? (count / totalSamples) * 100 : 0;
    
    frequencyList.push({
      byte: i,
      count,
      percentage
    });

    if (count > 0 && totalSamples > 0) {
      const p = count / totalSamples;
      entropy -= p * Math.log2(p);
    }
  }

  return {
    entropy: parseFloat(entropy.toFixed(4)),
    frequency: frequencyList,
    bitZeroCount,
    bitOneCount
  };
}

/**
 * Calculates a standard CRC32 checksum of a data array
 */
export function calculateCRC32(data: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  let crc = 0 ^ -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}
