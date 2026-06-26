/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StructureNode, FileTab } from '../types';

export interface SemanticAnalysis {
  nodeName: string;
  nodeDesc: string;
  category: 'core' | 'metadata' | 'audio' | 'image' | 'generic';
  categoryLabel: string;
  categoryColor: string;
  categoryBg: string;
  safetyLevel: 'safe' | 'warning' | 'danger';
  safetyLabel: string;
  safetyColor: string;
  safetyBg: string;
  editEffect: string;
  detailedPosition: string;
  isHeaderGuardActive: boolean;
}

/**
 * Recursively find the leaf node containing the target offset
 */
export function findNodeAtOffset(offset: number, nodes: StructureNode[]): StructureNode | null {
  if (!nodes) return null;
  for (const node of nodes) {
    if (offset >= node.offset && offset < node.offset + node.length) {
      if (node.children && node.children.length > 0) {
        const childMatch = findNodeAtOffset(offset, node.children);
        if (childMatch) return childMatch;
      }
      return node;
    }
  }
  return null;
}

/**
 * Perform deep semantic analysis for a given offset in a FileTab
 */
export function analyzeByteSemantics(offset: number | null, tab: FileTab): SemanticAnalysis | null {
  if (offset === null || offset === undefined) return null;

  const node = findNodeAtOffset(offset, tab.structureNodes);
  const nodeName = node ? node.name : 'BINARY_DATA';
  const nodeDesc = node ? node.description : 'Khối dữ liệu thô chưa phân loại';
  const fileExt = tab.name.substring(tab.name.lastIndexOf('.')).toLowerCase();

  let category: SemanticAnalysis['category'] = 'generic';
  let categoryLabel = 'Dữ liệu chung (Generic)';
  let categoryColor = 'text-zinc-400';
  let categoryBg = 'bg-zinc-500/10 border-zinc-500/20';
  
  let safetyLevel: SemanticAnalysis['safetyLevel'] = 'safe';
  let safetyLabel = 'AN TOÀN ĐỂ SỬA';
  let safetyColor = 'text-emerald-400';
  let safetyBg = 'bg-emerald-500/10 border-emerald-500/20';
  
  let editEffect = 'Byte này nằm trong phân vùng dữ liệu chung. Chỉnh sửa nó sẽ làm biến đổi nhẹ giá trị nhị phân, phù hợp cho các thử nghiệm cơ bản.';
  let detailedPosition = `Offset decimal: ${offset} | Hex: 0x${offset.toString(16).toUpperCase()}`;

  const nodeUpper = nodeName.toUpperCase();

  // 1. DETERMINE CATEGORY & SAFETY & EDIT EFFECTS BASED ON NODE NAME & FILE EXTENSION
  if (nodeUpper.includes('SIGNATURE') || nodeUpper === 'SOI' || nodeUpper === 'EOI' || nodeUpper === 'PDF_HEADER' || nodeUpper === 'MP4_ROOT') {
    category = 'core';
    categoryLabel = 'Chữ Ký Nhận Diện Lõi (Signature / Magic Headers)';
    categoryColor = 'text-red-400';
    categoryBg = 'bg-red-500/10 border-red-500/20';

    safetyLevel = 'danger';
    safetyLabel = 'CỰC KỲ NGUY HIỂM 🚨';
    safetyColor = 'text-rose-400';
    safetyBg = 'bg-rose-500/15 border-rose-500/30';

    editEffect = 'Đây là mã định danh cốt lõi giúp hệ điều hành nhận biết định dạng file. Chỉnh sửa byte này chắc chắn sẽ làm tệp bị hỏng hoàn toàn (Corrupted) và không thể mở được bằng bất kỳ trình duyệt hoặc ứng dụng tiêu chuẩn nào!';
  } 
  else if (nodeUpper.includes('IHDR') || nodeUpper.includes('SOF') || nodeUpper.includes('DQT') || nodeUpper.includes('DHT') || nodeUpper.includes('SOS')) {
    category = 'core';
    categoryLabel = 'Thông Số Cấu Hình Ảnh (Image Frame Headers)';
    categoryColor = 'text-amber-400';
    categoryBg = 'bg-amber-500/10 border-amber-500/20';

    safetyLevel = 'danger';
    safetyLabel = 'CỰC KỲ NGUY HIỂM 🚨';
    safetyColor = 'text-rose-400';
    safetyBg = 'bg-rose-500/15 border-rose-500/30';

    if (nodeUpper.includes('IHDR')) {
      editEffect = 'Phân vùng IHDR định nghĩa Chiều rộng, Chiều cao, Độ sâu màu và Phương pháp nén của ảnh PNG. Sửa đổi byte ở đây sẽ khiến kích thước ảnh bị tính toán sai, gây lỗi giải mã cấu trúc ảnh ngay lập tức.';
    } else if (nodeUpper.includes('SOF')) {
      editEffect = 'Vùng Start of Frame của ảnh JPEG chứa độ phân giải và kênh màu. Chỉnh sửa sẽ làm mất đồng bộ dòng quét pixel của ảnh.';
    } else {
      editEffect = 'Bảng lượng tử hóa (Quantization) hoặc bảng Huffman giúp nén ảnh. Chỉnh sửa sẽ làm xáo trộn nghiêm trọng cấu trúc giải mã của ảnh JPEG.';
    }
  }
  else if (nodeUpper.includes('ID3_HEADER') || nodeUpper.includes('LOCAL_FILE_HEADER') || nodeUpper.includes('CENTRAL_DIR_ENTRY') || nodeUpper === 'XREF_TABLE' || nodeUpper === 'STARTXREF') {
    category = 'core';
    categoryLabel = 'Đầu Mục Lục / Bảng Ánh Xạ File (Table of Offsets & File Indexes)';
    categoryColor = 'text-amber-400';
    categoryBg = 'bg-amber-500/10 border-amber-500/20';

    safetyLevel = 'danger';
    safetyLabel = 'CỰC KỲ NGUY HIỂM 🚨';
    safetyColor = 'text-rose-400';
    safetyBg = 'bg-rose-500/15 border-rose-500/30';

    if (nodeUpper.includes('LOCAL_FILE_HEADER')) {
      editEffect = 'Tiêu đề tệp cục bộ ZIP định vị tên tệp, tỷ lệ nén và checksum CRC32. Sửa đổi byte này sẽ làm cho các phần mềm giải nén báo lỗi "Header hỏng" hoặc "Sai lệch CRC".';
    } else if (nodeUpper.includes('XREF_TABLE')) {
      editEffect = 'Bảng tra cứu chéo (Xref) của PDF chứa danh sách địa chỉ byte chính xác của từng đối tượng trang. Chỉ cần lệch 1 byte ở đây, trình đọc PDF sẽ không thể định vị được nội dung trang.';
    } else {
      editEffect = 'Chứa các chỉ mục quan trọng điều hướng cấu trúc tệp tin. Tránh sửa đổi để đảm bảo tệp tin có thể load bình thường.';
    }
  }
  // 2. METADATA & HIDDEN TAGS
  else if (nodeUpper.includes('TEXt') || nodeUpper.includes('ZTXt') || nodeUpper.includes('ITXt') || nodeUpper.includes('EXIF') || nodeUpper.includes('COM') || nodeUpper.includes('ID3_FRAME') || nodeUpper.includes('UDTA')) {
    category = 'metadata';
    categoryLabel = 'Thẻ Metadata Ẩn & Mô Tả (Hidden Text / EXIF tags / Comments)';
    categoryColor = 'text-sky-400';
    categoryBg = 'bg-sky-500/10 border-sky-500/20';

    safetyLevel = 'warning';
    safetyLabel = 'CẦN CHÚ Ý ⚠️';
    safetyColor = 'text-amber-400';
    safetyBg = 'bg-amber-500/15 border-amber-500/30';

    if (nodeUpper.includes('ID3_FRAME')) {
      const frameType = nodeUpper.split(':')[1]?.trim() || '';
      editEffect = `Đây là khung metadata ID3v2 của file âm thanh MP3. Bạn đang đứng ở vị trí lưu trữ thông tin văn bản (${frameType}). Bạn có thể sửa đổi byte này để đổi tên bài hát, bản quyền, ca sĩ trực tiếp mà không hề làm ảnh hưởng tới giai điệu âm thanh!`;
    } else if (nodeUpper.includes('EXIF')) {
      editEffect = 'Dữ liệu EXIF ẩn của ảnh chứa thông tin ngày chụp, dòng máy ảnh (iPhone/Canon) hoặc tọa độ GPS GPS. Sửa đổi ở đây có thể tẩy xóa hoặc sửa thông số kỹ thuật chụp ảnh.';
    } else {
      editEffect = 'Chứa văn bản mô tả ẩn như bản quyền, tác giả hoặc bình luận do phần mềm tạo ảnh nhúng vào. Bạn có thể tự do gõ đè giá trị ASCII hoặc mã Hex để đổi nội dung văn bản ẩn này!';
    }
  }
  // 3. AUDIO STREAM
  else if (nodeUpper.includes('AUDIO_MPEG_STREAM') || nodeUpper.includes('MDAT') || fileExt === '.mp3' || fileExt === '.wav') {
    category = 'audio';
    categoryLabel = 'Dải Tần Số Âm Thanh (Audio Stream Payload)';
    categoryColor = 'text-emerald-400';
    categoryBg = 'bg-emerald-500/10 border-emerald-500/20';

    safetyLevel = 'safe';
    safetyLabel = 'RẤT AN TOÀN 🟢';
    safetyColor = 'text-emerald-400';
    safetyBg = 'bg-emerald-500/15 border-emerald-500/30';

    editEffect = 'Đây là dải sóng dữ liệu âm thanh nén thô (MPEG Audio frames). Chỉnh sửa các byte ở đây vô cùng thú vị: nó sẽ tạo ra những biến đổi âm thanh kỳ ảo như đổi tần số nốt nhạc, tạo tiếng vang méo tiếng kỹ thuật số, tiếng rít robot độc lạ hoặc nhịp beat hỏng (cyberpunk glitches). File nhạc vẫn chạy cực tốt!';
  }
  // 4. IMAGE DATA
  else if (nodeUpper.includes('IDAT') || nodeUpper.includes('IMAGE_SCAN_DATA') || nodeUpper.includes('PLTE') || fileExt === '.png' || fileExt === '.jpg' || fileExt === '.jpeg') {
    category = 'image';
    categoryLabel = 'Dòng Pixel / Màu Sắc Điểm Ảnh (Image Scan & Pixel Streams)';
    categoryColor = 'text-indigo-400';
    categoryBg = 'bg-indigo-500/10 border-indigo-500/20';

    safetyLevel = 'safe';
    safetyLabel = 'RẤT AN TOÀN 🟢';
    safetyColor = 'text-emerald-400';
    safetyBg = 'bg-emerald-500/15 border-emerald-500/30';

    if (nodeUpper.includes('PLTE')) {
      editEffect = 'Bảng màu lập chỉ mục (Color Palette). Sửa đổi byte ở đây sẽ lập tức hoán đổi bảng màu của toàn bộ ảnh, biến sắc đỏ thành sắc xanh hoặc tạo hiệu ứng đổi màu âm bản ma mị cực chất!';
    } else {
      editEffect = 'Đây là phân khu nén dữ liệu pixel ảnh thô. Do dữ liệu được mã hóa nén tuần tự (Deflate/Huffman), việc đổi một vài byte ở đây sẽ tạo ra các đường sọc ngang rực rỡ đầy màu sắc nghệ thuật hoặc dải màu loang lỗ bắt mắt từ tọa độ này trở đi. Vô cùng an toàn để sáng tạo nghệ thuật Glitch Art!';
    }
  }

  // Calculate detailed position context
  if (node) {
    const relativeOffset = offset - node.offset;
    const pct = ((relativeOffset / node.length) * 100).toFixed(1);
    detailedPosition = `Nằm trong khối [${nodeName}] (Kích thước: ${node.length} bytes)\n• Vị trí tương đối trong khối: byte thứ ${relativeOffset} (${pct}%)`;
  }

  // Header size safety checking (For MP3/PNG header protection toggles in preview)
  const isHeaderGuardActive = offset < 1024; // standard protection limit

  return {
    nodeName,
    nodeDesc,
    category,
    categoryLabel,
    categoryColor,
    categoryBg,
    safetyLevel,
    safetyLabel,
    safetyColor,
    safetyBg,
    editEffect,
    detailedPosition,
    isHeaderGuardActive
  };
}
