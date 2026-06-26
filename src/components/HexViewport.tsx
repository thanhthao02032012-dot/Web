/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { FileTab } from '../types';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, HelpCircle } from 'lucide-react';

interface HexViewportProps {
  tab: FileTab;
  onSelectOffset: (offset: number) => void;
  onEditByte: (offset: number, value: number) => void;
}

export default function HexViewport({ tab, onSelectOffset, onEditByte }: HexViewportProps) {
  const PAGE_SIZE = 512; // 32 rows of 16 bytes
  const ROWS = 32;
  const COLS = 16;

  const [viewportOffset, setViewportOffset] = useState<number>(0);
  const [pageBytes, setPageBytes] = useState<Uint8Array>(new Uint8Array(PAGE_SIZE));
  const [loading, setLoading] = useState<boolean>(false);
  const [jumpInput, setJumpInput] = useState<string>('');
  const [editNibble, setEditNibble] = useState<'high' | 'low' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load chunk of bytes from File + apply edits
  useEffect(() => {
    let active = true;
    const loadBytes = async () => {
      setLoading(true);
      try {
        const start = viewportOffset;
        const end = Math.min(viewportOffset + PAGE_SIZE, tab.size);
        if (end > start) {
          const slice = tab.file.slice(start, end);
          const buffer = await slice.arrayBuffer();
          const rawBytes = new Uint8Array(buffer);
          
          // Match size to page size or actual remaining size
          const output = new Uint8Array(PAGE_SIZE);
          output.set(rawBytes);

          // Apply sparse edits in this range
          for (let i = 0; i < rawBytes.length; i++) {
            const fileOffset = start + i;
            if (tab.edits.has(fileOffset)) {
              output[i] = tab.edits.get(fileOffset)!;
            }
          }

          if (active) {
            setPageBytes(output);
          }
        } else {
          if (active) {
            setPageBytes(new Uint8Array(PAGE_SIZE));
          }
        }
      } catch (err) {
        console.error('Failed to load file chunk:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadBytes();
    return () => {
      active = false;
    };
  }, [viewportOffset, tab.file, tab.edits, tab.size]);

  // Adjust viewportOffset if selectedOffset changes to be outside the current viewport
  useEffect(() => {
    if (tab.selectedOffset !== null) {
      if (tab.selectedOffset < viewportOffset || tab.selectedOffset >= viewportOffset + PAGE_SIZE) {
        const pageStart = Math.floor(tab.selectedOffset / PAGE_SIZE) * PAGE_SIZE;
        setViewportOffset(pageStart);
      }
    }
  }, [tab.selectedOffset, viewportOffset]);

  // Handle direct keyboard entry & navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (tab.selectedOffset === null) return;

      // Check if we are inside an input element to avoid capturing normal inputs
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const offset = tab.selectedOffset;

      // Grid navigation
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (offset + 1 < tab.size) {
          onSelectOffset(offset + 1);
          setEditNibble(null);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (offset - 1 >= 0) {
          onSelectOffset(offset - 1);
          setEditNibble(null);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (offset + COLS < tab.size) {
          onSelectOffset(offset + COLS);
          setEditNibble(null);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (offset - COLS >= 0) {
          onSelectOffset(offset - COLS);
          setEditNibble(null);
        }
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        const nextStart = Math.min(viewportOffset + PAGE_SIZE, Math.floor((tab.size - 1) / PAGE_SIZE) * PAGE_SIZE);
        setViewportOffset(nextStart);
        onSelectOffset(Math.min(offset + PAGE_SIZE, tab.size - 1));
        setEditNibble(null);
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        const prevStart = Math.max(0, viewportOffset - PAGE_SIZE);
        setViewportOffset(prevStart);
        onSelectOffset(Math.max(offset - PAGE_SIZE, 0));
        setEditNibble(null);
      }

      // Direct hex entry
      const hexChar = e.key.toLowerCase();
      const isHex = /^[0-9a-f]$/.test(hexChar);
      if (isHex) {
        e.preventDefault();
        const byteIndex = offset - viewportOffset;
        if (byteIndex < 0 || byteIndex >= PAGE_SIZE) return;

        const currentByte = pageBytes[byteIndex];
        const val = parseInt(hexChar, 16);

        if (editNibble === null || editNibble === 'low') {
          // Edit high nibble
          const newByte = (val << 4) | (currentByte & 0x0F);
          onEditByte(offset, newByte);
          setEditNibble('high');
        } else {
          // Edit low nibble and move to next cell
          const newByte = (currentByte & 0xF0) | val;
          onEditByte(offset, newByte);
          setEditNibble('low');
          
          // Auto-advance to next byte
          if (offset + 1 < tab.size) {
            onSelectOffset(offset + 1);
            setEditNibble(null);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [tab.selectedOffset, viewportOffset, tab.size, pageBytes, editNibble, onSelectOffset, onEditByte]);

  // Jump to Address Action
  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    let addr = jumpInput.trim().toLowerCase();
    if (!addr) return;

    let targetOffset = 0;
    if (addr.startsWith('0x')) {
      targetOffset = parseInt(addr.substring(2), 16);
    } else if (/^[0-9a-f]+h$/.test(addr)) {
      targetOffset = parseInt(addr.slice(0, -1), 16);
    } else {
      // Try decimal, fall back to hex if it contains a-f
      if (/[a-f]/.test(addr)) {
        targetOffset = parseInt(addr, 16);
      } else {
        targetOffset = parseInt(addr, 10);
      }
    }

    if (!isNaN(targetOffset) && targetOffset >= 0 && targetOffset < tab.size) {
      onSelectOffset(targetOffset);
      const pageStart = Math.floor(targetOffset / PAGE_SIZE) * PAGE_SIZE;
      setViewportOffset(pageStart);
    } else {
      alert('Invalid address range.');
    }
    setJumpInput('');
  };

  // Helper formatting values
  const formatOffset = (offset: number) => {
    return offset.toString(16).toUpperCase().padStart(8, '0');
  };

  const getByteAt = (row: number, col: number) => {
    const fileOffset = viewportOffset + row * COLS + col;
    if (fileOffset >= tab.size) return null;
    const pageIndex = row * COLS + col;
    return {
      value: pageBytes[pageIndex],
      fileOffset,
      isEdited: tab.edits.has(fileOffset)
    };
  };

  const formatByte = (b: number | null) => {
    if (b === null) return '  ';
    return b.toString(16).toUpperCase().padStart(2, '0');
  };

  const formatASCII = (b: number | null) => {
    if (b === null) return ' ';
    // Printable ASCII characters
    if (b >= 32 && b <= 126) {
      return String.fromCharCode(b);
    }
    return '.';
  };

  // Paging controls
  const totalPages = Math.ceil(tab.size / PAGE_SIZE);
  const currentPage = Math.floor(viewportOffset / PAGE_SIZE) + 1;

  const navigatePage = (direction: 'first' | 'prev' | 'next' | 'last') => {
    setEditNibble(null);
    let target = 0;
    if (direction === 'first') {
      target = 0;
    } else if (direction === 'prev') {
      target = Math.max(0, viewportOffset - PAGE_SIZE);
    } else if (direction === 'next') {
      target = Math.min(Math.floor((tab.size - 1) / PAGE_SIZE) * PAGE_SIZE, viewportOffset + PAGE_SIZE);
    } else if (direction === 'last') {
      target = Math.floor((tab.size - 1) / PAGE_SIZE) * PAGE_SIZE;
    }
    setViewportOffset(target);
    onSelectOffset(target);
  };

  return (
    <div id="hex-editor-container" ref={containerRef} className="flex flex-col flex-1 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-900 border-b border-zinc-800 text-zinc-300 text-sm">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-zinc-100 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Hex Viewer
          </span>
          <span className="text-zinc-500">|</span>
          <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-2.5 py-1 border border-zinc-800 rounded">
            Size: {tab.size.toLocaleString()} bytes
          </span>
        </div>

        {/* Address Jumping */}
        <form onSubmit={handleJump} className="flex items-center gap-1">
          <input
            id="address-jump-input"
            type="text"
            placeholder="Jump to offset (e.g. 0x4F or 100)"
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            className="bg-zinc-950 text-zinc-100 font-mono text-xs border border-zinc-800 rounded px-2.5 py-1.5 w-52 focus:outline-none focus:border-emerald-500"
          />
          <button
            id="jump-btn"
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded font-medium transition"
          >
            Go
          </button>
        </form>
      </div>

      {/* Hex Grid Body */}
      <div className="flex-1 overflow-x-auto overflow-y-auto p-4 custom-scrollbar select-none">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-500 text-xs font-mono">
            Loading bytes from disk...
          </div>
        ) : (
          <div className="font-mono text-sm leading-relaxed min-w-[700px]">
            {/* Hex Columns Headers */}
            <div className="flex text-zinc-500 border-b border-zinc-900 pb-2 mb-2 font-semibold">
              <div className="w-24 shrink-0">OFFSET</div>
              <div className="flex-1 flex gap-2 justify-between px-4 max-w-[420px]">
                {Array.from({ length: 16 }).map((_, i) => (
                  <span key={i} className="w-6 text-center text-xs">
                    {i.toString(16).toUpperCase().padStart(2, '0')}
                  </span>
                ))}
              </div>
              <div className="w-48 shrink-0 pl-4 text-xs">ASCII</div>
            </div>

            {/* Grid rows */}
            <div className="space-y-1">
              {Array.from({ length: ROWS }).map((_, row) => {
                const firstByteOffset = viewportOffset + row * COLS;
                if (firstByteOffset >= tab.size) return null;

                return (
                  <div key={row} className="flex items-center hover:bg-zinc-900/40 py-0.5 rounded px-1 transition-colors">
                    {/* Row Offset Address */}
                    <span className="w-24 text-zinc-500 shrink-0 font-bold select-text">
                      {formatOffset(firstByteOffset)}
                    </span>

                    {/* 16 Hex Values */}
                    <div className="flex-1 flex gap-2 justify-between px-4 max-w-[420px]">
                      {Array.from({ length: COLS }).map((_, col) => {
                        const byteObj = getByteAt(row, col);
                        if (!byteObj) return <span key={col} className="w-6" />;

                        const isSelected = tab.selectedOffset === byteObj.fileOffset;
                        
                        return (
                          <span
                            key={col}
                            onClick={() => {
                              onSelectOffset(byteObj.fileOffset);
                              setEditNibble(null);
                            }}
                            className={`w-6 text-center cursor-pointer select-none rounded text-xs py-0.5 transition-all font-mono
                              ${isSelected ? 'bg-emerald-500 text-zinc-950 font-bold shadow-lg shadow-emerald-500/10 scale-105' : ''}
                              ${!isSelected && byteObj.isEdited ? 'text-amber-400 bg-amber-500/10 font-bold underline decoration-dotted' : ''}
                              ${!isSelected && !byteObj.isEdited ? 'text-zinc-300 hover:bg-zinc-800' : ''}
                            `}
                            title={`Offset: 0x${byteObj.fileOffset.toString(16).toUpperCase()} (${byteObj.fileOffset})\nValue: 0x${byteObj.value.toString(16).toUpperCase()} (${byteObj.value})`}
                          >
                            {formatByte(byteObj.value)}
                          </span>
                        );
                      })}
                    </div>

                    {/* ASCII decoded representation */}
                    <div className="w-48 shrink-0 flex gap-0.5 pl-4 text-xs select-text">
                      {Array.from({ length: COLS }).map((_, col) => {
                        const byteObj = getByteAt(row, col);
                        if (!byteObj) return <span key={col} className="w-2" />;
                        const isSelected = tab.selectedOffset === byteObj.fileOffset;

                        return (
                          <span
                            key={col}
                            onClick={() => {
                              onSelectOffset(byteObj.fileOffset);
                              setEditNibble(null);
                            }}
                            className={`px-0.5 cursor-pointer rounded font-mono
                              ${isSelected ? 'bg-emerald-500 text-zinc-950 font-bold' : ''}
                              ${!isSelected && byteObj.isEdited ? 'text-amber-400 font-bold' : 'text-zinc-400'}
                              ${!isSelected && !byteObj.isEdited ? 'hover:bg-zinc-800' : ''}
                            `}
                          >
                            {formatASCII(byteObj.value)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Hex Instructions Helper Footer */}
      <div className="p-2.5 bg-zinc-950 border-t border-zinc-900 flex items-center justify-between text-zinc-500 text-[11px] font-mono px-4">
        <div className="flex items-center gap-1 text-zinc-400">
          <HelpCircle size={13} className="text-zinc-500" />
          <span>Use <b>Arrows / PgUp / PgDn</b> to navigate. Type <b>0-9, A-F</b> to edit active cell.</span>
        </div>
        {tab.selectedOffset !== null && (
          <span className="text-emerald-400 font-bold">
            Selected: 0x{tab.selectedOffset.toString(16).toUpperCase()} ({tab.selectedOffset})
          </span>
        )}
      </div>

      {/* Pagination Bar */}
      <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-zinc-400 text-xs">
        <div className="flex items-center gap-1.5">
          <button
            id="hex-first-page"
            disabled={currentPage === 1}
            onClick={() => navigatePage('first')}
            className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition"
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            id="hex-prev-page"
            disabled={currentPage === 1}
            onClick={() => navigatePage('prev')}
            className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-2 select-none text-zinc-300">
            Page <b className="text-zinc-100">{currentPage}</b> of <b className="text-zinc-100">{totalPages || 1}</b>
          </span>
          <button
            id="hex-next-page"
            disabled={currentPage >= totalPages}
            onClick={() => navigatePage('next')}
            className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition"
          >
            <ChevronRight size={16} />
          </button>
          <button
            id="hex-last-page"
            disabled={currentPage >= totalPages}
            onClick={() => navigatePage('last')}
            className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition"
          >
            <ChevronsRight size={16} />
          </button>
        </div>

        <div className="text-[11px] text-zinc-500 select-none">
          Showing bytes {viewportOffset.toLocaleString()} - {Math.min(viewportOffset + PAGE_SIZE, tab.size).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
