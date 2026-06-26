/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileTab } from '../types';

const DB_NAME = 'BinaryStudioDB';
const STORE_NAME = 'file_tabs';
const DB_VERSION = 1;

interface SerializedTab {
  id: string;
  name: string;
  size: number;
  type: string;
  fileBuffer: ArrayBuffer;
  originalChecksum: string;
  edits: [number, number][]; // Serialized Map
  history: [number, number][][]; // Serialized history of Maps
  historyIndex: number;
  selectedOffset: number | null;
  structureNodes: any;
  metadata: Record<string, string>;
  isSaved: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Save a FileTab to IndexedDB.
 */
export async function saveTabToDB(tab: FileTab): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Re-use cached fileBuffer if possible to avoid reading large files repeatedly
    const existing: SerializedTab | undefined = await new Promise((resolve) => {
      const getReq = store.get(tab.id);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => resolve(undefined);
    });

    let fileBuffer: ArrayBuffer;
    if (existing && existing.fileBuffer && existing.fileBuffer.byteLength > 0) {
      fileBuffer = existing.fileBuffer;
    } else {
      fileBuffer = await tab.file.arrayBuffer();
    }

    const serialized: SerializedTab = {
      id: tab.id,
      name: tab.name,
      size: tab.size,
      type: tab.type,
      fileBuffer,
      originalChecksum: tab.originalChecksum,
      edits: Array.from(tab.edits.entries()),
      history: tab.history.map((m) => Array.from(m.entries())),
      historyIndex: tab.historyIndex,
      selectedOffset: tab.selectedOffset,
      structureNodes: tab.structureNodes,
      metadata: tab.metadata,
      isSaved: tab.isSaved,
    };

    return new Promise((resolve, reject) => {
      const request = store.put(serialized);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to save tab to IndexedDB:', err);
  }
}

/**
 * Remove a FileTab from IndexedDB.
 */
export async function deleteTabFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to delete tab from IndexedDB:', err);
  }
}

/**
 * Load all saved FileTabs from IndexedDB.
 */
export async function loadTabsFromDB(): Promise<FileTab[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const serializedTabs: SerializedTab[] = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    const loadedTabs: FileTab[] = [];

    for (const item of serializedTabs) {
      // Reconstruct standard browser File object from array buffer
      const reconstructedFile = new File([item.fileBuffer], item.name, { type: item.type });

      const editsMap = new Map<number, number>(item.edits);
      const historyMaps = item.history.map((entries) => new Map<number, number>(entries));

      loadedTabs.push({
        id: item.id,
        name: item.name,
        size: item.size,
        type: item.type,
        file: reconstructedFile,
        originalChecksum: item.originalChecksum,
        edits: editsMap,
        history: historyMaps,
        historyIndex: item.historyIndex,
        selectedOffset: item.selectedOffset,
        structureNodes: item.structureNodes,
        metadata: item.metadata,
        isSaved: item.isSaved,
      });
    }

    return loadedTabs;
  } catch (err) {
    console.error('Failed to load tabs from IndexedDB:', err);
    return [];
  }
}

/**
 * Clear the database.
 */
export async function clearAllTabsFromDB(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to clear IndexedDB store:', err);
  }
}
