/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { StructureNode } from '../types';
import { FolderTree, ChevronRight, ChevronDown, Compass, CornerDownRight, ShieldCheck, ShieldAlert, AlertTriangle, Filter } from 'lucide-react';

interface FileStructureAnalyzerProps {
  nodes: StructureNode[];
  onSelectOffset: (offset: number) => void;
  selectedOffset: number | null;
}

export function getDangerRating(name: string): {
  level: 'safe' | 'warning' | 'danger';
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
} {
  const upper = name.toUpperCase();
  
  // 1. Critical / Danger
  if (
    upper.includes('SIGNATURE') ||
    upper.includes('IHDR') ||
    upper.includes('PLTE') ||
    upper.includes('IEND') ||
    upper.includes('SOI') ||
    upper.includes('EOI') ||
    upper.includes('SOF') ||
    upper.includes('DQT') ||
    upper.includes('DHT') ||
    upper.includes('SOS') ||
    upper.includes('END_OF_CENTRAL_DIR') ||
    upper.includes('CENTRAL_DIR_ENTRY') ||
    upper.includes('ID3_HEADER') ||
    upper.includes('PDF_HEADER') ||
    upper.includes('XREF_TABLE') ||
    upper.includes('STARTXREF') ||
    upper.includes('FTYP') ||
    upper.includes('MOOV') ||
    upper.includes('TRAK') ||
    upper.includes('MDIA') ||
    upper.includes('MINF') ||
    upper.includes('STBL')
  ) {
    return {
      level: 'danger',
      label: 'NGUY HIỂM 🚨',
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/15',
      borderColor: 'border-rose-500/30',
      description: 'Vùng nòng cốt (Headers/Signature). Sửa ở đây chắc chắn sẽ làm lỗi định dạng tệp, khiến trình phát/ảnh bị hỏng toàn bộ!'
    };
  }

  // 2. Safe / Low Risk
  if (
    upper.includes('IDAT') ||
    upper.includes('IMAGE_SCAN_DATA') ||
    upper.includes('AUDIO_MPEG_STREAM') ||
    upper.includes('PADDING') ||
    upper.includes('MDAT') ||
    upper.includes('BINARY_DATA')
  ) {
    return {
      level: 'safe',
      label: 'AN TOÀN 🟢',
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/15',
      borderColor: 'border-emerald-500/30',
      description: 'Vùng dữ liệu thô (Pixel/Audio payload). Sửa ở đây rất an toàn, giúp tạo ra các hiệu ứng glitch nghệ thuật cực đẹp mà tệp vẫn mở được!'
    };
  }

  // 3. Warning / Medium Risk (Default fallback for metadata chunks, text chunks, local file headers)
  return {
    level: 'warning',
    label: 'CẦN CHÚ Ý ⚠️',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/15',
    borderColor: 'border-amber-500/30',
    description: 'Chứa dữ liệu mô tả tệp (Metadata/Text tags/Sub-headers). Sửa ở đây có thể thay đổi tên bài hát, bản quyền hoặc thông số tệp.'
  };
}

