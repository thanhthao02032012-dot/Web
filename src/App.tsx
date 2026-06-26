/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { FileTab } from './types';
import TabsHeader from './components/TabsHeader';
import HexViewport from './components/HexViewport';
import DataInspector from './components/DataInspector';
import FileStructureAnalyzer from './components/FileStructureAnalyzer';
import PreviewPanel from './components/PreviewPanel';
import StatsPanel from './components/StatsPanel';
import SearchAndReplace from './components/SearchAndReplace';
import DiffViewer from './components/DiffViewer';
import BulkEditor from './components/BulkEditor';
import BitEditor from './components/BitEditor';
import HexValueEditor from './components/HexValueEditor';
import ByteSemanticInspector from './components/ByteSemanticInspector';
import { loadTabsFromDB, saveTabToDB, deleteTabFromDB } from './utils/indexedDB';
import { calculateSHA256 } from './utils/checksum';
import { parseFileStructureAndMetadata } from './utils/fileParsers';
import {
  Binary,
  Undo2,
  Redo2,
  Cpu,
  CornerDownRight,
  Sparkles,
  RefreshCw,
  FolderOpen,
  Info,
  User,
  LogOut,
  Check,
  Loader2,
  Mail
} from 'lucide-react';

export default function App() {
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'bit_editor' | 'hex_editor' | 'inspector' | 'search' | 'structure' | 'preview' | 'stats' | 'diff' | 'bulk'>('bit_editor');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Authentication & Guest States
  const [user, setUser] = useState<{ email: string; username: string; isGoogleUser: boolean; profilePic?: string } | null>({
    email: 'guest@binary.studio',
    username: 'Guest Analyst',
    isGoogleUser: false,
    profilePic: 'https://api.dicebear.com/7.x/bottts/svg?seed=Guest'
  });
  const [token, setToken] = useState<string | null>(null);

  // IndexedDB restoration & sync states
  const [dbLoading, setDbLoading] = useState(true);

  // Load saved tabs from IndexedDB on startup
  useEffect(() => {
    const restoreTabs = async () => {
      try {
        const savedToken = localStorage.getItem('auth_token');
        if (savedToken) {
          setToken(savedToken);
          // Try to verify if we have a valid session
          const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${savedToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.user) {
              setUser(data.user);
            }
          }
        }

        const savedTabs = await loadTabsFromDB();
        if (savedTabs.length > 0) {
          setTabs(savedTabs);
          const savedActiveId = localStorage.getItem('active_tab_id');
          if (savedActiveId && savedTabs.some((t) => t.id === savedActiveId)) {
            setActiveTabId(savedActiveId);
          } else {
            setActiveTabId(savedTabs[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to restore tabs from IndexedDB:', err);
      } finally {
        setDbLoading(false);
      }
    };
    restoreTabs();
  }, []);

  // Persist activeTabId to localStorage on change
  useEffect(() => {
    if (activeTabId) {
      localStorage.setItem('active_tab_id', activeTabId);
    } else {
      localStorage.removeItem('active_tab_id');
    }
  }, [activeTabId]);

  const [bulkPreFill, setBulkPreFill] = useState<{ startOffset: number; length: number } | null>(null);

  // Listen to select-offset event for ByteSemanticInspector synchronization
  useEffect(() => {
    const handleSelectOffsetEvent = (e: Event) => {
      const customEvent = e as CustomEvent<number>;
      onSelectOffset(customEvent.detail);
    };
    window.addEventListener('select-offset', handleSelectOffsetEvent);
    return () => {
      window.removeEventListener('select-offset', handleSelectOffsetEvent);
    };
  }, [activeTabId]);

  // Listen to open-bulk-editor event
  useEffect(() => {
    const handleOpenBulkEditor = (e: Event) => {
      const customEvent = e as CustomEvent<{ offset: number; length: number }>;
      setBulkPreFill({ startOffset: customEvent.detail.offset, length: customEvent.detail.length });
      setSidebarTab('bulk');
    };
    window.addEventListener('open-bulk-editor', handleOpenBulkEditor);
    return () => {
      window.removeEventListener('open-bulk-editor', handleOpenBulkEditor);
    };
  }, []);

  // Debounced safe tab sync to IndexedDB (prevents lag and startup race-condition deletions)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (dbLoading) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        for (const tab of tabs) {
          await saveTabToDB(tab);
        }
      } catch (err) {
        console.error('Failed to sync tabs with IndexedDB:', err);
      }
    }, 300);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [tabs, dbLoading]);

  const handleWelcomeFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const tabId = crypto.randomUUID();

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

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);
    }
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Load a valid sample PNG file on click so user has instant playable content
  const loadSampleFile = async () => {
    // Valid 65-byte PNG with custom text comment chunk
    const sampleBytes = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG Signature
      0x00, 0x00, 0x00, 0x0D, // IHDR Length
      0x49, 0x48, 0x44, 0x52, // IHDR Type
      0x00, 0x00, 0x00, 0x08, // Width 8
      0x00, 0x00, 0x00, 0x08, // Height 8
      0x08, 0x02, 0x00, 0x00, 0x00, // 8-bit, RGB, compression, filter, interlace
      0xC0, 0x93, 0xAE, 0xD4, // IHDR CRC
      0x00, 0x00, 0x00, 0x0E, // tEXt Length
      0x74, 0x45, 0x58, 0x74, // tEXt Type
      0x43, 0x6F, 0x6D, 0x6D, 0x65, 0x6E, 0x74, 0x00, // Comment key
      0x42, 0x69, 0x6E, 0x61, 0x72, 0x79, // "Binary" value
      0x2F, 0x48, 0xEF, 0xFA, // tEXt CRC
      0x00, 0x00, 0x00, 0x00, // IEND Length
      0x49, 0x45, 0x4E, 0x44, // IEND Type
      0xAE, 0x42, 0x60, 0x82  // IEND CRC
    ]);

    const sampleFile = new File([sampleBytes], 'sample_binary.png', { type: 'image/png' });
    const tabId = crypto.randomUUID();

    const { hash } = await calculateSHA256(sampleFile);
    const parsed = await parseFileStructureAndMetadata(sampleFile);

    const newTab: FileTab = {
      id: tabId,
      name: sampleFile.name,
      size: sampleFile.size,
      type: sampleFile.type,
      file: sampleFile,
      originalChecksum: hash,
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

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
  };

  // State mutation wrappers to coordinate undo/redo histories
  const onEditByte = (offset: number, value: number) => {
    if (!activeTabId) return;

    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabId) return tab;

        const updatedEdits = new Map(tab.edits);
        
        // If value matches original file byte, we can prune it, otherwise store it
        updatedEdits.set(offset, value);

        // History management
        const nextHistory = tab.history.slice(0, tab.historyIndex + 1);
        nextHistory.push(updatedEdits);
        const nextIndex = nextHistory.length - 1;

        return {
          ...tab,
          edits: updatedEdits,
          history: nextHistory,
          historyIndex: nextIndex,
          isSaved: false
        };
      })
    );
  };

  const onEditMultipleBytes = (editsToApply: Map<number, number>) => {
    if (!activeTabId) return;

    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabId) return tab;

        const updatedEdits = new Map(tab.edits);
        for (const [offset, value] of editsToApply.entries()) {
          updatedEdits.set(offset, value);
        }

        const nextHistory = tab.history.slice(0, tab.historyIndex + 1);
        nextHistory.push(updatedEdits);
        const nextIndex = nextHistory.length - 1;

        return {
          ...tab,
          edits: updatedEdits,
          history: nextHistory,
          historyIndex: nextIndex,
          isSaved: false
        };
      })
    );
  };

  const onUndo = () => {
    if (!activeTab || activeTab.historyIndex <= 0) return;

    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabId) return tab;

        const prevIndex = tab.historyIndex - 1;
        const prevEdits = tab.history[prevIndex];

        return {
          ...tab,
          edits: prevEdits,
          historyIndex: prevIndex,
          isSaved: prevIndex === 0
        };
      })
    );
  };

  const onRedo = () => {
    if (!activeTab || activeTab.historyIndex >= activeTab.history.length - 1) return;

    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabId) return tab;

        const nextIndex = tab.historyIndex + 1;
        const nextEdits = tab.history[nextIndex];

        return {
          ...tab,
          edits: nextEdits,
          historyIndex: nextIndex,
          isSaved: false
        };
      })
    );
  };

  const onClearEdits = () => {
    if (!activeTabId) return;

    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabId) return tab;

        const emptyEdits = new Map<number, number>();
        const nextHistory = tab.history.slice(0, tab.historyIndex + 1);
        nextHistory.push(emptyEdits);
        const nextIndex = nextHistory.length - 1;

        return {
          ...tab,
          edits: emptyEdits,
          history: nextHistory,
          historyIndex: nextIndex,
          isSaved: true
        };
      })
    );
  };

  const onSelectOffset = (offset: number) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        return {
          ...tab,
          selectedOffset: offset
        };
      })
    );
  };

  const onMarkSaved = (tabId: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          isSaved: true
        };
      })
    );
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleShortcuts = (e: KeyboardEvent) => {
      // Don't trigger shortcuts inside text inputs
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo();
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => {
      window.removeEventListener('keydown', handleShortcuts);
    };
  }, [activeTab]);

  return (
    <div id="binary-studio-workspace" className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-zinc-950">
      
      {/* Header Bar */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
            <Binary size={22} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-100 uppercase tracking-widest font-sans flex items-center gap-1.5">
              Binary Studio
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 border border-zinc-700 rounded font-mono font-normal tracking-normal lowercase">v1.0.0</span>
            </h1>
            <p className="text-[10px] text-zinc-500 font-mono">0x00 // CLIENT-SIDE LOW LEVEL COMPILER</p>
          </div>
        </div>

        {/* Action Controls & Authentication Profile */}
        <div className="flex items-center gap-4">
          {/* Global Undo/Redo & Utility states */}
          {activeTab && (
            <div className="flex items-center gap-1 bg-zinc-950 p-1 border border-zinc-800 rounded-lg">
              <button
                id="global-undo-btn"
                disabled={activeTab.historyIndex <= 0}
                onClick={onUndo}
                className="p-1.5 rounded hover:bg-zinc-900 text-zinc-400 hover:text-zinc-100 disabled:opacity-20 transition cursor-pointer"
                title="Undo Edit (Ctrl+Z)"
              >
                <Undo2 size={16} />
              </button>
              <button
                id="global-redo-btn"
                disabled={activeTab.historyIndex >= activeTab.history.length - 1}
                onClick={onRedo}
                className="p-1.5 rounded hover:bg-zinc-900 text-zinc-400 hover:text-zinc-100 disabled:opacity-20 transition cursor-pointer"
                title="Redo Edit (Ctrl+Y)"
              >
                <Redo2 size={16} />
              </button>
            </div>
          )}

        </div>
      </header>

      {/* Main Workspace Frame */}
      <main className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full gap-6">
        
        {/* Document header uploads & tabs bar */}
        <TabsHeader
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTabId}
          onCloseTab={async (id) => {
            const index = tabs.findIndex((t) => t.id === id);
            const remaining = tabs.filter((t) => t.id !== id);
            setTabs(remaining);
            await deleteTabFromDB(id);
            if (activeTabId === id) {
              if (remaining.length > 0) {
                setActiveTabId(remaining[Math.max(0, index - 1)].id);
              } else {
                setActiveTabId(null);
              }
            }
          }}
          onAddTab={async (tab) => {
            setTabs((prev) => [...prev, tab]);
            setActiveTabId(tab.id);
            await saveTabToDB(tab);
          }}
          onMarkSaved={onMarkSaved}
        />

        {/* Split View Content Grid */}
        {activeTab ? (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* Hex Viewer Grid Column */}
            <div className="lg:col-span-7 flex flex-col h-full min-h-[500px]">
              <HexViewport
                tab={activeTab}
                onSelectOffset={onSelectOffset}
                onEditByte={onEditByte}
              />
            </div>

            {/* Interactive Analysis Panel Column */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              
              {/* Sidebar Tabs Selectors */}
              <div className="flex border border-zinc-800 p-1 bg-zinc-950 rounded-xl text-xs font-semibold gap-1 overflow-x-auto custom-scrollbar select-none">
                {([
                  { id: 'bit_editor', label: '👾 Sửa Bit 01' },
                  { id: 'hex_editor', label: '📝 Sửa Hex/Dec' },
                  { id: 'inspector', label: '🔍 Cột Song Song' },
                  { id: 'search', label: '🔎 Tìm & Thay Thế' },
                  { id: 'bulk', label: '⚡ Sửa Hàng Loạt' },
                  { id: 'structure', label: '🗺️ Bản Đồ File' },
                  { id: 'preview', label: '📱 Xem Thử' },
                  { id: 'stats', label: '📊 Phân Tích' },
                  { id: 'diff', label: '🔄 Lịch Sử Sửa' }
                ] as const).map((tabItem) => (
                  <button
                    key={tabItem.id}
                    id={`sidebar-tab-${tabItem.id}`}
                    onClick={() => setSidebarTab(tabItem.id)}
                    className={`px-3 py-2 rounded-lg transition shrink-0 cursor-pointer
                      ${sidebarTab === tabItem.id 
                        ? 'bg-zinc-800 text-zinc-100 shadow' 
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30'}`}
                  >
                    {tabItem.label}
                  </button>
                ))}
              </div>

              {/* Tab views switcher content container */}
              <div className="flex-1 min-h-[420px]">
                {sidebarTab === 'bit_editor' && (
                  <div className="space-y-4">
                    <BitEditor
                      tab={activeTab}
                      onEditByte={onEditByte}
                    />
                    <ByteSemanticInspector tab={activeTab} />
                  </div>
                )}

                {sidebarTab === 'hex_editor' && (
                  <div className="space-y-4">
                    <HexValueEditor
                      tab={activeTab}
                      onEditByte={onEditByte}
                    />
                    <ByteSemanticInspector tab={activeTab} />
                  </div>
                )}

                {sidebarTab === 'inspector' && (
                  <div className="space-y-4">
                    <DataInspector
                      tab={activeTab}
                      onEditByte={onEditByte}
                      onEditMultipleBytes={onEditMultipleBytes}
                    />

                    {/* Simple Exif / File metadata list inside Inspector */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 select-none">
                      <div className="flex items-center gap-1.5 pb-2.5 border-b border-zinc-800 mb-2.5 text-xs text-zinc-400 font-bold">
                        <Info size={14} className="text-emerald-500" />
                        <span>FILE METADATA & HEADERS</span>
                      </div>
                      <div className="max-h-[140px] overflow-y-auto custom-scrollbar space-y-1.5 font-mono text-[11px] text-zinc-400">
                        {Object.entries(activeTab.metadata).map(([key, value]) => (
                          <div key={key} className="flex justify-between hover:bg-zinc-950/40 p-1 rounded">
                            <span className="text-zinc-500 font-medium">{key}</span>
                            <span className="text-zinc-100 text-right truncate max-w-[200px]" title={value}>
                              {value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {sidebarTab === 'search' && (
                  <SearchAndReplace
                    tab={activeTab}
                    onSelectOffset={onSelectOffset}
                    onEditMultipleBytes={onEditMultipleBytes}
                  />
                )}

                {sidebarTab === 'bulk' && (
                  <BulkEditor
                    tab={activeTab}
                    onEditMultipleBytes={onEditMultipleBytes}
                    preFill={bulkPreFill}
                  />
                )}

                {sidebarTab === 'structure' && (
                  <FileStructureAnalyzer
                    nodes={activeTab.structureNodes}
                    onSelectOffset={onSelectOffset}
                    selectedOffset={activeTab.selectedOffset}
                  />
                )}

                {sidebarTab === 'preview' && (
                  <PreviewPanel 
                    tab={activeTab} 
                    onEditByte={onEditByte}
                    onEditMultipleBytes={onEditMultipleBytes}
                    onSelectOffset={onSelectOffset}
                    onClearEdits={onClearEdits}
                  />
                )}

                {sidebarTab === 'stats' && (
                  <StatsPanel tab={activeTab} />
                )}

                {sidebarTab === 'diff' && (
                  <DiffViewer
                    tab={activeTab}
                    onSelectOffset={onSelectOffset}
                    onClearEdits={onClearEdits}
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Empty Workspace Welcome Screen */
          <div className="flex-1 flex flex-col items-center justify-center border border-zinc-800 bg-zinc-950 rounded-2xl p-12 text-center shadow-2xl relative overflow-hidden min-h-[450px]">
            {/* Ambient background decoration */}
            <div className="absolute top-0 left-0 right-0 h-44 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center max-w-md">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 mb-5 animate-bounce shadow-lg shadow-emerald-500/5">
                <Binary size={44} />
              </div>

              <h2 className="text-xl font-black text-zinc-100 font-sans uppercase tracking-wider">
                Low-Level Hex & Bit Editor
              </h2>
              
              <p className="text-xs text-zinc-400 mt-2.5 leading-relaxed">
                Analyze and repair file systems down to the bit-level. Upload raw binary formats or execute deep data diagnostics on images, media, and folders locally in your browser.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full">
                <button
                  id="welcome-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-zinc-100 text-xs py-3 px-4 rounded-xl border border-zinc-850 hover:border-zinc-700 font-semibold transition shadow flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FolderOpen size={14} className="text-zinc-400" />
                  Upload Local File
                </button>
                <button
                  id="welcome-sample-btn"
                  onClick={loadSampleFile}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs py-3 px-4 rounded-xl font-bold shadow-lg shadow-emerald-500/10 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles size={14} />
                  Load Sample PNG
                </button>
              </div>

              {/* Feature Points list */}
              <div className="mt-10 pt-8 border-t border-zinc-900 w-full text-left grid grid-cols-2 gap-x-6 gap-y-3 text-[10px] text-zinc-500 font-mono">
                <div className="flex items-center gap-1.5">
                  <CornerDownRight size={10} className="text-emerald-500" />
                  <span>Real-time EXIF & ID3</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CornerDownRight size={10} className="text-emerald-500" />
                  <span>Interactive Bit switch</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CornerDownRight size={10} className="text-emerald-500" />
                  <span>Structure map expansion</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CornerDownRight size={10} className="text-emerald-500" />
                  <span>Up to 10GB performance</span>
                </div>
              </div>
            </div>
            <input
              id="welcome-file-input"
              type="file"
              ref={fileInputRef}
              multiple
              onChange={(e) => handleWelcomeFiles(e.target.files)}
              className="hidden"
            />
          </div>
        )}

        {/* No active tabs content */}
      </main>
    </div>
  );
}
