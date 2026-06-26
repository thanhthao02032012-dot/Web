/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FileTab, SearchResult } from '../types';
import {
  parseHexPattern,
  parseBinaryPattern,
  searchPatternInFile
} from '../utils/searchEngine';
import { Search, RefreshCw, ChevronRight, AlertCircle, Sparkles } from 'lucide-react';

interface SearchAndReplaceProps {
  tab: FileTab;
  onSelectOffset: (offset: number) => void;
  onEditMultipleBytes: (editsMap: Map<number, number>) => void;
}

export default function SearchAndReplace({
  tab,
  onSelectOffset,
  onEditMultipleBytes
}: SearchAndReplaceProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [searchType, setSearchType] = useState<'hex' | 'binary' | 'ascii' | 'utf8'>('hex');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [searchProgress, setSearchProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResults([]);

    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    let pattern: Uint8Array | null = null;

    if (searchType === 'hex') {
      pattern = parseHexPattern(trimmed);
      if (!pattern) {
        setErrorMsg('Invalid Hex string. Enter bytes e.g. "89 50 4E" or "89504e".');
        return;
      }
    } else if (searchType === 'binary') {
      pattern = parseBinaryPattern(trimmed);
      if (!pattern) {
        setErrorMsg('Invalid Binary string. Enter 8-bit blocks e.g. "10001001 01010000".');
        return;
      }
    } else {
      // ASCII or UTF-8
      const encoder = new TextEncoder();
      pattern = encoder.encode(trimmed);
    }

    if (!pattern || pattern.length === 0) {
      setErrorMsg('Could not process search query pattern.');
      return;
    }

    setSearching(true);
    setSearchProgress(0);

    try {
      const matches = await searchPatternInFile(
        tab.file,
        tab.edits,
        pattern,
        searchType,
        trimmed,
        (percent) => setSearchProgress(percent)
      );
      setResults(matches);
    } catch (err) {
      console.error(err);
      setErrorMsg('An error occurred during file scanning.');
    } finally {
      setSearching(false);
    }
  };

  const handleReplace = () => {
    setErrorMsg(null);
    if (results.length === 0) {
      setErrorMsg('Perform a search first to identify matches to replace.');
      return;
    }

    const trimmedReplace = replaceQuery.trim();
    if (!trimmedReplace) {
      setErrorMsg('Please specify a replacement pattern.');
      return;
    }

    let repBytes: Uint8Array | null = null;
    if (searchType === 'hex') {
      repBytes = parseHexPattern(trimmedReplace);
      if (!repBytes) {
        setErrorMsg('Invalid replacement Hex string.');
        return;
      }
    } else if (searchType === 'binary') {
      repBytes = parseBinaryPattern(trimmedReplace);
      if (!repBytes) {
        setErrorMsg('Invalid replacement Binary string.');
        return;
      }
    } else {
      const encoder = new TextEncoder();
      repBytes = encoder.encode(trimmedReplace);
    }

    if (!repBytes || repBytes.length === 0) {
      setErrorMsg('Invalid replacement pattern values.');
      return;
    }

    // Prepare a Map of multiple byte edits
    const editsToApply = new Map<number, number>();
    for (const match of results) {
      for (let i = 0; i < repBytes.length; i++) {
        editsToApply.set(match.offset + i, repBytes[i]);
      }
    }

    onEditMultipleBytes(editsToApply);
    setResults([]);
    setSearchQuery('');
    setReplaceQuery('');
  };

  return (
    <div className="flex flex-col gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl select-none text-zinc-300">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
        <Search size={18} className="text-emerald-500" />
        <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider font-sans">
          Search & Replace
        </h3>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSearch} className="space-y-3">
        {/* Type selector tab */}
        <div className="grid grid-cols-4 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-[11px] font-semibold">
          {(['hex', 'binary', 'ascii', 'utf8'] as const).map((t) => (
            <button
              key={t}
              type="button"
              id={`search-type-tab-${t}`}
              onClick={() => {
                setSearchType(t);
                setErrorMsg(null);
                setResults([]);
              }}
              className={`py-1 rounded-md transition uppercase font-mono cursor-pointer
                ${searchType === t 
                  ? 'bg-emerald-600 text-white font-bold' 
                  : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Search entry */}
        <div>
          <label className="block text-[11px] text-zinc-500 font-bold mb-1 uppercase">Search Sequence</label>
          <div className="flex gap-1.5">
            <input
              id="search-input-field"
              type="text"
              placeholder={
                searchType === 'hex'
                  ? 'e.g. 49 44 33 or 89504e'
                  : searchType === 'binary'
                  ? 'e.g. 10001001 01010000'
                  : 'e.g. PNG or ID3'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
            <button
              id="search-submit-btn"
              type="submit"
              disabled={searching || !searchQuery}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-35 disabled:hover:bg-emerald-600 text-white text-xs px-4 py-1.5 rounded font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              {searching ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Search size={13} />
              )}
              {searching ? `${searchProgress}%` : 'Find'}
            </button>
          </div>
        </div>

        {/* Replace entry */}
        <div>
          <label className="block text-[11px] text-zinc-500 font-bold mb-1 uppercase">Replace Pattern</label>
          <div className="flex gap-1.5">
            <input
              id="replace-input-field"
              type="text"
              placeholder={
                searchType === 'hex'
                  ? 'e.g. FF D8'
                  : searchType === 'binary'
                  ? 'e.g. 11111111'
                  : 'e.g. PDF'
              }
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
            <button
              id="replace-submit-btn"
              type="button"
              onClick={handleReplace}
              disabled={results.length === 0 || !replaceQuery}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-35 disabled:hover:bg-amber-600 text-white text-xs px-3 py-1.5 rounded font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} />
              Replace All
            </button>
          </div>
        </div>
      </form>

      {/* Errors and Warnings */}
      {errorMsg && (
        <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded text-[11px] text-rose-400 flex items-start gap-1.5 font-mono">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Search results list */}
      <div>
        <div className="flex items-center justify-between text-[11px] text-zinc-500 font-semibold mb-1.5">
          <span>MATCHES ({results.length})</span>
          {results.length > 0 && <span className="text-[10px] text-zinc-400">Jump & Edit</span>}
        </div>

        {results.length === 0 ? (
          <div className="p-4 text-center bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-600 text-[10px]">
            No active search results. Enter a sequence and click Find.
          </div>
        ) : (
          <div className="max-h-[140px] overflow-y-auto custom-scrollbar bg-zinc-950 border border-zinc-800 rounded-lg divide-y divide-zinc-900 pr-1">
            {results.map((r, i) => (
              <div
                key={i}
                onClick={() => onSelectOffset(r.offset)}
                className="flex items-center justify-between p-2 hover:bg-zinc-900/60 transition cursor-pointer font-mono text-xs text-zinc-300"
              >
                <div className="flex items-center gap-2">
                  <ChevronRight size={12} className="text-emerald-500" />
                  <span className="font-bold text-zinc-100">
                    Offset: 0x{r.offset.toString(16).toUpperCase()}
                  </span>
                  <span className="text-[10px] text-zinc-500">({r.offset})</span>
                </div>
                <span className="text-[9px] bg-zinc-900 text-zinc-400 border border-zinc-800 px-1.5 py-0.5 rounded">
                  Match
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