export default function FileStructureAnalyzer({
  nodes,
  onSelectOffset,
  selectedOffset
}: FileStructureAnalyzerProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'safe' | 'danger' | 'warning'>('all');

  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-zinc-500">
        <FolderTree size={36} className="mb-2 text-zinc-600 animate-pulse" />
        <p className="text-xs">Không phân tích được cấu trúc nhị phân của tệp này.</p>
      </div>
    );
  }

  // Calculate File Safety distribution
  let totalBytesAnalyzed = 0;
  let dangerBytes = 0;
  let warningBytes = 0;
  let safeBytes = 0;

  const gatherBytesStats = (nodeList: StructureNode[]) => {
    for (const node of nodeList) {
      const rating = getDangerRating(node.name);
      if (rating.level === 'danger') dangerBytes += node.length;
      else if (rating.level === 'warning') warningBytes += node.length;
      else if (rating.level === 'safe') safeBytes += node.length;
      
      totalBytesAnalyzed += node.length;
      if (node.children) {
        gatherBytesStats(node.children);
      }
    }
  };

  gatherBytesStats(nodes);

  const dangerPct = totalBytesAnalyzed > 0 ? (dangerBytes / totalBytesAnalyzed) * 100 : 0;
  const warningPct = totalBytesAnalyzed > 0 ? (warningBytes / totalBytesAnalyzed) * 100 : 0;
  const safePct = totalBytesAnalyzed > 0 ? (safeBytes / totalBytesAnalyzed) * 100 : 0;

  // Filter root nodes
  const filteredNodes = nodes.filter(node => {
    if (filterMode === 'all') return true;
    const rating = getDangerRating(node.name);
    return rating.level === filterMode;
  });

  return (
    <div className="flex flex-col gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl select-none text-zinc-300">
      
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
        <Compass size={18} className="text-emerald-500" />
        <h3 className="text-sm font-black text-zinc-100 uppercase tracking-wider font-sans">
          Bản Đồ Cấu Trúc File & Vùng Nguy Hiểm
        </h3>
      </div>

      <p className="text-[11px] text-zinc-400 leading-snug">
        Mô hình phân tách cấu trúc nhị phân thành các khối dữ liệu rõ ràng. Hãy chọn khối để nhảy nhanh đến vị trí byte chỉnh sửa.
      </p>

      {/* Visual Safety distribution Bar */}
      <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-850 flex flex-col gap-2">
        <div className="flex justify-between items-center text-[10px] font-mono">
          <span className="text-zinc-500 font-bold uppercase">Biểu đồ phân dải độ an toàn tệp:</span>
          <span className="text-emerald-400 font-bold">{safePct.toFixed(0)}% AN TOÀN ĐỂ SỬA</span>
        </div>

        {/* Triple Segment Progress bar */}
        <div className="h-3.5 bg-zinc-900 rounded-full overflow-hidden flex border border-zinc-850">
          <div 
            style={{ width: `${safePct}%` }} 
            className="bg-emerald-500 hover:opacity-90 transition-all duration-300 relative group cursor-help"
            title={`Vùng an toàn để chỉnh sửa: ${safeBytes.toLocaleString()} bytes (${safePct.toFixed(1)}%)`}
          />
          <div 
            style={{ width: `${warningPct}%` }} 
            className="bg-amber-500 hover:opacity-90 transition-all duration-300 relative group cursor-help"
            title={`Vùng cảnh báo sửa thuộc tính: ${warningBytes.toLocaleString()} bytes (${warningPct.toFixed(1)}%)`}
          />
          <div 
            style={{ width: `${dangerPct}%` }} 
            className="bg-rose-500 hover:opacity-90 transition-all duration-300 relative group cursor-help"
            title={`Vùng nguy hiểm cấm sửa: ${dangerBytes.toLocaleString()} bytes (${dangerPct.toFixed(1)}%)`}
          />
        </div>

        {/* Legend */}
        <div className="flex justify-between items-center text-[9px] font-mono mt-1 pt-1 border-t border-zinc-900">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-emerald-500" />
            <span className="text-zinc-400">An toàn ({safePct.toFixed(0)}%)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-amber-500" />
            <span className="text-zinc-400">Chú ý ({warningPct.toFixed(0)}%)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-rose-500" />
            <span className="text-zinc-400">Nguy hiểm ({dangerPct.toFixed(0)}%)</span>
          </div>
        </div>
      </div>

      {/* Filter Mode Selector */}
      <div className="flex items-center gap-1 text-[10px] bg-zinc-950 p-1 rounded-lg border border-zinc-850 overflow-x-auto custom-scrollbar">
        <div className="text-zinc-500 font-bold uppercase font-mono px-1.5 flex items-center gap-1 shrink-0">
          <Filter size={11} />
          <span>Bộ lọc:</span>
        </div>
        {[
          { id: 'all', label: 'TẤT CẢ KHỐI' },
          { id: 'safe', label: 'AN TOÀN 🟢' },
          { id: 'warning', label: 'CẦN CHÚ Ý ⚠️' },
          { id: 'danger', label: 'NGUY HIỂM 🚨' }
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setFilterMode(item.id as any)}
            className={`px-2.5 py-1 rounded font-bold transition cursor-pointer shrink-0 uppercase text-[9px]
              ${filterMode === item.id 
                ? 'bg-zinc-800 text-zinc-100 shadow' 
                : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Root Node List */}
      <div className="max-h-[280px] overflow-y-auto custom-scrollbar space-y-1 font-mono text-xs pr-1">
        {filteredNodes.length === 0 ? (
          <div className="p-8 text-center text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
            Không tìm thấy khối dữ liệu nào khớp với bộ lọc!
          </div>
        ) : (
          filteredNodes.map((node, index) => (
            <TreeNode
              key={`${node.name}-${index}`}
              node={node}
              onSelect={onSelectOffset}
              selectedOffset={selectedOffset}
              depth={0}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface TreeNodeProps {
  key?: string;
  node: StructureNode;
  onSelect: (offset: number) => void;
  selectedOffset: number | null;
  depth: number;
}

function TreeNode({ node, onSelect, selectedOffset, depth }: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const hasChildren = node.children && node.children.length > 0;
  
  // Is this node currently covering the selected offset?
  const isCurrentlySelected = selectedOffset !== null && 
    selectedOffset >= node.offset && 
    selectedOffset < node.offset + node.length;

  const rating = getDangerRating(node.name);

  return (
    <div className="flex flex-col">
      {/* Node Row */}
      <div
        onClick={() => onSelect(node.offset)}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        className={`flex items-center justify-between gap-2 py-1.5 px-2 rounded-md cursor-pointer transition border
          ${isCurrentlySelected 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'hover:bg-zinc-800/60 text-zinc-300 border-transparent'
          }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation(); // prevent select offset on collapse
                setIsOpen(!isOpen);
              }}
              className="p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-zinc-300"
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <div className="w-5 flex justify-center text-zinc-600">
              <CornerDownRight size={10} />
            </div>
          )}

          {/* Danger Level Visual Indicator Bullet */}
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            rating.level === 'danger' ? 'bg-rose-500 animate-pulse' :
            rating.level === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
          }`} />

          <span className="font-bold text-zinc-100 truncate text-[11px]" title={node.name}>
            {node.name}
          </span>
        </div>

        {/* Offset and size tag & Danger rating badge */}
        <div className="flex items-center gap-2 shrink-0 text-[9px]">
          {/* Danger Badge */}
          <span className={`px-1.5 py-0.2 rounded border text-[8px] font-bold ${rating.bgColor} ${rating.color} ${rating.borderColor}`}>
            {rating.label}
          </span>

          <span className="text-zinc-500 font-mono">
            @0x{node.offset.toString(16).toUpperCase()}
          </span>
          <span className="text-[9px] bg-zinc-950 text-zinc-400 px-1 py-0.2 border border-zinc-800 rounded">
            {node.length >= 1024 
              ? `${(node.length / 1024).toFixed(1)}K` 
              : `${node.length}B`}
          </span>
        </div>
      </div>

      {/* Description tooltip/label & Warning details (underneath if active) */}
      {isCurrentlySelected && (
        <div 
          style={{ marginLeft: `${depth * 12 + 26}px` }}
          className={`text-[10px] mt-1.5 mb-2.5 p-2.5 rounded-lg border flex flex-col gap-1.5 leading-relaxed font-sans
            ${rating.bgColor} ${rating.borderColor} ${rating.color}`}
        >
          <div className="flex items-center gap-1.5 font-bold text-[10px]">
            {rating.level === 'danger' && <ShieldAlert size={12} />}
            {rating.level === 'warning' && <AlertTriangle size={12} />}
            {rating.level === 'safe' && <ShieldCheck size={12} />}
            <span>ĐÁNH GIÁ ĐỘ AN TOÀN: {rating.label}</span>
          </div>

          <p className="text-zinc-200 font-medium">
            {rating.description}
          </p>

          {node.description && (
            <div className="text-[9px] border-t border-zinc-800/60 pt-1.5 text-zinc-400 font-mono italic mt-0.5">
              Chi tiết khối: {node.description}
            </div>
          )}
        </div>
      )}

      {/* Children Nodes */}
      {hasChildren && isOpen && (
        <div className="flex flex-col mt-0.5">
          {node.children!.map((child, idx) => (
            <TreeNode
              key={`${child.name}-${idx}`}
              node={child}
              onSelect={onSelect}
              selectedOffset={selectedOffset}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
