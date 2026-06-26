/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StructureNode {
  name: string;
  offset: number;
  length: number;
  description: string;
  children?: StructureNode[];
}

export interface FileTab {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
  originalChecksum: string;
  // Sparse map of index -> byte (0-255) to track all modifications
  edits: Map<number, number>;
  // History array of Map copies for unlimited Undo/Redo
  history: Map<number, number>[];
  historyIndex: number;
  selectedOffset: number | null;
  structureNodes: StructureNode[];
  metadata: Record<string, string>;
  isSaved: boolean;
}

export interface SearchResult {
  offset: number;
  length: number;
  matchType: 'hex' | 'binary' | 'ascii' | 'utf8';
  matchValue: string;
}

export interface DiffItem {
  offset: number;
  original: number;
  modified: number;
}

export interface ByteStat {
  byte: number;
  count: number;
  percentage: number;
}

export interface FileStats {
  entropy: number;
  frequency: ByteStat[];
  bitZeroCount: number;
  bitOneCount: number;
}
