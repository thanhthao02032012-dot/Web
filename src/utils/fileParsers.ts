/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StructureNode } from '../types';

/**
 * Safely decodes a slice of an ArrayBuffer to an ASCII string
 */
function decodeASCII(buffer: Uint8Array, start: number, length: number): string {
  let result = '';
  const end = Math.min(start + length, buffer.length);
  for (let i = start; i < end; i++) {
    const charCode = buffer[i];
    // Keep printable ASCII, replace others with dot
    result += (charCode >= 32 && charCode <= 126) ? String.fromCharCode(charCode) : '.';
  }
  return result;
}

/**
 * Safely decodes text with optional encoding prefix (ID3 style)
 */
function decodeID3Text(bytes: Uint8Array, start: number, length: number): string {
  if (length <= 0) return '';
  const encoding = bytes[start];
  const dataStart = start + 1;
  const dataLength = length - 1;

  if (encoding === 0) {
    // ISO-8859-1 (Latin1)
    let str = '';
    for (let i = 0; i < dataLength; i++) {
      const b = bytes[dataStart + i];
      if (b === 0) break;
      str += String.fromCharCode(b);
    }
    return str.trim();
  } else if (encoding === 1 || encoding === 2) {
    // UTF-16 with BOM (1) or without BOM (2)
    try {
      const utf16Bytes = bytes.slice(dataStart, dataStart + dataLength);
      const decoder = new TextDecoder('utf-16');
      return decoder.decode(utf16Bytes).replace(/\0/g, '').trim();
    } catch {
      return decodeASCII(bytes, dataStart, dataLength);
    }
  } else if (encoding === 3) {
    // UTF-8
    try {
      const utf8Bytes = bytes.slice(dataStart, dataStart + dataLength);
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(utf8Bytes).replace(/\0/g, '').trim();
    } catch {
      return decodeASCII(bytes, dataStart, dataLength);
    }
  }

  return decodeASCII(bytes, start, length).trim();
}

/**
 * Read Big-Endian 32-bit integer
 */
function readUint32BE(buffer: Uint8Array, offset: number): number {
  if (offset + 4 > buffer.length) return 0;
  return (
    (buffer[offset] << 24) |
    (buffer[offset + 1] << 16) |
    (buffer[offset + 2] << 8) |
    buffer[offset + 3]
  ) >>> 0;
}

/**
 * Read Little-Endian 16-bit integer
 */
function readUint16LE(buffer: Uint8Array, offset: number): number {
  if (offset + 2 > buffer.length) return 0;
  return (buffer[offset] | (buffer[offset + 1] << 8)) >>> 0;
}

/**
 * Read Little-Endian 32-bit integer
 */
function readUint32LE(buffer: Uint8Array, offset: number): number {
  if (offset + 4 > buffer.length) return 0;
  return (
    buffer[offset] |
    (buffer[offset + 1] << 8) |
    (buffer[offset + 2] << 16) |
    (buffer[offset + 3] << 24)
  ) >>> 0;
}

/**
 * Read Big-Endian 16-bit integer
 */
function readUint16BE(buffer: Uint8Array, offset: number): number {
  if (offset + 2 > buffer.length) return 0;
  return ((buffer[offset] << 8) | buffer[offset + 1]) >>> 0;
}

/**
 * Main parser dispatcher
 */
export async function parseFileStructureAndMetadata(
  file: File
): Promise<{ nodes: StructureNode[]; metadata: Record<string, string> }> {
  const size = file.size;
  const nodes: StructureNode[] = [];
  const metadata: Record<string, string> = {
    'File Name': file.name,
    'File Size': `${(size / 1024).toFixed(2)} KB (${size.toLocaleString()} bytes)`,
    'MIME Type': file.type || 'application/octet-stream',
    'Last Modified': new Date(file.lastModified).toLocaleString()
  };

  if (size === 0) {
    return { nodes, metadata };
  }

  // Read the first 10MB to parse headers and containers
  const headerSize = Math.min(size, 10 * 1024 * 1024);
  const headerBuffer = await file.slice(0, headerSize).arrayBuffer();
  const bytes = new Uint8Array(headerBuffer);

  // Detect signature
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    // PNG
    await parsePNG(bytes, size, nodes, metadata);
  } else if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    // JPEG
    await parseJPEG(bytes, size, nodes, metadata);
  } else if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
    // ZIP
    await parseZIP(bytes, size, nodes, metadata);
  } else if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    // MP3 (ID3v2)
    await parseID3v2(bytes, size, nodes, metadata);
  } else if (
    (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) || // ftyp
    readUint32BE(bytes, 0) === 12 || // QuickTime
    bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00 && (bytes[3] === 0x14 || bytes[3] === 0x18 || bytes[3] === 0x20)
  ) {
    // MP4
    await parseMP4(bytes, size, nodes, metadata);
  } else if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    // PDF (%PDF)
    await parsePDF(bytes, size, nodes, metadata);
  } else {
    // Generic file fallback
    nodes.push({
      name: 'BINARY_DATA',
      offset: 0,
      length: size,
      description: 'Generic binary content blocks'
    });
  }

  return { nodes, metadata };
}

