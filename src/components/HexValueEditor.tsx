/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FileTab } from '../types';
import { Hash, Sliders, Info, Zap, HelpCircle } from 'lucide-react';

interface HexValueEditorProps {
  tab: FileTab;
  onEditByte: (offset: number, value: number) => void;
}

export default function HexValueEditor({ tab, onEditByte }: HexValueEditorProps) {
  const [byteVal, setByteVal] = useState<number>(0);
  const [hexInput, setHexInput] = useState<string>('00');
  const [decInput, setDecInput] = useState<string>('0');
  const [charInput, setCharInput] = useState<string>('');
  
  const offset = tab.selectedOffset;

  // Sync state with selected byte offset
  useEffect(() => {
    if (offset === null || offset === undefined) return;
    
    let currentVal = 0;
    if (tab.edits.has(offset)) {
      currentVal = tab.edits.get(offset)!;
    } else {
      // Fetch from file asynchronously
      let active = true;
      const readByte = async () => {
        try {
          const slice = tab.file.slice(offset, offset + 1);
          const buf = await slice.arrayBuffer();
          if (buf.byteLength > 0 && active) {
            const u8 = new Uint8Array(buf);
            setByteVal(u8[0]);
            setHexInput(u8[0].toString(16).toUpperCase().padStart(2, '0'));
            setDecInput(u8[0].toString());
            setCharInput(u8[0] >= 32 && u8[0] <= 126 ? String.fromCharCode(u8[0]) : '.');
          }
        } catch (err) {
          console.error('Error reading byte for hex editor:', err);
        }
      };
      readByte();
      return () => {
        active = false;
      };
    }

    setByteVal(currentVal);
    setHexInput(currentVal.toString(16).toUpperCase().padStart(2, '0'));
    setDecInput(currentVal.toString());
    setCharInput(currentVal >= 32 && currentVal <= 126 ? String.fromCharCode(currentVal) : '.');
  }, [offset, tab.file, tab.edits]);

  if (offset === null || offset === undefined) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 border border-zinc-800 rounded-xl h-full text-center text-zinc-500">
        <Hash size={40} className="mb-3 text-zinc-600 animate-pulse" />
        <p className="text-sm font-semibold text-zinc-400 uppercase tracking-wider font-mono">Chưa Chọn Địa Chỉ Sửa</p>
        <p className="text-xs mt-2 max-w-[240px] leading-relaxed text-zinc-500">
          Hãy nhấp chọn một byte bất kỳ trên lưới Hex để bắt đầu gõ giá trị Hex (16) hoặc Decimal (10) trực tiếp bằng bộ lọc này!
        </p>
      </div>
    );
  }

  const updateAllFields = (val: number) => {
    const clamped = Math.max(0, Math.min(255, val));
    setByteVal(clamped);
    setHexInput(clamped.toString(16).toUpperCase().padStart(2, '0'));
    setDecInput(clamped.toString());
    setCharInput(clamped >= 32 && clamped <= 126 ? String.fromCharCode(clamped) : '.');
    onEditByte(offset, clamped);
  };

  const handleHexChange = (val: string) => {
    setHexInput(val);
    const parsed = parseInt(val, 16);
    if (!isNaN(parsed)) {
      const clamped = Math.max(0, Math.min(255, parsed));
      setByteVal(clamped);
      setDecInput(clamped.toString());
      setCharInput(clamped >= 32 && clamped <= 126 ? String.fromCharCode(clamped) : '.');
      onEditByte(offset, clamped);
    }
  };

  const handleDecChange = (val: string) => {
    setDecInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(0, Math.min(255, parsed));
      setByteVal(clamped);
      setHexInput(clamped.toString(16).toUpperCase().padStart(2, '0'));
      setCharInput(clamped >= 32 && clamped <= 126 ? String.fromCharCode(clamped) : '.');
      onEditByte(offset, clamped);
    }
  };

  const handleCharChange = (val: string) => {
    if (val.length === 0) {
      setCharInput('');
      return;
    }
    // Take the last character
    const lastChar = val.substring(val.length - 1);
    setCharInput(lastChar);
    const code = lastChar.charCodeAt(0);
    if (code >= 0 && code <= 255) {
      updateAllFields(code);
    }
  };

  const presets = [
    { name: '0x00 (Null)', val: 0x00 },
    { name: '0xFF (Max)', val: 0xFF },
    { name: '0x20 (Space)', val: 0x20 },
    { name: '0x0A (LF)', val: 0x0A },
    { name: '0x0D (CR)', val: 0x0D },
    { name: '0x30 ("0")', val: 0x30 },
    { name: '0x41 ("A")', val: 0x41 },
    { name: 'Ngẫu nhiên', val: -1 },
  ];

  return (
    <div className="flex flex-col gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl select-none text-zinc-300">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Hash size={18} className="text-amber-500 animate-pulse" />
          <h3 className="text-xs font-black text-zinc-100 uppercase tracking-wider font-sans">
            Trang Sửa Thập Lục Phân (Hex/Dec Editor)
          </h3>
        </div>
        <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-bold">
          Địa chỉ: 0x{offset.toString(16).toUpperCase()}
        </span>
      </div>

      {/* Main Editing Controls Panel */}
      <div className="grid grid-cols-3 gap-3 bg-zinc-950 p-4 rounded-xl border border-zinc-850">
        
        {/* Hex Block */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-500 font-bold uppercase font-mono tracking-wider text-center">Hexadecimal (Cơ số 16)</label>
          <div className="flex items-center justify-center bg-zinc-900 border border-zinc-800 focus-within:border-amber-500 rounded-lg p-1">
            <span className="text-zinc-600 font-mono font-bold text-xs pl-1.5 select-none">0x</span>
            <input
              id="hexvaledit-hex-input"
              type="text"
              maxLength={2}
              value={hexInput}
              onChange={(e) => handleHexChange(e.target.value)}
              className="w-full bg-transparent border-none text-zinc-100 font-mono text-center text-lg font-black focus:outline-none uppercase"
              placeholder="00"
            />
          </div>
        </div>

        {/* Dec Block */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-500 font-bold uppercase font-mono tracking-wider text-center">Decimal (Cơ số 10)</label>
          <input
            id="hexvaledit-dec-input"
            type="number"
            min={0}
            max={255}
            value={decInput}
            onChange={(e) => handleDecChange(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-lg py-2.5 px-2 font-mono text-center text-lg font-black text-zinc-100 focus:outline-none"
            placeholder="0"
          />
        </div>

        {/* Char Block */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-500 font-bold uppercase font-mono tracking-wider text-center">Ký tự ASCII (Chữ)</label>
          <input
            id="hexvaledit-char-input"
            type="text"
            value={charInput}
            onChange={(e) => handleCharChange(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-lg py-2.5 px-2 font-mono text-center text-lg font-black text-zinc-100 focus:outline-none"
            placeholder="."
          />
        </div>

      </div>

      {/* Numeric Nudge Operations (+1, -1, +16, -16) */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase tracking-wider">Cộng trừ dịch số lượng tử:</span>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            onClick={() => updateAllFields(byteVal - 1)}
            className="bg-zinc-950 hover:bg-zinc-800 text-zinc-300 font-bold py-2 border border-zinc-850 rounded-lg text-[10px] transition cursor-pointer active:scale-95 text-center font-mono"
          >
            -1 Dec
          </button>
          <button
            onClick={() => updateAllFields(byteVal + 1)}
            className="bg-zinc-950 hover:bg-zinc-800 text-zinc-300 font-bold py-2 border border-zinc-850 rounded-lg text-[10px] transition cursor-pointer active:scale-95 text-center font-mono"
          >
            +1 Dec
          </button>
          <button
            onClick={() => updateAllFields(byteVal - 16)}
            className="bg-zinc-950 hover:bg-zinc-800 text-zinc-300 font-bold py-2 border border-zinc-850 rounded-lg text-[10px] transition cursor-pointer active:scale-95 text-center font-mono"
          >
            -16 (1 Dòng)
          </button>
          <button
            onClick={() => updateAllFields(byteVal + 16)}
            className="bg-zinc-950 hover:bg-zinc-800 text-zinc-300 font-bold py-2 border border-zinc-850 rounded-lg text-[10px] transition cursor-pointer active:scale-95 text-center font-mono"
          >
            +16 (1 Dòng)
          </button>
        </div>
      </div>

      {/* Quick Values Presets */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono font-bold uppercase tracking-wider">
          <Zap size={13} className="text-amber-500" />
          <span>Mẫu Hex Có Sẵn (Hex Presets)</span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {presets.map((preset) => {
            const isCurrent = preset.val === -1 ? false : byteVal === preset.val;
            return (
              <button
                key={preset.name}
                onClick={() => {
                  if (preset.val === -1) {
                    updateAllFields(Math.floor(Math.random() * 256));
                  } else {
                    updateAllFields(preset.val);
                  }
                }}
                className={`py-2 rounded-lg border text-[10px] font-mono flex flex-col items-center justify-center transition cursor-pointer active:scale-95 ${
                  isCurrent
                    ? 'bg-amber-600/10 border-amber-500 text-amber-300 font-bold'
                    : 'bg-zinc-950 border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hex vs Dec Explainer */}
      <div className="bg-zinc-950/40 p-3 rounded-lg border border-zinc-850 flex items-start gap-2.5 text-[10px] text-zinc-400 leading-relaxed">
        <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1 font-sans">
          <span className="font-bold text-zinc-300 uppercase tracking-wide">Hexadecimal vs Decimal:</span>
          <p>
            Mạng lưới nhị phân có độ phủ lớn nên hệ <strong className="text-zinc-300">Thập lục phân (Hex - Cơ số 16)</strong> được dùng rộng rãi trong khoa học máy tính để gộp 8 bits nhị phân thành đúng <strong className="text-zinc-300">2 ký tự</strong> ngắn gọn (từ 00 đến FF). 
          </p>
          <p>
            Ví dụ: Trị decimal <strong className="text-zinc-300">255</strong> tương đương với hex <strong className="text-amber-400">FF</strong> (nhị phân 11111111). Trị decimal <strong className="text-zinc-300">0</strong> tương đương hex <strong className="text-amber-400">00</strong>. Chỉnh sửa bằng Hex giúp thao tác file nhanh hơn, ít sai lệch hơn.
          </p>
        </div>
      </div>

    </div>
  );
}
