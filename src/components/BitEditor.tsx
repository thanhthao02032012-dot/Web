/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FileTab } from '../types';
import { Binary, ToggleLeft, Activity, Info, Zap, HelpCircle, Check, RefreshCw } from 'lucide-react';

interface BitEditorProps {
  tab: FileTab;
  onEditByte: (offset: number, value: number) => void;
}

export default function BitEditor({ tab, onEditByte }: BitEditorProps) {
  const [byteVal, setByteVal] = useState<number>(0);
  const offset = tab.selectedOffset;

  // Sync state with selected byte offset
  useEffect(() => {
    if (offset === null || offset === undefined) return;
    
    // Read from edits map or standard file
    if (tab.edits.has(offset)) {
      setByteVal(tab.edits.get(offset)!);
      return;
    }

    let active = true;
    const readByte = async () => {
      try {
        const slice = tab.file.slice(offset, offset + 1);
        const buf = await slice.arrayBuffer();
        if (buf.byteLength > 0 && active) {
          const u8 = new Uint8Array(buf);
          setByteVal(u8[0]);
        }
      } catch (err) {
        console.error('Error reading byte for bit editor:', err);
      }
    };
    readByte();

    return () => {
      active = false;
    };
  }, [offset, tab.file, tab.edits]);

  if (offset === null || offset === undefined) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 border border-zinc-800 rounded-xl h-full text-center text-zinc-500">
        <Binary size={40} className="mb-3 text-zinc-600 animate-pulse" />
        <p className="text-sm font-semibold text-zinc-400 uppercase tracking-wider font-mono">Bảng Điều Khiển Bit Trống</p>
        <p className="text-xs mt-2 max-w-[240px] leading-relaxed text-zinc-500">
          Hãy nhấp chọn một byte bất kỳ trên lưới Hex để mở màng bọc phân tách 8-bit và bắt đầu xoay chuyển bật tắt các bit 0 và 1!
        </p>
      </div>
    );
  }

  const toggleBitAt = (bitIndex: number) => {
    const newVal = byteVal ^ (1 << bitIndex);
    setByteVal(newVal);
    onEditByte(offset, newVal);
  };

  const setByteDirect = (val: number) => {
    const clamped = Math.max(0, Math.min(255, val));
    setByteVal(clamped);
    onEditByte(offset, clamped);
  };

  // Binary Representation String
  const binStr = byteVal.toString(2).padStart(8, '0');

  // Binary presets
  const presets = [
    { name: 'Xóa Sạch (0x00)', val: 0x00, pattern: '00000000' },
    { name: 'Lấp Đầy (0xFF)', val: 0xFF, pattern: '11111111' },
    { name: 'Xen Kẽ A (0xAA)', val: 0xAA, pattern: '10101010' },
    { name: 'Xen Kẽ B (0x55)', val: 0x55, pattern: '01010101' },
    { name: 'Nửa Trên (0xF0)', val: 0xF0, pattern: '11110000' },
    { name: 'Nửa Dưới (0x0F)', val: 0x0F, pattern: '00001111' },
  ];

  return (
    <div className="flex flex-col gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl select-none text-zinc-300">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <ToggleLeft size={18} className="text-emerald-500 animate-pulse" />
          <h3 className="text-xs font-black text-zinc-100 uppercase tracking-wider font-sans">
            Trang Sửa Bit Chuyên Sâu (0-1 Bit Editor)
          </h3>
        </div>
        <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold">
          Offset: 0x{offset.toString(16).toUpperCase()}
        </span>
      </div>

      {/* Visual Large Bit Switches */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono font-bold">
          <span>SƠ ĐỒ 8 CÔNG TẮC NHỊ PHÂN (BẤT/TẮT):</span>
          <span className="text-zinc-500">Trái: Bit Trọng Số Lớn (MSB) | Phải: LSB</span>
        </div>

        {/* Big Buttons row */}
        <div className="grid grid-cols-8 gap-2">
          {Array.from({ length: 8 }).map((_, idx) => {
            const bitIndex = 7 - idx; // bit 7 to bit 0
            const bitValue = (byteVal >> bitIndex) & 1;
            const bitWeight = Math.pow(2, bitIndex);

            return (
              <button
                key={bitIndex}
                id={`bitedit-switch-${bitIndex}`}
                onClick={() => toggleBitAt(bitIndex)}
                className={`flex flex-col items-center justify-center py-4 rounded-xl border transition-all cursor-pointer active:scale-90 relative overflow-hidden ${
                  bitValue === 1
                    ? 'bg-gradient-to-b from-emerald-500/20 to-emerald-600/5 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/5'
                    : 'bg-zinc-950 border-zinc-850 text-zinc-600 hover:border-zinc-700'
                }`}
              >
                {/* Glow effect for ON bits */}
                {bitValue === 1 && (
                  <div className="absolute inset-0 bg-emerald-400/5 animate-pulse pointer-events-none" />
                )}
                <span className="text-[9px] font-mono text-zinc-500 font-semibold mb-1">
                  Bit {bitIndex}
                </span>
                <span className="text-[22px] font-black font-mono tracking-tight leading-none">
                  {bitValue}
                </span>
                <span className={`text-[8px] font-mono mt-1 px-1 rounded ${bitValue === 1 ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-600'}`}>
                  vél: {bitWeight}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bit Weight Calculation Table */}
      <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850">
        <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono mb-2 border-b border-zinc-900 pb-1.5 uppercase font-bold">
          <span>Phép tính dịch trị nhị phân (Decimal Sum):</span>
          <span className="text-emerald-400 font-bold font-mono">Total: {byteVal} (0x{byteVal.toString(16).toUpperCase().padStart(2, '0')})</span>
        </div>

        <div className="space-y-1 font-mono text-[10px]">
          <div className="flex flex-wrap gap-1.5 text-zinc-500 leading-relaxed justify-center py-1">
            {Array.from({ length: 8 }).map((_, idx) => {
              const bitIndex = 7 - idx;
              const bitValue = (byteVal >> bitIndex) & 1;
              const bitWeight = Math.pow(2, bitIndex);
              
              return (
                <span key={bitIndex} className={`px-1.5 py-0.5 rounded ${bitValue === 1 ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-zinc-700 font-normal line-through opacity-40'}`}>
                  {bitValue === 1 ? `${bitWeight}` : '0'}
                </span>
              );
            }).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, <span key={`plus-${i}`} className="text-zinc-600">+</span>, curr], [] as React.ReactNode[])}
            <span className="text-zinc-400 font-bold">=</span>
            <span className="bg-emerald-500/15 text-emerald-400 px-2 rounded font-black">{byteVal}</span>
          </div>
        </div>
      </div>

      {/* Binary Pattern Presets */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono font-bold uppercase tracking-wider">
          <Zap size={13} className="text-amber-500" />
          <span>Mẫu Bit Nhị Phân Nhanh (Binary Presets)</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {presets.map((preset) => {
            const isCurrent = byteVal === preset.val;
            return (
              <button
                key={preset.name}
                onClick={() => setByteDirect(preset.val)}
                className={`px-2.5 py-2 rounded-lg border text-[10px] font-mono flex flex-col items-center justify-center gap-0.5 transition cursor-pointer active:scale-95 ${
                  isCurrent
                    ? 'bg-emerald-600/10 border-emerald-500 text-emerald-300 font-bold'
                    : 'bg-zinc-950 border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className="font-sans font-semibold text-[9px]">{preset.name}</span>
                <span className="text-[9px] opacity-70 tracking-widest">{preset.pattern}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Operations (Invert / Shift) */}
        <div className="grid grid-cols-3 gap-2 mt-1">
          <button
            onClick={() => setByteDirect(byteVal ^ 0xFF)}
            className="bg-zinc-950 hover:bg-zinc-800 border border-zinc-850 text-[10px] font-bold py-2 rounded-lg transition text-zinc-400 hover:text-zinc-200 uppercase cursor-pointer active:scale-95"
          >
            🔄 Đảo Ngược Bit (NOT)
          </button>
          <button
            onClick={() => setByteDirect((byteVal << 1) & 0xFF)}
            className="bg-zinc-950 hover:bg-zinc-800 border border-zinc-850 text-[10px] font-bold py-2 rounded-lg transition text-zinc-400 hover:text-zinc-200 uppercase cursor-pointer active:scale-95 text-center"
            title="Dịch bit sang trái 1 vị trí (Nhân 2)"
          >
            ◀◀ Dịch Trái (SHL)
          </button>
          <button
            onClick={() => setByteDirect(byteVal >> 1)}
            className="bg-zinc-950 hover:bg-zinc-800 border border-zinc-850 text-[10px] font-bold py-2 rounded-lg transition text-zinc-400 hover:text-zinc-200 uppercase cursor-pointer active:scale-95 text-center"
            title="Dịch bit sang phải 1 vị trí (Chia 2 lấy nguyên)"
          >
            ▶▶ Dịch Phải (SHR)
          </button>
        </div>
      </div>

      {/* Informative Help Guide */}
      <div className="bg-zinc-950/40 p-3 rounded-lg border border-zinc-850 flex items-start gap-2.5 text-[10px] text-zinc-400 leading-relaxed">
        <Info size={14} className="text-emerald-500 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1 font-sans">
          <span className="font-bold text-zinc-300 uppercase tracking-wide">Giải thích Cơ bản về Nhị phân:</span>
          <p>
            Mỗi Byte chứa <strong className="text-zinc-300">8 Bit</strong> nhị phân độc lập. Bit nhận trị <strong className="text-zinc-300">1</strong> (Mở/Điện áp cao) hoặc <strong className="text-zinc-300">0</strong> (Tắt/Điện áp thấp). 
          </p>
          <p>
            Xoay chuyển các bit này sẽ thay đổi giá trị số từ <strong className="text-emerald-400">0 đến 255</strong>. Sửa các bit quan trọng ở vị trí cao (ví dụ Bit 7) sẽ tạo ra mức nhảy giá trị rất lớn (±128), trong khi sửa Bit 0 chỉ làm xê dịch trị số cực nhỏ (±1).
          </p>
        </div>
      </div>

    </div>
  );
}