/**
 * PNG Chunk Parser
 */
async function parsePNG(bytes: Uint8Array, size: number, nodes: StructureNode[], metadata: Record<string, string>) {
  metadata['Format'] = 'PNG Image (Portable Network Graphics)';
  
  nodes.push({
    name: 'PNG_SIGNATURE',
    offset: 0,
    length: 8,
    description: 'Valid PNG Signature (89 50 4E 47 0D 0A 1A 0A)'
  });

  let offset = 8;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      break;
    }

    const length = readUint32BE(bytes, offset);
    const type = decodeASCII(bytes, offset + 4, 4);
    const chunkTotalLength = length + 12; // 4 length + 4 type + data + 4 CRC

    let desc = `Length: ${length} bytes`;
    if (type === 'IHDR') {
      const width = readUint32BE(bytes, offset + 8);
      const height = readUint32BE(bytes, offset + 12);
      const bitDepth = bytes[offset + 16];
      const colorType = bytes[offset + 17];
      metadata['Dimensions'] = `${width} x ${height}`;
      metadata['Bit Depth'] = `${bitDepth}-bit`;
      metadata['Color Type'] = getColorTypeDesc(colorType);
      desc += ` (Width: ${width}, Height: ${height}, ${bitDepth}-bit, Color: ${colorType})`;
    } else if (type === 'pHYs') {
      const ppuX = readUint32BE(bytes, offset + 8);
      const ppuY = readUint32BE(bytes, offset + 12);
      const unit = bytes[offset + 16];
      desc += ` (Pixel density: ${ppuX}x${ppuY} per ${unit === 1 ? 'meter' : 'unknown'})`;
    } else if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const keyword = decodeASCII(bytes, offset + 8, Math.min(79, length));
      desc += ` (Text keyword: "${keyword.split('\0')[0]}")`;
    }

    nodes.push({
      name: `${type}_CHUNK`,
      offset,
      length: Math.min(chunkTotalLength, size - offset),
      description: desc
    });

    offset += chunkTotalLength;
    if (type === 'IEND') break;
  }
}

function getColorTypeDesc(colorType: number): string {
  switch (colorType) {
    case 0: return 'Grayscale';
    case 2: return 'RGB Color';
    case 3: return 'Indexed Color (Palette)';
    case 4: return 'Grayscale with Alpha';
    case 6: return 'RGBA Color (Truecolor with Alpha)';
    default: return `Unknown (${colorType})`;
  }
}

/**
 * JPEG Marker Parser
 */
