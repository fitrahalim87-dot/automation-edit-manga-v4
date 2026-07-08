import React, { useRef, useEffect, useState } from "react";
import { MangaPanel } from "../types";
import { Film, Save, Download, Play, Pause, RefreshCw, Volume2, Sparkles, Smartphone, Monitor, Maximize, Minimize, Zap, Undo, CheckCircle } from "lucide-react";

interface CanvasRendererProps {
  panels: MangaPanel[];
  narrationAudioUrl: string | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentTime: number;
  onUpdateTime: (time: number) => void;
  activePanelIndexOverride?: number;

  // Smart Tapping Lifted properties
  isSyncing?: boolean;
  tapsCompleted?: boolean;
  lastTapTime?: number;
  tapHistory?: { lastTapTime: number; syncIndex: number }[];
  isTappingMode?: boolean;
  currentSyncIndex?: number | null;
  onStartSyncSession?: () => void;
  onCancelSyncSession?: () => void;
  onHandleTap?: () => void;
  onHandleUndo?: () => void;
  onSetTapsCompleted?: (val: boolean) => void;

  activeTab?: "standard" | "cubit" | "ketukan";

  verticalConfig: any;
  setVerticalConfig: (cfg: any) => void;
  horizontalConfig: any;
  setHorizontalConfig: (cfg: any) => void;
  squareConfig: any;
  setSquareConfig: (cfg: any) => void;
}

// Helper function to dynamically detect focal areas (speech bubbles or action hotspots) in manga panels using pixel contrast analysis
function analyzeMangaPanel(img: HTMLImageElement): { x: number; y: number }[] {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 60;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return [
        { x: 0.15, y: -0.15 },
        { x: 0.0, y: 0.0 },
        { x: -0.15, y: 0.15 }
      ];
    }
    ctx.drawImage(img, 0, 0, 60, 60);
    const imgData = ctx.getImageData(0, 0, 60, 60);
    const data = imgData.data;

    const gridSize = 6;
    const blockSize = 10;
    const blocks: { x: number; y: number; brightness: number; contrast: number; score: number }[] = [];

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let totalBrightness = 0;
        let minPixel = 255;
        let maxPixel = 0;
        let count = 0;

        for (let py = 0; py < blockSize; py++) {
          for (let px = 0; px < blockSize; px++) {
            const ix = (gx * blockSize + px);
            const iy = (gy * blockSize + py);
            const idx = (iy * 60 + ix) * 4;
            if (idx >= data.length) continue;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const brightness = (r + g + b) / 3;

            totalBrightness += brightness;
            if (brightness < minPixel) minPixel = brightness;
            if (brightness > maxPixel) maxPixel = brightness;
            count++;
          }
        }

        const avgBrightness = totalBrightness / (count || 1);
        const contrast = maxPixel - minPixel;
        const relX = (gx + 0.5) / gridSize - 0.5; // -0.5 to 0.5 coordinate
        const relY = (gy + 0.5) / gridSize - 0.5; // -0.5 to 0.5 coordinate

        // High contrast blocks represent key details, bright blocks represent text bubbles
        const score = contrast * 1.5 + (255 - avgBrightness) * 0.3;

        blocks.push({
          x: relX,
          y: relY,
          brightness: avgBrightness,
          contrast: contrast,
          score: score
        });
      }
    }

    // Manga panels are scanned from Top-Right (Panel 1) -> Center -> Bottom-Left (Panel 2)
    const topRightBlocks = blocks.filter(b => b.x >= -0.15 && b.y <= 0.15).sort((a, b) => b.score - a.score);
    const middleBlocks = blocks.filter(b => Math.abs(b.x) <= 0.25 && Math.abs(b.y) <= 0.25).sort((a, b) => b.score - a.score);
    const bottomLeftBlocks = blocks.filter(b => b.x <= 0.15 && b.y >= -0.15).sort((a, b) => b.score - a.score);

    const h1 = topRightBlocks[0] || { x: 0.15, y: -0.15 };
    const h2 = middleBlocks[0] || { x: 0.0, y: 0.0 };
    const h3 = bottomLeftBlocks[0] || { x: -0.15, y: 0.15 };

    return [
      { x: h1.x, y: h1.y },
      { x: h2.x, y: h2.y },
      { x: h3.x, y: h3.y }
    ];
  } catch (err) {
    console.warn("Manga analysis failed, utilizing robust default path:", err);
    return [
      { x: 0.18, y: -0.18 },
      { x: 0.0, y: 0.0 },
      { x: -0.18, y: 0.18 }
    ];
  }
}

function analyzeMangaFlow95(img: HTMLImageElement): { x: number; y: number }[] {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 60;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return [
        { x: 0.2, y: -0.2 },
        { x: -0.2, y: -0.2 },
        { x: 0.2, y: 0.2 },
        { x: -0.2, y: 0.2 }
      ];
    }
    ctx.drawImage(img, 0, 0, 60, 60);
    const imgData = ctx.getImageData(0, 0, 60, 60);
    const data = imgData.data;

    const gridSize = 6;
    const blockSize = 10;
    const blocks: { x: number; y: number; brightness: number; contrast: number; score: number }[] = [];

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let totalBrightness = 0;
        let minPixel = 255;
        let maxPixel = 0;
        let count = 0;

        for (let py = 0; py < blockSize; py++) {
          for (let px = 0; px < blockSize; px++) {
            const ix = (gx * blockSize + px);
            const iy = (gy * blockSize + py);
            const idx = (iy * 60 + ix) * 4;
            if (idx >= data.length) continue;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const brightness = (r + g + b) / 3;

            totalBrightness += brightness;
            if (brightness < minPixel) minPixel = brightness;
            if (brightness > maxPixel) maxPixel = brightness;
            count++;
          }
        }

        const avgBrightness = totalBrightness / (count || 1);
        const contrast = maxPixel - minPixel;
        const relX = (gx + 0.5) / gridSize - 0.5;
        const relY = (gy + 0.5) / gridSize - 0.5;

        const score = contrast * 1.5 + (255 - avgBrightness) * 0.4;

        blocks.push({
          x: relX,
          y: relY,
          brightness: avgBrightness,
          contrast: contrast,
          score: score
        });
      }
    }

    const tr = blocks.filter(b => b.x >= -0.1 && b.y <= 0.1).sort((a, b) => b.score - a.score)[0] || { x: 0.2, y: -0.2 };
    const tl = blocks.filter(b => b.x <= 0.1 && b.y <= 0.1).sort((a, b) => b.score - a.score)[0] || { x: -0.2, y: -0.2 };
    const br = blocks.filter(b => b.x >= -0.1 && b.y >= -0.1).sort((a, b) => b.score - a.score)[0] || { x: 0.2, y: 0.2 };
    const bl = blocks.filter(b => b.x <= 0.1 && b.y >= -0.1).sort((a, b) => b.score - a.score)[0] || { x: -0.2, y: 0.2 };

    return [
      { x: tr.x, y: tr.y },
      { x: tl.x, y: tl.y },
      { x: br.x, y: br.y },
      { x: bl.x, y: bl.y }
    ];
  } catch (err) {
    return [
      { x: 0.2, y: -0.2 },
      { x: -0.2, y: -0.2 },
      { x: 0.2, y: 0.2 },
      { x: -0.2, y: 0.2 }
    ];
  }
}

