/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FileTab } from '../types';
import { analyzeByteSemantics, findNodeAtOffset } from '../utils/semanticAnalyzer';
import { 
  ShieldAlert, ShieldCheck, AlertTriangle, Compass, 
  HelpCircle, Binary, Flame, Music, Image as ImageIcon, 
  Settings, FileText, Hash, ArrowRight, Shield 
} from 'lucide-react';

interface ByteSemanticInspectorProps {
  tab: FileTab;
}

export default function ByteSemanticInspector({ tab }: ByteSemanticInspectorProps) {
  const offset = tab.selectedOffset;
  const analysis = analyzeByteSemantics(offset, tab);

  if (offset === null || offset === undefined || !analysis) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-950 border border-zinc-900 border-dashed rounded-xl text-center text-zinc-500 h-full min-h-[220px]">
        <Compass size={32} className="mb-2 text-zinc-700 animate-pulse" />
        <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 font-mono">DÒ TÌM NGỮ NGHĨA (SEMANTICS)</p>
        <p className="text-[10px] text-zinc-500 mt-2 max-w-[280px] leading-relaxed">
          Hãy nhấp chọn bất kỳ byte nào trên lưới Hex để quét sâu cấu trúc nhị phân ẩn, chỉ ra chính xác byte đó tác động tới phân đoạn âm thanh hay khu vực đồ họa nào!
        </p>
      </div>
    );
  }

  // Get matching icon based on semantic category
  const getCategoryIcon = () => {
    switch (analysis.category) {
      case 'core':
        return <Settings className="text-rose-400" size={16} />;
      case 'metadata':
        return <FileText className="text-sky-400" size={16} />;
      case 'audio':
        return <Music className="text-emerald-400" size={16} />;
      case 'image':
        return <ImageIcon className="text-indigo-400" size={16} />;
      default:
        return <Binary className="text-zinc-400" size={16} />;
    }
  };

  // Safe visual styling
  const getSafetyIcon = () => {
    switch (analysis.safetyLevel) {
      case 'danger':
        return <ShieldAlert className="text-rose-400 animate-bounce" size={18} />;
      case 'warning':
        return <AlertTriangle className="text-amber-400 animate-pulse" size={18} />;
      default:
        return <ShieldCheck className="text-emerald-400" size={18} />;
    }
  };

  // Generate local region bytes around the selected offset
  // We can show a visual timeline / horizontal map showing which adjacent offsets are safe/unsafe
  const windowSize = 9; // Show 4 bytes before, selected, and 4 bytes after
  const offsetsAround = Array.from({ length: windowSize }).map((_, idx) => {
    const relativeOffset = offset - 4 + idx;
    if (relativeOffset < 0 || relativeOffset >= tab.size) return null;
    return relativeOffset;
  });

  return (
    <div className="flex flex-col gap-3 bg-zinc-950 border border-zinc-900 rounded-xl p-4 shadow-xl select-none text-zinc-300">
      
      {/* Block Title & Indicator */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
        <div className="flex items-center gap-1.5">
          <Compass size={16} className="text-amber-500 animate-pulse" />
          <h4 className="text-[10px] font-black text-zinc-200 uppercase tracking-wider font-mono">
            Radar Quét Bản Đồ Vị Trí Byte
          </h4>
        </div>
        <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.2 rounded font-bold font-mono">
          Live Scanner
        </span>
      </div>

      {/* Hex representation of the selected location */}
      <div className="grid grid-cols-2 gap-3 bg-zinc-900/60 p-3 rounded-lg border border-zinc-850">
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] text-zinc-500 font-mono uppercase tracking-wider">Địa chỉ Byte (Offset)</span>
          <span className="text-sm font-black text-zinc-100 font-mono">
            0x{offset.toString(16).toUpperCase().padStart(4, '0')}
          </span>
          <span className="text-[9px] text-zinc-400 font-mono">Decimal: {offset}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] text-zinc-500 font-mono uppercase tracking-wider">Giá Trị Hiện Tại (Byte)</span>
          <span className="text-sm font-black text-amber-400 font-mono">
            0x{(tab.edits.get(offset) ?? 0).toString(16).toUpperCase().padStart(2, '0')}
          </span>
          <span className="text-[9px] text-zinc-400 font-mono">
            Ký tự ASCII: {((tab.edits.get(offset) ?? 0) >= 32 && (tab.edits.get(offset) ?? 0) <= 126) 
              ? String.fromCharCode(tab.edits.get(offset) ?? 0) 
              : '.'}
          </span>
        </div>
      </div>

      {/* Semantic Zone Classification */}
      <div className={`p-3 rounded-lg border flex flex-col gap-1.5 ${analysis.categoryBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {getCategoryIcon()}
            <span className={`text-[10px] font-bold uppercase tracking-wide ${analysis.categoryColor}`}>
              {analysis.categoryLabel}
            </span>
          </div>
        </div>
        <p className="text-[10px] text-zinc-400 font-medium">
          Khối tệp: <strong className="text-zinc-200">{analysis.nodeName}</strong> {analysis.nodeDesc ? `(${analysis.nodeDesc})` : ''}
        </p>
      </div>

      {/* Risk evaluation */}
      <div className={`p-3 rounded-lg border flex flex-col gap-2 ${analysis.safetyBg}`}>
        <div className="flex items-center gap-2">
          {getSafetyIcon()}
          <span className={`text-[10px] font-black uppercase tracking-wider ${analysis.safetyColor}`}>
            ĐỘ AN TOÀN SỬA: {analysis.safetyLabel}
          </span>
        </div>

        <p className="text-[11px] leading-relaxed text-zinc-200 font-medium font-sans">
          {analysis.editEffect}
        </p>
      </div>

      {/* Visual Safety Segment Map of Adjacent Bytes */}
      <div className="bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-900 flex flex-col gap-2">
        <div className="flex justify-between items-center text-[9px] font-mono">
          <span className="text-zinc-500 font-bold uppercase">Bản đồ an toàn lân cận (±4 Bytes):</span>
          <span className="text-zinc-400">Selected: {offset}</span>
        </div>

        {/* Horizontal cells representing adjacent bytes and their safety color */}
        <div className="grid grid-cols-9 gap-1 text-[9px] font-mono">
          {offsetsAround.map((adjOffset, idx) => {
            if (adjOffset === null) {
              return (
                <div key={`adj-null-${idx}`} className="bg-zinc-950/20 border border-zinc-900/40 py-2 text-center text-zinc-700 rounded select-none">
                  -
                </div>
              );
            }

            const adjAnalysis = analyzeByteSemantics(adjOffset, tab);
            const isSelected = adjOffset === offset;
            
            let colorCell = 'bg-zinc-900 border-zinc-800 text-zinc-600';
            if (adjAnalysis) {
              if (adjAnalysis.safetyLevel === 'danger') {
                colorCell = isSelected 
                  ? 'bg-rose-500 text-rose-100 border-rose-400 animate-pulse font-black' 
                  : 'bg-rose-950/40 border-rose-900 text-rose-400';
              } else if (adjAnalysis.safetyLevel === 'warning') {
                colorCell = isSelected 
                  ? 'bg-amber-500 text-amber-950 border-amber-300 font-black' 
                  : 'bg-amber-950/30 border-amber-900/60 text-amber-400';
              } else {
                colorCell = isSelected 
                  ? 'bg-emerald-500 text-emerald-950 border-emerald-300 font-black' 
                  : 'bg-emerald-950/30 border-emerald-900/60 text-emerald-400';
              }
            }

            return (
              <div 
                key={`adj-offset-${adjOffset}`}
                className={`flex flex-col items-center justify-center py-1 rounded border transition-all cursor-pointer ${colorCell}`}
                onClick={() => {
                  tab.selectedOffset = adjOffset;
                  // Trigger state refresh in parent by updating offset
                  const customEvent = new CustomEvent('select-offset', { detail: adjOffset });
                  window.dispatchEvent(customEvent);
                }}
                title={`Offset: ${adjOffset} (${adjAnalysis?.safetyLabel || 'Unknown'})`}
              >
                <span className="text-[7px] text-zinc-500">+{adjOffset - offset}</span>
                <span className="text-[9px] font-mono tracking-tighter">
                  {adjOffset.toString(16).toUpperCase().slice(-2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Location Details (Relative) */}
      <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-900 text-[9px] font-mono text-zinc-500 leading-normal">
        <div className="flex items-start gap-1.5">
          <ArrowRight size={10} className="text-zinc-600 shrink-0 mt-0.5" />
          <p className="whitespace-pre-line text-zinc-400">{analysis.detailedPosition}</p>
        </div>
      </div>

    </div>
  );
}