async function parseJPEG(bytes: Uint8Array, size: number, nodes: StructureNode[], metadata: Record<string, string>) {
  metadata['Format'] = 'JPEG Image (Joint Photographic Experts Group)';
  
  nodes.push({
    name: 'SOI',
    offset: 0,
    length: 2,
    description: 'Start of Image marker (FF D8)'
  });

  let offset = 2;
  while (offset < bytes.length) {
    // Find next marker (FF followed by non-zero, non-FF byte)
    if (offset + 1 >= bytes.length) break;
    
    if (bytes[offset] !== 0xFF) {
      offset++;
      continue;
    }

    const markerByte = bytes[offset + 1];
    if (markerByte === 0x00 || markerByte === 0xFF) {
      offset += 2;
      continue;
    }

    const markerName = getJPEGMarkerName(markerByte);
    const markerOffset = offset;

    // Standard markers with a length field
    if (markerByte !== 0xD9 && markerByte !== 0xD8 && (markerByte < 0xD0 || markerByte > 0xD7)) {
      if (offset + 4 > bytes.length) break;
      const length = readUint16BE(bytes, offset + 2);
      const markerTotalLength = length + 2; // 2 for marker + length value

      let desc = `Length: ${length} bytes`;
      if (markerByte === 0xC0 || markerByte === 0xC2) {
        // Start of Frame
        const precision = bytes[offset + 4];
        const height = readUint16BE(bytes, offset + 5);
        const width = readUint16BE(bytes, offset + 7);
        const components = bytes[offset + 9];
        metadata['Dimensions'] = `${width} x ${height}`;
        metadata['Color Channels'] = `${components} channels`;
        metadata['Precision'] = `${precision}-bit`;
        desc += ` (Width: ${width}, Height: ${height}, Precision: ${precision}-bit, Channels: ${components})`;
      } else if (markerByte === 0xE1 && decodeASCII(bytes, offset + 4, 4) === 'Exif') {
        metadata['EXIF Metadata'] = 'Present';
        desc += ' (EXIF header block found)';
      }

      nodes.push({
        name: markerName,
        offset: markerOffset,
        length: Math.min(markerTotalLength, size - markerOffset),
        description: desc
      });

      offset += markerTotalLength;

      // SOS is followed by image entropy coded stream, we can skip or look for next FF marker
      if (markerByte === 0xDA) {
        // Read until next marker or end of file
        let scan = offset;
        while (scan < bytes.length - 1) {
          if (bytes[scan] === 0xFF && bytes[scan + 1] !== 0x00 && (bytes[scan + 1] < 0xD0 || bytes[scan + 1] > 0xD7)) {
            break;
          }
          scan++;
        }
        nodes.push({
          name: 'IMAGE_SCAN_DATA',
          offset,
          length: scan - offset,
          description: 'Entropy-coded image scan stream (compressed raw pixels)'
        });
        offset = scan;
      }
    } else {
      // Standalone marker
      nodes.push({
        name: markerName,
        offset: markerOffset,
        length: 2,
        description: 'Stand-alone marker'
      });
      offset += 2;
      if (markerByte === 0xD9) break; // EOI
    }
  }
}

function getJPEGMarkerName(marker: number): string {
  if (marker >= 0xE0 && marker <= 0xEF) return `APP${marker - 0xE0}`;
  if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) return `SOF${marker - 0xC0}`;
  switch (marker) {
    case 0xC4: return 'DHT'; // Define Huffman Table
    case 0xCC: return 'DAC'; // Define Arithmetic Coding
    case 0xDB: return 'DQT'; // Define Quantization Table
    case 0xDD: return 'DRI'; // Define Restart Interval
    case 0xDA: return 'SOS'; // Start of Scan
    case 0xD8: return 'SOI'; // Start of Image
    case 0xD9: return 'EOI'; // End of Image
    case 0xFE: return 'COM'; // Comment
    default: return `MARKER_FF${marker.toString(16).toUpperCase()}`;
  }
}

/**
 * ZIP File Parser
 */
async function parseZIP(bytes: Uint8Array, size: number, nodes: StructureNode[], metadata: Record<string, string>) {
  metadata['Format'] = 'ZIP Archive';
  
  let offset = 0;
  let fileCount = 0;

  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) break;
    const sig = readUint32LE(bytes, offset);

    if (sig === 0x04034B50) {
      // Local File Header
      if (offset + 30 > bytes.length) break;
      const minVersion = readUint16LE(bytes, offset + 4);
      const compression = readUint16LE(bytes, offset + 8);
      const compSize = readUint32LE(bytes, offset + 18);
      const uncompSize = readUint32LE(bytes, offset + 22);
      const nameLen = readUint16LE(bytes, offset + 26);
      const extraLen = readUint16LE(bytes, offset + 28);
      const fileName = decodeASCII(bytes, offset + 30, nameLen);

      const headerLen = 30 + nameLen + extraLen;
      const totalLen = headerLen + compSize;

      nodes.push({
        name: `LOCAL_FILE_HEADER: ${fileName || `File #${fileCount}`}`,
        offset,
        length: Math.min(totalLen, size - offset),
        description: `Name: ${fileName}, Compressed: ${compSize} B, Uncompressed: ${uncompSize} B, CompMethod: ${getZipCompMethod(compression)}`
      });

      fileCount++;
      offset += totalLen;
    } else if (sig === 0x02014B50) {
      // Central Directory File Header
      if (offset + 46 > bytes.length) break;
      const nameLen = readUint16LE(bytes, offset + 28);
      const extraLen = readUint16LE(bytes, offset + 30);
      const commentLen = readUint16LE(bytes, offset + 32);
      const fileName = decodeASCII(bytes, offset + 46, nameLen);
      
      const totalLen = 46 + nameLen + extraLen + commentLen;

      nodes.push({
        name: `CENTRAL_DIR_ENTRY: ${fileName}`,
        offset,
        length: Math.min(totalLen, size - offset),
        description: `Directory entry index for file: ${fileName}`
      });

      offset += totalLen;
    } else if (sig === 0x06054B50) {
      // End of Central Directory Record
      nodes.push({
        name: 'END_OF_CENTRAL_DIR',
        offset,
        length: Math.min(22, size - offset),
        description: 'End of Central Directory marker (EOCD)'
      });
      break;
    } else {
      // Unknown signature or alignment gap
      offset++;
    }
  }

  metadata['Archived Files'] = fileCount.toString();
}