export const CanvasRenderer: React.FC<CanvasRendererProps> = ({
  panels,
  narrationAudioUrl,
  isPlaying,
  onTogglePlay,
  currentTime,
  onUpdateTime,
  activePanelIndexOverride,
  isSyncing = false,
  tapsCompleted = false,
  lastTapTime = 0,
  tapHistory = [],
  isTappingMode = false,
  currentSyncIndex = null,
  onStartSyncSession,
  onCancelSyncSession,
  onHandleTap,
  onHandleUndo,
  onSetTapsCompleted,
  activeTab = "standard",
  verticalConfig,
  setVerticalConfig,
  horizontalConfig,
  setHorizontalConfig,
  squareConfig,
  setSquareConfig
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const exportAnimFrameRef = useRef<number | null>(null);
  const isExportCancelledRef = useRef<boolean>(false);

  // Locked full screen state to blow up canvas player width (Theatre Mode style)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Background style selection ("hitam" | "putih" | "abu" | "navy" | "kabur" | "custom")
  const [bgStyle, setBgStyle] = useState<"hitam" | "putih" | "abu" | "navy" | "kabur" | "custom">(() => {
    const saved = localStorage.getItem("manga_recap_bg_style");
    return (saved as any) || "kabur";
  });

  const [customBgUrl, setCustomBgUrl] = useState<string | null>(() => {
    return localStorage.getItem("manga_recap_custom_bg_url");
  });

  // Watchers to save bgStyle to localStorage
  useEffect(() => {
    localStorage.setItem("manga_recap_bg_style", bgStyle);
  }, [bgStyle]);

  // Video format (codec) and quality (bitrate) states
  const [videoCodec, setVideoCodec] = useState<string>(() => {
    return localStorage.getItem("manga_recap_video_codec") || "mp4-high";
  });

  const [videoBitrate, setVideoBitrate] = useState<string>(() => {
    return localStorage.getItem("manga_recap_video_bitrate") || "2mbps";
  });

  useEffect(() => {
    localStorage.setItem("manga_recap_video_codec", videoCodec);
  }, [videoCodec]);

  useEffect(() => {
    localStorage.setItem("manga_recap_video_bitrate", videoBitrate);
  }, [videoBitrate]);

  // Export recording states
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [localExportTime, setLocalExportTime] = useState(0);

  // Locked aspect ratio to 16:9 YouTube Normal format
  const aspectRatio = "16:9";

  // Voice Over / Speech synthesis toggle state for Method 1
  const [useAutoTTS, setUseAutoTTS] = useState<boolean>(true);

  // Selected category for Cubit & Geser settings ("vertical" | "horizontal" | "square")
  const [selectedCubitCategory, setSelectedCubitCategory] = useState<"vertical" | "horizontal" | "square">("vertical");

  // Track loaded URLs for React layout reactiveness
  const [loadedUrls, setLoadedUrls] = useState<Record<string, boolean>>({});

  const totalDuration = panels.reduce((acc, p) => acc + Number(p.duration || 4), 0);

  // Determine drawing time based on export state
  const drawTime = isExporting ? localExportTime : currentTime;

  // Active panel details derived directly from standard linear timeline coordinates
  let activePanelIndex = 0;
  let activePanelTime = 0;

  if (activePanelIndexOverride !== undefined && activePanelIndexOverride !== null && !isExporting) {
    activePanelIndex = activePanelIndexOverride;
    // Calculate simulated active panel time
    let accumulatedBefore = 0;
    for (let i = 0; i < activePanelIndex; i++) {
      accumulatedBefore += Number(panels[i]?.duration || 4);
    }
    activePanelTime = Math.max(0, drawTime - accumulatedBefore);
  } else if (panels.length > 0) {
    let accumulated = 0;
    let found = false;

    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      const pDuration = Number(panel.duration || 4);
      if (drawTime >= accumulated && drawTime < accumulated + pDuration) {
        activePanelIndex = i;
        activePanelTime = drawTime - accumulated;
        found = true;
        break;
      }
      accumulated += pDuration;
    }

    if (!found) {
      // Default to the final storyboard panel if out of range
      activePanelIndex = panels.length - 1;
      activePanelTime = Number(panels[panels.length - 1]?.duration || 4);
    }
  }

  // Method 1: Automatic Speech Synthesis narration synced dynamically to panel index changes
  useEffect(() => {
    if (!useAutoTTS || !isPlaying) {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    // Skip TTS reading if a customized voice recording is uploaded and active
    if (narrationAudioUrl) return;

    if (panels.length > 0) {
      const activePanel = panels[activePanelIndex];
      if (activePanel && activePanel.subtitle) {
        if (typeof window !== "undefined" && window.speechSynthesis) {
          window.speechSynthesis.cancel();

          // Build energetic voiceover parameters for standard Indonesian speak patterns
          const utterance = new SpeechSynthesisUtterance(activePanel.subtitle);
          
          const voices = window.speechSynthesis.getVoices();
          const indVoice = voices.find(
            (v) =>
              v.lang.startsWith("id") ||
              v.lang.startsWith("id-ID") ||
              v.name.toLowerCase().includes("indonesian")
          );
          if (indVoice) {
            utterance.voice = indVoice;
          }
          utterance.lang = "id-ID";
          utterance.rate = 1.1; // Balanced dynamic speech rate of manga recap channel
          utterance.pitch = 1.0;
          
          window.speechSynthesis.speak(utterance);
        }
      }
    }

    return () => {
      // Ensure clean cancellation on active index hop
    };
  }, [activePanelIndex, isPlaying, useAutoTTS, panels, narrationAudioUrl]);

  // Load narration audio element helper
  useEffect(() => {
    if (narrationAudioUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = narrationAudioUrl;
        audioRef.current.load();
      } else {
        const audio = new Audio(narrationAudioUrl);
        audio.preload = "auto";
        audioRef.current = audio;
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    }
  }, [narrationAudioUrl]);

  // Sync Audio Playback speed or start/stop states
  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.currentTime = currentTime;
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Sync vocal audio playhead on timeline seek, reset, or when playing drifting out from state
  useEffect(() => {
    if (isExporting) return; // Skip standard sync during export to prevent audio stuttering
    if (audioRef.current) {
      const diff = Math.abs(audioRef.current.currentTime - currentTime);
      if (diff > 0.35) {
        audioRef.current.currentTime = currentTime;
      }
    }
  }, [currentTime, isExporting]);

  // Image caching to avoid flickering during direct canvas draws
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({});
  const hotspotsCacheRef = useRef<Record<string, { x: number; y: number }[]>>({});
  const hotspotsCache95Ref = useRef<Record<string, { x: number; y: number }[]>>({});

  // Proactively preload and cache all manga panels in the background
  useEffect(() => {
    panels.forEach((p) => {
      if (!imageCacheRef.current[p.url]) {
        const loadImg = new Image();
        loadImg.crossOrigin = "anonymous";
        loadImg.src = p.url;
        loadImg.onload = () => {
          imageCacheRef.current[p.url] = loadImg;
          setLoadedUrls((prev) => ({ ...prev, [p.url]: true }));
        };
      } else {
        if (!loadedUrls[p.url]) {
          setLoadedUrls((prev) => ({ ...prev, [p.url]: true }));
        }
      }
    });
  }, [panels]);

  // Safely dispose of any active rendering animation frames on component unmount
  useEffect(() => {
    return () => {
      if (exportAnimFrameRef.current !== null) {
        cancelAnimationFrame(exportAnimFrameRef.current);
      }
    };
  }, []);

  // Core Drawing Engine - draws any timeline position on any arbitrary canvas at peak performance
  const drawFrameDirectly = (
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    timeValue: number,
    isAnimated: boolean
  ) => {
    if (panels.length === 0) return;

    // Determine drawing time based on export state
    const drawTime = timeValue;

    // Active panel details derived directly from standard linear timeline coordinates
    let activeIndex = 0;
    let activeTime = 0;

    if (activePanelIndexOverride !== undefined && activePanelIndexOverride !== null && !isExporting) {
      activeIndex = activePanelIndexOverride;
      // Calculate simulated active panel time
      let accumulatedBefore = 0;
      for (let i = 0; i < activeIndex; i++) {
        accumulatedBefore += Number(panels[i]?.duration || 4);
      }
      activeTime = Math.max(0, drawTime - accumulatedBefore);
    } else {
      let accumulated = 0;
      let found = false;

      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        const pDuration = Number(panel.duration || 4);
        if (drawTime >= accumulated && drawTime < accumulated + pDuration) {
          activeIndex = i;
          activeTime = drawTime - accumulated;
          found = true;
          break;
        }
        accumulated += pDuration;
      }

      if (!found) {
        // Default to the final storyboard panel if out of range
        activeIndex = panels.length - 1;
        activeTime = Number(panels[panels.length - 1]?.duration || 4);
      }
    }

    const panel = panels[activeIndex];
    if (!panel) return;

    const drawPanelFrame = (
      idx: number,
      progressVal: number,
      alpha: number,
      xShift: number = 0,
      yShift: number = 0,
      extraScale: number = 1.0
    ) => {
      const p = panels[idx];
      if (!p) return;
      const pImg = imageCacheRef.current[p.url];
      if (!pImg) return;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (extraScale !== 1.0 || xShift !== 0 || yShift !== 0) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.translate(xShift, yShift);
        ctx.scale(extraScale, extraScale);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
      }

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // We want the viewport to always be 100% of the canvas to avoid artificial column boundaries ("bingkai")
      const sizePercent = 100;
      const viewportW = canvas.width;
      const viewportH = canvas.height;
      const viewportRatio = viewportW / viewportH;

      const imgRatio = pImg.width / pImg.height;
      let drawW, drawH;
      if (imgRatio > viewportRatio) {
        // Landscape wider than 16:9 -> fit width to viewport, calculate height
        drawW = viewportW;
        drawH = viewportW / imgRatio;
      } else {
        // Vertical or square -> fit height to viewport, calculate width
        drawH = viewportH;
        drawW = viewportH * imgRatio;
      }

      // Easing calculation
      const easingType = p.easing || 'smooth';
      let easedP = progressVal;
      if (easingType === 'linear') {
        easedP = progressVal;
      } else if (easingType === 'ease-in-out') {
        easedP = progressVal < 0.5 
          ? 4 * progressVal * progressVal * progressVal 
          : 1 - Math.pow(-2 * progressVal + 2, 3) / 2;
      } else {
        easedP = Math.sin((progressVal * Math.PI) / 2);
      }

      let scaleVal = 1.0;
      let finalOffsetX = 0;
      let finalOffsetY = 0;

      if (imgRatio < 0.9) {
        // Vertikal: Pan Vertikal (dari atas ke bawah), gambarnya sedikit diperbesar
        // Khusus vertikal aja.
        scaleVal = verticalConfig.initialScale + easedP * verticalConfig.zoomSpeed;
        finalOffsetX = (verticalConfig.offsetX / 100) * viewportW;
        finalOffsetY = (0.5 - easedP) * (drawH * scaleVal - viewportH) + (verticalConfig.offsetY / 100) * viewportH;
      } else if (imgRatio > 1.1) {
        // Horizontal: slow zoom, gak full layar, sedikit diperbesar
        scaleVal = horizontalConfig.initialScale + easedP * horizontalConfig.zoomSpeed;
        finalOffsetX = (horizontalConfig.offsetX / 100) * viewportW;
        finalOffsetY = (horizontalConfig.offsetY / 100) * viewportH;
      } else {
        // Square: slow zoom, gak full layar
        scaleVal = squareConfig.initialScale + easedP * squareConfig.zoomSpeed;
        finalOffsetX = (squareConfig.offsetX / 100) * viewportW;
        finalOffsetY = (squareConfig.offsetY / 100) * viewportH;
      }

      // Draw standard shadow ONLY if we have an artificial border (which is not used here)
      if (sizePercent < 100) {
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.98)";
        ctx.shadowBlur = 45;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = "#000000";
        ctx.fillRect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
        ctx.restore();
      }

      // Fill flat background within viewport ONLY if style is black or white.
      // For "kabur", we do not fill any flat background so the blurred backdrop remains fully visible.
      if (bgStyle === "hitam") {
        ctx.save();
        ctx.fillStyle = "#000000";
        ctx.fillRect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
        ctx.restore();
      } else if (bgStyle === "putih") {
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
        ctx.restore();
      }

      // Clip canvas drawing inside viewport
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
      ctx.clip();

      ctx.translate(cx + finalOffsetX, cy + finalOffsetY);
      ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 10;
      ctx.drawImage(
        pImg,
        - (drawW * scaleVal) / 2,
        - (drawH * scaleVal) / 2,
        drawW * scaleVal,
        drawH * scaleVal
      );

      ctx.restore(); // undo clip
      ctx.restore(); // undo translate & alpha
    };

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const activeImg = imageCacheRef.current[panel.url];
    if (!activeImg) {
      // Drawing beautiful placeholders
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f59e0b";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Sedang memuat frame sketsa...", canvas.width / 2, canvas.height / 2);
      return;
    }

    const duration = panel.duration || 4;
    const progress = Math.min(activeTime / duration, 1.0); // 0 to 1

    // --- DRAW 1. DYNAMIC BACKGROUND (HITAM, PUTIH, ABU, NAVY, KABUR, CUSTOM) ---
    if (bgStyle === "hitam") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (bgStyle === "putih") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (bgStyle === "abu") {
      ctx.fillStyle = "#292524";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (bgStyle === "navy") {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (bgStyle === "custom") {
      ctx.save();
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.filter = "blur(4px) brightness(0.50) saturate(0.85)";
      
      let customBgImg: HTMLImageElement | null = null;
      if (customBgUrl) {
        if (!imageCacheRef.current[customBgUrl]) {
          const img = new Image();
          img.src = customBgUrl;
          img.onload = () => {
            imageCacheRef.current[customBgUrl] = img;
            setLoadedUrls(prev => ({ ...prev, [customBgUrl]: true }));
          };
        }
        customBgImg = imageCacheRef.current[customBgUrl] || null;
      }

      const bgImgToDraw = customBgImg || activeImg;
      if (bgImgToDraw) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(1.05, 1.05);
        
        const canvasRatio = canvas.width / canvas.height;
        const imgRatio = bgImgToDraw.width / bgImgToDraw.height;
        let drawW, drawH;
        if (imgRatio > canvasRatio) {
          drawH = canvas.height;
          drawW = canvas.height * imgRatio;
        } else {
          drawW = canvas.width;
          drawH = canvas.width / imgRatio;
        }
        ctx.drawImage(bgImgToDraw, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }
      ctx.restore();
    } else { // "kabur"
      ctx.save();
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.filter = "blur(4px) brightness(0.48) saturate(0.85)";
      if (activeImg) {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(1.08, 1.08);
        
        const canvasRatio = canvas.width / canvas.height;
        const imgRatio = activeImg.width / activeImg.height;
        let drawW, drawH;
        if (imgRatio > canvasRatio) {
          drawH = canvas.height;
          drawW = canvas.height * imgRatio;
        } else {
          drawW = canvas.width;
          drawH = canvas.width / imgRatio;
        }
        ctx.drawImage(activeImg, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }
      
      const transitionDuration = 0.6;
      if (activeIndex > 0 && activeTime < transitionDuration) {
        const prevPanel = panels[activeIndex - 1];
        const prevImg = imageCacheRef.current[prevPanel.url];
        if (prevImg) {
          const tProgress = activeTime / transitionDuration;
          ctx.save();
          ctx.globalAlpha = 1.0 - tProgress;
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.scale(1.08, 1.08);
          
          const canvasRatio = canvas.width / canvas.height;
          const imgRatio = prevImg.width / prevImg.height;
          let drawW, drawH;
          if (imgRatio > canvasRatio) {
            drawH = canvas.height;
            drawW = canvas.height * imgRatio;
          } else {
            drawW = canvas.width;
            drawH = canvas.width / imgRatio;
          }
          ctx.drawImage(prevImg, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();
        }
      }
      ctx.restore();

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)"; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // --- DRAW 2. CUSTOMIZABLE CELL PANEL TRANSITIONS ---
    const transitionDuration = 0.6;
    const curTransition = panel.transitionType || "crossfade";

    if (activeIndex > 0 && activeTime < transitionDuration) {
      const prevPanel = panels[activeIndex - 1];
      const prevImg = imageCacheRef.current[prevPanel.url];
      
      if (prevImg) {
        const tProgress = activeTime / transitionDuration;

        if (curTransition === "crossfade") {
          drawPanelFrame(activeIndex - 1, 1.0, 1.0 - tProgress, 0, 0, 1.0);
          drawPanelFrame(activeIndex, progress, tProgress, 0, 0, 1.0);
        } else if (curTransition === "slide-left") {
          drawPanelFrame(activeIndex - 1, 1.0, 1.0, -tProgress * canvas.width, 0, 1.0);
          drawPanelFrame(activeIndex, progress, 1.0, (1.0 - tProgress) * canvas.width, 0, 1.0);
        } else if (curTransition === "slide-right") {
          drawPanelFrame(activeIndex - 1, 1.0, 1.0, tProgress * canvas.width, 0, 1.0);
          drawPanelFrame(activeIndex, progress, 1.0, -(1.0 - tProgress) * canvas.width, 0, 1.0);
        } else if (curTransition === "zoom-fade") {
          drawPanelFrame(activeIndex - 1, 1.0, 1.0 - tProgress, 0, 0, 1.0 - tProgress * 0.15);
          drawPanelFrame(activeIndex, progress, tProgress, 0, 0, 0.85 + tProgress * 0.15);
        } else {
          drawPanelFrame(activeIndex, progress, 1.0, 0, 0, 1.0);
        }
      } else {
        drawPanelFrame(activeIndex, progress, 1.0, 0, 0, 1.0);
      }
    } else {
      drawPanelFrame(activeIndex, progress, 1.0, 0, 0, 1.0);
    }

    // --- DRAW 3. CINEMATIC PAGE-TURN FLASH EFFECT ---
    if (activeTime < 0.25) {
      const flashAlpha = ((0.25 - activeTime) / 0.25) * 0.45;
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Shaky speed lines for action sections
    if (panel.motionType === "shaky-action") {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 1.5;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      for (let i = 0; i < 40; i++) {
        const edgeX = Math.random() < 0.5 ? 0 : canvas.width;
        const edgeY = Math.random() * canvas.height;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(edgeX, edgeY);
        ctx.stroke();
      }
      ctx.restore();
    }

    // --- DRAW 5. CHROMA SHIFT PIXEL SHIELD ---
    ctx.save();
    ctx.globalAlpha = 0.007;
    for (let i = 0; i < 8; i++) {
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const w = (0.2 + Math.random() * 0.8) * canvas.width;
      const h = (0.2 + Math.random() * 0.8) * canvas.height;
      const x = Math.random() * (canvas.width - w);
      const y = Math.random() * (canvas.height - h);
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  };

  // Standard preview/timeline drawing subscription
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || panels.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isSubscribed = true;
    drawFrameDirectly(canvas, ctx, drawTime, isPlaying || isExporting);
    return () => {
      isSubscribed = false;
    };
  }, [activePanelIndex, activePanelTime, drawTime, panels, aspectRatio, bgStyle, isPlaying, isExporting]);

  const _oldRenderLoop = () => {
    const canvas = canvasRef.current;
    if (!canvas || panels.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isSubscribed = true;
    const panel = panels[activePanelIndex];
    if (!panel) return;

    const drawPanelFrame = (idx: number, progressVal: number, alpha: number, xShift: number = 0, yShift: number = 0, extraScale: number = 1.0) => {
      const p = panels[idx];
      if (!p) return;
      const pImg = imageCacheRef.current[p.url];
      if (!pImg) return;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (extraScale !== 1.0 || xShift !== 0 || yShift !== 0) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.translate(xShift, yShift);
        ctx.scale(extraScale, extraScale);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
      }

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Deterministic viewport sizing based on chosen animation style
      const mType = p.motionType;
      let sizePercent = 65;
      if (mType === 'random-50-100') {
        const str = p.id || "";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const min = 50;
        const max = 100;
        const range = max - min;
        const val = Math.abs(hash) % (range + 1);
        sizePercent = min + val;
      } else if (mType === 'random-45-75') {
        const str = p.id || "";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const min = 45;
        const max = 75;
        const range = max - min;
        const val = Math.abs(hash) % (range + 1);
        sizePercent = min + val;
      } else if (mType === '100-manga-flow' || mType === 'manga-multi-focus') {
        sizePercent = 100;
      } else if (mType && mType.startsWith("100-")) {
        sizePercent = 100;
      } else if (mType && (mType.startsWith("65-") || mType.startsWith("80-"))) {
        sizePercent = 65;
      } else {
        sizePercent = 65; // Default sizing for legacy or other options
      }

      const viewportW = canvas.width * (sizePercent / 100);
      const viewportH = canvas.height;
      const viewportRatio = viewportW / viewportH;

      const imgRatio = pImg.width / pImg.height;
      let drawW, drawH;
      if (imgRatio > viewportRatio) {
        // Image is wider than viewport -> fit height to viewport
        drawH = viewportH;
        drawW = viewportH * imgRatio;
      } else {
        // Image is taller than viewport -> fit width to viewport
        drawW = viewportW;
        drawH = viewportW / imgRatio;
      }

      // Easing calculation
      const easingType = p.easing || 'smooth';
      let easedP = progressVal;
      if (easingType === 'linear') {
        easedP = progressVal;
      } else if (easingType === 'ease-in-out') {
        easedP = progressVal < 0.5 
          ? 4 * progressVal * progressVal * progressVal 
          : 1 - Math.pow(-2 * progressVal + 2, 3) / 2;
      } else {
        easedP = Math.sin((progressVal * Math.PI) / 2);
      }

      let scaleVal = 1.0;
      let finalOffsetX = 0;
      let finalOffsetY = 0;

      // Determine active motion action
      let activeMotion: string = mType;
      if (mType === "random-45-75") {
        const str = p.id || "";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const options = ["pan-top-to-bottom", "pan-bottom-to-top"];
        const idx = Math.abs(hash) % options.length;
        activeMotion = options[idx];
      } else if (mType === "80-random" || mType === "65-random" || mType === "random-50-100") {
        const possibleMotions = [
          "pan-top-to-bottom",
          "pan-bottom-to-top",
          "diagonal-right-to-left"
        ];
        const str = p.id || "";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const idx = Math.abs(hash) % possibleMotions.length;
        activeMotion = possibleMotions[idx];
      } else {
        if (mType === "80-pan-top-to-bottom" || mType === "65-pan-top-to-bottom" || mType === "100-pan-top-to-bottom") {
          activeMotion = "pan-top-to-bottom";
        } else if (mType === "80-pan-bottom-to-top" || mType === "65-pan-bottom-to-top" || mType === "100-pan-bottom-to-top") {
          activeMotion = "pan-bottom-to-top";
        } else if (mType === "100-diagonal-right-to-left") {
          activeMotion = "diagonal-right-to-left";
        }
      }

      if (activeMotion === "zoom-in") {
        scaleVal = 1.05 + easedP * 0.35; // 105% to 140%
      } else if (activeMotion === "zoom-out") {
        scaleVal = 1.40 - easedP * 0.35; // 140% to 105%
      } else if (activeMotion === "pan-top-to-bottom") {
        scaleVal = 1.30;
        const extraH = (drawH * scaleVal) - viewportH;
        finalOffsetY = (extraH / 2) - easedP * extraH;
      } else if (activeMotion === "pan-bottom-to-top") {
        scaleVal = 1.30;
        const extraH = (drawH * scaleVal) - viewportH;
        finalOffsetY = (-extraH / 2) + easedP * extraH;
      } else if (activeMotion === "pan-left-to-right") {
        scaleVal = 1.30;
        const extraW = (drawW * scaleVal) - viewportW;
        finalOffsetX = (extraW / 2) - easedP * extraW;
      } else if (activeMotion === "pan-right-to-left") {
        scaleVal = 1.30;
        const extraW = (drawW * scaleVal) - viewportW;
        finalOffsetX = (-extraW / 2) + easedP * extraW;
      } else if (activeMotion === "diagonal-right-to-left") {
        scaleVal = 1.30;
        const extraW = (drawW * scaleVal) - viewportW;
        const extraH = (drawH * scaleVal) - viewportH;
        finalOffsetX = (-extraW / 2) + easedP * extraW;
        finalOffsetY = (extraH / 2) - easedP * extraH;
      } else if (activeMotion === "shaky-action") {
        scaleVal = 1.15;
        if (isPlaying) {
          finalOffsetX = Math.sin(activePanelTime * 65) * 6;
          finalOffsetY = Math.cos(activePanelTime * 55) * 6;
        }
      } else if (activeMotion === "100-manga-flow") {
        let spots = hotspotsCache95Ref.current[p.url];
        if (!spots) {
          spots = analyzeMangaFlow95(pImg);
          hotspotsCache95Ref.current[p.url] = spots;
        }
        const h1 = spots[0] || { x: 0.2, y: -0.2 };
        const h2 = spots[1] || { x: -0.2, y: -0.2 };
        const h3 = spots[2] || { x: 0.2, y: 0.2 };
        const h4 = spots[3] || { x: -0.2, y: 0.2 };

        let tgtX = 0;
        let tgtY = 0;
        let baseScale = 1.6;

        if (progressVal < 0.18) {
          tgtX = h1.x;
          tgtY = h1.y;
          baseScale = 1.6;
        } else if (progressVal < 0.30) {
          const t = (progressVal - 0.18) / 0.12;
          const easedT = Math.sin((t * Math.PI) / 2);
          tgtX = h1.x + (h2.x - h1.x) * easedT;
          tgtY = h1.y + (h2.y - h1.y) * easedT;
          baseScale = 1.6;
        } else if (progressVal < 0.48) {
          tgtX = h2.x;
          tgtY = h2.y;
          baseScale = 1.6;
        } else if (progressVal < 0.60) {
          const t = (progressVal - 0.48) / 0.12;
          const easedT = Math.sin((t * Math.PI) / 2);
          tgtX = h2.x + (h3.x - h2.x) * easedT;
          tgtY = h2.y + (h3.y - h2.y) * easedT;
          baseScale = 1.6;
        } else if (progressVal < 0.78) {
          tgtX = h3.x;
          tgtY = h3.y;
          baseScale = 1.6;
        } else if (progressVal < 0.90) {
          const t = (progressVal - 0.78) / 0.12;
          const easedT = Math.sin((t * Math.PI) / 2);
          tgtX = h3.x + (h4.x - h3.x) * easedT;
          tgtY = h3.y + (h4.y - h3.y) * easedT;
          baseScale = 1.6;
        } else {
          tgtX = h4.x;
          tgtY = h4.y;
          baseScale = 1.6;
        }

        scaleVal = baseScale;
        finalOffsetX = -tgtX * drawW * scaleVal;
        finalOffsetY = -tgtY * drawH * scaleVal;
      } else if (activeMotion === "manga-multi-focus") {
        let spots = hotspotsCacheRef.current[p.url];
        if (!spots) {
          spots = analyzeMangaPanel(pImg);
          hotspotsCacheRef.current[p.url] = spots;
        }
        const h1 = spots[0] || { x: 0.15, y: -0.15 };
        const h2 = spots[1] || { x: 0.0, y: 0.0 };
        const h3 = spots[2] || { x: -0.15, y: 0.15 };

        let tgtX = 0;
        let tgtY = 0;
        let baseScale = 1.6;

        if (progressVal < 0.25) {
          tgtX = h1.x;
          tgtY = h1.y;
          baseScale = 1.6;
        } else if (progressVal < 0.45) {
          const t = (progressVal - 0.25) / 0.20;
          const easedT = Math.sin((t * Math.PI) / 2);
          tgtX = h1.x + (h2.x - h1.x) * easedT;
          tgtY = h1.y + (h2.y - h1.y) * easedT;
          baseScale = 1.6;
        } else if (progressVal < 0.70) {
          tgtX = h2.x;
          tgtY = h2.y;
          baseScale = 1.6;
        } else if (progressVal < 0.85) {
          const t = (progressVal - 0.70) / 0.15;
          const easedT = Math.sin((t * Math.PI) / 2);
          tgtX = h2.x + (h3.x - h2.x) * easedT;
          tgtY = h2.y + (h3.y - h2.y) * easedT;
          baseScale = 1.6;
        } else {
          tgtX = h3.x;
          tgtY = h3.y;
          baseScale = 1.6;
        }

        scaleVal = baseScale;
        finalOffsetX = -tgtX * drawW * scaleVal;
        finalOffsetY = -tgtY * drawH * scaleVal;
      } else {
        // Fallback or anything else (no more dynamic zoom fallback animations)
        scaleVal = 1.0;
      }

      // Draw standard elegant drop shadow rectangle behind viewport if it has a background visible
      if (sizePercent < 100) {
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.98)";
        ctx.shadowBlur = 45;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = "#000000";
        ctx.fillRect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
        ctx.restore();
      }

      // Fill flat background within the viewport bounds seamlessly
      ctx.save();
      if (bgStyle === "hitam") {
        ctx.fillStyle = "#000000";
      } else if (bgStyle === "putih") {
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle = "#1c1917";
      }
      ctx.fillRect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
      ctx.restore();

      // Clip canvas drawing specifically inside the widescreen viewport
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
      ctx.clip();

      ctx.translate(cx + finalOffsetX, cy + finalOffsetY);
      ctx.drawImage(
        pImg,
        - (drawW * scaleVal) / 2,
        - (drawH * scaleVal) / 2,
        drawW * scaleVal,
        drawH * scaleVal
      );

      ctx.restore(); // undo clip

      ctx.restore(); // Undo alpha and root state save
    };

    const draw = () => {
      if (!isSubscribed) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const activeImg = imageCacheRef.current[panel.url];
      if (!activeImg) {
        // Drawing beautiful dark-tech placeholder loading indicator
        ctx.fillStyle = "#1c1917";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#f59e0b";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Sedang memuat frame sketsa...", canvas.width / 2, canvas.height / 2);
        return;
      }

      // Calculation of Motion (Ken Burns Effect) based on activePanelTime
      const duration = panel.duration || 4;
      const progress = Math.min(activePanelTime / duration, 1.0); // 0 to 1

      // --- DRAW 1. DYNAMIC BACKGROUND (HITAM, PUTIH, ATAU KABUR) ---
      if (bgStyle === "hitam") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (bgStyle === "putih") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (bgStyle === "kabur") {
        ctx.save();
        ctx.fillStyle = "#1c1917"; // Dark brown/stone base fallback
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.filter = "blur(3px) brightness(0.40)";
        if (activeImg) {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.scale(1.5, 1.5);
          
          const canvasRatio = canvas.width / canvas.height;
          const imgRatio = activeImg.width / activeImg.height;
          let drawW, drawH;
          if (imgRatio > canvasRatio) {
            drawH = canvas.height;
            drawW = canvas.height * imgRatio;
          } else {
            drawW = canvas.width;
            drawH = canvas.width / imgRatio;
          }
          ctx.drawImage(activeImg, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();
        }
        
        const transitionDuration = 0.6;
        if (activePanelIndex > 0 && activePanelTime < transitionDuration) {
          const prevPanel = panels[activePanelIndex - 1];
          const prevImg = imageCacheRef.current[prevPanel.url];
          if (prevImg) {
            const tProgress = activePanelTime / transitionDuration;
            ctx.save();
            ctx.globalAlpha = 1.0 - tProgress;
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(1.5, 1.5);
            
            const canvasRatio = canvas.width / canvas.height;
            const imgRatio = prevImg.width / prevImg.height;
            let drawW, drawH;
            if (imgRatio > canvasRatio) {
              drawH = canvas.height;
              drawW = canvas.height * imgRatio;
            } else {
              drawW = canvas.width;
              drawH = canvas.width / imgRatio;
            }
            ctx.drawImage(prevImg, -drawW / 2, -drawH / 2, drawW, drawH);
            ctx.restore();
          }
        }
        ctx.restore();
      }

      // --- DRAW 2. CUSTOMIZABLE CELL PANEL TRANSITIONS ---
      const transitionDuration = 0.6; // 0.6s transition when panel changes
      const curTransition = panel.transitionType || "crossfade";

      if (activePanelIndex > 0 && activePanelTime < transitionDuration) {
        const prevPanel = panels[activePanelIndex - 1];
        const prevImg = imageCacheRef.current[prevPanel.url];
        
        if (prevImg) {
          const tProgress = activePanelTime / transitionDuration;

          if (curTransition === "crossfade") {
            // Draw previous panel fading out (with progress fixed at 1.0)
            drawPanelFrame(activePanelIndex - 1, 1.0, 1.0 - tProgress, 0, 0, 1.0);
            // Draw current panel fading in
            drawPanelFrame(activePanelIndex, progress, tProgress, 0, 0, 1.0);
          } else if (curTransition === "slide-left") {
            // Slide left: previous exits to the left, current enters from the right
            drawPanelFrame(activePanelIndex - 1, 1.0, 1.0, -tProgress * canvas.width, 0, 1.0);
            drawPanelFrame(activePanelIndex, progress, 1.0, (1.0 - tProgress) * canvas.width, 0, 1.0);
          } else if (curTransition === "slide-right") {
            // Slide right: previous exits to the right, current enters from the left
            drawPanelFrame(activePanelIndex - 1, 1.0, 1.0, tProgress * canvas.width, 0, 1.0);
            drawPanelFrame(activePanelIndex, progress, 1.0, -(1.0 - tProgress) * canvas.width, 0, 1.0);
          } else if (curTransition === "zoom-fade") {
            // Zoom-fade: previous zooms out and fades, current zooms in and fades in
            drawPanelFrame(activePanelIndex - 1, 1.0, 1.0 - tProgress, 0, 0, 1.0 - tProgress * 0.15);
            drawPanelFrame(activePanelIndex, progress, tProgress, 0, 0, 0.85 + tProgress * 0.15);
          } else {
            // "none": instant snap cut
            drawPanelFrame(activePanelIndex, progress, 1.0, 0, 0, 1.0);
          }
        } else {
          // Fallback if previous image is not cached
          drawPanelFrame(activePanelIndex, progress, 1.0, 0, 0, 1.0);
        }
      } else {
        // Standard single slide drawing (fully opaque)
        drawPanelFrame(activePanelIndex, progress, 1.0, 0, 0, 1.0);
      }

      // --- DRAW 3. CINEMATIC PAGE-TURN FLASH EFFECT ---
      if (activePanelTime < 0.25) {
        const flashAlpha = ((0.25 - activePanelTime) / 0.25) * 0.45;
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Shaky speed lines for action sections
      if (panel.motionType === "shaky-action") {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
        ctx.lineWidth = 1.5;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        for (let i = 0; i < 40; i++) {
          const edgeX = Math.random() < 0.5 ? 0 : canvas.width;
          const edgeY = Math.random() * canvas.height;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(edgeX, edgeY);
          ctx.stroke();
        }
        ctx.restore();
      }

      // --- DRAW 5. CHROMA SHIFT PIXEL SHIELD (CONTENT ID BYPASS & UNIQUE HASH ENFORCEMENT) ---
      ctx.save();
      ctx.globalAlpha = 0.007;
      for (let i = 0; i < 8; i++) {
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        const w = (0.2 + Math.random() * 0.8) * canvas.width;
        const h = (0.2 + Math.random() * 0.8) * canvas.height;
        const x = Math.random() * (canvas.width - w);
        const y = Math.random() * (canvas.height - h);
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();

      // Optional focus metadata corner removed for a clean presentation

      // --- DRAW 4. MODERN REEL CAPTIONS / SUBTITLE OVERLAY REMOVED FOR CLEAN VIDEO ---
    };

    // Trigger drawing once checked
    const activeImg = imageCacheRef.current[panel.url];
    if (!activeImg) {
      const loadImg = new Image();
      loadImg.crossOrigin = "anonymous";
      loadImg.src = panel.url;
      loadImg.onload = () => {
        imageCacheRef.current[panel.url] = loadImg;
        draw();
      };
    } else {
      draw();
    }

    return () => {
      isSubscribed = false;
    };
  };


  // FULL IN-BROWSER EXPORT RECORDER WITH AUDIO MIXING!
  const startRecordingHDExport = async () => {
    if (panels.length === 0) {
      alert("Buat storyboard/panel dan suara Anda sebelum melakukan ekspor video.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Pause first if currently playing to reset playhead cleanly
    if (isPlaying) {
      onTogglePlay();
    }

    setIsExporting(true);
    setExportProgress(0);
    onUpdateTime(0);

    // Keep track of parent canvas dimensions
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;

    // Set canvas dimensions to high-definition 720p constraints
    canvas.width = 1280;
    canvas.height = 720;

    // Give a brief delay for state propagation so both visual canvas and audio seek to 0
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Capture canvas video track (30 FPS as requested for standard high-smooth, cinematic output constraints)
    const canvasStream = canvas.captureStream(30);

    // Capture narration audio track if present
    let audioStream: MediaStream | null = null;
    const audioEl = audioRef.current;
    if (audioEl && narrationAudioUrl) {
      try {
        if ((audioEl as any).captureStream) {
          audioStream = (audioEl as any).captureStream();
        } else if ((audioEl as any).mozCaptureStream) {
          audioStream = (audioEl as any).mozCaptureStream();
        }
      } catch (err) {
        console.warn("Direct captureStream failed. Trying Web Audio API fallback", err);
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const actx = new AudioContextClass();
            const source = actx.createMediaElementSource(audioEl);
            const dest = actx.createMediaStreamDestination();
            source.connect(dest);
            source.connect(actx.destination); // Keep output audible
            audioStream = dest.stream;
          }
        } catch (webAudioErr) {
          console.error("Web Audio API capture failed:", webAudioErr);
        }
      }
    }

    // Combine visual video track and voice tracks into a single stream
    const combinedStream = new MediaStream();
    canvasStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));
    if (audioStream) {
      audioStream.getAudioTracks().forEach((track) => {
        combinedStream.addTrack(track);
        console.log("Successfully bundled audio track to export stream:", track);
      });
    }

    // Dynamically choose codec from user preference
    const getMimeForCodec = (codec: string): string => {
      if (typeof MediaRecorder === "undefined" || !(MediaRecorder as any).isTypeSupported) {
        return "";
      }

      let candidates: string[] = [];
      if (codec === "mp4-high") {
        candidates = [
          "video/mp4;codecs=avc1.640028,mp4a.40.2",
          "video/mp4;codecs=avc1.640028",
          "video/mp4;codecs=h264,aac",
          "video/mp4;codecs=h264",
          "video/mp4"
        ];
      } else if (codec === "mp4-baseline") {
        candidates = [
          "video/mp4;codecs=avc1.42001E,mp4a.40.2",
          "video/mp4;codecs=avc1.42001E",
          "video/mp4;codecs=h264,aac",
          "video/mp4;codecs=h264",
          "video/mp4"
        ];
      } else if (codec === "mp4-auto") {
        candidates = [
          "video/mp4;codecs=h264,aac",
          "video/mp4;codecs=h264",
          "video/mp4"
        ];
      } else if (codec === "webm-vp9") {
        candidates = [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp9",
          "video/webm"
        ];
      } else if (codec === "webm-vp8") {
        candidates = [
          "video/webm;codecs=vp8,opus",
          "video/webm;codecs=vp8",
          "video/webm"
        ];
      } else {
        // Auto: prioritize MP4 high profile, fall back to anything
        candidates = [
          "video/mp4;codecs=avc1.640028,mp4a.40.2",
          "video/mp4;codecs=avc1.640028",
          "video/mp4;codecs=h264,aac",
          "video/mp4;codecs=h264",
          "video/mp4",
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm"
        ];
      }

      // Find first supported
      for (const mime of candidates) {
        if ((MediaRecorder as any).isTypeSupported(mime)) {
          return mime;
        }
      }

      // Ultimate fallback
      const fallbackMimes = [
        "video/mp4",
        "video/webm",
        ""
      ];
      for (const mime of fallbackMimes) {
        if (!mime || (MediaRecorder as any).isTypeSupported(mime)) {
          return mime;
        }
      }

      return "";
    };

    const getBitrateValue = (bitrate: string): number => {
      if (bitrate === "6mbps") return 6000000;
      if (bitrate === "4mbps") return 4000000;
      return 2000000; // default "2mbps"
    };

    const chosenMime = getMimeForCodec(videoCodec);
    const chosenBitrate = getBitrateValue(videoBitrate);

    let recorder: MediaRecorder;
    try {
      if (chosenMime) {
        recorder = new MediaRecorder(combinedStream, { 
          mimeType: chosenMime,
          videoBitsPerSecond: chosenBitrate,
          audioBitsPerSecond: 128000
        });
      } else {
        recorder = new MediaRecorder(combinedStream, {
          videoBitsPerSecond: chosenBitrate,
          audioBitsPerSecond: 128000
        });
      }
    } catch (e) {
      console.warn("MediaRecorder creation with options failed, falling back to basic recorder:", e);
      recorder = new MediaRecorder(combinedStream);
    }

    mediaRecorderRef.current = recorder;
    isExportCancelledRef.current = false;

    const dataChunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        dataChunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      // Revert drawing dimensions dynamically for UI responsiveness
      canvas.width = originalWidth;
      canvas.height = originalHeight;

      if (isExportCancelledRef.current) {
        setIsExporting(false);
        setExportProgress(0);
        setLocalExportTime(0);
        onUpdateTime(0);
        return;
      }

      // Wrap output with a friendly webm or mp4 media tag and stream it out
      const actualMime = recorder.mimeType || chosenMime || "video/webm";
      const fileExt = actualMime.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(dataChunks, { type: actualMime });
      const url = URL.createObjectURL(blob);
      
      // Auto download link formatted with correct file extension (default webm)
      const a = document.createElement("a");
      a.href = url;
      a.download = `MangaRecap_HD720pExport_${Date.now()}.${fileExt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setIsExporting(false);
      setExportProgress(100);
      setLocalExportTime(0);
      onUpdateTime(0);
    };

    recorder.start();

    // Reset local time head to starting checkpoint
    setLocalExportTime(0);

    // Play narration voice audio track directly in background if present
    if (audioEl && narrationAudioUrl) {
      audioEl.currentTime = 0;
      audioEl.play().catch((playErr) => {
        console.warn("Direct audio source play failed:", playErr);
      });
    }

    // Deterministic, ultra-smooth frame-by-frame ticker running at precise 30 FPS for export
    console.log("Starting WebM/MP4 Export. Total Duration:", totalDuration, "s | Panels:", panels.length, "mimeType:", chosenMime || "default");
    const ctx = canvas.getContext("2d");
    const startTimeStamp = performance.now();
    let currentFrame = 0;
    const fps = 30;
    const frameInterval = 1000 / fps; // 33.33ms

    const exportTick = () => {
      if (isExportCancelledRef.current) {
        console.log("HD Export loop has been cancelled.");
        return;
      }
      
      // Drive elapsed time directly from high-resolution real-world clock to sync perfectly with 1x speed MediaRecorder & Audio stream
      const realElapsed = (performance.now() - startTimeStamp) / 1000;
      const elapsed = Math.min(realElapsed, totalDuration);
      
      // Keep audio synced if present - using a relaxed threshold to prevent constant seeking (stuttering/choppiness)
      if (audioEl && narrationAudioUrl) {
        const audioDiff = audioEl.currentTime - elapsed;
        if (Math.abs(audioDiff) > 2.5) {
          audioEl.currentTime = elapsed;
        }
      }
      
      // Directly render canvas frame
      if (ctx) {
        drawFrameDirectly(canvas, ctx, elapsed, true);
      }

      currentFrame++;
      
      const currentProgress = Math.min((elapsed / totalDuration) * 100, 99);

      // Verify and print frames processing progress to logging console
      if (currentFrame % 30 === 0 || elapsed >= totalDuration) {
        console.log(`[Export Loop] Frame #${currentFrame} | Real Elapsed: ${realElapsed.toFixed(2)}s / ${totalDuration.toFixed(2)}s | Progress: ${currentProgress.toFixed(1)}%`);
      }

      // Sparing state updates to prevent CPU thrashing and frame drops
      if (currentFrame % 10 === 0 || elapsed >= totalDuration) {
        setExportProgress(currentProgress);
        setLocalExportTime(elapsed);
      }

      if (elapsed >= totalDuration) {
        console.log(`HD Export loop finished. Total frames: ${currentFrame}. Elapsed: ${realElapsed.toFixed(2)}s. Stopping recorder...`);
        if (recorder.state === "recording") {
          recorder.stop();
        }
        if (audioEl) {
          audioEl.pause();
          audioEl.currentTime = 0;
        }
      } else {
        // Schedule next tick exactly based on the next frame's ideal timestamp to let the encoder process at a robust pacing
        const nextFrameTargetTime = startTimeStamp + (currentFrame * frameInterval);
        const delay = Math.max(1, nextFrameTargetTime - performance.now());
        const nextId = setTimeout(exportTick, delay);
        exportAnimFrameRef.current = nextId as any;
      }
    };

    const initialId = setTimeout(exportTick, 1);
    exportAnimFrameRef.current = initialId as any;
  };

  const cancelHDExport = () => {
    isExportCancelledRef.current = true;
    
    // Stop the animation loop
    if (exportAnimFrameRef.current !== null) {
      cancelAnimationFrame(exportAnimFrameRef.current);
      clearTimeout(exportAnimFrameRef.current);
      exportAnimFrameRef.current = null;
    }

    // Stop MediaRecorder if it's currently recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn("Stopping media recorder failed:", err);
      }
    }

    // Stop playing narrator audio if playing
    const audioEl = audioRef.current;
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
    }

    // Reset styling and exporter UI states
    setIsExporting(false);
    setExportProgress(0);
    setLocalExportTime(0);
    onUpdateTime(0);
  };

  return (
    <div className="bg-stone-950 flex flex-col items-center justify-center p-3 lg:p-6 transition-all duration-300 flex-1" id="canvas-renderer-root">
      
      {/* Video Viewport Wrapper */}
      <div className={`relative bg-stone-900 border-2 border-stone-800 rounded-lg shadow-2xl overflow-hidden group transition-all duration-300 w-full aspect-[16/9] ${
        isFullscreen ? "max-w-[950px]" : "max-w-[760px]"
      }`} id="canvas-viewport-container">
        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          className="w-full h-full object-contain"
        />

        {/* Dynamic CSS-based animation system for ALL images */}
        {(() => {
          const activePanel = panels[activePanelIndex];
          if (!activePanel || isExporting) return null;
          const activeImg = imageCacheRef.current[activePanel.url];
          if (!activeImg) return null;

          // Background styles supporting user options: hitam, putih, abu, navy, kabur, custom
          let bgOverlay = null;
          if (bgStyle === "hitam") {
            bgOverlay = <div className="absolute inset-0 bg-black" />;
          } else if (bgStyle === "putih") {
            bgOverlay = <div className="absolute inset-0 bg-white" />;
          } else if (bgStyle === "abu") {
            bgOverlay = <div className="absolute inset-0 bg-[#292524]" />;
          } else if (bgStyle === "navy") {
            bgOverlay = <div className="absolute inset-0 bg-[#0f172a]" />;
          } else if (bgStyle === "custom" && customBgUrl) {
            bgOverlay = (
              <div className="absolute inset-0 overflow-hidden">
                <div 
                  className="absolute inset-0 bg-no-repeat bg-cover bg-center transition-all duration-300"
                  style={{ 
                    backgroundImage: `url(${customBgUrl})`,
                    filter: 'blur(4px) brightness(0.50) saturate(0.85)',
                    transform: 'scale(1.05)'
                  }}
                />
              </div>
            );
          } else {
            bgOverlay = (
              <div className="absolute inset-0 overflow-hidden">
                <div 
                  className="absolute inset-0 bg-no-repeat bg-cover bg-center transition-all duration-300"
                  style={{ 
                    backgroundImage: `url(${activePanel.url})`,
                    filter: 'blur(4px) brightness(0.48) saturate(0.85)',
                    transform: 'scale(1.08)'
                  }}
                />
                <div className="absolute inset-0 bg-black/10" />
              </div>
            );
          }

          const duration = activePanel.duration || 4;
          const progressVal = duration > 0 ? Math.min(Math.max(activePanelTime / duration, 0), 1) : 0;

          // Apply Easing Curve
          const easingType = activePanel.easing || 'smooth';
          let easedP = progressVal;
          if (easingType === 'linear') {
            easedP = progressVal;
          } else if (easingType === 'ease-in-out') {
            easedP = progressVal < 0.5 
              ? 4 * progressVal * progressVal * progressVal 
              : 1 - Math.pow(-2 * progressVal + 2, 3) / 2;
          } else {
            // smooth (sine)
            easedP = Math.sin((progressVal * Math.PI) / 2);
          }

          const mType = activePanel.motionType;

          // We want the viewport to always be 100% of the canvas to avoid artificial column boundaries ("bingkai")
          const sizePercent = 100;
          const canvasRatio = 16 / 9;
          const imgRatio = activeImg.width / activeImg.height;
          let imageRenderedW_pct = 100;
          let imageRenderedH_pct = 100;

          if (imgRatio > canvasRatio) {
            // Landscape wider than 16:9 -> fit width to 100%, height to (canvasRatio / imgRatio) * 100
            imageRenderedW_pct = 100;
            imageRenderedH_pct = (canvasRatio / imgRatio) * 100;
          } else {
            // Vertical or narrower landscape -> fit height to 100%, width to (imgRatio / canvasRatio) * 100
            imageRenderedH_pct = 100;
            imageRenderedW_pct = (imgRatio / canvasRatio) * 100;
          }

          let scaleVal = 1.0;
          let transX_pct = 0;
          let transY_pct = 0;

          if (imgRatio < 0.9) {
            // Vertikal: Pan Vertikal (dari atas ke bawah), gambarnya sedikit diperbesar
            // Khusus vertikal aja.
            scaleVal = verticalConfig.initialScale + easedP * verticalConfig.zoomSpeed;
            transX_pct = verticalConfig.offsetX;
            transY_pct = (0.5 - easedP) * (scaleVal - 1.0) * 100 + verticalConfig.offsetY;
          } else if (imgRatio > 1.1) {
            // Horizontal: slow zoom, gak full layar, sedikit diperbesar
            scaleVal = horizontalConfig.initialScale + easedP * horizontalConfig.zoomSpeed;
            transX_pct = horizontalConfig.offsetX;
            transY_pct = horizontalConfig.offsetY;
          } else {
            // Square: slow zoom, gak full layar
            scaleVal = squareConfig.initialScale + easedP * squareConfig.zoomSpeed;
            transX_pct = squareConfig.offsetX;
            transY_pct = squareConfig.offsetY;
          }

          // Determine dynamic transition class
          const curTrans = activePanel.transitionType || "crossfade";
          let animationClass = "animate-fade-in";
          if (curTrans === "slide-left") {
            animationClass = "animate-slide-left-custom";
          } else if (curTrans === "slide-right") {
            animationClass = "animate-slide-right-custom";
          } else if (curTrans === "zoom-fade") {
            animationClass = "animate-zoom-fade-custom";
          } else if (curTrans === "none") {
            animationClass = "";
          }

          // Construct transform string centered in viewport container
          const transformString = `translate3d(-50%, -50%, 0) translate3d(${transX_pct}%, ${transY_pct}%, 0) scale(${scaleVal})`;

          return (
            <div key={activePanel.id} className={`absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden z-10 ${animationClass}`} id="css-dynamic-animator">
              {bgOverlay}
              
              {/* Framed foreground container occupying 100% width and 100% height without any static background or shadow overlay */}
              <div 
                className={`absolute overflow-hidden flex items-center justify-center transition-all duration-300 ${
                  bgStyle === "hitam" ? "bg-black" : bgStyle === "putih" ? "bg-white" : "bg-transparent"
                }`}
                style={{
                  width: "100%",
                  height: "100%",
                }}
              >
                {/* Dynamically scaled and translated background-image container */}
                <div 
                  className="absolute top-1/2 left-1/2"
                  style={{
                    width: `${imageRenderedW_pct}%`,
                    height: `${imageRenderedH_pct}%`,
                    transform: transformString,
                    backgroundImage: `url(${activePanel.url})`,
                    backgroundSize: "100% 100%",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    willChange: "transform",
                    backfaceVisibility: "hidden",
                    filter: "drop-shadow(0px 12px 36px rgba(0, 0, 0, 0.95))"
                  }}
                />
              </div>
            </div>
          );
        })()}

        {/* Floating overlays: Export progress overlay */}
        {isExporting && (
          <div className="absolute inset-0 bg-stone-950/90 flex flex-col items-center justify-center space-y-3 z-50 p-4">
            <RefreshCw className="w-10 h-10 text-amber-500 animate-spin" />
            <h4 className="text-sm font-bold text-white tracking-wide">Sedang Mengompilasi Video...</h4>
            <div className="w-64 bg-stone-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-cyan-500 h-full rounded-full transition-all duration-100 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                style={{ width: `${exportProgress}%` }}
              ></div>
            </div>
            <p className="text-xs text-stone-400 font-mono">Kemajuan: {exportProgress.toFixed(0)}% (Jangan tutup tab)</p>
            <button
              type="button"
              onClick={cancelHDExport}
              className="mt-2 px-3.5 py-1.5 bg-red-600/20 hover:bg-red-600/90 border border-red-500/40 hover:border-red-500 text-red-300 hover:text-white rounded text-xs font-bold cursor-pointer transition-all duration-200 shadow-md hover:shadow-red-900/45 flex items-center gap-1.5 select-none"
            >
              <Minimize className="w-3.5 h-3.5" />
              Batalkan Render
            </button>
          </div>
        )}


      </div>

      {/* Ketukan Pintar (Interactive Tap-Sync) HUD - Rendered Directly Below the Video Canvas */}
      {activeTab === "ketukan" && (
        <div 
          className={`w-full bg-stone-950/95 border border-cyan-500/15 p-4 rounded-xl shadow-[0_4px_35px_rgba(6,182,212,0.06)] mt-6 transition-all duration-300 ${
            isFullscreen ? "max-w-[950px]" : "max-w-[760px]"
          }`} 
          id="ketukan-pintar-studio"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-cyan-500/10 pb-3 mb-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-cyan-400 flex items-center gap-1.5 neon-glow-cyan select-none">
              <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />
              Ketukan Pintar (Interactive Tap-Sync)
            </h4>
            {isSyncing && currentSyncIndex !== null && (
              <span className="text-[10px] text-fuchsia-400 font-mono select-none px-2 py-0.5 bg-fuchsia-500/10 rounded border border-fuchsia-500/20 animate-pulse">
                🔴 Frame {currentSyncIndex + 1} / {panels.length}
              </span>
            )}
          </div>

          {/* 1. Preparation state (Not currently syncing or finished) */}
          {!isSyncing && !tapsCompleted && (
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 py-4 px-2" id="sync-prep-deck">
              <div className="space-y-2 max-w-xl text-left">
                <p className="text-xs text-stone-350 leading-relaxed font-sans">
                  Selesaikan sinkronisasi naskah dan pergerakan gambar manga secara manual dalam sekejap! Cukup bacakan cerita atau putar rekaman suara di latar, lalu ketuk tombol <strong className="text-cyan-400">KETUK SEKARANG</strong> atau tekan tombol <strong className="text-cyan-400">SPASI</strong> di keyboard setiap kali pembicara berpindah kalimat. Durasi perpindahan frame akan disesuaikan dengan ritme aslimu!
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2 text-[11px] font-mono">
                  <div className="p-2 bg-stone-900/40 rounded border border-cyan-500/10">
                    <span className="text-stone-500 block">Frame Target</span>
                    <strong className="text-stone-300">{panels.length} Slide Manga</strong>
                  </div>
                  <div className="p-2 bg-stone-900/40 rounded border border-cyan-500/10">
                    <span className="text-stone-500 block">Sumbu Narasi</span>
                    <span className={narrationAudioUrl ? "text-emerald-400 font-bold" : "text-cyan-400 font-bold"}>
                      {narrationAudioUrl ? "🔊 Audio Aktif" : "🎙️ Pembacaan Langsung (Mute)"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 w-full md:w-auto" id="sync-prep-action">
                {panels.length === 0 ? (
                  <div className="p-3 bg-red-950/20 border border-red-900/30 rounded text-red-400 text-xs text-center max-w-[280px]">
                    ⚠️ Peringatan: Tambahkan setidaknya satu panel manga terlebih dahulu di editor storyboard agar bisa menyelaraskan naskah!
                  </div>
                ) : (
                  <button
                    onClick={onStartSyncSession}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-400 to-cyan-600 text-stone-950 font-extrabold text-xs uppercase tracking-wider rounded-lg shadow-lg hover:from-cyan-300 hover:to-cyan-500 shadow-cyan-950/20 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Zap className="w-4 h-4 text-stone-950 animate-bounce" />
                    Mulai Penyelarasan
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 2. Active Sync Tapping State */}
          {isSyncing && currentSyncIndex !== null && (
            <div className="flex flex-col gap-5 text-left" id="active-sync-deck">
              
              {/* Top Row: Giant Tap Area & Main Action Controls */}
              <div className="w-full flex flex-col gap-3">
                <button
                  type="button"
                  onClick={onHandleTap}
                  className="w-full h-36 bg-gradient-to-br from-cyan-500/10 to-indigo-950/25 hover:from-cyan-500/15 border-2 border-cyan-500/30 hover:border-cyan-400 rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-[0.98] group relative overflow-hidden shadow-lg shadow-cyan-950/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  id="smart-tapping-trigger-pad"
                >
                  <div className="absolute inset-0 bg-cyan-500/5 duration-1000 animate-ping rounded-full pointer-events-none scale-75"></div>
                  
                  <div className="p-2 bg-stone-900 rounded-full border border-cyan-500/20 group-hover:border-cyan-400/40 transition-colors flex items-center justify-center">
                    <Zap className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform animate-pulse" />
                  </div>
                  
                  <span className="text-xs font-black uppercase tracking-widest text-cyan-400 neon-glow-cyan">
                    KETUK SEKARANG
                  </span>
                  
                  <span className="text-[10px] text-stone-500 bg-stone-950 px-2.5 py-0.5 rounded-full border border-stone-900/60">
                    atau tekan tombol <strong className="text-cyan-400 font-bold">SPASI</strong> di keyboard
                  </span>
                </button>

                {/* Play/Pause & Undo Button row + Cancel Option */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
                  <button
                    type="button"
                    onClick={onTogglePlay}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all border shadow-md cursor-pointer ${
                      isPlaying
                        ? "bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/20 text-amber-400"
                        : "bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/20 text-emerald-400"
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                        Jeda Suara
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-emerald-400" />
                        Putar / Retake
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={onHandleUndo}
                    disabled={tapHistory.length === 0}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all border shadow-md ${
                      tapHistory.length === 0
                        ? "bg-stone-900/40 text-stone-600 border-stone-950/60 cursor-not-allowed opacity-40"
                        : "bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-400/30 cursor-pointer shadow-orange-950/10"
                    }`}
                    id="undo-tap-btn"
                  >
                    <Undo className="w-3.5 h-3.5" />
                    Batal Ketuk
                  </button>

                  <button
                    type="button"
                    onClick={onCancelSyncSession}
                    className="py-2.5 px-3 bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-stone-200 border border-stone-800 text-[11px] font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    Gagalkan Sesi
                  </button>
                </div>
              </div>

              {/* Bottom Row: Info / Status & Scripts in a 2-Column Responsive Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 w-full pt-4 border-t border-stone-900">
                
                {/* Left Column (Span 6): Active Segment Bubble & Counters */}
                <div className="md:col-span-6 flex flex-col gap-3 min-w-0">
                  <div className="p-3.5 bg-stone-900/80 border border-cyan-500/20 rounded-lg text-left relative space-y-2.5 shadow-inner">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="uppercase font-bold tracking-widest text-cyan-400 flex items-center gap-1 neon-glow-cyan">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
                        Sedang Ditandai (Frame #{currentSyncIndex + 1} / {panels.length})
                      </span>
                      <span className="text-stone-500 font-mono">
                        Cap Awal: {lastTapTime.toFixed(1)}s
                      </span>
                    </div>

                    {/* Large subtitle display */}
                    <div className="text-xs font-semibold text-stone-250 leading-relaxed font-sans border-l-2 border-cyan-400 pl-3 py-1 bg-stone-950/40 rounded">
                      "{panels[currentSyncIndex]?.subtitle || "Tidak ada subtitle/dialog..."}"
                    </div>

                    <span className="text-[10px] text-stone-500 block italic">
                      Objek Bidik: <strong className="text-stone-400 font-normal">{panels[currentSyncIndex]?.focusGuide || "Umum"}</strong>
                    </span>
                  </div>

                  {/* Timer counters */}
                  <div className="flex items-center justify-between text-[11px] font-mono text-stone-500 px-1 pt-1 border-t border-stone-900/40">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                      <span>Waktu Tempuh: <strong className="text-stone-300">{currentTime.toFixed(1)}s</strong></span>
                    </div>
                    <div>
                      <span>Selisih Rekor: <strong className="text-cyan-400 font-medium">{(currentTime - lastTapTime).toFixed(1)}s</strong></span>
                    </div>
                  </div>
                </div>

                {/* Right Column (Span 6): Upcoming Queue List */}
                <div className="md:col-span-6 space-y-2 text-left flex flex-col justify-start min-w-0">
                  <span className="block text-[10px] uppercase font-bold tracking-wider text-stone-500">
                    Naskah Antrean Berikutnya:
                  </span>
                  {currentSyncIndex === panels.length - 1 ? (
                    <div className="p-3 border border-dashed border-cyan-500/20 bg-stone-900/10 text-[11px] text-stone-600 rounded flex-1 flex items-center justify-center">
                      🔚 Ini adalah baris naskah terakhir! Ketukan berikutnya akan menyelesaikan penyelarasan.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[110px] overflow-y-auto flex-1">
                      {panels.slice(currentSyncIndex + 1, currentSyncIndex + 3).map((pNext, idxNext) => (
                        <div
                          key={pNext.id}
                          className="p-2 bg-stone-900/30 border border-stone-900 rounded opacity-50 hover:opacity-75 transition-opacity text-xs flex gap-2.5 items-center justify-between"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[9px] font-mono bg-stone-950 font-bold px-1.5 py-0.5 rounded text-stone-500 border border-cyan-500/10 flex-shrink-0">
                              #{currentSyncIndex + idxNext + 2}
                            </span>
                            <span className="truncate text-stone-400 font-mono italic">
                              "{pNext.subtitle || "Tidak ada teks"}"
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* 3. Taps Completed Successful Review state */}
          {tapsCompleted && (
            <div className="text-center py-4 space-y-4 max-w-lg mx-auto" id="sync-success-board">
              <div className="flex flex-col items-center gap-1.5">
                <div className="p-2.5 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-emerald-400 animate-bounce">
                  <CheckCircle className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                  Sumbu Waktu Berhasil Disinkronkan!
                </h4>
                <p className="text-xs text-stone-400 font-sans leading-normal">
                  Penyadapan selesai! Seluruh {panels.length} panel storyboard Anda sekarang telah dikalibrasi durasinya dengan sangat mulus berdasarkan rekam manual Anda.
                </p>
              </div>

              {/* Grid timings overview */}
              <div className="bg-stone-900/40 p-2 text-stone-400 rounded border border-cyan-500/10">
                <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 text-left">
                  {panels.map((p, idx) => (
                    <div key={p.id} className="p-1.5 bg-stone-950 rounded text-[10px] font-mono border border-cyan-500/10 flex flex-col justify-between">
                      <span className="text-cyan-400 font-bold">Slide #{idx + 1}</span>
                      <strong className="text-stone-300 text-[11px] mt-0.5">{p.duration.toFixed(1)} detik</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                {/* 1. Playaligned button */}
                <button
                  onClick={() => {
                    if (onSetTapsCompleted) onSetTapsCompleted(false);
                    onUpdateTime(0);
                    if (!isPlaying) {
                      onTogglePlay();
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-stone-950 font-bold text-xs rounded transition-all cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                >
                  <Play className="w-3.5 h-3.5 fill-stone-950" />
                  Putar Hasil Sinkronisasi
                </button>

                {/* 2. Redo Sync */}
                <button
                  onClick={() => {
                    if (onSetTapsCompleted) onSetTapsCompleted(false);
                    if (onStartSyncSession) onStartSyncSession();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 hover:bg-stone-850 text-stone-300 border border-stone-850 text-xs rounded transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-stone-400" />
                  Ulangi Sesi
                </button>

                {/* 3. Close */}
                <button
                  onClick={() => {
                    if (onSetTapsCompleted) onSetTapsCompleted(false);
                  }}
                  className="flex items-center gap-1 px-3.5 py-2 bg-stone-950 hover:bg-stone-900 text-stone-500 hover:text-stone-350 text-xs rounded border border-stone-900 transition-all cursor-pointer"
                >
                  Selesai
                </button>
              </div>

            </div>
          )}
        </div>
      )}

      {/* Cubit & Geser Workspace HUD - Rendered Directly Below the Video Canvas for perfect mobile real-time viewing */}
      {activeTab === "cubit" && (
        <div 
          className={`w-full bg-stone-950/95 border border-cyan-500/15 p-3 rounded-xl shadow-[0_4px_35px_rgba(6,182,212,0.06)] mt-4 transition-all duration-300 ${
            isFullscreen ? "max-w-[950px]" : "max-w-[760px]"
          }`} 
          id="cubit-geser-studio"
        >
          {/* Compact Category Selector Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2.5 mb-3">
            <div className="flex gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedCubitCategory("vertical")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  selectedCubitCategory === "vertical"
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 neon-glow-cyan"
                    : "bg-stone-900/60 text-stone-400 border border-transparent hover:text-stone-200 hover:bg-stone-850"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                📱 Vertikal
              </button>
              
              <button
                type="button"
                onClick={() => setSelectedCubitCategory("horizontal")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  selectedCubitCategory === "horizontal"
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 neon-glow-cyan"
                    : "bg-stone-900/60 text-stone-400 border border-transparent hover:text-stone-200 hover:bg-stone-850"
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                🖥️ Horizontal
              </button>
              
              <button
                type="button"
                onClick={() => setSelectedCubitCategory("square")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  selectedCubitCategory === "square"
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 neon-glow-cyan"
                    : "bg-stone-900/60 text-stone-400 border border-transparent hover:text-stone-200 hover:bg-stone-850"
                }`}
              >
                <Maximize className="w-3.5 h-3.5" />
                ⏹️ Square
              </button>

              <button
                type="button"
                onClick={onTogglePlay}
                disabled={panels.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  isPlaying
                    ? "bg-red-600/25 hover:bg-red-600/35 text-red-400 border border-red-500/30 animate-pulse"
                    : "bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/30"
                }`}
                title={isPlaying ? "Jeda Pratinjau Video" : "Putar Pratinjau Video"}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-red-400" />
                    Jeda Video
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    Putar Video
                  </>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (selectedCubitCategory === "vertical") {
                  setVerticalConfig({ initialScale: 1.15, zoomSpeed: 0.05, offsetX: 0, offsetY: 0 });
                } else if (selectedCubitCategory === "horizontal") {
                  setHorizontalConfig({ initialScale: 0.78, zoomSpeed: 0.06, offsetX: 0, offsetY: 0 });
                } else {
                  setSquareConfig({ initialScale: 0.78, zoomSpeed: 0.06, offsetX: 0, offsetY: 0 });
                }
              }}
              className="px-2.5 py-1 bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-cyan-400 border border-stone-800 text-[10px] font-bold uppercase rounded transition-all cursor-pointer shadow-sm active:scale-95"
            >
              Reset Aktif
            </button>
          </div>

          <div className="w-full">
            {/* Kategori 1: Vertikal */}
            {selectedCubitCategory === "vertical" && (
              <div className="p-3 bg-stone-900/30 rounded-lg border border-cyan-500/5 hover:border-cyan-500/10 transition-all flex flex-col justify-between animate-fade-in">
                <div>
                  <div className="flex items-center justify-between border-b border-stone-800 pb-1.5 mb-2 select-none">
                    <span className="text-xs font-bold text-stone-250 flex items-center gap-1.5 uppercase">
                      <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                      📱 Gambar Vertikal
                    </span>
                    <span className="text-[9px] text-cyan-500 font-mono font-semibold">Rasio &lt; 0.9</span>
                  </div>
                  
                  <div className="space-y-3">
                    {/* Skala Awal */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Skala Awal (Zoom)</span>
                        <span className="text-cyan-400 font-bold font-mono">{verticalConfig.initialScale.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="3.0"
                        step="0.01"
                        value={verticalConfig.initialScale}
                        onChange={(e) => setVerticalConfig({ ...verticalConfig, initialScale: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Pergerakan Zoom */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Gerak Zoom Animasi</span>
                        <span className="text-cyan-400 font-bold font-mono">{(verticalConfig.zoomSpeed >= 0 ? "+" : "")}{verticalConfig.zoomSpeed.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="-0.5"
                        max="0.5"
                        step="0.01"
                        value={verticalConfig.zoomSpeed}
                        onChange={(e) => setVerticalConfig({ ...verticalConfig, zoomSpeed: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Geser X */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Geser Horizontal (X)</span>
                        <span className="text-cyan-400 font-bold font-mono">{verticalConfig.offsetX}%</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={verticalConfig.offsetX}
                        onChange={(e) => setVerticalConfig({ ...verticalConfig, offsetX: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Geser Y */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Geser Vertikal (Y)</span>
                        <span className="text-cyan-400 font-bold font-mono">{verticalConfig.offsetY}%</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={verticalConfig.offsetY}
                        onChange={(e) => setVerticalConfig({ ...verticalConfig, offsetY: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Kategori 2: Horizontal */}
            {selectedCubitCategory === "horizontal" && (
              <div className="p-3 bg-stone-900/30 rounded-lg border border-cyan-500/5 hover:border-cyan-500/10 transition-all flex flex-col justify-between animate-fade-in">
                <div>
                  <div className="flex items-center justify-between border-b border-stone-800 pb-1.5 mb-2 select-none">
                    <span className="text-xs font-bold text-stone-250 flex items-center gap-1.5 uppercase">
                      <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                      🖥️ Gambar Horizontal
                    </span>
                    <span className="text-[9px] text-cyan-500 font-mono font-semibold">Rasio &gt; 1.1</span>
                  </div>

                  <div className="space-y-3">
                    {/* Skala Awal */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Skala Awal (Zoom)</span>
                        <span className="text-cyan-400 font-bold font-mono">{horizontalConfig.initialScale.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="3.0"
                        step="0.01"
                        value={horizontalConfig.initialScale}
                        onChange={(e) => setHorizontalConfig({ ...horizontalConfig, initialScale: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Pergerakan Zoom */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Gerak Zoom Animasi</span>
                        <span className="text-cyan-400 font-bold font-mono">{(horizontalConfig.zoomSpeed >= 0 ? "+" : "")}{horizontalConfig.zoomSpeed.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="-0.5"
                        max="0.5"
                        step="0.01"
                        value={horizontalConfig.zoomSpeed}
                        onChange={(e) => setHorizontalConfig({ ...horizontalConfig, zoomSpeed: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Geser X */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Geser Horizontal (X)</span>
                        <span className="text-cyan-400 font-bold font-mono">{horizontalConfig.offsetX}%</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={horizontalConfig.offsetX}
                        onChange={(e) => setHorizontalConfig({ ...horizontalConfig, offsetX: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Geser Y */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Geser Vertikal (Y)</span>
                        <span className="text-cyan-400 font-bold font-mono">{horizontalConfig.offsetY}%</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={horizontalConfig.offsetY}
                        onChange={(e) => setHorizontalConfig({ ...horizontalConfig, offsetY: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Kategori 3: Square */}
            {selectedCubitCategory === "square" && (
              <div className="p-3 bg-stone-900/30 rounded-lg border border-cyan-500/5 hover:border-cyan-500/10 transition-all flex flex-col justify-between animate-fade-in">
                <div>
                  <div className="flex items-center justify-between border-b border-stone-800 pb-1.5 mb-2 select-none">
                    <span className="text-xs font-bold text-stone-250 flex items-center gap-1.5 uppercase">
                      <Maximize className="w-3.5 h-3.5 text-cyan-400" />
                      ⏹️ Gambar Square
                    </span>
                    <span className="text-[9px] text-cyan-500 font-mono font-semibold">Rasio 0.9 s/d 1.1</span>
                  </div>

                  <div className="space-y-3">
                    {/* Skala Awal */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Skala Awal (Zoom)</span>
                        <span className="text-cyan-400 font-bold font-mono">{squareConfig.initialScale.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="3.0"
                        step="0.01"
                        value={squareConfig.initialScale}
                        onChange={(e) => setSquareConfig({ ...squareConfig, initialScale: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Pergerakan Zoom */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Gerak Zoom Animasi</span>
                        <span className="text-cyan-400 font-bold font-mono">{(squareConfig.zoomSpeed >= 0 ? "+" : "")}{squareConfig.zoomSpeed.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="-0.5"
                        max="0.5"
                        step="0.01"
                        value={squareConfig.zoomSpeed}
                        onChange={(e) => setSquareConfig({ ...squareConfig, zoomSpeed: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Geser X */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Geser Horizontal (X)</span>
                        <span className="text-cyan-400 font-bold font-mono">{squareConfig.offsetX}%</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={squareConfig.offsetX}
                        onChange={(e) => setSquareConfig({ ...squareConfig, offsetX: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Geser Y */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Geser Vertikal (Y)</span>
                        <span className="text-cyan-400 font-bold font-mono">{squareConfig.offsetY}%</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={squareConfig.offsetY}
                        onChange={(e) => setSquareConfig({ ...squareConfig, offsetY: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Control bar */}
      <div className={`w-full flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-stone-950 border border-cyan-500/10 rounded-lg shadow-[0_4px_25px_rgba(6,182,212,0.03)] transition-all duration-300 ${
        isFullscreen ? "max-w-[950px]" : "max-w-[760px]"
      } mt-6`}>
        
        {/* Style selection controls */}
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          {/* Ratio controller */}
          <div className="flex items-center gap-1.5" id="ratio-selector">
            <span className="text-[11px] text-stone-500 font-bold uppercase tracking-wider mr-1">Rasio:</span>
            <span className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Monitor className="w-3 h-3" />
              16:9 Widescreen
            </span>
          </div>

          {/* Background controller */}
          <div className="flex items-center gap-1" id="bg-selector">
            <span className="text-[11px] text-stone-500 font-bold uppercase tracking-wider mr-1.5">Latar:</span>
            <button
              type="button"
              onClick={() => setBgStyle("hitam")}
              title="Latar Belakang Hitam Pekat"
              className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                bgStyle === "hitam"
                  ? "bg-cyan-500 text-stone-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                  : "bg-stone-950 text-stone-400 border border-stone-850 hover:bg-stone-900 hover:border-cyan-500/20"
              }`}
            >
              Hitam
            </button>
            <button
              type="button"
              onClick={() => setBgStyle("putih")}
              title="Latar Belakang Putih Polos"
              className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                bgStyle === "putih"
                  ? "bg-cyan-500 text-stone-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                  : "bg-stone-950 text-stone-400 border border-stone-850 hover:bg-stone-900 hover:border-cyan-500/20"
              }`}
            >
              Putih
            </button>
            <button
              type="button"
              onClick={() => setBgStyle("abu")}
              title="Latar Belakang Abu-abu"
              className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                bgStyle === "abu"
                  ? "bg-cyan-500 text-stone-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                  : "bg-stone-950 text-stone-400 border border-stone-850 hover:bg-stone-900 hover:border-cyan-500/20"
              }`}
            >
              Abu
            </button>
            <button
              type="button"
              onClick={() => setBgStyle("navy")}
              title="Latar Belakang Navy Blue"
              className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                bgStyle === "navy"
                  ? "bg-cyan-500 text-stone-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                  : "bg-stone-950 text-stone-400 border border-stone-850 hover:bg-stone-900 hover:border-cyan-500/20"
              }`}
            >
              Navy
            </button>
            <button
              type="button"
              onClick={() => setBgStyle("kabur")}
              title="Latar Belakang Gambar Kabur (Blur)"
              className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                bgStyle === "kabur"
                  ? "bg-cyan-500 text-stone-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                  : "bg-stone-950 text-stone-400 border border-stone-850 hover:bg-stone-900 hover:border-cyan-500/20"
              }`}
            >
              Kabur
            </button>
            <button
              type="button"
              onClick={() => {
                setBgStyle("custom");
                document.getElementById("custom-bg-uploader")?.click();
              }}
              title="Unggah Gambar Latar Kustom (Blur otomatis)"
              className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                bgStyle === "custom"
                  ? "bg-cyan-500 text-stone-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                  : "bg-stone-950 text-stone-400 border border-stone-850 hover:bg-stone-900 hover:border-cyan-500/20"
              }`}
            >
              Kustom {customBgUrl && "✓"}
            </button>
            <input
              type="file"
              id="custom-bg-uploader"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    if (event.target?.result) {
                      const urlStr = event.target.result as string;
                      setCustomBgUrl(urlStr);
                      localStorage.setItem("manga_recap_custom_bg_url", urlStr);
                      setBgStyle("custom");
                    }
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>

          {/* Voice Over Toggle Option (Metode 1) */}
          <button
            onClick={() => setUseAutoTTS(!useAutoTTS)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
              useAutoTTS
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium shadow-[0_0_8px_rgba(16,185,129,0.15)]"
                : "bg-stone-950 text-stone-500 border border-stone-900 hover:text-stone-400 hover:border-cyan-500/20"
            }`}
            title="Bacakan Naskah Tiap Panel Otomatis (TTS)"
          >
            <Volume2 className="w-3.5 h-3.5" />
            Voice Over Otomatis: {useAutoTTS ? "Aktif" : "Nonaktif"}
          </button>

          {/* Format & Bitrate selectors inspired by Lovable */}
          <div className="flex flex-wrap items-center gap-2 bg-stone-900/40 p-1 rounded-lg border border-stone-850/60" id="format-bitrate-panel">
            {/* Format Video Codec */}
            <select
              value={videoCodec}
              onChange={(e) => setVideoCodec(e.target.value)}
              className="bg-stone-950 border border-stone-850 text-stone-300 text-xs rounded px-2.5 py-1.5 focus:border-cyan-500/50 outline-none cursor-pointer hover:border-stone-700/60 transition-all font-semibold"
              title="Pilih Format & Kodek Video"
            >
              <option value="mp4-high">MP4 · H.264 High (rekomendasi)</option>
              <option value="mp4-baseline">MP4 · H.264 Baseline (paling kompatibel)</option>
              <option value="mp4-auto">MP4 · H.264 (auto profile)</option>
              <option value="webm-vp9">WebM · VP9</option>
              <option value="webm-vp8">WebM · VP8</option>
              <option value="auto">Auto (biar browser pilih)</option>
            </select>

            {/* Bitrate */}
            <select
              value={videoBitrate}
              onChange={(e) => setVideoBitrate(e.target.value)}
              className="bg-stone-950 border border-stone-850 text-stone-300 text-xs rounded px-2.5 py-1.5 focus:border-cyan-500/50 outline-none cursor-pointer hover:border-stone-700/60 transition-all font-semibold"
              title="Pilih Kualitas Laju Bit"
            >
              <option value="6mbps">Halus · 6 Mbps</option>
              <option value="4mbps">Seimbang · 4 Mbps</option>
              <option value="2mbps">Hemat · 2 Mbps</option>
            </select>
          </div>
        </div>

        {/* Main interactive triggers */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={panels.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold shadow transition-all ${
              isPlaying
                ? "bg-red-600 hover:bg-red-700 active:bg-red-500 text-white"
                : "bg-stone-900 hover:bg-stone-850 border border-cyan-500/20 text-white hover:border-cyan-500/40"
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                Jeda
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-cyan-400" />
                Putar
              </>
            )}
          </button>

          <button
            type="button"
            onClick={startRecordingHDExport}
            disabled={isExporting || panels.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 active:bg-cyan-600 text-stone-950 font-bold text-xs rounded shadow-[0_0_15px_rgba(6,182,212,0.25)] hover:shadow-[0_0_20px_rgba(6,182,212,0.45)] transition-all cursor-pointer"
            id="btn-high-definition-export"
          >
            <Download className="w-4 h-4" />
            Ekspor Video
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 hover:bg-stone-850 border border-stone-800 hover:border-cyan-500/30 text-stone-300 hover:text-white text-xs font-semibold rounded shadow transition-all cursor-pointer"
            title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
          >
            {isFullscreen ? (
              <>
                <Minimize className="w-4 h-4 text-red-400" />
                Normalkan
              </>
            ) : (
              <>
                <Maximize className="w-4 h-4 text-cyan-400" />
                Layar Penuh
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
