import React, { useState, useRef, useEffect } from 'react';
import { Menu, Plus, X, Check, Palette, Eraser, Scissors, Grid3X3, Info, Image as ImageIcon } from 'lucide-react';

/**
 * Utility: Convert canvas to file/blob for download
 */
const downloadCanvas = (canvas: HTMLCanvasElement) => {
  const link = document.createElement('a');
  link.download = `edited-image-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};

/**
 * Main Application Component
 */
export default function App() {
  // --- State Management ---
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [originalImageObj, setOriginalImageObj] = useState<HTMLImageElement | null>(null); 
  const [showMenu, setShowMenu] = useState(false);
  const [activeTool, setActiveTool] = useState<'none' | 'brush' | 'mosaic' | 'eraser' | 'crop'>('none');
  const [menuContent, setMenuContent] = useState<'none' | 'version' | 'about'>('none');
  
  // Tool Settings
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(10);
  const [mosaicType, setMosaicType] = useState<'pixel' | 'blur'>('pixel');
  
  // Crop State
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 100, h: 100 }); // Percentages

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Reset Crop Rect when entering crop mode ---
  useEffect(() => {
    if (activeTool === 'crop') {
      setCropRect({ x: 0, y: 0, w: 100, h: 100 });
    }
  }, [activeTool]);

  // --- Image Loading ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setOriginalImageObj(img);
          setImageSrc(event.target?.result as string);
          setActiveTool('none');
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Canvas Rendering ---
  useEffect(() => {
    if (imageSrc && canvasRef.current && originalImageObj) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas dimensions to match the image resolution
      canvas.width = originalImageObj.width;
      canvas.height = originalImageObj.height;
      
      ctx.drawImage(originalImageObj, 0, 0);
    }
  }, [imageSrc, originalImageObj]);

  // --- Drawing Logic Helpers ---
  const getCanvasCoordinates = (e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  // --- Drawing Tools Implementations ---
  const applyMosaic = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    const pixelSize = size * 2; 
    const startX = Math.floor(x / pixelSize) * pixelSize;
    const startY = Math.floor(y / pixelSize) * pixelSize;

    const imageData = ctx.getImageData(startX, startY, pixelSize, pixelSize);
    const data = imageData.data;
    
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2];
    }
    const pixelCount = data.length / 4;
    r = Math.floor(r / pixelCount);
    g = Math.floor(g / pixelCount);
    b = Math.floor(b / pixelCount);

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(startX, startY, pixelSize, pixelSize);
  };

  const applyBlur = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    ctx.filter = 'blur(4px)';
    ctx.drawImage(ctx.canvas, x - size, y - size, size * 2, size * 2, x - size, y - size, size * 2, size * 2);
    ctx.filter = 'none';
  };

  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number, y: number } | null>(null);

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    if (activeTool === 'none' || activeTool === 'crop') return;
    isDrawing.current = true;
    const { x, y } = getCanvasCoordinates(e);
    lastPos.current = { x, y };
    draw(e);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing.current || !canvasRef.current || !lastPos.current) return;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);

    if (activeTool === 'brush') {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(x, y);
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else if (activeTool === 'mosaic') {
      mosaicType === 'pixel' ? applyMosaic(ctx, x, y, brushSize) : applyBlur(ctx, x, y, brushSize);
    } else if (activeTool === 'eraser' && originalImageObj) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, brushSize, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(originalImageObj, 0, 0); 
      ctx.restore();
    }
    lastPos.current = { x, y };
  };

  const stopDrawing = () => {
    isDrawing.current = false;
    lastPos.current = null;
  };

  // --- Crop Logic ---
  const applyCrop = () => {
    if (!canvasRef.current || !originalImageObj) return;
    
    const canvas = canvasRef.current;
    const cropX = (cropRect.x / 100) * canvas.width;
    const cropY = (cropRect.y / 100) * canvas.height;
    const cropW = (cropRect.w / 100) * canvas.width;
    const cropH = (cropRect.h / 100) * canvas.height;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (tempCtx) {
      tempCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const newUrl = tempCanvas.toDataURL();
      const newImg = new Image();
      newImg.onload = () => {
        setOriginalImageObj(newImg);
        setImageSrc(newUrl);
        setActiveTool('none');
      };
      newImg.src = newUrl;
    }
  };

  // --- UI Components ---
  const Header = () => (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 fixed top-0 w-full z-50 shadow-sm select-none">
      <div className="relative">
        <button onClick={() => setShowMenu(!showMenu)} className="p-2 active:bg-gray-100 rounded-full transition-colors">
          <Menu className="text-gray-700 w-6 h-6" />
        </button>
        {showMenu && (
          <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-200 z-[70]">
            <button onClick={() => { setMenuContent('version'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b flex items-center gap-2">
              <Info size={16} /> 版本信息
            </button>
            <button onClick={() => { setMenuContent('about'); setShowMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-2">
              <Grid3X3 size={16} /> 关于作者
            </button>
          </div>
        )}
      </div>
      {imageSrc && (
        <button onClick={() => fileInputRef.current?.click()} className="p-2 active:bg-gray-100 rounded-full text-gray-600">
          <Plus className="w-6 h-6" />
        </button>
      )}
      <button onClick={() => canvasRef.current && downloadCanvas(canvasRef.current)} className="px-4 py-1.5 bg-blue-500 text-white rounded-full text-sm font-medium active:bg-blue-600 shadow-sm">
        保存
      </button>
    </header>
  );

  const SubToolBar = () => {
    if (activeTool === 'none' || activeTool === 'crop') return null;
    return (
      <div className="fixed bottom-20 w-full bg-white/95 backdrop-blur-md border-t border-gray-200 p-4 z-30 flex flex-col gap-3 shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">
            {activeTool === 'brush' ? '画笔设置' : activeTool === 'mosaic' ? '马赛克设置' : '橡皮设置'}
          </span>
          <button onClick={() => setActiveTool('none')} className="text-gray-400"><X size={16} /></button>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">粗细</span>
          <input type="range" min="2" max="50" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg accent-blue-500" />
          <div className="w-6 h-6 rounded-full border border-gray-300 shrink-0" style={{ backgroundColor: activeTool === 'brush' ? brushColor : '#ccc', transform: `scale(${brushSize/25})` }} />
        </div>
        {activeTool === 'brush' && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#000000', '#ffffff', '#ff00ff', '#00ffff'].map(c => (
              <button key={c} onClick={() => setBrushColor(c)} className={`w-8 h-8 rounded-full border-2 shrink-0 ${brushColor === c ? 'border-blue-500 scale-110' : 'border-gray-200'}`} style={{ backgroundColor: c }} />
            ))}
            <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="w-8 h-8 rounded-full overflow-hidden shrink-0 border-0 p-0" />
          </div>
        )}
        {activeTool === 'mosaic' && (
          <div className="flex gap-2">
            <button onClick={() => setMosaicType('pixel')} className={`flex-1 py-2 text-sm rounded-md border ${mosaicType === 'pixel' ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200'}`}>方块像素</button>
            <button onClick={() => setMosaicType('blur')} className={`flex-1 py-2 text-sm rounded-md border ${mosaicType === 'blur' ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200'}`}>模糊涂抹</button>
          </div>
        )}
      </div>
    );
  };

  const Footer = () => (
    <footer className="h-20 bg-white border-t border-gray-200 fixed bottom-0 w-full z-40 pb-safe">
      <div className="flex justify-around items-center h-full px-2">
        <ToolButton 
          icon={<Palette size={24} />} 
          label="画笔" 
          isActive={activeTool === 'brush'}
          onClick={() => setActiveTool(activeTool === 'brush' ? 'none' : 'brush')} 
        />
        <ToolButton 
          icon={<Grid3X3 size={24} />} 
          label="马赛克" 
          isActive={activeTool === 'mosaic'}
          onClick={() => setActiveTool(activeTool === 'mosaic' ? 'none' : 'mosaic')} 
        />
        <ToolButton 
          icon={<Eraser size={24} />} 
          label="橡皮" 
          isActive={activeTool === 'eraser'}
          onClick={() => setActiveTool(activeTool === 'eraser' ? 'none' : 'eraser')} 
        />
        <ToolButton 
          icon={<Scissors size={24} />} 
          label="裁剪" 
          isActive={activeTool === 'crop'}
          onClick={() => setActiveTool(activeTool === 'crop' ? 'none' : 'crop')} 
        />
      </div>
    </footer>
  );

  const CropOverlay = () => {
    // Supports 8 handles: 4 corners + 4 sides
    type Mode = 'move' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | null;
    const [interactionMode, setInteractionMode] = useState<Mode>(null);
    const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
    const [startRect, setStartRect] = useState(cropRect);

    const getClientPos = (e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      return { x: clientX, y: clientY };
    };

    const handleStart = (mode: Mode, e: React.TouchEvent | React.MouseEvent) => {
      e.stopPropagation();
      setInteractionMode(mode);
      setStartPos(getClientPos(e));
      setStartRect(cropRect);
    };

    const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
      if (!interactionMode || !startPos || !containerRef.current) return;
      e.stopPropagation();
      e.preventDefault(); 

      const currentPos = getClientPos(e);
      const deltaXPixels = currentPos.x - startPos.x;
      const deltaYPixels = currentPos.y - startPos.y;
      const { width, height } = containerRef.current.getBoundingClientRect();
      const dX = (deltaXPixels / width) * 100;
      const dY = (deltaYPixels / height) * 100;

      let newRect = { ...startRect };
      const minSize = 5; 

      if (interactionMode === 'move') {
        newRect.x = Math.max(0, Math.min(100 - newRect.w, startRect.x + dX));
        newRect.y = Math.max(0, Math.min(100 - newRect.h, startRect.y + dY));
      } 
      // Corners
      else if (interactionMode === 'br') {
        newRect.w = Math.max(minSize, Math.min(100 - newRect.x, startRect.w + dX));
        newRect.h = Math.max(minSize, Math.min(100 - newRect.y, startRect.h + dY));
      }
      else if (interactionMode === 'bl') {
        const maxDX = startRect.w - minSize; 
        const effectiveDX = Math.max(-startRect.x, Math.min(maxDX, dX));
        newRect.x = startRect.x + effectiveDX;
        newRect.w = startRect.w - effectiveDX;
        newRect.h = Math.max(minSize, Math.min(100 - newRect.y, startRect.h + dY));
      }
      else if (interactionMode === 'tr') {
        newRect.w = Math.max(minSize, Math.min(100 - newRect.x, startRect.w + dX));
        const maxDY = startRect.h - minSize;
        const effectiveDY = Math.max(-startRect.y, Math.min(maxDY, dY));
        newRect.y = startRect.y + effectiveDY;
        newRect.h = startRect.h - effectiveDY;
      }
      else if (interactionMode === 'tl') {
        const maxDX = startRect.w - minSize;
        const effectiveDX = Math.max(-startRect.x, Math.min(maxDX, dX));
        newRect.x = startRect.x + effectiveDX;
        newRect.w = startRect.w - effectiveDX;

        const maxDY = startRect.h - minSize;
        const effectiveDY = Math.max(-startRect.y, Math.min(maxDY, dY));
        newRect.y = startRect.y + effectiveDY;
        newRect.h = startRect.h - effectiveDY;
      }
      // Sides
      else if (interactionMode === 'r') {
        newRect.w = Math.max(minSize, Math.min(100 - newRect.x, startRect.w + dX));
      }
      else if (interactionMode === 'l') {
        const maxDX = startRect.w - minSize;
        const effectiveDX = Math.max(-startRect.x, Math.min(maxDX, dX));
        newRect.x = startRect.x + effectiveDX;
        newRect.w = startRect.w - effectiveDX;
      }
      else if (interactionMode === 'b') {
        newRect.h = Math.max(minSize, Math.min(100 - newRect.y, startRect.h + dY));
      }
      else if (interactionMode === 't') {
        const maxDY = startRect.h - minSize;
        const effectiveDY = Math.max(-startRect.y, Math.min(maxDY, dY));
        newRect.y = startRect.y + effectiveDY;
        newRect.h = startRect.h - effectiveDY;
      }

      setCropRect(newRect);
    };

    const handleEnd = () => {
      setInteractionMode(null);
      setStartPos(null);
    };

    const Handle = ({ mode, cursor, style }: { mode: Mode, cursor: string, style: React.CSSProperties }) => (
      <div 
        className="absolute bg-blue-500 border-2 border-white rounded-full shadow-md z-50"
        style={{ width: 24, height: 24, ...style, cursor }}
        onTouchStart={(e) => handleStart(mode, e)}
        onMouseDown={(e) => handleStart(mode, e)}
      />
    );

    // Invisible hit areas for side dragging
    const SideHandle = ({ mode, cursor, style }: { mode: Mode, cursor: string, style: React.CSSProperties }) => (
      <div 
        className="absolute z-40"
        // Key Fix: Added transparent background to force event capture and touch-action: none
        style={{ ...style, cursor, backgroundColor: 'rgba(0,0,0,0)', touchAction: 'none' }}
        onTouchStart={(e) => handleStart(mode, e)}
        onMouseDown={(e) => handleStart(mode, e)}
      />
    );

    return (
      <div 
        className="absolute inset-0 z-20 bg-black/50 touch-none" 
        onTouchMove={(e) => e.stopPropagation()} 
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchEnd={handleEnd}
      >
        <div className="absolute inset-0" onMouseMove={handleMove} onTouchMove={handleMove} />

        <div 
          className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
          style={{
            left: `${cropRect.x}%`,
            top: `${cropRect.y}%`,
            width: `${cropRect.w}%`,
            height: `${cropRect.h}%`,
          }}
          onTouchStart={(e) => handleStart('move', e)}
          onMouseDown={(e) => handleStart('move', e)}
          onTouchMove={handleMove}
        >
          {/* Grid lines */}
          <div className="absolute top-1/3 left-0 w-full h-px bg-white/50 pointer-events-none"></div>
          <div className="absolute top-2/3 left-0 w-full h-px bg-white/50 pointer-events-none"></div>
          <div className="absolute left-1/3 top-0 h-full w-px bg-white/50 pointer-events-none"></div>
          <div className="absolute left-2/3 top-0 h-full w-px bg-white/50 pointer-events-none"></div>
          
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 active:opacity-100 transition-opacity">
            <span className="text-white/80 text-xs font-bold bg-black/20 px-2 py-1 rounded backdrop-blur">移动</span>
          </div>

          {/* Side Drag Areas (Invisible but draggable) - Significantly Increased Hit Area */}
          <SideHandle mode="t" cursor="ns-resize" style={{ top: -20, left: 20, right: 20, height: 40 }} />
          <SideHandle mode="b" cursor="ns-resize" style={{ bottom: -20, left: 20, right: 20, height: 40 }} />
          <SideHandle mode="l" cursor="ew-resize" style={{ left: -20, top: 20, bottom: 20, width: 40 }} />
          <SideHandle mode="r" cursor="ew-resize" style={{ right: -20, top: 20, bottom: 20, width: 40 }} />

          {/* Corner Handles */}
          <Handle mode="tl" cursor="nw-resize" style={{ top: -12, left: -12 }} />
          <Handle mode="tr" cursor="ne-resize" style={{ top: -12, right: -12 }} />
          <Handle mode="bl" cursor="sw-resize" style={{ bottom: -12, left: -12 }} />
          <Handle mode="br" cursor="se-resize" style={{ bottom: -12, right: -12 }} />
        </div>

        <div className="absolute bottom-6 left-0 w-full flex justify-center gap-12 pointer-events-auto z-40">
          <button onClick={() => setActiveTool('none')} className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-red-500 shadow-xl active:scale-95 transition-transform"><X size={28} /></button>
          <button onClick={applyCrop} className="w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-xl active:scale-95 transition-transform"><Check size={28} /></button>
        </div>
      </div>
    );
  };

  const Modal = () => {
    if (menuContent === 'none') return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">{menuContent === 'version' ? '版本信息' : '关于应用'}</h2>
          <div className="text-gray-600 text-sm space-y-2">
            {menuContent === 'version' ? <p>v1.2.0 (Stable)</p> : <p>轻量级 Web 图片编辑器</p>}
          </div>
          <button onClick={() => setMenuContent('none')} className="mt-6 w-full py-2 bg-gray-900 text-white rounded-xl">关闭</button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-gray-50 font-sans select-none overflow-hidden touch-none">
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      <Header />
      <Modal />
      
      {/* Key Fix 1: Layout */}
      <main className="flex-1 flex items-center justify-center p-4 overflow-hidden bg-gray-100/50">
        {!imageSrc ? (
          <button onClick={() => fileInputRef.current?.click()} className="group flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-gray-300 hover:border-blue-400 bg-white">
            <Plus size={40} className="text-gray-400 group-hover:text-blue-500" />
            <span className="text-gray-500">点击添加图片</span>
          </button>
        ) : (
          <div 
            ref={containerRef}
            className="relative shadow-lg bg-white inline-block" // inline-block wraps content
            style={{ touchAction: 'none' }}
          >
            <canvas
              ref={canvasRef}
              className="block max-w-full max-h-[75vh] w-auto h-auto object-contain" // Ensures aspect ratio is respected
              onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
              onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
            />
            {activeTool === 'crop' && <CropOverlay />}
          </div>
        )}
      </main>

      <SubToolBar />
      <Footer />
    </div>
  );
}

// Re-paste ToolButton for completeness
const ToolButton = ({ icon, label, isActive, onClick }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 p-2 w-16 ${isActive ? 'text-blue-600 -translate-y-2' : 'text-gray-500'}`}>
    <div className={`p-2 rounded-xl ${isActive ? 'bg-blue-100' : ''}`}>{icon}</div>
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);