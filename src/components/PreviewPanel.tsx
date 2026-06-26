/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { FileTab } from '../types';
import { 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Music as MusicIcon, 
  FileText, 
  AlertTriangle, 
  Play, 
  Pause, 
  Volume2, 
  Activity, 
  Grid, 
  RefreshCw,
  Eye,
  Info,
  Sliders,
  Sparkles,
  Download,
  Smartphone,
  Zap,
  RotateCcw,
  Shield
} from 'lucide-react';

interface PreviewPanelProps {
  tab: FileTab;
  onEditByte?: (offset: number, value: number) => void;
  onEditMultipleBytes?: (editsToApply: Map<number, number>) => void;
  onSelectOffset?: (offset: number) => void;
  onClearEdits?: () => void;
}

// Custom Magic Bytes detector to identify file format and give context
const getFileSignatureInfo = (bytes: Uint8Array): { format: string; description: string; headerSize: number; isAudio: boolean; isImage: boolean } => {
  if (bytes.length >= 4) {
    const hex = Array.from(bytes.slice(0, 4)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    
    // PNG: 89 50 4E 47
    if (hex.startsWith('89 50 4E 47')) {
      return { 
        format: 'PNG Image', 
        description: 'Ảnh nén không mất chi tiết. Header chứa chunk IHDR mô tả kích thước và độ sâu màu. Rất nhạy cảm với CRC checksum.', 
        headerSize: 33,
        isAudio: false,
        isImage: true
      };
    }
    // JPEG: FF D8 FF
    if (hex.startsWith('FF D8 FF')) {
      return { 
        format: 'JPEG Image', 
        description: 'Ảnh nén tổn hao. Header chứa bảng Huffman/DQT. Đổi một byte trong header có thể dịch chuyển toàn bộ dòng ảnh.', 
        headerSize: 24,
        isAudio: false,
        isImage: true
      };
    }
    // GIF: 47 49 46 38 (GIF8)
    if (hex.startsWith('47 49 46 38')) {
      return { 
        format: 'GIF Image', 
        description: 'Ảnh động 8-bit. Chứa bảng màu toàn cục và các mô tả khối đồ họa riêng lẻ.', 
        headerSize: 13,
        isAudio: false,
        isImage: true
      };
    }
    // WAV: RIFF (52 49 46 46) ... WAVE (57 41 56 45)
    if (hex.startsWith('52 49 46 46')) {
      return { 
        format: 'WAV Audio', 
        description: 'Âm thanh PCM thô không nén. Sửa đổi byte ở đây thay đổi trực tiếp biên độ sóng âm, tạo tiếng vang hoặc rè đặc trưng.', 
        headerSize: 44,
        isAudio: true,
        isImage: false
      };
    }
    // MP3: ID3 (49 44 33) or Frame Sync (FF FB / FF F3)
    if (hex.startsWith('49 44 33') || hex.startsWith('FF FB') || hex.startsWith('FF F3') || hex.startsWith('FF F2')) {
      return { 
        format: 'MP3 Audio', 
        description: 'Âm thanh nén MPEG. Việc phá vỡ đồng bộ khung (Frame Sync) tạo ra hiện tượng nhảy giây, lặp tiếng hoặc nhiễu âm rít.', 
        headerSize: 10,
        isAudio: true,
        isImage: false
      };
    }
    // PDF: %PDF (25 50 44 46)
    if (hex.startsWith('25 50 44 46')) {
      return { 
        format: 'PDF Document', 
        description: 'Tài liệu PDF. Việc sửa byte cấu trúc bảng xref có thể làm hỏng định dạng trang tài liệu.', 
        headerSize: 15,
        isAudio: false,
        isImage: false
      };
    }
  }
  return { 
    format: 'Nhị phân Chung', 
    description: 'Tệp tin dữ liệu không có chữ ký quen thuộc hoặc tệp nhị phân thô. Thích hợp để dịch sang dải sóng âm tự do.', 
    headerSize: 64,
    isAudio: false,
    isImage: false
  };
};

export default function PreviewPanel({ 
  tab, 
  onEditByte, 
  onEditMultipleBytes, 
  onSelectOffset,
  onClearEdits
}: PreviewPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [compiling, setCompiling] = useState<boolean>(false);
  
  // Custom states for unified resilient preview
  const [mode, setMode] = useState<'standard' | 'glitch'>('standard');
  const [sampleRate, setSampleRate] = useState<number>(11025);
  const [volume, setVolume] = useState<number>(0.15);
  const [rawAudioLoop, setRawAudioLoop] = useState<'all' | 'selection'>('all');
  
  // Audio playback statuses
  const [audioState, setAudioState] = useState<'idle' | 'decoding' | 'playing_decoded' | 'playing_raw_pcm' | 'error'>('idle');
  const [audioFeedback, setAudioFeedback] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);

  // Raw image canvas config
  const [stride, setStride] = useState<number>(64);
  const [visualMode, setVisualMode] = useState<'grayscale' | 'rgb' | 'bits'>('grayscale');
  const [visualZoom, setVisualZoom] = useState<number>(2.5);

  // Mobile pocket controls & easy-editor states
  const [selectedByteValue, setSelectedByteValue] = useState<number>(0);
  const [safeHeaderGuard, setSafeHeaderGuard] = useState<boolean>(true);
  const [glitchIntensity, setGlitchIntensity] = useState<number>(0.03);
  
  // Real-time animation simulator (FPS)
  const [glitchAnimationActive, setGlitchAnimationActive] = useState<boolean>(false);
  const [glitchFPS, setGlitchFPS] = useState<number>(12);
  const [animFrameIndex, setAnimFrameIndex] = useState<number>(0);

  // Load the current byte value dynamically when offset or edits change
  useEffect(() => {
    let active = true;
    const fetchByte = async () => {
      if (tab.selectedOffset === null || tab.selectedOffset === undefined) return;
      if (tab.selectedOffset >= tab.size) return;
      
      // If already edited, read from sparse map
      if (tab.edits.has(tab.selectedOffset)) {
        if (active) setSelectedByteValue(tab.edits.get(tab.selectedOffset)!);
        return;
      }
      
      try {
        const slice = tab.file.slice(tab.selectedOffset, tab.selectedOffset + 1);
        const buffer = await slice.arrayBuffer();
        if (buffer.byteLength > 0) {
          const u8 = new Uint8Array(buffer);
          if (active) setSelectedByteValue(u8[0]);
        }
      } catch (err) {
        console.error('Error fetching byte for mobile panel:', err);
      }
    };
    fetchByte();
    return () => {
      active = false;
    };
  }, [tab.selectedOffset, tab.file, tab.edits, tab.size]);

  // Tick the animation index at the specified glitched FPS rate
  useEffect(() => {
    if (!glitchAnimationActive) return;
    const intervalTime = 1000 / glitchFPS;
    const timer = setInterval(() => {
      setAnimFrameIndex(prev => (prev + 1) % 360);
    }, intervalTime);
    return () => clearInterval(timer);
  }, [glitchAnimationActive, glitchFPS]);

  // Media load error fallback states
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [videoLoadError, setVideoLoadError] = useState<boolean>(false);
  const [pdfLoadError, setPdfLoadError] = useState<boolean>(false);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // File metadata properties
  const isImage = tab.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|ico)$/i.test(tab.name);
  const isVideo = tab.type.startsWith('video/') || /\.(mp4|webm|ogg)$/i.test(tab.name);
  const isAudio = tab.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(tab.name);
  const isPDF = tab.type === 'application/pdf' || tab.name.endsWith('.pdf');

  // Detect header edits & calculate statistics
  const [stats, setStats] = useState({
    fileFormat: 'Đang quét...',
    formatDescription: '',
    totalEdits: 0,
    headerEdits: 0,
    headerSize: 64,
    glitchScore: 0, // percentage of file altered
    headerCorrupted: false,
  });

  // Calculate stats on every tab edit change
  useEffect(() => {
    const readStats = async () => {
      try {
        const readLen = Math.min(tab.size, 64);
        const slice = tab.file.slice(0, readLen);
        const buffer = await slice.arrayBuffer();
        const headerBytes = new Uint8Array(buffer);
        
        // Apply current edits to header sample
        for (let i = 0; i < headerBytes.length; i++) {
          if (tab.edits.has(i)) {
            headerBytes[i] = tab.edits.get(i)!;
          }
        }

        const formatInfo = getFileSignatureInfo(headerBytes);
        
        // Count how many edits are within the recognized header bounds
        let headerEditCount = 0;
        for (const offset of tab.edits.keys()) {
          if (offset < formatInfo.headerSize) {
            headerEditCount++;
          }
        }

        const totalEdits = tab.edits.size;
        const glitchScore = tab.size > 0 ? (totalEdits / tab.size) * 100 : 0;

        setStats({
          fileFormat: formatInfo.format,
          formatDescription: formatInfo.description,
          totalEdits,
          headerEdits: headerEditCount,
          headerSize: formatInfo.headerSize,
          glitchScore,
          headerCorrupted: headerEditCount > 0,
        });
      } catch (err) {
        console.error('Error analyzing signature:', err);
      }
    };
    readStats();
  }, [tab.file, tab.edits, tab.size]);

  // Compile active binary modifications into a Blob for native standard playback
  useEffect(() => {
    let active = true;
    let url: string | null = null;

    const generatePreview = async () => {
      setPreviewError(null);
      setImageLoadError(false);
      setVideoLoadError(false);
      setPdfLoadError(false);

      // If no edits, render the pristine file directly
      if (tab.edits.size === 0) {
        url = URL.createObjectURL(tab.file);
        if (active) setPreviewUrl(url);
        return;
      }

      // Memory safeguard
      const maxCompileSize = 40 * 1024 * 1024;
      if (tab.size > maxCompileSize) {
        setPreviewError('Tệp lớn hơn 40MB. Để tránh quá tải RAM, trình phát chuẩn bị vô hiệu hóa; vui lòng dùng chế độ "Sóng âm & Điểm ảnh thô"!');
        url = URL.createObjectURL(tab.file);
        if (active) setPreviewUrl(url);
        return;
      }

      setCompiling(true);
      try {
        const buffer = await tab.file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        // Apply edits dynamically in memory
        for (const [offset, value] of tab.edits.entries()) {
          if (offset < bytes.length) {
            bytes[offset] = value;
          }
        }

        const editedBlob = new Blob([bytes], { type: tab.type || 'application/octet-stream' });
        url = URL.createObjectURL(editedBlob);
        if (active) {
          setPreviewUrl(url);
        }
      } catch (err) {
        console.error('Failed to compile preview blob:', err);
        if (active) setPreviewError('Không thể tạo bộ đệm nhị phân sửa đổi.');
      } finally {
        if (active) setCompiling(false);
      }
    };

    generatePreview();

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [tab.file, tab.edits, tab.size, tab.type]);

  // RAW PIXEL MATRIX CANVAS RENDERER (For Glitch art analysis)
  useEffect(() => {
    let active = true;
    const renderRawCanvas = async () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        // Read first 64KB to maintain ultra-fast render speeds
        const readLen = Math.min(tab.size, 65536);
        const slice = tab.file.slice(0, readLen);
        const buffer = await slice.arrayBuffer();
        const rawBytes = new Uint8Array(buffer);

        // Inject edits into current canvas segment
        for (let i = 0; i < rawBytes.length; i++) {
          if (tab.edits.has(i)) {
            rawBytes[i] = tab.edits.get(i)!;
          }
        }

        if (!active) return;

        const width = stride;
        let height = Math.ceil(rawBytes.length / (visualMode === 'rgb' ? stride * 3 : stride));
        if (height <= 0) height = 1;

        canvas.width = width;
        canvas.height = Math.min(height, 512);

        const imgData = ctx.createImageData(canvas.width, canvas.height);
        const data = imgData.data;

        let byteIdx = 0;
        const totalPixels = canvas.width * canvas.height;

        for (let p = 0; p < totalPixels; p++) {
          const pixelOffset = p * 4;

          if (visualMode === 'grayscale') {
            let val = byteIdx < rawBytes.length ? rawBytes[byteIdx] : 0;
            
            // Apply live animated scanline noise wave
            if (glitchAnimationActive) {
              const row = Math.floor(p / width);
              const col = p % width;
              const wave = Math.sin((row / 12) + animFrameIndex * 0.15) * Math.cos((col / 8) - animFrameIndex * 0.1);
              val = (val + Math.floor(wave * 30) + 256) % 256;
            }

            const isEdited = tab.edits.has(byteIdx);
            
            if (isEdited) {
              // Pulse amber for edited spots
              const pulse = Math.sin(Date.now() / 150) > 0;
              data[pixelOffset] = pulse ? 239 : 251;     // R
              data[pixelOffset + 1] = pulse ? 68 : 191;   // G
              data[pixelOffset + 2] = pulse ? 68 : 36;    // B
            } else {
              data[pixelOffset] = val;
              data[pixelOffset + 1] = val;
              data[pixelOffset + 2] = val;
            }
            data[pixelOffset + 3] = 255;
            byteIdx++;

          } else if (visualMode === 'rgb') {
            let r = byteIdx < rawBytes.length ? rawBytes[byteIdx] : 0;
            let g = byteIdx + 1 < rawBytes.length ? rawBytes[byteIdx + 1] : 0;
            let b = byteIdx + 2 < rawBytes.length ? rawBytes[byteIdx + 2] : 0;
            
            // Apply chromatic color shifting
            if (glitchAnimationActive) {
              const row = Math.floor(p / width);
              const rShift = Math.floor(Math.sin((row / 8) + animFrameIndex * 0.12) * 25);
              const bShift = Math.floor(Math.cos((row / 10) + animFrameIndex * 0.15) * 25);
              r = (r + rShift + 256) % 256;
              b = (b + bShift + 256) % 256;
            }

            const isEdited = tab.edits.has(byteIdx) || tab.edits.has(byteIdx + 1) || tab.edits.has(byteIdx + 2);
            
            if (isEdited) {
              data[pixelOffset] = 239; // Pure orange red
              data[pixelOffset + 1] = 68;
              data[pixelOffset + 2] = 68;
            } else {
              data[pixelOffset] = r;
              data[pixelOffset + 1] = g;
              data[pixelOffset + 2] = b;
            }
            data[pixelOffset + 3] = 255;
            byteIdx += 3;

          } else { // bits matrix
            let currentByte = byteIdx < rawBytes.length ? rawBytes[byteIdx] : 0;
            
            if (glitchAnimationActive) {
              const row = Math.floor(p / width);
              const drift = Math.floor(Math.sin((row / 6) + animFrameIndex * 0.1) * 8);
              currentByte = (currentByte + drift + 256) % 256;
            }

            const bitOffset = p % 8;
            const bit = (currentByte >> (7 - bitOffset)) & 1;
            const isEdited = tab.edits.has(byteIdx);

            if (isEdited) {
              data[pixelOffset] = 245;
              data[pixelOffset + 1] = 158;
              data[pixelOffset + 2] = 11;
            } else {
              const val = bit ? 240 : 25;
              data[pixelOffset] = val;
              data[pixelOffset + 1] = val;
              data[pixelOffset + 2] = val;
            }
            data[pixelOffset + 3] = 255;

            if (bitOffset === 7) {
              byteIdx++;
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);

      } catch (err) {
        console.error('Failed to draw raw pixel canvas:', err);
      }
    };

    renderRawCanvas();
    
    // Set a tiny interval to animate edited flashing spots or background sync
    const timer = setInterval(renderRawCanvas, glitchAnimationActive ? Math.max(16, 1000 / glitchFPS) : 300);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tab.file, tab.edits, tab.size, stride, visualMode, glitchAnimationActive, animFrameIndex, glitchFPS]);

  // FALLBACK RAW PIXEL MATRIX CANVAS RENDERER FOR STANDARD VIEW IMAGE DECODE ERROR
  useEffect(() => {
    if (!imageLoadError || !fallbackCanvasRef.current) return;
    let active = true;

    const renderFallbackCanvas = async () => {
      const canvas = fallbackCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        const readLen = Math.min(tab.size, 65536);
        const slice = tab.file.slice(0, readLen);
        const buffer = await slice.arrayBuffer();
        const rawBytes = new Uint8Array(buffer);

        for (let i = 0; i < rawBytes.length; i++) {
          if (tab.edits.has(i)) {
            rawBytes[i] = tab.edits.get(i)!;
          }
        }

        if (!active) return;

        // Draw with stride 128 for fallback image representation
        const width = 128;
        let height = Math.ceil(rawBytes.length / width);
        if (height <= 0) height = 1;

        canvas.width = width;
        canvas.height = Math.min(height, 128);

        const imgData = ctx.createImageData(canvas.width, canvas.height);
        const data = imgData.data;

        let byteIdx = 0;
        const totalPixels = canvas.width * canvas.height;

        for (let p = 0; p < totalPixels; p++) {
          const pixelOffset = p * 4;
          const val = byteIdx < rawBytes.length ? rawBytes[byteIdx] : 0;
          const isEdited = tab.edits.has(byteIdx);

          if (isEdited) {
            const pulse = Math.sin(Date.now() / 150) > 0;
            data[pixelOffset] = pulse ? 239 : 251;     // R
            data[pixelOffset + 1] = pulse ? 68 : 191;   // G
            data[pixelOffset + 2] = pulse ? 68 : 36;    // B
          } else {
            // Give it a colorful RGB matrix look for glitched feel:
            data[pixelOffset] = val;
            data[pixelOffset + 1] = (val * 3) % 256;
            data[pixelOffset + 2] = (val * 7) % 256;
          }
          data[pixelOffset + 3] = 255;
          byteIdx++;
        }

        ctx.putImageData(imgData, 0, 0);
      } catch (err) {
        console.error('Failed to render fallback canvas:', err);
      }
    };

    renderFallbackCanvas();
    const interval = setInterval(renderFallbackCanvas, 300);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [imageLoadError, tab.file, tab.edits, tab.size]);

  // LIVE AUDIO ANALYZER DRAW LOOP
  useEffect(() => {
    let active = true;
    const draw = () => {
      if (!active) return;
      animationFrameRef.current = requestAnimationFrame(draw);

      const canvas = waveformCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const analyser = analyserRef.current;
      
      if (analyser && isAudioPlaying) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        // Background slate
        ctx.fillStyle = 'rgba(9, 9, 11, 0.85)';
        ctx.fillRect(0, 0, width, height);

        // Draw frequency bars in the background
        analyser.getByteFrequencyData(dataArray);
        const barWidth = (width / bufferLength) * 1.6;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * height * 0.85;
          const r = Math.floor(239 * (i / bufferLength));
          const g = Math.floor(191 * (1 - i / bufferLength) + 60);
          const b = 255;
          
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
          ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }

        // Draw time-domain line on top (wave line)
        const timeData = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(timeData);

        ctx.lineWidth = 2.5;
        // Neon green-blue line
        ctx.strokeStyle = '#059669'; 
        
        // Apply slight yellow/amber color shift if we are playing raw PCM
        if (audioState === 'playing_raw_pcm') {
          ctx.strokeStyle = '#d97706'; // Amber-600
        }

        ctx.beginPath();
        const sliceWidth = width / bufferLength;
        let tX = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = timeData[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(tX, y);
          } else {
            ctx.lineTo(tX, y);
          }
          tX += sliceWidth;
        }
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Glitch line artifacts for effect
        if (Math.random() < 0.08) {
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const glitchY = Math.random() * height;
          ctx.moveTo(0, glitchY);
          ctx.lineTo(width, glitchY);
          ctx.stroke();
        }

      } else {
        // Idle screen
        ctx.fillStyle = 'rgb(9, 9, 11)';
        ctx.fillRect(0, 0, width, height);
        
        // Draw centered idle line
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#27272a'; // zinc-800
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        
        const points = 40;
        const step = width / points;
        for (let i = 0; i <= points; i++) {
          const noise = (Math.random() - 0.5) * 1.5; // subtle live static
          ctx.lineTo(i * step, height / 2 + noise);
        }
        ctx.stroke();
      }
    };

    draw();

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isAudioPlaying, audioState]);

  // CORE ADVANCED AUDIO PLAYER
  // Decodes full file into AudioBuffer so edits are played natively.
  // Falls back gracefully to raw PCM if headers are too corrupted!
  const playDynamicAudio = async () => {
    try {
      stopAudioPlayback();
      
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      audioCtxRef.current = audioCtx;

      setAudioState('decoding');
      setAudioFeedback('Đang kết hợp và nạp cấu trúc nhị phân của tệp...');

      // Prepare entire bytes buffer with current edits applied
      const buffer = await tab.file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      for (const [offset, value] of tab.edits.entries()) {
        if (offset < bytes.length) {
          bytes[offset] = value;
        }
      }

      // 1) Try standard native decoding via Web Audio (MP3, WAV, etc.)
      try {
        // Copy array buffer for decoding safety
        const copyBuffer = bytes.buffer.slice(0);
        const decodedBuffer = await audioCtx.decodeAudioData(copyBuffer);
        
        setAudioState('playing_decoded');
        setAudioFeedback('Đã giải mã thành công! Đang phát tín hiệu âm sắc chuẩn kèm theo các đoạn biến dạng (Glitch) bạn chỉnh sửa.');

        const source = audioCtx.createBufferSource();
        source.buffer = decodedBuffer;
        source.loop = rawAudioLoop === 'selection'; // Loop if selected

        // Setup Analyser
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        // Setup Gain (Volume)
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = volume;

        // Connections
        source.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        source.start(0);
        audioSourceRef.current = source;
        gainNodeRef.current = gainNode;
        setIsAudioPlaying(true);

        source.onended = () => {
          setIsAudioPlaying(false);
          setAudioState('idle');
          setAudioFeedback('Kết thúc lượt phát.');
        };

      } catch (decodeErr) {
        // 2) Fallback to Direct RAW PCM Sonification if browser fails decoding
        console.warn('Standard media decoding failed. Triggering raw PCM direct play.', decodeErr);
        
        setAudioState('playing_raw_pcm');
        setAudioFeedback('Ghi chú: Header tệp đã bị lỗi/sai cấu trúc. Hệ thống tự động kích hoạt bộ phát PCM nhị phân thô để ép xuất dải sóng âm.');

        // Play segment depending on loop mode
        let pcmBytes: Uint8Array;
        if (rawAudioLoop === 'selection' && tab.selectedOffset !== null) {
          // Loop around selected cursor offset
          const start = Math.max(0, tab.selectedOffset - 16384);
          const end = Math.min(bytes.length, tab.selectedOffset + 16384);
          pcmBytes = bytes.slice(start, end);
        } else {
          // Play up to 1.5MB max to avoid rendering massive buffers
          const maxLen = Math.min(bytes.length, 1500000);
          pcmBytes = bytes.slice(0, maxLen);
        }

        if (pcmBytes.length === 0) {
          setAudioState('error');
          setAudioFeedback('Tệp rỗng hoặc không thể truy xuất dữ liệu.');
          return;
        }

        const pcmBuffer = audioCtx.createBuffer(1, pcmBytes.length, sampleRate);
        const channelData = pcmBuffer.getChannelData(0);

        // Convert raw 8-bit unsigned integers to [-1.0, 1.0] audio voltage levels
        for (let i = 0; i < pcmBytes.length; i++) {
          channelData[i] = (pcmBytes[i] / 127.5) - 1.0;
        }

        const source = audioCtx.createBufferSource();
        source.buffer = pcmBuffer;
        source.loop = true; // Auto loop in raw pcm mode for rich synth experience

        // Setup Analyser
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        // Volume
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = volume;

        source.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        source.start(0);
        audioSourceRef.current = source;
        gainNodeRef.current = gainNode;
        setIsAudioPlaying(true);
      }

    } catch (err: any) {
      console.error('Audio engine crash:', err);
      setAudioState('error');
      setAudioFeedback(`Lỗi phát sóng âm: ${err.message || 'Lỗi động cơ WebAudio'}`);
    }
  };

  const stopAudioPlayback = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {}
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setIsAudioPlaying(false);
    setAudioState('idle');
  };

  // Keep volume slider synced during active audio play
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  // Reload audio dynamic nodes if edits, sample rate, or loops change while playing
  useEffect(() => {
    if (isAudioPlaying && audioState === 'playing_raw_pcm') {
      playDynamicAudio();
    }
  }, [tab.edits, rawAudioLoop, sampleRate]);

  // Clean up on component destroy
  useEffect(() => {
    return () => {
      stopAudioPlayback();
    };
  }, []);

  const handleMediaError = () => {
    setPreviewError(
      'Cảnh báo: Tệp không giải mã được theo bộ nén tiêu chuẩn của trình duyệt do byte cấu trúc (Header/Magic Bytes) bị hỏng. Hãy chuyển sang chế độ "Glitch & Sóng Âm Thô" dưới đây để nghe biến dạng âm thanh và xem lưới pixel nhị phân thô.'
    );
  };

  const applyGlitchPreset = async (type: 'melt' | 'rgb_split' | 'robot' | 'static') => {
    if (!onEditMultipleBytes) return;

    try {
      const buffer = await tab.file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const startOffset = safeHeaderGuard ? stats.headerSize : 0;
      const editsToApply = new Map<number, number>();

      // Size of edits based on intensity slider
      const sizeToModify = Math.floor(bytes.length * glitchIntensity);
      
      if (type === 'melt') {
        // Melt color lanes by adding sequential offsets
        let offset = startOffset + Math.floor(Math.random() * (bytes.length - startOffset - 256));
        if (offset < 0) offset = 0;
        const meltLength = Math.min(sizeToModify > 0 ? sizeToModify : 200, bytes.length - offset);
        let shift = Math.floor(Math.random() * 60) + 15;
        for (let i = 0; i < meltLength; i++) {
          if (offset + i < bytes.length) {
            if (i % 64 === 0) shift = (shift + 17) % 256;
            const originalVal = bytes[offset + i];
            const newVal = (originalVal + shift) % 256;
            editsToApply.set(offset + i, newVal);
          }
        }
      } else if (type === 'rgb_split') {
        // Periodic modifications that simulate RGB misalignment
        const strideStep = Math.max(3, Math.floor(bytes.length / 400));
        for (let i = startOffset; i < bytes.length; i += strideStep) {
          if (i + 2 < bytes.length) {
            const r = bytes[i];
            const g = bytes[i + 1];
            const b = bytes[i + 2];
            editsToApply.set(i, g);
            editsToApply.set(i + 1, b);
            editsToApply.set(i + 2, r);
          }
        }
      } else if (type === 'robot') {
        // Block-wise bitwise distortions for robotic crunch
        const blockLength = 64;
        let isGlitchedBlock = false;
        for (let i = startOffset; i < bytes.length; i++) {
          if (i % blockLength === 0) {
            isGlitchedBlock = Math.random() < 0.3;
          }
          if (isGlitchedBlock) {
            const newVal = bytes[i] ^ 0x5C;
            editsToApply.set(i, newVal);
          }
        }
      } else if (type === 'static') {
        // High intensity binary noise
        const editCount = Math.min(1500, sizeToModify > 0 ? sizeToModify : 150);
        for (let i = 0; i < editCount; i++) {
          const randOffset = startOffset + Math.floor(Math.random() * (bytes.length - startOffset));
          if (randOffset < bytes.length) {
            const newVal = Math.random() < 0.5 ? 0x00 : 0xFF;
            editsToApply.set(randOffset, newVal);
          }
        }
      }

      onEditMultipleBytes(editsToApply);
      setAudioFeedback(`Đã kích hoạt bộ preset "${type.toUpperCase()}". Đã thay đổi ${editsToApply.size} byte dữ liệu.`);
    } catch (err) {
      console.error('Preset error:', err);
    }
  };

  return (
    <div className="flex flex-col gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl select-none text-zinc-300 h-full font-sans">
      
      {/* Title Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Eye size={16} className="text-emerald-500 animate-pulse" />
          <h3 className="text-xs font-black text-zinc-100 uppercase tracking-wider">
            Thử Nghiệm Âm Sóng & Đồ Hoạ Biến Dạng
          </h3>
        </div>

        {/* Unified Mode Toggle */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 border border-zinc-850 rounded-lg">
          <button
            id="preview-mode-standard-btn"
            onClick={() => { setMode('standard'); stopAudioPlayback(); }}
            className={`px-3 py-1.5 text-[10px] font-bold rounded transition cursor-pointer flex items-center gap-1
              ${mode === 'standard' 
                ? 'bg-emerald-600 text-white shadow' 
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
          >
            Mở File Chuẩn
          </button>
          <button
            id="preview-mode-glitch-btn"
            onClick={() => setMode('glitch')}
            className={`px-3 py-1.5 text-[10px] font-bold rounded transition cursor-pointer flex items-center gap-1
              ${mode === 'glitch' 
                ? 'bg-amber-600 text-white shadow' 
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
          >
            Glitch & Sóng Âm Thô
          </button>
        </div>
      </div>

      {/* METADATA SUMMARY & WARPING REPORT (Vietnam translation instructions) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-zinc-950 p-3 rounded-lg border border-zinc-850 text-[11px] font-mono">
        <div className="flex flex-col gap-1 border-r border-zinc-850/60 pr-2">
          <div className="text-zinc-500 uppercase tracking-wider text-[9px] font-bold flex items-center gap-1">
            <Info size={11} className="text-sky-400" /> Nhận diện định dạng tệp:
          </div>
          <div className="text-emerald-400 font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
            {stats.fileFormat} (Khu vực Header: {stats.headerSize} bytes)
          </div>
          <div className="text-zinc-400 text-[10px] leading-relaxed mt-0.5">
            {stats.formatDescription}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-zinc-500 uppercase tracking-wider text-[9px] font-bold flex items-center gap-1">
            <Sparkles size={11} className="text-amber-400" /> Báo cáo biến dạng nhị phân:
          </div>
          <div className="flex justify-between items-center text-[10px]">
            <span>Tổng số byte đã sửa đổi:</span>
            <span className="text-amber-400 font-bold">{stats.totalEdits} byte</span>
          </div>
          <div className="flex justify-between items-center text-[10px]">
            <span>Chỉnh sửa vùng Header:</span>
            <span className={`${stats.headerCorrupted ? 'text-rose-400 font-bold animate-pulse' : 'text-zinc-400'}`}>
              {stats.headerEdits} / {stats.headerSize} byte
            </span>
          </div>
          {/* Progress bar of destruction level */}
          <div className="mt-1">
            <div className="flex justify-between text-[9px] text-zinc-500 mb-0.5">
              <span>Chỉ số biến dạng tệp (Glitch Level):</span>
              <span className="text-zinc-300 font-bold">{stats.glitchScore.toFixed(3)}%</span>
            </div>
            <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${
                  stats.headerCorrupted ? 'bg-gradient-to-r from-amber-500 to-rose-600' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(3, stats.glitchScore * 10))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 📱 BỘ ĐIỀU KHIỂN THỦ CÔNG DI ĐỘNG & GLITCH NHANH */}
      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-2 border-b border-zinc-900 justify-between flex-wrap">
          <div className="flex items-center gap-2">
            <Smartphone size={16} className="text-amber-500 animate-pulse" />
            <h4 className="text-xs font-black text-zinc-100 uppercase tracking-wider font-mono">
              Bàn Điều Khiển Cầm Tay Cho Di Động
            </h4>
          </div>
          <span className="text-[9px] bg-amber-500/10 text-amber-400 font-bold px-2 py-0.5 rounded border border-amber-500/25 uppercase font-mono">
            Touch Friendly
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          
          {/* COLUMN 1: PRESET GLITCH ENGINE */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-bold uppercase tracking-wider">
              <Zap size={13} className="text-amber-500" />
              <span>Hiệu Ứng Glitch Nhanh (Preset Engine)</span>
            </div>
            
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Kích hoạt nhanh các thuật toán phá vỡ nhị phân. Bật <strong className="text-zinc-400 font-bold">Bảo vệ Header</strong> để tránh hỏng tệp làm trình duyệt từ chối phát chuẩn.
            </p>

            <div className="flex items-center justify-between gap-3 bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-850 flex-wrap">
              <div className="flex items-center gap-2">
                <Shield size={14} className={safeHeaderGuard ? "text-emerald-400" : "text-zinc-500"} />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-zinc-300">Màng chắn Header An Toàn</span>
                  <span className="text-[8px] text-zinc-500">Bỏ qua {stats.headerSize} byte đầu tiên để tệp luôn tải được</span>
                </div>
              </div>
              <button
                id="safe-header-toggle"
                onClick={() => setSafeHeaderGuard(!safeHeaderGuard)}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer border ${
                  safeHeaderGuard 
                    ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30' 
                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {safeHeaderGuard ? "ĐANG BẬT" : "ĐANG TẮT"}
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                <span>Mật độ biến đổi (Glitch Density):</span>
                <span className="text-amber-400 font-bold">{(glitchIntensity * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.005"
                max="0.15"
                step="0.005"
                value={glitchIntensity}
                onChange={(e) => setGlitchIntensity(Number(e.target.value))}
                className="w-full accent-amber-500 h-1 bg-zinc-900 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => applyGlitchPreset('melt')}
                className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-amber-600/20 border border-zinc-800 hover:border-amber-500/50 text-zinc-300 hover:text-amber-300 py-3 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer active:scale-95 min-h-[44px]"
              >
                🌀 Tan Chảy Màu
              </button>
              <button
                onClick={() => applyGlitchPreset('rgb_split')}
                className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-sky-600/20 border border-zinc-800 hover:border-sky-500/50 text-zinc-300 hover:text-sky-300 py-3 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer active:scale-95 min-h-[44px]"
              >
                🌈 Phân Tách RGB
              </button>
              <button
                onClick={() => applyGlitchPreset('robot')}
                className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-emerald-600/20 border border-zinc-800 hover:border-emerald-500/50 text-zinc-300 hover:text-emerald-300 py-3 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer active:scale-95 min-h-[44px]"
              >
                🤖 Tiếng Rít Robot
              </button>
              <button
                onClick={() => applyGlitchPreset('static')}
                className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-rose-600/20 border border-zinc-800 hover:border-rose-500/50 text-zinc-300 hover:text-rose-300 py-3 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer active:scale-95 min-h-[44px]"
              >
                ⚡ Nhiễu Muối Tiêu
              </button>
            </div>

            {onClearEdits && (
              <button
                onClick={onClearEdits}
                className="w-full flex items-center justify-center gap-1 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200 py-2.5 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer active:scale-95 min-h-[40px]"
              >
                <RotateCcw size={12} />
                Khôi phục tệp gốc ban đầu
              </button>
            )}
          </div>

          {/* COLUMN 2: BYTE SWEEPER & BIT SWITCHES */}
          <div className="flex flex-col gap-3 border-t lg:border-t-0 lg:border-l border-zinc-900 pt-4 lg:pt-0 lg:pl-5">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-bold uppercase tracking-wider">
              <Sliders size={13} className="text-emerald-500" />
              <span>Cơ Chế Byte Thủ Công & Bit Toggles</span>
            </div>

            {tab.selectedOffset === null || tab.selectedOffset === undefined ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4 bg-zinc-900/40 border border-zinc-900 border-dashed rounded-xl min-h-[160px]">
                <span className="text-[20px] mb-2">🕹️</span>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wide">Chưa Chọn Vị Trí Byte</p>
                <p className="text-[9px] text-zinc-500 mt-1 max-w-[240px] leading-relaxed">
                  Hãy chạm chọn một ô vuông byte bất kỳ trên lưới nhị phân thô hoặc bảng Hex để bắt đầu xoay chuyển bit di động!
                </p>
                <button
                  onClick={() => onSelectOffset?.(0)}
                  className="mt-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 text-[9px] font-bold rounded-lg uppercase tracking-wide transition cursor-pointer"
                >
                  Chọn Byte Đầu Tiên (Offset 0)
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                
                {/* Position Scrub Slider */}
                <div className="flex flex-col gap-1.5 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-900">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-zinc-500">Vị trí chỉnh sửa:</span>
                    <span className="text-emerald-400 font-bold">
                      0x{tab.selectedOffset.toString(16).toUpperCase().padStart(4, '0')} ({tab.selectedOffset})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectOffset?.(Math.max(0, tab.selectedOffset! - 1))}
                      className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 w-8 h-8 rounded flex items-center justify-center font-bold font-mono transition cursor-pointer border border-zinc-800 text-xs active:scale-95"
                    >
                      -1
                    </button>
                    <input
                      type="range"
                      min="0"
                      max={tab.size - 1}
                      value={tab.selectedOffset}
                      onChange={(e) => onSelectOffset?.(Number(e.target.value))}
                      className="flex-1 accent-emerald-500 h-1 bg-zinc-900 rounded-lg appearance-none cursor-pointer"
                    />
                    <button
                      onClick={() => onSelectOffset?.(Math.min(tab.size - 1, tab.selectedOffset! + 1))}
                      className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 w-8 h-8 rounded flex items-center justify-center font-bold font-mono transition cursor-pointer border border-zinc-800 text-xs active:scale-95"
                    >
                      +1
                    </button>
                  </div>
                </div>

                {/* Selected Byte Details and Bit toggles */}
                <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-850">
                  <div className="flex justify-between items-center text-[10px] mb-2 font-mono">
                    <span className="text-zinc-400 font-bold uppercase">Sơ Đồ 8-Bit Nhị Phân:</span>
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-1.5 py-0.2 rounded font-bold">
                      Dec: {selectedByteValue} | Hex: 0x{selectedByteValue.toString(16).toUpperCase().padStart(2, '0')}
                    </span>
                  </div>

                  {/* 8 Binary Switch Toggles */}
                  <div className="grid grid-cols-8 gap-1.5">
                    {Array.from({ length: 8 }).map((_, idx) => {
                      const bitIndex = 7 - idx; // left-most is bit 7 (value 128)
                      const bitValue = (selectedByteValue >> bitIndex) & 1;
                      const bitWeight = Math.pow(2, bitIndex);
                      
                      return (
                        <button
                          key={bitIndex}
                          onClick={() => {
                            const mask = 1 << bitIndex;
                            const newByteVal = selectedByteValue ^ mask;
                            onEditByte?.(tab.selectedOffset!, newByteVal);
                          }}
                          className={`flex flex-col items-center p-1 rounded border transition-all cursor-pointer active:scale-90 ${
                            bitValue === 1
                              ? 'bg-emerald-600/30 border-emerald-500/60 text-emerald-300'
                              : 'bg-zinc-950 border-zinc-850 text-zinc-600'
                          }`}
                        >
                          <span className="text-[7px] font-mono text-zinc-500">{bitWeight}</span>
                          <span className="text-[12px] font-bold font-mono mt-0.5">{bitValue}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Thumb-friendly fast-set Buttons */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => onEditByte?.(tab.selectedOffset!, 0x00)}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-700 text-[10px] font-mono py-2.5 rounded transition text-zinc-300 font-bold cursor-pointer active:scale-95"
                  >
                    0x00
                  </button>
                  <button
                    onClick={() => onEditByte?.(tab.selectedOffset!, 0xFF)}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-700 text-[10px] font-mono py-2.5 rounded transition text-zinc-300 font-bold cursor-pointer active:scale-95"
                  >
                    0xFF
                  </button>
                  <button
                    onClick={() => onEditByte?.(tab.selectedOffset!, 0x7F)}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-700 text-[10px] font-mono py-2.5 rounded transition text-zinc-300 font-bold cursor-pointer active:scale-95"
                  >
                    0x7F
                  </button>
                  <button
                    onClick={() => onEditByte?.(tab.selectedOffset!, Math.floor(Math.random() * 256))}
                    className="bg-zinc-900 hover:bg-amber-600/10 border border-zinc-850 hover:border-amber-500/30 text-[10px] font-mono py-2.5 rounded transition text-amber-400 font-bold cursor-pointer active:scale-95"
                  >
                    Ngẫu Nhiên
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => onEditByte?.(tab.selectedOffset!, Math.max(0, selectedByteValue - 1))}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 text-[10px] py-2 rounded text-zinc-400 cursor-pointer active:scale-95"
                  >
                    -1 Dec
                  </button>
                  <button
                    onClick={() => onEditByte?.(tab.selectedOffset!, Math.min(255, selectedByteValue + 1))}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 text-[10px] py-2 rounded text-zinc-400 cursor-pointer active:scale-95"
                  >
                    +1 Dec
                  </button>
                  <button
                    onClick={() => onEditByte?.(tab.selectedOffset!, Math.max(0, selectedByteValue - 16))}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 text-[10px] py-2 rounded text-zinc-400 cursor-pointer active:scale-95"
                  >
                    -16 Dec
                  </button>
                  <button
                    onClick={() => onEditByte?.(tab.selectedOffset!, Math.min(255, selectedByteValue + 16))}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 text-[10px] py-2 rounded text-zinc-400 cursor-pointer active:scale-95"
                  >
                    +16 Dec
                  </button>
                </div>

              </div>
            )}

          </div>

        </div>
      </div>

      {/* RENDER STAGE */}
      {mode === 'standard' ? (
        <div className="flex-1 bg-zinc-950 rounded-xl border border-zinc-850 flex flex-col items-center justify-center overflow-hidden relative min-h-[300px] p-4">
          
          {previewError && !isImage && !isAudio && !isVideo && !isPDF ? (
            <div className="p-6 text-center max-w-sm flex flex-col items-center justify-center">
              <AlertTriangle size={32} className="text-rose-500 mb-2.5 animate-bounce" />
              <p className="text-xs font-black text-rose-400 uppercase tracking-wider font-mono">
                Trình Phát Chuẩn Bị Từ Chối
              </p>
              <p className="text-[10px] text-zinc-400 mt-2.5 leading-relaxed">
                {previewError}
              </p>
              
              <button
                onClick={() => setMode('glitch')}
                className="mt-4 bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-2 rounded-lg text-[10px] transition uppercase cursor-pointer"
              >
                Chuyển qua Chế độ Glitch Cưỡng Bức
              </button>
            </div>
          ) : !previewUrl ? (
            <div className="text-zinc-500 text-xs font-mono animate-pulse flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-emerald-500" />
              Đang biên dịch tệp nhị phân sửa đổi...
            </div>
          ) : (
            <>
              {/* IMAGE MEDIA TYPE */}
              {isImage && (
                <div className="flex flex-col items-center gap-3 w-full max-w-md">
                  {!imageLoadError ? (
                    <div className="relative flex flex-col items-center gap-2">
                      <img
                        src={previewUrl}
                        alt="Pristine/Modified Preview"
                        onError={() => setImageLoadError(true)}
                        referrerPolicy="no-referrer"
                        className="max-w-full max-h-[300px] object-contain rounded-lg shadow-2xl border border-zinc-800"
                      />
                      {stats.totalEdits > 0 && (
                        <span className="text-[9px] text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-900/50 px-2 py-0.5 rounded-full mt-1">
                          ✓ Đang hiển thị kết quả chỉnh sửa trực tiếp ({stats.totalEdits} byte)
                        </span>
                      )}
                    </div>
                  ) : (
                    // Display glitched raw pixel canvas directly!
                    <div className="flex flex-col items-center gap-3 bg-zinc-950 p-4 rounded-xl border border-rose-950 w-full">
                      <div className="flex items-center gap-1.5 text-rose-400 font-mono text-[11px] font-bold">
                        <AlertTriangle size={14} className="text-rose-500 animate-pulse" />
                        <span>Trình duyệt không giải mã được ảnh (Lỗi Header)</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 text-center leading-normal">
                        Header bị hỏng. Đang hiển thị bản đồ pixel thô của tệp ảnh (Glitch Art) để hiển thị chi tiết các lỗi nhị phân trực quan:
                      </p>
                      
                      {/* Fallback canvas container */}
                      <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg max-h-[160px] overflow-auto flex items-center justify-center w-full">
                        <canvas
                          ref={fallbackCanvasRef}
                          className="image-render-pixelated shadow-lg border border-zinc-850"
                          style={{ imageRendering: 'pixelated', transform: 'scale(1.25)', transformOrigin: 'center' }}
                        />
                      </div>
                      
                      <div className="text-[9px] text-zinc-500 font-mono text-center">
                        Từng điểm ảnh phía trên tương ứng trực tiếp với các byte bạn đã chỉnh sửa!
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* VIDEO MEDIA TYPE */}
              {isVideo && (
                <div className="flex flex-col items-center gap-3 w-full max-w-md">
                  {!videoLoadError ? (
                    <video
                      src={previewUrl}
                      controls
                      onError={() => setVideoLoadError(true)}
                      className="max-w-full max-h-[300px] rounded-lg shadow-2xl border border-zinc-800"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-3 bg-zinc-950 p-4 rounded-xl border border-rose-950 w-full text-center">
                      <AlertTriangle size={24} className="text-rose-500 mb-1 animate-bounce" />
                      <div className="text-rose-400 font-mono text-[11px] font-bold">
                        Không thể giải mã luồng Video (Decode Error)
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-normal">
                        Lỗi giải mã định dạng nén do byte cấu trúc bị biến đổi. Bạn có thể xuất tệp và mở bằng VLC hoặc các trình phát chuyên dụng để xem phần dữ liệu lỗi một cách cưỡng bức!
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* AUDIO MEDIA TYPE */}
              {isAudio && (
                <div className="flex flex-col items-center justify-center p-6 w-full max-w-[340px]">
                  <div className="p-4 bg-emerald-950/20 border border-emerald-900/30 rounded-full mb-3 shadow-lg flex items-center justify-center relative">
                    <MusicIcon size={40} className={`text-emerald-400 ${isAudioPlaying ? 'animate-pulse' : ''}`} />
                    {isAudioPlaying && (
                      <span className="absolute inset-0 border border-emerald-500 rounded-full animate-ping opacity-35" />
                    )}
                  </div>
                  
                  {/* Standard Play Button triggers dynamic hybrid playback for best glitch audio feeling */}
                  <div className="flex flex-col gap-2 w-full">
                    <button
                      id="standard-play-trigger-btn"
                      onClick={isAudioPlaying ? stopAudioPlayback : playDynamicAudio}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg py-2 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      {isAudioPlaying ? <Pause size={14} /> : <Play size={14} />}
                      {isAudioPlaying ? 'Dừng phát nhạc' : 'Phát thử tệp đã sửa đổi'}
                    </button>

                    {/* Integrated mini spectrum display in standard view */}
                    <div className="mt-2">
                      <canvas 
                        ref={waveformCanvasRef} 
                        width={280} 
                        height={60} 
                        className="rounded bg-zinc-900 border border-zinc-850 w-full"
                      />
                    </div>

                    {/* Show dynamic feedback notice if running in PCM fallback */}
                    {audioState === 'playing_raw_pcm' && (
                      <div className="mt-2 p-2.5 bg-amber-950/30 border border-amber-900/40 rounded text-[9px] text-amber-300 font-mono leading-normal">
                        ⚠️ <strong>Âm thanh lỗi:</strong> Header tệp bị hỏng hoặc trình duyệt không giải mã được. Đang tự động ép phát tín hiệu sóng âm thô (PCM) từ chính các byte lỗi!
                      </div>
                    )}

                    {audioFeedback && audioState !== 'playing_raw_pcm' && (
                      <div className="text-[9px] text-zinc-400 text-center font-mono mt-1">
                        {audioFeedback}
                      </div>
                    )}
                    
                    {!audioFeedback && (
                      <div className="text-[9px] text-zinc-500 text-center font-mono mt-1">
                        Hệ thống tự động đồng bộ và phát các bytes đã được bạn sửa đổi trong Hex Editor.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PDF MEDIA TYPE */}
              {isPDF && (
                <div className="flex flex-col items-center gap-3 w-full h-full min-h-[320px]">
                  {!pdfLoadError ? (
                    <iframe
                      src={`${previewUrl}#toolbar=0&navpanes=0`}
                      title="PDF Preview"
                      className="w-full h-full border-0 min-h-[320px] rounded-lg"
                      onError={() => setPdfLoadError(true)}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 bg-zinc-950 p-6 rounded-xl border border-rose-950 w-full text-center min-h-[320px]">
                      <AlertTriangle size={24} className="text-rose-500 mb-1 animate-bounce" />
                      <div className="text-rose-400 font-mono text-[11px] font-bold">
                        Bảng cấu trúc PDF xref bị hỏng
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-normal">
                        Trình duyệt không thể dựng định dạng tài liệu PDF bị sai checksum. Hãy sửa lại các byte cũ hoặc đổi sang chế độ xem "Glitch & Sóng Âm Thô" để khám phá!
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* BINARY OR UNKNOWN TYPE */}
              {!isImage && !isVideo && !isAudio && !isPDF && (
                <div className="flex flex-col items-center justify-center text-center p-6 text-zinc-500 max-w-[280px]">
                  <FileText size={42} className="mb-2 text-zinc-700" />
                  <p className="text-xs font-semibold text-zinc-400">Không có bộ giải mã Media thích hợp</p>
                  <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
                    Đây là tệp nhị phân chung. Hệ thống khuyên bạn đổi sang chế độ <strong>"Glitch & Sóng Âm Thô"</strong> để nghe các xung nhịp hoặc xem hình ảnh thô.
                  </p>
                  <button
                    onClick={() => setMode('glitch')}
                    className="mt-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-3 py-1 text-[9px] font-bold rounded uppercase cursor-pointer"
                  >
                    Xem điểm ảnh & dải sóng âm
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* GLITCH SONIFIER & RAW RENDERER SUITE */
        <div className="flex-1 flex flex-col gap-4">
          
          {/* Audio Sonifier Section */}
          <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-850 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2 flex-wrap gap-1">
              <div className="flex items-center gap-1.5">
                <Activity size={14} className="text-amber-500 animate-pulse" />
                <span className="text-[10px] font-bold text-zinc-200 uppercase tracking-wider font-mono">
                  Bộ Phát Âm Thanh PCM Nhị Phân (Sonifier)
                </span>
              </div>
              <span className="text-[9px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">
                {audioState === 'playing_raw_pcm' ? 'Ép phát sóng âm PCM' : 'Đang sạc...'}
              </span>
            </div>

            {/* Audio player status messages */}
            {audioFeedback && (
              <div className="text-[10px] font-mono p-2 rounded bg-zinc-900 border border-amber-900/20 text-zinc-400 leading-normal flex items-start gap-1">
                <span className="text-amber-500">➜</span>
                <span>{audioFeedback}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Play/Stop Trigger */}
              <button
                id="glitch-audio-play-btn"
                onClick={isAudioPlaying ? stopAudioPlayback : playDynamicAudio}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md
                  ${isAudioPlaying 
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/10' 
                    : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/10'
                  }`}
              >
                {isAudioPlaying ? <Pause size={14} /> : <Play size={14} />}
                <span>{isAudioPlaying ? 'Dừng phát nhạc thô' : 'Phát âm sóng thô (Raw PCM)'}</span>
              </button>

              {/* Loop Area Settings */}
              <div className="flex items-center gap-1.5 bg-zinc-900 p-1 border border-zinc-800 rounded-lg text-[9px] font-mono">
                <button
                  id="loop-mode-all-btn"
                  onClick={() => setRawAudioLoop('all')}
                  className={`px-2.5 py-1 rounded transition cursor-pointer ${rawAudioLoop === 'all' ? 'bg-zinc-800 text-amber-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Toàn Bộ Tệp
                </button>
                <button
                  id="loop-mode-selection-btn"
                  onClick={() => setRawAudioLoop('selection')}
                  className={`px-2.5 py-1 rounded transition cursor-pointer ${rawAudioLoop === 'selection' ? 'bg-zinc-800 text-amber-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
                  title="Loop 16KB quanh byte đang chọn"
                >
                  Loop Byte Đang Chọn
                </button>
              </div>
            </div>

            {/* Live Audio Visualizer Canvas */}
            <div className="relative">
              <canvas 
                ref={waveformCanvasRef} 
                width={480} 
                height={80} 
                className="rounded-lg bg-zinc-900 border border-zinc-850 w-full"
              />
              <span className="absolute bottom-2 right-2 text-[8px] font-mono text-zinc-600 bg-zinc-950/80 px-1 py-0.5 rounded">
                Tốc độ phổ: Real-time
              </span>
            </div>

            {/* Audio controllers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Sample Rate */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-zinc-500 flex items-center gap-1">
                    <Sliders size={11} /> Tốc độ lấy mẫu / Pitch:
                  </span>
                  <span className="text-amber-400 font-bold">{sampleRate} Hz</span>
                </div>
                <input
                  id="glitch-samplerate-range"
                  type="range"
                  min={4000}
                  max={32000}
                  step={500}
                  value={sampleRate}
                  onChange={(e) => setSampleRate(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-900 rounded-lg"
                />
              </div>

              {/* Volume Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-zinc-500 flex items-center gap-1">
                    <Volume2 size={11} /> Âm lượng:
                  </span>
                  <span className="text-amber-400 font-bold">{Math.round(volume * 100)}%</span>
                </div>
                <input
                  id="glitch-volume-range"
                  type="range"
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-900 rounded-lg"
                />
              </div>
            </div>
            
            <p className="text-[9px] text-zinc-500 font-mono leading-relaxed bg-zinc-900/40 p-2 rounded-lg border border-zinc-900">
              💡 <strong>CƠ CHẾ PHÁT THÔ:</strong> Hệ thống ép chuyển các dòng byte nhị phân thành biên độ điện áp âm thanh dạng sóng sin thô. Khi bạn gõ sửa các giá trị Hex ở grid bên cạnh, tiếng rè rít (frequency/tone) sẽ thay đổi theo thời gian thực!
            </p>
          </div>

          {/* Raw Visual Matrix Canvas Section */}
          <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-850 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2 flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <Grid size={14} className="text-amber-500 animate-pulse" />
                <span className="text-[10px] font-bold text-zinc-200 uppercase tracking-wider font-mono">
                  Bản Đồ Pixel Thô (Raw Binary Matrix)
                </span>
              </div>

              {/* Visual Modes select */}
              <div className="flex items-center gap-1.5 text-[9px] font-mono">
                <span className="text-zinc-500">Chế độ phủ:</span>
                <select
                  id="visual-mode-select"
                  value={visualMode}
                  onChange={(e) => setVisualMode(e.target.value as any)}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-zinc-300 outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="grayscale">Trắng Đen (Grayscale)</option>
                  <option value="rgb">Đa Sắc (RGB Mode)</option>
                  <option value="bits">Ma trận Bit (Bit-Matrix)</option>
                </select>
              </div>
            </div>

            {/* Stride & Zoom Adjusters */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-zinc-500">Độ rộng cột (Stride):</span>
                  <span className="text-amber-400 font-bold">{stride} px</span>
                </div>
                <input
                  id="glitch-stride-range"
                  type="range"
                  min={8}
                  max={256}
                  step={8}
                  value={stride}
                  onChange={(e) => setStride(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-900 rounded-lg"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-zinc-500">Phóng to (Zoom):</span>
                  <span className="text-amber-400 font-bold">{visualZoom}x</span>
                </div>
                <input
                  id="glitch-zoom-range"
                  type="range"
                  min={1}
                  max={4}
                  step={0.5}
                  value={visualZoom}
                  onChange={(e) => setVisualZoom(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-900 rounded-lg"
                />
              </div>
            </div>

            {/* Live Animation Simulator (FPS Controls) */}
            <div className="bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-900 flex flex-col gap-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-300">
                  <span className={`w-2 h-2 rounded-full inline-block ${glitchAnimationActive ? 'bg-amber-500 animate-ping' : 'bg-zinc-600'}`} />
                  <span className="font-bold">Trình Mô Phỏng Khung Hình Động (Live Glitch Animation)</span>
                </div>
                
                {/* Simulation Toggle */}
                <button
                  onClick={() => setGlitchAnimationActive(!glitchAnimationActive)}
                  className={`px-3 py-1 text-[9px] font-bold rounded-lg transition-all border cursor-pointer active:scale-95 ${
                    glitchAnimationActive 
                      ? 'bg-amber-600/20 border-amber-500/40 text-amber-400 hover:bg-amber-600/30' 
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  {glitchAnimationActive ? "DỪNG MÔ PHỎNG" : "BẮT ĐẦU MÔ PHỎNG"}
                </button>
              </div>

              {/* FPS Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[9px] font-mono">
                  <span className="text-zinc-500">Tốc độ khung hình (Animation FPS):</span>
                  <span className="text-amber-400 font-bold">{glitchFPS} khung hình/giây (FPS)</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="45"
                  step="1"
                  value={glitchFPS}
                  onChange={(e) => setGlitchFPS(Number(e.target.value))}
                  disabled={!glitchAnimationActive}
                  className={`w-full cursor-pointer h-1 rounded-lg accent-amber-500 bg-zinc-950 ${!glitchAnimationActive && 'opacity-40 cursor-not-allowed'}`}
                />
              </div>
            </div>

            {/* Canvas Container with Custom Zoom */}
            <div className="bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 flex items-center justify-center overflow-auto min-h-[160px] max-h-[260px] custom-scrollbar">
              <div 
                style={{ transform: `scale(${visualZoom})`, transformOrigin: 'center center' }} 
                className="transition-transform duration-200"
              >
                <canvas 
                  ref={canvasRef} 
                  className="image-render-pixelated shadow-lg border border-zinc-850 bg-black"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </div>

            <p className="text-[9px] text-zinc-500 font-mono leading-relaxed bg-zinc-900/40 p-2 rounded-lg border border-zinc-900">
              🎨 <strong>GHI CHÚ HÌNH ẢNH:</strong> Từng pixel trên lưới hiển thị tương ứng với byte dữ liệu. Byte đã được chỉnh sửa được đánh dấu bằng màu <span className="text-rose-500 font-bold animate-pulse">Cam / Đỏ nhấp nháy</span> để bạn quan sát vị trí thay đổi của lỗi trong cấu trúc nhị phân một cách trực quan trước khi kết xuất!
            </p>

          </div>

        </div>
      )}

      {/* DETAILED ADVICE & GUIDANCE FOOTER */}
      <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-850 text-[10px] font-mono text-zinc-400 leading-relaxed">
        <span className="text-amber-400 font-bold block mb-1">💡 HƯỚNG DẪN TẠO HIỆU ỨNG (GLITCH ART & SONIFICATION):</span>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong className="text-zinc-200">Sửa vùng Header (byte 0 đến {stats.headerSize}):</strong> Thích hợp làm lỗi định dạng tệp để tạo các hiệu ứng âm thô độc lạ. Tuy nhiên, nó sẽ khiến trình duyệt không mở được bằng bộ nén thông thường (báo lỗi giải mã).
          </li>
          <li>
            <strong className="text-zinc-200">Sửa vùng Body dữ liệu (từ byte {stats.headerSize} trở đi):</strong> Trực tiếp làm nhiễu sóng âm, dịch khối màu hoặc làm móp méo dữ liệu thô nhưng vẫn đảm bảo tệp tin có thể phát được hoặc mở được trên các phần mềm nghe nhạc/xem ảnh tiêu chuẩn sau khi xuất.
          </li>
        </ul>
      </div>

    </div>
  );
}
