/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FileTab } from '../types';
import { Eye, RotateCcw, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';

interface DiffViewerProps {
  tab: FileTab;
  onSelectOffset: (offset: number) => void;
  onClearEdits: () => void;
}

interface DiffItem {
  offset: number;
  original: number;
  modified: number;
}

export default function DiffViewer({ tab, onSelectOffset, onClearEdits }: DiffViewerProps) {
  const [diffs, setDiffs] = useState<DiffItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (tab.edits.size === 0) {
      setDiffs([]);
      return;
    }

    let active = true;
    const computeDiffs = async () => {
      setLoading(true);
      try {
        const sortedOffsets = Array.from(tab.edits.keys()).sort((a, b) => a - b);
        const list: DiffItem[] = [];

        // Read original bytes for edited offsets
        for (const offset of sortedOffsets) {
          const slice = tab.file.slice(offset, offset + 1);
          const buffer = await slice.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const originalVal = bytes.length > 0 ? bytes[0] : 0;
          const modifiedVal = tab.edits.get(offset)!;

          list.push({
            offset,
            original: originalVal,
            modified: modifiedVal
          });
        }

        if (active) {
          setDiffs(list);
        }
      } catch (err) {
        console.error('Failed to compute diffs:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    computeDiffs();
    return () => {
      active = false;
    };
  }, [tab.edits, tab.file]);

  // Renders the side-by-side bit visualizer
  const renderBitDiff = (original: number, modified: number) => {
    return (
      <div className="flex items-center gap-1.5 font-mono text-[10px]">
        {/* Original */}
        <div className="flex gap-0.5 text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900">
          {Array.from({ length: 8 }).map((_, i) => {
            const bitIdx = 7 - i;
            const bit = (original & (1 << bitIdx)) !== 0 ? '1' : '0';
            return <span key={bitIdx}>{bit}</span>;
          })}
        </div>

        <ChevronRight size={10} className="text-zinc-600" />

        {/* Modified with highlighted changes */}
        <div className="flex gap-0.5 text-zinc-300 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900">
          {Array.from({ length: 8 }).map((_, i) => {
            const bitIdx = 7 - i;
            const origBit = (original & (1 << bitIdx)) !== 0;
            const modBit = (modified & (1 << bitIdx)) !== 0;
            const isFlipped = origBit !== modBit;

            return (
              <span
                key={bitIdx}
                className={isFlipped ? 'text-amber-400 font-bold underline decoration-amber-400' : ''}
              >
                {modBit ? '1' : '0'}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  if (tab.edits.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-zinc-500 font-sans select-none">
        <Eye size={36} className="mb-2 text-zinc-600 animate-pulse" />
        <p className="text-sm font-semibold text-zinc-400">Perfect Integrity</p>
        <p className="text-xs mt-1 max-w-[240px]">
          No modifications detected. Edit any byte values in the Hex Grid to see comparisons.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl select-none text-zinc-300">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Eye size={18} className="text-emerald-500" />
          <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider font-sans">
            Modified Comparison (Diff)
          </h3>
        </div>
        <button
          id="clear-edits-btn"
          onClick={onClearEdits}
          className="flex items-center gap-1 bg-zinc-950 hover:bg-rose-950/40 border border-zinc-800 hover:border-rose-900/50 text-zinc-400 hover:text-rose-400 text-xs px-2.5 py-1 rounded transition cursor-pointer"
        >
          <RotateCcw size={12} />
          Reset All
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-6 text-zinc-500 font-mono text-xs">
          <RefreshCw size={14} className="animate-spin mr-1.5" />
          Recalculating diff records...
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary stats */}
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Total Modified Bytes: <b className="text-zinc-100">{diffs.length}</b></span>
            <span className="text-zinc-500">Click entry to navigate</span>
          </div>

          {/* Diffs Table */}
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar border border-zinc-800 rounded-lg overflow-hidden text-xs font-mono">
            {/* Table Header */}
            <div className="grid grid-cols-12 bg-zinc-950 p-2.5 text-zinc-500 font-semibold border-b border-zinc-800">
              <div className="col-span-3">OFFSET</div>
              <div className="col-span-4 text-center">BYTE DIFF (HEX)</div>
              <div className="col-span-5 text-center">BIT DIFF (7 → 0)</div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-zinc-900 bg-zinc-950/20">
              {diffs.map((d) => (
                <div
                  key={d.offset}
                  onClick={() => onSelectOffset(d.offset)}
                  className={`grid grid-cols-12 p-2.5 items-center transition cursor-pointer
                    ${tab.selectedOffset === d.offset 
                      ? 'bg-emerald-500/10 text-emerald-400 font-semibold' 
                      : 'hover:bg-zinc-900/50 text-zinc-300'
                    }`}
                >
                  {/* Address */}
                  <div className="col-span-3 font-bold text-zinc-400 select-text">
                    0x{d.offset.toString(16).toUpperCase()}
                  </div>

                  {/* Byte Diff */}
                  <div className="col-span-4 flex items-center justify-center gap-1.5">
                    <span className="text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded text-[10px]">
                      {d.original.toString(16).toUpperCase().padStart(2, '0')}
                    </span>
                    <ChevronRight size={10} className="text-zinc-700" />
                    <span className="text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded text-[10px]">
                      {d.modified.toString(16).toUpperCase().padStart(2, '0')}
                    </span>
                  </div>

                  {/* Bit Diff */}
                  <div className="col-span-5 flex justify-center">
                    {renderBitDiff(d.original, d.modified)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