function getZipCompMethod(method: number): string {
  switch (method) {
    case 0: return 'None (Stored)';
    case 8: return 'DEFLATE';
    case 12: return 'BZIP2';
    case 14: return 'LZMA';
    default: return `Unknown (${method})`;
  }
}

/**
 * MP3 ID3v2 Parser
 */
async function parseID3v2(bytes: Uint8Array, size: number, nodes: StructureNode[], metadata: Record<string, string>) {
  metadata['Format'] = 'MP3 Audio with ID3v2 Tags';
  
  const majorVer = bytes[3];
  const minorVer = bytes[4];
  const flags = bytes[5];
  
  // Synchsafe integer parsing for tag size (4 bytes, each using only 7 bits)
  const sizeByte1 = bytes[6] & 0x7F;
  const sizeByte2 = bytes[7] & 0x7F;
  const sizeByte3 = bytes[8] & 0x7F;
  const sizeByte4 = bytes[9] & 0x7F;
  const tagSize = (sizeByte1 << 21) | (sizeByte2 << 14) | (sizeByte3 << 7) | sizeByte4;
  const tagTotalSize = tagSize + 10; // including 10 byte header

  metadata['ID3 Version'] = `v2.${majorVer}.${minorVer}`;

  nodes.push({
    name: 'ID3_HEADER',
    offset: 0,
    length: 10,
    description: `ID3v2 header. Tag Size: ${tagSize} bytes, Flags: 0x${flags.toString(16)}`
  });

  let offset = 10;
  const tagEnd = Math.min(tagTotalSize, bytes.length);

  while (offset < tagEnd - 10) {
    const frameId = decodeASCII(bytes, offset, 4);
    
    // Check if we hit padding (filled with zeros)
    if (frameId === '....' || bytes[offset] === 0) {
      nodes.push({
        name: 'ID3_PADDING',
        offset,
        length: tagEnd - offset,
        description: 'Padding buffer bytes'
      });
      break;
    }

    const frameSize = readUint32BE(bytes, offset + 4);
    const frameTotalSize = 10 + frameSize; // 10 bytes frame header + payload
    
    let content = '';
    if (frameSize > 0 && offset + 10 + frameSize <= bytes.length) {
      content = decodeID3Text(bytes, offset + 10, frameSize);
    }

    // Capture standard tags in metadata
    if (frameId === 'TIT2') metadata['Title (TIT2)'] = content;
    else if (frameId === 'TPE1') metadata['Artist (TPE1)'] = content;
    else if (frameId === 'TALB') metadata['Album (TALB)'] = content;
    else if (frameId === 'TYER' || frameId === 'TDRC') metadata['Year'] = content;
    else if (frameId === 'COMM') metadata['Comments'] = content;

    nodes.push({
      name: `ID3_FRAME: ${frameId}`,
      offset,
      length: Math.min(frameTotalSize, size - offset),
      description: content ? `"${content}" (${frameSize} bytes)` : `Frame Size: ${frameSize} bytes`
    });

    offset += frameTotalSize;
  }

  // Rest of MP3 is Audio Data
  if (size > tagTotalSize) {
    nodes.push({
      name: 'AUDIO_MPEG_STREAM',
      offset: tagTotalSize,
      length: size - tagTotalSize,
      description: 'MPEG audio stream frames'
    });
  }
}

/**
 * MP4 Box (Atom) Parser
 */
