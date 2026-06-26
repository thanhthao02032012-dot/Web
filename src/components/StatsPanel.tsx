/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { FileTab, FileStats } from '../types';
import { analyzeFileStats } from '../utils/checksum';
import { BarChart3, HelpCircle } from 'lucide-react';

interface StatsPanelProps {
  tab: FileTab;
}

export default function StatsPanel({ tab }: StatsPanelProps) {
  const [stats, setStats] = useState<FileStats | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    const calculateStats = async () => {
      setLoading(true);
      try {
        const fileStats = await analyzeFileStats(tab.file, tab.edits);
        if (active) {
          setStats(fileStats);
        }
      } catch (err) {
        console.error('Failed to compute file statistics:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    calculateStats();
    return () => {
      active = false;
    };
  }, [tab.file, tab.edits, tab.size]);

  // Draw 256-bin Histogram to Canvas
  useEffect(() => {
    if (!stats || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear background
    ctx.fillStyle = '#09090b'; // zinc-950
    ctx.fillRect(0, 0, width, height);

    // Find max frequency count to scale height
    let maxCount = 0;
    for (let i = 0; i < 256; i++) {
      if (stats.frequency[i].count > maxCount) {
        maxCount = stats.frequency[i].count;
      }
    }

    if (maxCount === 0) return;

    // Draw bars
    const paddingLeft = 10;
    const paddingRight = 10;
    const plotWidth = width - paddingLeft - paddingRight;
    const barWidth = plotWidth / 256;

    for (let i = 0; i < 256; i++) {
      const count = stats.frequency[i].count;
      const barHeight = (count / maxCount) * (height - 30);
      const x = paddingLeft + i * barWidth;
      const y = height - 20 - barHeight;

      // Color coding (low values green, high values blue/cyan)
      const grad = ctx.createLinearGradient(x, y, x, height - 20);
      grad.addColorStop(0, '#10b981'); // emerald-500
      grad.addColorStop(1, '#059669'); // emerald-600

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barHeight);
    }

    // Draw axis / markers
    ctx.strokeStyle = '#27272a'; // zinc-800
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, height - 20);
    ctx.lineTo(width - paddingRight, height - 20);
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#71717a'; // zinc-500
    ctx.font = '10px monospace';
    ctx.fillText('0x00', paddingLeft, height - 5);
    ctx.fillText('0x7F', paddingLeft + plotWidth / 2 - 10, height - 5);
    ctx.fillText('0xFF', width - paddingRight - 28, height - 5);
  }, [stats]);

  if (loading || !stats) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-zinc-500 h-[280px]">
        <BarChart3 size={32} className="mb-2 text-zinc-600 animate-spin" />
        <p className="text-xs font-mono">Analyzing entropy & histograms...</p>
      </div>
    );
  }

  // Find top 5 most frequent bytes
  const topBytes = [...stats.frequency]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const formatASCII = (b: number) => {
    if (b >= 32 && b <= 126) return `'${String.fromCharCode(b)}'`;
    return 'Dot/Control';
  };

  const totalBits = stats.bitOneCount + stats.bitZeroCount;
  const bitOnePercent = totalBits > 0 ? (stats.bitOneCount / totalBits) * 100 : 0;

  // Describe entropy meaning
  let entropyDesc = '';
  if (stats.entropy > 7.5) {
    entropyDesc = 'High Entropy (Compressed/Encrypted Data)';
  } else if (stats.entropy > 5.0) {
    entropyDesc = 'Medium Entropy (Uncompressed Code/Structured Data)';
  } else {
    entropyDesc = 'Low Entropy (Highly repetitive/Text/Sparse Data)';
  }

  return (
    <div className="flex flex-col gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl select-none text-zinc-300">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
        <BarChart3 size={18} className="text-emerald-500" />
        <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider font-sans">
          Statistical Diagnostics
        </h3>
      </div>

      {/* Grid of Entropy & Bits */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Entropy Widget */}
        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-zinc-500 font-bold">SHANNON ENTROPY</span>
            <HelpCircle
              size={13}
              className="text-zinc-500 cursor-help"
              title="Shannon Entropy measures the randomness of the file data (0 = predictable, 8 = highly random/compressed)."
            />
          </div>
          <div className="text-2xl font-mono font-bold text-zinc-100">
            {stats.entropy} <span className="text-xs text-zinc-500">bits/byte</span>
          </div>
          <div className="text-[10px] text-emerald-400 mt-1 truncate">
            {entropyDesc}
          </div>
        </div>

        {/* Bit Ratio Widget */}
        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-zinc-500 font-bold">BIT BALANCE (0 vs 1)</span>
          </div>
          <div>
            <div className="flex justify-between font-mono text-[11px] text-zinc-400 mb-1">
              <span>0-Bits ({100 - Math.round(bitOnePercent)}%)</span>
              <span>1-Bits ({Math.round(bitOnePercent)}%)</span>
            </div>
            {/* Split Progress bar */}
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden flex">
              <div 
                style={{ width: `${100 - bitOnePercent}%` }}
                className="bg-zinc-600 h-full"
              />
              <div 
                style={{ width: `${bitOnePercent}%` }}
                className="bg-emerald-500 h-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Histogram Drawing Canvas */}
      <div>
        <span className="block text-[11px] text-zinc-500 font-bold mb-1.5 uppercase">
          Byte Frequency Histogram (0x00 - 0xFF)
        </span>
        <canvas
          id="frequency-histogram-canvas"
          ref={canvasRef}
          className="w-full h-28 bg-zinc-950 rounded-lg border border-zinc-800"
        />
      </div>

      {/* Top 4 Most Frequent Bytes */}
      <div>
        <span className="block text-[11px] text-zinc-500 font-bold mb-1.5 uppercase">
          Most Frequent Byte Values
        </span>
        <div className="grid grid-cols-2 gap-2">
          {topBytes.map((item, index) => (
            <div
              key={item.byte}
              className="bg-zinc-950 p-2 border border-zinc-800 rounded flex items-center justify-between text-[11px]"
            >
              <div className="flex items-center gap-2 font-mono">
                <span className="text-zinc-500 font-bold">#{index + 1}</span>
                <span className="bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-100 font-bold">
                  0x{item.byte.toString(16).toUpperCase().padStart(2, '0')}
                </span>
                <span className="text-zinc-400 truncate max-w-[50px]">
                  {formatASCII(item.byte)}
                </span>
              </div>
              <span className="font-mono font-bold text-emerald-400">
                {item.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
