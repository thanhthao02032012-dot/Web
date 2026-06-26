/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FileTab } from '../types';
import { 
  Sparkles, 
  HelpCircle, 
  Binary, 
  Hash, 
  Type, 
  RefreshCw, 
  Settings, 
  Check, 
  AlertTriangle, 
  Clock, 
  Plus, 
  Minus, 
  Shuffle 
} from 'lucide-react';

interface BulkEditorProps {
  tab: FileTab;
  onEditMultipleBytes: (editsMap: Map<number, number>) => void;
}

export default function BulkEditor({ tab, onEditMultipleBytes }: BulkEditorProps) {
  // Tabs: 'fill' (Fill range with bytes/text) or 'transform' (Math/XOR operations on existing bytes)
  const [activeSubTab, setActiveSubTab] = useState<'fill' | 'transform'>('fill');

  // Range selections
  const [startInput, setStartInput] = useState<string>('0');
  const [endInput, setEndInput] = useState<string>('');
  const [lengthInput, setLengthInput] = useState<string>('16');

  // Resolved range numbers
  const [startOffset, setStartOffset] = useState<number>(0);
  const [endOffset, setEndOffset] = useState<number>(16);
  const [rangeLength, setRangeLength] = useState<number>(16);

  // Error/Success state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Mode: Fill settings
  const [fillType, setFillType] = useState<'byte' | 'text' | 'sequence' | 'random'>('byte');
  const [fillByteVal, setFillByteVal] = useState<string>('00'); // hex or decimal
  const [fillTextVal, setFillTextVal] = useState<string>('');
  const [repeatText, setRepeatText] = useState<boolean>(true);
  const [seqStart, setSeqStart] = useState<string>('0');
  const [seqStep, setSeqStep] = useState<string>('1');

  // Mode: Transform settings
  const [transformOp, setTransformOp] = useState<'xor' | 'add' | 'sub' | 'not' | 'and' | 'or'>('xor');
  const [transformOperand, setTransformOperand] = useState<string>('55'); // hex or decimal

  // Sync inputs with state values
  const parseOffset = (input: string): number => {
    const clean = input.trim();
    if (!clean) return NaN;
    if (clean.toLowerCase().startsWith('0x')) {
      return parseInt(clean.slice(2), 16);
    }
    // If it contains A-F and no standard decimal digits matching letter format, treat as hex
    if (/[a-fA-F]/.test(clean) && !/^[0-9]+$/.test(clean)) {
      return parseInt(clean, 16);
    }
    return parseInt(clean, 10);
  };

  // Keep startOffset, endOffset, and rangeLength synchronized when inputs change
  useEffect(() => {
    const parsedStart = parseOffset(startInput);
    if (isNaN(parsedStart) || parsedStart < 0) {
      setStartOffset(0);
      return;
    }
    setStartOffset(parsedStart);
  }, [startInput]);

  useEffect(() => {
    const parsedLen = parseOffset(lengthInput);
    if (isNaN(parsedLen) || parsedLen <= 0) {
      return;
    }
    setRangeLength(parsedLen);
    setEndOffset(startOffset + parsedLen);
    setEndInput((startOffset + parsedLen).toString());
  }, [lengthInput, startOffset]);

  // Handle direct change of end input
  const handleEndChange = (val: string) => {
    setEndInput(val);
    const parsedEnd = parseOffset(val);
    if (!isNaN(parsedEnd) && parsedEnd >= startOffset) {
      setEndOffset(parsedEnd);
      const computedLen = parsedEnd - startOffset;
      setRangeLength(computedLen);
      setLengthInput(computedLen.toString());
    }
  };

  // Helper to import active cursor selection
  const handleUseCursorOffset = () => {
    if (tab.selectedOffset !== null) {
      setStartInput(tab.selectedOffset.toString());
      setStartOffset(tab.selectedOffset);
      // Retain the current length and update End input
      const parsedLen = parseOffset(lengthInput) || 16;
      setEndInput((tab.selectedOffset + parsedLen).toString());
      setEndOffset(tab.selectedOffset + parsedLen);
      setErrorMsg(null);
      setSuccessMsg(`Set start offset to active cursor: 0x${tab.selectedOffset.toString(16).toUpperCase()} (${tab.selectedOffset})`);
    } else {
      setErrorMsg('No active cursor selection found. Click on any byte in the hex grid first.');
    }
  };

  // Helper to select entire file
  const handleSelectEntireFile = () => {
    setStartInput('0');
    setStartOffset(0);
    setEndInput(tab.size.toString());
    setEndOffset(tab.size);
    setLengthInput(tab.size.toString());
    setRangeLength(tab.size);
    setErrorMsg(null);
    setSuccessMsg(`Range set to cover entire file (${tab.size} bytes)`);
  };

  // Parsing values helpers
  const parseByteValue = (val: string): number => {
    const clean = val.trim();
    if (clean.toLowerCase().startsWith('0x')) {
      return parseInt(clean.slice(2), 16) & 0xFF;
    }
    if (/[a-fA-F]/.test(clean) && clean.length <= 2) {
      return parseInt(clean, 16) & 0xFF;
    }
    const dec = parseInt(clean, 10);
    return isNaN(dec) ? 0 : dec & 0xFF;
  };

  // Main Submit handler for filling a range
  const handleApplyFill = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (startOffset < 0 || startOffset >= tab.size) {
      setErrorMsg(`Invalid start offset. Must be between 0 and ${tab.size - 1}.`);
      return;
    }
    if (endOffset <= startOffset || endOffset > tab.size) {
      setErrorMsg(`Invalid range. End offset must be between ${startOffset + 1} and ${tab.size}.`);
      return;
    }

    if (rangeLength > 100000) {
      setErrorMsg('For performance reasons, bulk editing is capped at 100,000 bytes per operation.');
      return;
    }

    setIsProcessing(true);

    try {
      const editsToApply = new Map<number, number>();

      if (fillType === 'byte') {
        const byteVal = parseByteValue(fillByteVal);
        for (let i = startOffset; i < endOffset; i++) {
          editsToApply.set(i, byteVal);
        }
      } else if (fillType === 'text') {
        if (!fillTextVal) {
          setErrorMsg('Please specify some text characters to insert.');
          setIsProcessing(false);
          return;
        }
        const encoder = new TextEncoder();
        const textBytes = encoder.encode(fillTextVal);
        if (textBytes.length === 0) {
          setErrorMsg('Text encoding produced empty bytes.');
          setIsProcessing(false);
          return;
        }

        for (let i = startOffset; i < endOffset; i++) {
          const indexInRange = i - startOffset;
          if (repeatText) {
            const byteChar = textBytes[indexInRange % textBytes.length];
            editsToApply.set(i, byteChar);
          } else {
            if (indexInRange < textBytes.length) {
              editsToApply.set(i, textBytes[indexInRange]);
            } else {
              // pad with 0x00
              editsToApply.set(i, 0);
            }
          }
        }
      } else if (fillType === 'sequence') {
        const startVal = parseByteValue(seqStart);
        const stepVal = parseInt(seqStep, 10) || 1;
        for (let i = startOffset; i < endOffset; i++) {
          const indexInRange = i - startOffset;
          const currentVal = (startVal + indexInRange * stepVal) & 0xFF;
          editsToApply.set(i, currentVal);
        }
      } else if (fillType === 'random') {
        for (let i = startOffset; i < endOffset; i++) {
          const randomVal = Math.floor(Math.random() * 256);
          editsToApply.set(i, randomVal);
        }
      }

      // Apply
      onEditMultipleBytes(editsToApply);
      setSuccessMsg(`Successfully edited ${editsToApply.size} bytes in range [0x${startOffset.toString(16).toUpperCase()} - 0x${endOffset.toString(16).toUpperCase()})!`);
    } catch (err) {
      console.error(err);
      setErrorMsg('An error occurred while preparing bulk range edits.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Main Submit handler for transforming/manipulating existing bytes in range
  const handleApplyTransform = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (startOffset < 0 || startOffset >= tab.size) {
      setErrorMsg(`Invalid start offset. Must be between 0 and ${tab.size - 1}.`);
      return;
    }
    if (endOffset <= startOffset || endOffset > tab.size) {
      setErrorMsg(`Invalid range. End offset must be between ${startOffset + 1} and ${tab.size}.`);
      return;
    }

    if (rangeLength > 100000) {
      setErrorMsg('For performance reasons, bulk transformations are capped at 100,000 bytes per operation.');
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Fetch original file chunk
      const slice = tab.file.slice(startOffset, endOffset);
      const buffer = await slice.arrayBuffer();
      const rawBytes = new Uint8Array(buffer);

      const operand = parseByteValue(transformOperand);
      const editsToApply = new Map<number, number>();

      // 2. Perform math operations
      for (let i = 0; i < rawBytes.length; i++) {
        const offset = startOffset + i;
        // Check if there's already an active edit, otherwise read original
        const currentByte = tab.edits.has(offset) ? tab.edits.get(offset)! : rawBytes[i];
        let resultByte = currentByte;

        switch (transformOp) {
          case 'xor':
            resultByte = currentByte ^ operand;
            break;
          case 'add':
            resultByte = (currentByte + operand) & 0xFF;
            break;
          case 'sub':
            resultByte = (currentByte - operand + 256) & 0xFF;
            break;
          case 'not':
            resultByte = (~currentByte) & 0xFF;
            break;
          case 'and':
            resultByte = currentByte & operand;
            break;
          case 'or':
            resultByte = currentByte | operand;
            break;
        }

        editsToApply.set(offset, resultByte);
      }

      onEditMultipleBytes(editsToApply);
      setSuccessMsg(`Successfully transformed ${editsToApply.size} bytes in range using ${transformOp.toUpperCase()} operation!`);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to process and transform the selected bytes.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl select-none text-zinc-300">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider font-sans">
            Bulk Edit / Sửa Hàng Loạt
          </h3>
        </div>
        <div className="flex bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[10px] font-bold">
          <button
            type="button"
            id="bulk-subtab-fill"
            onClick={() => {
              setActiveSubTab('fill');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`px-2.5 py-1 rounded transition uppercase ${
              activeSubTab === 'fill' ? 'bg-amber-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Fill Pattern
          </button>
          <button
            type="button"
            id="bulk-subtab-transform"
            onClick={() => {
              setActiveSubTab('transform');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`px-2.5 py-1 rounded transition uppercase ${
              activeSubTab === 'transform' ? 'bg-amber-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Math / XOR
          </button>
        </div>
      </div>

      {/* Range Configurations */}
      <div className="space-y-3 bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
        <div className="flex justify-between items-center text-[11px] font-bold text-zinc-400">
          <span className="uppercase tracking-wider">Configure Target Range</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              id="btn-use-cursor"
              onClick={handleUseCursorOffset}
              className="text-[10px] bg-zinc-900 hover:bg-zinc-800 text-amber-500 px-2 py-0.5 rounded border border-zinc-800 cursor-pointer"
            >
              Use Cursor
            </button>
            <button
              type="button"
              id="btn-select-all-file"
              onClick={handleSelectEntireFile}
              className="text-[10px] bg-zinc-900 hover:bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-800 cursor-pointer"
            >
              All File
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {/* Start Offset */}
          <div>
            <label className="block text-[10px] text-zinc-500 font-bold mb-1 uppercase">Start Offset</label>
            <input
              id="bulk-start-offset"
              type="text"
              value={startInput}
              onChange={(e) => {
                setStartInput(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="e.g. 0 or 0x10"
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
            />
            <span className="text-[9px] text-zinc-600 font-mono block mt-0.5">
              Dec: {startOffset} / Hex: 0x{startOffset.toString(16).toUpperCase()}
            </span>
          </div>

          {/* End Offset */}
          <div>
            <label className="block text-[10px] text-zinc-500 font-bold mb-1 uppercase">End Offset</label>
            <input
              id="bulk-end-offset"
              type="text"
              value={endInput}
              onChange={(e) => {
                handleEndChange(e.target.value);
                setErrorMsg(null);
              }}
              placeholder={`e.g. ${tab.size}`}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
            />
            <span className="text-[9px] text-zinc-600 font-mono block mt-0.5">
              Dec: {endOffset} / Hex: 0x{endOffset.toString(16).toUpperCase()}
            </span>
          </div>

          {/* Length */}
          <div>
            <label className="block text-[10px] text-zinc-500 font-bold mb-1 uppercase">Length (Bytes)</label>
            <input
              id="bulk-range-length"
              type="text"
              value={lengthInput}
              onChange={(e) => {
                setLengthInput(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="e.g. 16"
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 font-mono text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
            />
            <span className="text-[9px] text-zinc-600 font-mono block mt-0.5">
              {rangeLength} bytes
            </span>
          </div>
        </div>
      </div>

      {/* Subtab A: Fill with pattern */}
      {activeSubTab === 'fill' && (
        <div className="space-y-3">
          {/* Fill Type */}
          <div>
            <label className="block text-[11px] text-zinc-500 font-bold mb-1.5 uppercase">Fill Type (Kiểu ghi đè)</label>
            <div className="grid grid-cols-4 gap-1.5 text-[10px] font-semibold">
              <button
                type="button"
                id="fill-type-byte"
                onClick={() => setFillType('byte')}
                className={`py-1.5 rounded border transition flex flex-col items-center gap-1 cursor-pointer ${
                  fillType === 'byte'
                    ? 'bg-amber-600 border-amber-500 text-white font-bold'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Hash size={13} />
                <span>Single Byte</span>
              </button>
              <button
                type="button"
                id="fill-type-text"
                onClick={() => setFillType('text')}
                className={`py-1.5 rounded border transition flex flex-col items-center gap-1 cursor-pointer ${
                  fillType === 'text'
                    ? 'bg-amber-600 border-amber-500 text-white font-bold'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Type size={13} />
                <span>Text String</span>
              </button>
              <button
                type="button"
                id="fill-type-sequence"
                onClick={() => setFillType('sequence')}
                className={`py-1.5 rounded border transition flex flex-col items-center gap-1 cursor-pointer ${
                  fillType === 'sequence'
                    ? 'bg-amber-600 border-amber-500 text-white font-bold'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Binary size={13} />
                <span>Sequence</span>
              </button>
              <button
                type="button"
                id="fill-type-random"
                onClick={() => setFillType('random')}
                className={`py-1.5 rounded border transition flex flex-col items-center gap-1 cursor-pointer ${
                  fillType === 'random'
                    ? 'bg-amber-600 border-amber-500 text-white font-bold'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Shuffle size={13} />
                <span>Random Noise</span>
              </button>
            </div>
          </div>

          {/* Settings Based on Fill Type */}
          {fillType === 'byte' && (
            <div className="space-y-1 bg-zinc-950/40 p-2.5 rounded border border-zinc-800/60">
              <label className="block text-[11px] text-zinc-400 font-bold mb-1">BYTE TO WRITE (Hex or Decimal)</label>
              <div className="flex gap-2">
                <input
                  id="fill-byte-input"
                  type="text"
                  value={fillByteVal}
                  onChange={(e) => setFillByteVal(e.target.value)}
                  placeholder="e.g. 00 or FF or 144"
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                />
                <span className="bg-zinc-900 border border-zinc-800 text-zinc-500 text-xs px-2.5 py-1.5 rounded font-mono flex items-center justify-center">
                  Parsed: 0x{parseByteValue(fillByteVal).toString(16).toUpperCase()} ({parseByteValue(fillByteVal)})
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 block mt-1">
                Fills the entire range with this identical byte. Excellent for clearing sections (zero fill with 00).
              </span>
            </div>
          )}

          {fillType === 'text' && (
            <div className="space-y-2 bg-zinc-950/40 p-2.5 rounded border border-zinc-800/60">
              <div>
                <label className="block text-[11px] text-zinc-400 font-bold mb-1">TEXT PATTERN (Chữ hàng loạt)</label>
                <input
                  id="fill-text-input"
                  type="text"
                  value={fillTextVal}
                  onChange={(e) => setFillTextVal(e.target.value)}
                  placeholder="e.g. ABC, NOP, NULL"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="checkbox-repeat-text"
                  type="checkbox"
                  checked={repeatText}
                  onChange={(e) => setRepeatText(e.target.checked)}
                  className="rounded bg-zinc-900 border-zinc-800 text-amber-500 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer"
                />
                <label htmlFor="checkbox-repeat-text" className="text-[11px] text-zinc-400 select-none cursor-pointer">
                  Repeat pattern to fill whole range (Lặp liên tục để lấp đầy vùng chọn)
                </label>
              </div>
              <span className="text-[10px] text-zinc-500 block">
                Fills the selected block with ASCII representation of your text. If repeat is unchecked, remaining bytes are filled with zero.
              </span>
            </div>
          )}

          {fillType === 'sequence' && (
            <div className="bg-zinc-950/40 p-2.5 rounded border border-zinc-800/60 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-zinc-500 font-bold mb-1 uppercase">Start Byte Value</label>
                  <input
                    id="seq-start-input"
                    type="text"
                    value={seqStart}
                    onChange={(e) => setSeqStart(e.target.value)}
                    placeholder="e.g. 0"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 font-bold mb-1 uppercase">Increment Step</label>
                  <input
                    id="seq-step-input"
                    type="text"
                    value={seqStep}
                    onChange={(e) => setSeqStep(e.target.value)}
                    placeholder="e.g. 1"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
              <span className="text-[10px] text-zinc-500 block">
                Generates a dynamic sequence: byte_val = (start + step * index) % 256. Perfect for generating offsets or testing gradients.
              </span>
            </div>
          )}

          {fillType === 'random' && (
            <div className="p-2.5 bg-zinc-950/40 rounded border border-zinc-800/60">
              <span className="text-[10px] text-zinc-400 block font-medium">
                ⚡ Will fill the selected range with completely randomized byte values (0x00 - 0xFF). This is useful for dummy data insertion, obfuscating padding zones, or testing entropy bounds.
              </span>
            </div>
          )}

          <button
            id="btn-apply-bulk-fill"
            type="button"
            onClick={handleApplyFill}
            disabled={isProcessing || isNaN(startOffset) || isNaN(endOffset) || rangeLength <= 0}
            className="w-full mt-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:hover:bg-amber-600 text-white font-bold py-2 rounded transition flex items-center justify-center gap-1.5 cursor-pointer text-xs"
          >
            {isProcessing ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            Execute Bulk Fill ({rangeLength} Bytes)
          </button>
        </div>
      )}

      {/* Subtab B: Transform/Math */}
      {activeSubTab === 'transform' && (
        <div className="space-y-3">
          {/* Operation Selector */}
          <div>
            <label className="block text-[11px] text-zinc-400 font-bold mb-1.5 uppercase">Operation (Phép toán)</label>
            <div className="grid grid-cols-3 gap-1 text-[11px] font-mono">
              {[
                { op: 'xor', label: 'XOR (Encrypt)' },
                { op: 'add', label: 'ADD (+)' },
                { op: 'sub', label: 'SUB (-)' },
                { op: 'not', label: 'NOT (Invert)' },
                { op: 'and', label: 'AND (&)' },
                { op: 'or', label: 'OR (|)' }
              ].map((item) => (
                <button
                  key={item.op}
                  type="button"
                  id={`transform-op-${item.op}`}
                  onClick={() => setTransformOp(item.op as any)}
                  className={`py-1 px-1 rounded border transition text-center cursor-pointer ${
                    transformOp === item.op
                      ? 'bg-amber-600 border-amber-500 text-white font-bold'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Operand value input */}
          {transformOp !== 'not' && (
            <div className="space-y-1 bg-zinc-950/40 p-2.5 rounded border border-zinc-800/60">
              <label className="block text-[11px] text-zinc-400 font-bold mb-1">
                OPERAND VALUE (Giá trị biến đổi - Hex or Decimal)
              </label>
              <div className="flex gap-2">
                <input
                  id="transform-operand-input"
                  type="text"
                  value={transformOperand}
                  onChange={(e) => setTransformOperand(e.target.value)}
                  placeholder="e.g. 55 or 0xAA"
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                />
                <span className="bg-zinc-900 border border-zinc-800 text-zinc-500 text-xs px-2.5 py-1.5 rounded font-mono flex items-center justify-center">
                  Parsed: 0x{parseByteValue(transformOperand).toString(16).toUpperCase()} ({parseByteValue(transformOperand)})
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 block mt-1">
                This value will be applied to each byte in the selected range according to the chosen mathematical operator.
              </span>
            </div>
          )}

          {transformOp === 'not' && (
            <div className="p-2.5 bg-zinc-950/40 rounded border border-zinc-800/60">
              <span className="text-[10px] text-zinc-400 block font-medium">
                🧩 <strong>NOT operation:</strong> Reverses each bit (1s' complement) of every byte in the range. No operand is required. E.g., 0x00 becomes 0xFF, and 0x55 becomes 0xAA.
              </span>
            </div>
          )}

          <button
            id="btn-apply-bulk-transform"
            type="button"
            onClick={handleApplyTransform}
            disabled={isProcessing || isNaN(startOffset) || isNaN(endOffset) || rangeLength <= 0}
            className="w-full mt-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:hover:bg-amber-600 text-white font-bold py-2 rounded transition flex items-center justify-center gap-1.5 cursor-pointer text-xs"
          >
            {isProcessing ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            Transform Range ({rangeLength} Bytes)
          </button>
        </div>
      )}

      {/* Messages */}
      {errorMsg && (
        <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded text-[11px] text-rose-400 flex items-start gap-1.5 font-mono">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[11px] text-emerald-400 flex items-start gap-1.5 font-mono">
          <Check size={14} className="shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Info warning */}
      <div className="text-[10px] text-zinc-500 leading-relaxed p-2 bg-zinc-950 rounded border border-zinc-900 flex gap-1.5 items-start">
        <HelpCircle size={14} className="shrink-0 mt-0.5 text-zinc-400" />
        <div>
          Any bulk edits made here are instantly buffered and added to the file's dynamic modifications. You can view, inspect, or revert these actions in the <strong>Modified Diffs</strong> sidebar tab or undo with Command/Ctrl+Z.
        </div>
      </div>
    </div>
  );
}