async function parseMP4(bytes: Uint8Array, size: number, nodes: StructureNode[], metadata: Record<string, string>) {
  metadata['Format'] = 'MP4 Media (ISO Base Media File Format)';
  
  let offset = 0;
  
  function parseContainer(containerOffset: number, containerSize: number, parentNode: StructureNode) {
    let scanOffset = containerOffset;
    const endOffset = Math.min(containerOffset + containerSize, bytes.length);
    parentNode.children = [];

    while (scanOffset + 8 <= endOffset) {
      const boxSize = readUint32BE(bytes, scanOffset);
      const boxType = decodeASCII(bytes, scanOffset + 4, 4);
      
      let realSize = boxSize;
      let headerSize = 8;
      
      if (boxSize === 1) {
        // 64-bit large size
        if (scanOffset + 16 > endOffset) break;
        // Read upper and lower 32-bits, treat as high precision
        const high = readUint32BE(bytes, scanOffset + 8);
        const low = readUint32BE(bytes, scanOffset + 12);
        realSize = high * 4294967296 + low;
        headerSize = 16;
      } else if (boxSize === 0) {
        // Runs to end of file
        realSize = size - scanOffset;
      }

      if (realSize <= 0) break;

      let desc = `Size: ${realSize.toLocaleString()} bytes`;
      if (boxType === 'ftyp') {
        const majorBrand = decodeASCII(bytes, scanOffset + 8, 4);
        metadata['Major Brand'] = majorBrand;
        desc += ` (Major brand: ${majorBrand})`;
      }

      const childNode: StructureNode = {
        name: `BOX: ${boxType}`,
        offset: scanOffset,
        length: Math.min(realSize, size - scanOffset),
        description: desc
      };

      // Containers that we recursively explore
      const containerTypes = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta'];
      if (containerTypes.includes(boxType)) {
        parseContainer(scanOffset + headerSize, realSize - headerSize, childNode);
      }

      parentNode.children.push(childNode);
      scanOffset += realSize;
    }
  }

  const rootNode: StructureNode = {
    name: 'MP4_ROOT',
    offset: 0,
    length: size,
    description: 'Root box stream'
  };

  parseContainer(0, bytes.length, rootNode);
  if (rootNode.children) {
    nodes.push(...rootNode.children);
  }
}

/**
 * PDF structural analyzer
 */
async function parsePDF(bytes: Uint8Array, size: number, nodes: StructureNode[], metadata: Record<string, string>) {
  metadata['Format'] = 'PDF (Portable Document Format)';

  // Find PDF Version
  const firstLine = decodeASCII(bytes, 0, 15);
  const versionMatch = firstLine.match(/%PDF-(\d+\.\d+)/);
  if (versionMatch) {
    metadata['PDF Version'] = versionMatch[1];
  }

  nodes.push({
    name: 'PDF_HEADER',
    offset: 0,
    length: Math.min(10, size),
    description: `PDF Magic Header: ${firstLine.split('\n')[0]}`
  });

  // Scan text-based objects (up to 2000 of them in first 10MB)
  const textStr = new TextDecoder('ascii', { fatal: false }).decode(bytes);
  
  // Look for: "3 0 obj"
  const objRegex = /(\d+)\s+(\d+)\s+obj/g;
  let match;
  let count = 0;
  
  while ((match = objRegex.exec(textStr)) !== null && count < 250) {
    const objOffset = match.index;
    const objNum = match[1];
    const genNum = match[2];
    
    // Find matching "endobj"
    const endIdx = textStr.indexOf('endobj', objOffset);
    const length = endIdx !== -1 ? (endIdx + 6) - objOffset : 100;

    nodes.push({
      name: `OBJ: ${objNum} ${genNum}`,
      offset: objOffset,
      length,
      description: `PDF Object ID ${objNum} (Generation ${genNum})`
    });

    count++;
  }

  // Scan for cross reference table "xref" and trailer
  const xrefIdx = textStr.lastIndexOf('xref');
  if (xrefIdx !== -1) {
    const trailerIdx = textStr.indexOf('trailer', xrefIdx);
    const endXref = trailerIdx !== -1 ? trailerIdx : xrefIdx + 200;
    nodes.push({
      name: 'XREF_TABLE',
      offset: xrefIdx,
      length: endXref - xrefIdx,
      description: 'Cross-reference table listing byte offsets for objects'
    });
  }

  const startxrefIdx = textStr.lastIndexOf('startxref');
  if (startxrefIdx !== -1) {
    nodes.push({
      name: 'STARTXREF',
      offset: startxrefIdx,
      length: size - startxrefIdx,
      description: 'Pointer to xref table offset'
    });
  }

  metadata['Parsed Objects'] = count.toString();
}
