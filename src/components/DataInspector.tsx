/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FileTab } from '../types';
import { 
  Binary, 
  ToggleLeft, 
  Activity, 
  Info, 
  Hash, 
  ShieldAlert, 
  Flame, 
  Sliders, 
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

interface DataInspectorProps {
  tab: FileTab;
  onEditByte: (offset: number, value: number) => void;
  onEditMultipleBytes?: (edits: Map<number, number>) => void;
}

export default function DataInspector({ tab, onEditByte, onEditMultipleBytes }: DataInspectorProps) {
  const [numBytes, setNumBytes] = useState<number>(4); // Edit 1, 2, 4, or 8 bytes parallelly
  const [unsafeMode, setUnsafeMode] = useState<boolean>(false);
  const [bytes, setBytes] = useState<Uint8Array>(new Uint8Array(8));
  const [availableLen, setAvailableLen] = useState<number>(0);
  
  // Local inputs to hold temporary/raw typed values (especially for Unsafe Mode)
  const [hexInputs, setHexInputs] = useState<string[]>(Array(8).fill(''));
  const [decInputs, setDecInputs] = useState<string[]>(Array(8).fill(''));
  const [binInputs, setBinInputs] = useState<string[]>(Array(8).fill(''));

  const offset = tab.selectedOffset;

  // Read up to 8 bytes at selected offset
  useEffect(() => {
    if (offset === null) return;

    let active = true;
    const fetchBytes = async () => {
      try {
        const start = offset;
        const end = Math.min(offset + 8, tab.size);
        const slice = tab.file.slice(start, end);
        const buffer = await slice.arrayBuffer();
        const raw = new Uint8Array(buffer);

        const activeBytes = new Uint8Array(8);
        activeBytes.set(raw);

        // Apply sparse edits
        for (let i = 0; i < raw.length; i++) {
          const fileOffset = start + i;
          if (tab.edits.has(fileOffset)) {
            activeBytes[i] = tab.edits.get(fileOffset)!;
          }
        }

        if (active) {
          setBytes(activeBytes);
          setAvailableLen(raw.length);

          // Update local inputs
          const newHexs = Array(8).fill('');
          const newDecs = Array(8).fill('');
          const newBins = Array(8).fill('');
          for (let i = 0; i < 8; i++) {
            newHexs[i] = activeBytes[i].toString(16).toUpperCase().padStart(2, '0');
            newDecs[i] = activeBytes[i].toString();
            newBins[i] = activeBytes[i].toString(2).padStart(8, '0');
          }
          setHexInputs(newHexs);
          setDecInputs(newDecs);
          setBinInputs(newBins);
        }
      } catch (err) {
        console.error('Failed to inspect bytes:', err);
      }
    };

    fetchBytes();
    return () => {
      active = false;
    };
  }, [offset, tab.file, tab.edits, tab.size]);

  if (offset === null) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 border border-zinc-800 rounded-xl h-full text-center text-zinc-500">
        <Binary size={40} className="mb-3 text-zinc-600 animate-pulse" />
        <p className="text-sm font-semibold text-zinc-400">Chưa chọn Byte nào</p>
        <p className="text-xs mt-1 max-w-[220px]">
          Hãy nhấp vào bất kỳ byte nào trong bảng Hex để bắt đầu phân tách, chỉnh sửa bit/hex theo nhiều cột song song chuyên nghiệp.
        </p>
      </div>
    );
  }

  // Handle bit-level toggle
  const toggleBit = (byteIdx: number, bitIndex: number) => {
    const currentByteVal = bytes[byteIdx];
    const newVal = currentByteVal ^ (1 << bitIndex);
    onEditByte(offset + byteIdx, newVal);
  };

  // Convert raw value to 8-bit bounds or apply unsafe wrapping
  const parseAndApplyValue = (byteIdx: number, rawVal: number, originalInput: string, type: 'hex' | 'dec' | 'bin') => {
    let finalVal = rawVal;
    
    if (isNaN(rawVal)) return;

    if (!unsafeMode) {
      // Normal bounds
      finalVal = Math.max(0, Math.min(255, rawVal));
    } else {
      // Unsafe mode bounds: apply custom byte-wrapping mask
      finalVal = rawVal & 0xFF;
    }

    // Trigger update
    onEditByte(offset + byteIdx, finalVal);

    // Sync input states
    if (type === 'hex') {
      setHexInputs(prev => { const n = [...prev]; n[byteIdx] = originalInput; return n; });
    } else if (type === 'dec') {
      setDecInputs(prev => { const n = [...prev]; n[byteIdx] = originalInput; return n; });
    } else if (type === 'bin') {
      setBinInputs(prev => { const n = [...prev]; n[byteIdx] = originalInput; return n; });
    }
  };

  // Compute multi-byte types safely starting at selected offset
  const view = new DataView(bytes.buffer);
  const getS8 = () => (bytes[0] >= 128 ? bytes[0] - 256 : bytes[0]);
  const getU16LE = () => (availableLen >= 2 ? view.getUint16(0, true) : null);
  const getU16BE = () => (availableLen >= 2 ? view.getUint16(0, false) : null);
  const getU32LE = () => (availableLen >= 4 ? view.getUint32(0, true) : null);
  const getF32LE = () => (availableLen >= 4 ? view.getFloat32(0, true) : null);

  const activeLenToRender = Math.min(numBytes, availableLen);

  return (
    <div className="flex flex-col gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl select-none text-zinc-300">
      
      {/* Header with Settings */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-2">
        <div className="flex items-center gap-2">
          <Sliders size={18} className="text-emerald-500 animate-pulse" />
          <h3 className="text-xs font-black text-zinc-100 uppercase tracking-wider font-sans">
            Sửa Song Song Nhiều Cột (Multitask Byte)
          </h3>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="text-zinc-500">Sửa cùng lúc:</span>
          <select 
            id="num-bytes-selector"
            value={numBytes}
            onChange={(e) => setNumBytes(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-850 rounded px-1.5 py-0.5 text-zinc-200 outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value={1}>1 Byte</option>
            <option value={2}>2 Bytes</option>
            <option value={4}>4 Bytes</option>
            <option value={8}>8 Bytes</option>
          </select>
        </div>
      </div>

      {/* Unsafe Mode Switch & Warning Banner */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-850">
          <div className="flex items-center gap-2">
            <Flame size={14} className={unsafeMode ? "text-amber-500 animate-bounce" : "text-zinc-600"} />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-zinc-300">Bỏ qua giới hạn an toàn (Unsafe Mode)</span>
              <span className="text-[8px] text-zinc-500">Cho phép nhập số âm, giá trị tràn {'>'}255 và ký tự thô</span>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              id="unsafe-mode-toggle"
              type="checkbox"
              checked={unsafeMode}
              onChange={(e) => setUnsafeMode(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-8 h-4.5 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-500 after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-600 peer-checked:after:bg-white"></div>
          </label>
        </div>

        {unsafeMode && (
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2 text-amber-400 text-[10px] leading-relaxed">
            <ShieldAlert size={14} className="shrink-0 mt-0.5" />
            <span>
              <strong>CẢNH BÁO:</strong> Bạn đang bật Unsafe Mode. Mọi giới hạn biên sẽ bị bỏ qua (tự động wrap bits). Nhập giá trị vượt mức có thể gây hỏng định dạng file hoặc gây lỗi runtime cho tệp đích!
            </span>
          </div>
        )}
      </div>

      {/* PARALLEL EDITING COLUMNS CONTAINER */}
      <div className="space-y-3 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
        {Array.from({ length: activeLenToRender }).map((_, byteIdx) => {
          const currentOffset = offset + byteIdx;
          const currentByteVal = bytes[byteIdx];
          const isModified = tab.edits.has(currentOffset);

          const rawHex = hexInputs[byteIdx] || '';
          const rawDec = decInputs[byteIdx] || '';
          const rawBin = binInputs[byteIdx] || '';

          // Determine if there is overflow/underflow in the text inputs (Unsafe Mode visualization)
          const decNum = parseInt(rawDec, 10);
          const hasOverflow = !isNaN(decNum) && (decNum < 0 || decNum > 255);

          return (
            <div 
              key={byteIdx}
              className={`p-3 rounded-xl border transition-all flex flex-col gap-2.5
                ${isModified 
                  ? 'bg-amber-500/5 border-amber-500/30' 
                  : 'bg-zinc-950/60 border-zinc-850'
                }`}
            >
              {/* Byte Header */}
              <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5 text-[10px]">
                <span className="font-bold font-mono text-zinc-400">
                  Byte +{byteIdx} (Offset: <span className="text-zinc-300">0x{currentOffset.toString(16).toUpperCase()}</span>)
                </span>
                <div className="flex items-center gap-1.5">
                  {isModified && (
                    <span className="text-[8px] bg-amber-500/15 text-amber-400 font-mono font-bold px-1.5 py-0.5 rounded border border-amber-500/20">
                      MODIFIED
                    </span>
                  )}
                  {hasOverflow && (
                    <span className="text-[8px] bg-rose-500/15 text-rose-400 font-mono font-bold px-1.5 py-0.5 rounded border border-rose-500/20 animate-pulse">
                      OVERFLOW WRAP
                    </span>
                  )}
                </div>
              </div>

              {/* Grid: Column 1 (Bits) & Column 2 (Hex/Dec) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                
                {/* 8-Bit Toggle Panel */}
                <div className="md:col-span-7 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider font-bold">Bit Editor</span>
                    <span className="text-[8px] text-zinc-600 font-mono">{rawBin}</span>
                  </div>
                  <div className="grid grid-cols-8 gap-1">
                    {Array.from({ length: 8 }).map((_, bIdx) => {
                      const bitIndex = 7 - bIdx;
                      const isSet = (currentByteVal & (1 << bitIndex)) !== 0;
                      return (
                        <button
                          key={bitIndex}
                          id={`bit-${byteIdx}-${bitIndex}`}
                          onClick={() => toggleBit(byteIdx, bitIndex)}
                          className={`py-1.5 text-[10px] font-mono rounded border transition-all cursor-pointer text-center
                            ${isSet 
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-bold' 
                              : 'bg-zinc-900 border-zinc-800/80 text-zinc-500 hover:text-zinc-400'
                            }`}
                          title={`Bit ${bitIndex} (Value: ${1 << bitIndex})`}
                        >
                          {isSet ? '1' : '0'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Hex & Decimal Input Panel */}
                <div className="md:col-span-5 grid grid-cols-2 gap-2">
                  {/* Hex Input */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider font-bold">HEX</span>
                    <input
                      id={`hex-input-${byteIdx}`}
                      type="text"
                      maxLength={unsafeMode ? 8 : 2}
                      value={rawHex}
                      onChange={(e) => {
                        const val = e.target.value;
                        const parsed = parseInt(val, 16);
                        parseAndApplyValue(byteIdx, parsed, val, 'hex');
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 font-mono text-xs text-zinc-100 text-center uppercase focus:outline-none focus:border-amber-500 font-semibold"
                      placeholder="00"
                    />
                  </div>

                  {/* Decimal Input */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider font-bold">DEC</span>
                    <input
                      id={`dec-input-${byteIdx}`}
                      type={unsafeMode ? "text" : "number"}
                      min={0}
                      max={255}
                      value={rawDec}
                      onChange={(e) => {
                        const val = e.target.value;
                        const parsed = parseInt(val, 10);
                        parseAndApplyValue(byteIdx, parsed, val, 'dec');
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 font-mono text-xs text-zinc-100 text-center focus:outline-none focus:border-amber-500 font-semibold"
                      placeholder="0"
                    />
                  </div>
                </div>

              </div>

              {/* Quick Operation row inside each byte block */}
              <div className="flex items-center gap-1.5 pt-1.5 border-t border-zinc-900/60 text-[8px] font-mono">
                <span className="text-zinc-600">Thao tác nhanh:</span>
                <button
                  onClick={() => onEditByte(currentOffset, 0x00)}
                  className="bg-zinc-900 hover:bg-zinc-850 px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                >
                  Set 0x00
                </button>
                <button
                  onClick={() => onEditByte(currentOffset, 0xFF)}
                  className="bg-zinc-900 hover:bg-zinc-850 px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                >
                  Set 0xFF
                </button>
                <button
                  onClick={() => onEditByte(currentOffset, currentByteVal ^ 0xFF)}
                  className="bg-zinc-900 hover:bg-zinc-850 px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                  title="Invert bits"
                >
                  Invert
                </button>
                <button
                  onClick={() => onEditByte(currentOffset, (currentByteVal + 1) & 0xFF)}
                  className="bg-zinc-900 hover:bg-zinc-850 px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                >
                  Byte + 1
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* DATA INSPECTOR TYPES GRID */}
      <div className="pt-2 border-t border-zinc-800/80">
        <div className="text-[10px] text-zinc-500 mb-2 font-black uppercase tracking-wider font-mono flex items-center gap-1.5">
          <Activity size={12} className="text-zinc-400" />
          <span>Thông dịch các kiểu dữ liệu khác (từ byte đầu)</span>
        </div>

        <div className="bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden text-xs divide-y divide-zinc-900 font-mono">
          {/* Int8 */}
          <div className="flex p-2 hover:bg-zinc-900/30">
            <span className="w-28 text-zinc-500">Int8 (Có dấu)</span>
            <span className="text-zinc-100 select-text">{getS8()}</span>
          </div>

          {/* UInt16 */}
          {availableLen >= 2 ? (
            <>
              <div className="flex p-2 hover:bg-zinc-900/30">
                <span className="w-28 text-zinc-500">UInt16 LE</span>
                <span className="text-zinc-100 select-text">{getU16LE()}</span>
              </div>
              <div className="flex p-2 hover:bg-zinc-900/30">
                <span className="w-28 text-zinc-500">UInt16 BE</span>
                <span className="text-zinc-100 select-text">{getU16BE()}</span>
              </div>
            </>
          ) : (
            <div className="flex p-2 text-zinc-600 text-[10px]">
              <Info size={10} className="mr-1 mt-0.5 animate-pulse" />
              <span>Cần thêm tối thiểu 2 byte để dịch 16-bit</span>
            </div>
          )}

          {/* UInt32 / Float32 */}
          {availableLen >= 4 ? (
            <>
              <div className="flex p-2 hover:bg-zinc-900/30">
                <span className="w-28 text-zinc-500">UInt32 LE</span>
                <span className="text-zinc-100 select-text">{getU32LE()}</span>
              </div>
              <div className="flex p-2 hover:bg-zinc-900/30">
                <span className="w-28 text-zinc-500">Float32 LE</span>
                <span className="text-zinc-100 select-text">
                  {getF32LE()?.toPrecision(6)}
                </span>
              </div>
            </>
          ) : (
            <div className="flex p-2 text-zinc-600 text-[10px]">
              <Info size={10} className="mr-1 mt-0.5 animate-pulse" />
              <span>Cần thêm tối thiểu 4 byte để dịch 32-bit</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
