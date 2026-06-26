/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { FileTab } from '../types';
import { calculateSHA256 } from '../utils/checksum';
import { parseFileStructureAndMetadata } from '../utils/fileParsers';
import {
  Upload,
  Plus,
  X,
  Download,
  AlertTriangle,
  FileCheck,
  Cpu
} from 'lucide-react';

interface TabsHeaderProps {
  tabs: FileTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddTab: (newTab: FileTab) => void;
  onMarkSaved: (id: string) => void;
}

export default function TabsHeader({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onMarkSaved
}: TabsHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);

  // File Upload Handlers
  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const tabId = crypto.randomUUID();

      // Preliminary hash & structural parse
      const { hash, isPartial } = await calculateSHA256(file);
      const parsed = await parseFileStructureAndMetadata(file);

      const newTab: FileTab = {
        id: tabId,
        name: file.name,
        size: file.size,
        type: file.type,
        file: file,
        originalChecksum: isPartial ? `${hash} (partial)` : hash,
        edits: new Map<number, number>(),
        history: [new Map<number, number>()],
        historyIndex: 0,
        selectedOffset: 0,
        structureNodes: parsed.nodes,
        metadata: {
          ...parsed.metadata,
          'Original Hash': hash
        },
        isSaved: true
      };

      onAddTab(newTab);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await handleFiles(e.dataTransfer.files);
  };

  // Export File (Applying Sparse Edits Chunk-By-Chunk)
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleExport = async () => {
    if (!activeTab) return;
    setExporting(true);

    try {
      const chunks: BlobPart[] = [];
      const chunkSize = 10 * 1024 * 1024; // 10MB chunk size
      let offset = 0;

      const editedOffsets = Array.from(activeTab.edits.keys());

      while (offset < activeTab.size) {
        const end = Math.min(offset + chunkSize, activeTab.size);
        
        // Check if there are edits in this chunk range
        const hasEditsInChunk = editedOffsets.some((off) => off >= offset && off < end);

        if (hasEditsInChunk) {
          // Read chunk into memory and apply edits
          const slice = activeTab.file.slice(offset, end);
          const buffer = await slice.arrayBuffer();
          const bytes = new Uint8Array(buffer);

          for (let i = 0; i < bytes.length; i++) {
            const fileOffset = offset + i;
            if (activeTab.edits.has(fileOffset)) {
              bytes[i] = activeTab.edits.get(fileOffset)!;
            }
          }
          chunks.push(bytes);
        } else {
          // Point directly to original file slice (0 RAM copy)
          chunks.push(activeTab.file.slice(offset, end));
        }

        offset += chunkSize;
      }

      // Create blob of compiled data
      const finalBlob = new Blob(chunks, { type: activeTab.type || 'application/octet-stream' });
      
      // Trigger file saver
      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeTab.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onMarkSaved(activeTab.id);
    } catch (err) {
      console.error('Failed to export file:', err);
      alert('Failed to compile and export file.');
    } finally {
      setExporting(false);
    }
  };

  // Detect if any header bytes are edited (first 256 bytes)
  const hasHeaderEdits = activeTab && Array.from(activeTab.edits.keys()).some((off) => off < 256);

  return (
    <div className="flex flex-col gap-3">
      {/* Drag & Drop Upload Overlay / Dashboard */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer flex flex-col items-center justify-center gap-2 select-none
          ${isDragging 
            ? 'border-emerald-500 bg-emerald-500/5 text-emerald-400' 
            : 'border-zinc-800 bg-zinc-950 hover:bg-zinc-900/55 text-zinc-400 hover:border-zinc-700'
          }`}
      >
        <input
          id="file-import-input"
          type="file"
          ref={fileInputRef}
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <div className="p-3 bg-zinc-900 rounded-full border border-zinc-800">
          <Upload size={22} className="text-emerald-500 animate-bounce" />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100">
            Drag & Drop Files Here or Click to Open
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Supports PNG, JPEG, ZIP, MP4, MP3, PDF, WebP and generic binary files up to 10GB+
          </p>
        </div>
      </div>

      {/* Tabs Navigation Rail */}
      {tabs.length > 0 && (
        <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-1.5 flex-wrap">
          {/* Horizontal Tabs List */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar shrink-0 max-w-full">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              const hasUnsaved = tab.edits.size > 0;
              return (
                <div
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  onClick={() => onSelectTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition select-none shrink-0
                    ${isActive 
                      ? 'bg-zinc-900 border-zinc-700 text-zinc-100 shadow-lg' 
                      : 'bg-zinc-950/60 border-transparent text-zinc-500 hover:bg-zinc-900/40 hover:text-zinc-300'
                    }`}
                >
                  <div className="flex items-center gap-1.5">
                    {/* Status dot */}
                    <span 
                      className={`h-1.5 w-1.5 rounded-full 
                        ${hasUnsaved ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} 
                      title={hasUnsaved ? 'Has unsaved modifications' : 'File Saved'}
                    />
                    <span className="truncate max-w-[150px]">{tab.name}</span>
                  </div>

                  {/* Close Tab Button */}
                  <button
                    id={`close-tab-btn-${tab.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="p-0.5 rounded-md hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 transition"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}

            {/* Quick add icon */}
            <button
              id="quick-add-tab-btn"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg border border-dashed border-zinc-800 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition cursor-pointer"
              title="Add File"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Active File Control Panel */}
          {activeTab && (
            <div className="flex items-center gap-2.5">
              {/* Header modification warning */}
              {hasHeaderEdits && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/25 px-2.5 py-1 rounded">
                  <AlertTriangle size={12} className="shrink-0" />
                  <span>File headers edited. Format could corrupt.</span>
                </div>
              )}

              {/* Save/Export button */}
              <button
                id="export-active-file-btn"
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white disabled:text-zinc-500 text-xs px-3.5 py-1.5 rounded-lg font-bold shadow-lg transition cursor-pointer"
              >
                {exporting ? (
                  <Cpu size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                <span>{exporting ? 'Compiling...' : 'Save & Export File'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
