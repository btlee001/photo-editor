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
 * Custom Slider Component for smooth mobile touch dragging
 * Replaces native input range for better mobile experience
 */
const TouchSlider = ({ value, min, max, onChange, className }: { value: number, min: number, max: number, onChange: (val: number) => void, className?: string }) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const calculateAndSetValue = (clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    let percentage = (clientX - rect.left) / rect.width;
    percentage = Math.max(0, Math.min(1, percentage));
    const newValue = Math.round(min + percentage * (max - min));
    onChange(newValue);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // FIX: Prevent browser scrolling/gestures when starting slide
    e.preventDefault();
    e.stopPropagation(); // Stop event bubbling
    isDragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    calculateAndSetValue(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    e.stopPropagation();
    calculateAndSetValue(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging.current) {
      isDragging.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div 
      ref={sliderRef}
      // FIX: Added inline touchAction: 'none' which is critical for mobile drag
      style={{ touchAction: 'none' }}
      className={`relative h-10 flex items-center cursor-pointer ${className}`} 
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="w-full h-2 bg-gray-200 rounded-full pointer-events-none overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${percentage}%` }} />
      </div>
      <div 
        className="absolute w-7 h-7 bg-white border-2 border-blue-500 rounded-full shadow-md top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ left: `calc(${percentage}% - 14px)` }}
      />
    </div>
  );
};

/**
 * Main Application Component
 */
export default function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [originalImageObj, setOriginalImageObj] = useState<HTMLImageElement | null>(null); 
  const [showMenu, setShowMenu] = useState(false);
  const [activeTool, setActiveTool] = useState<'none' | 'brush' | 'mosaic' | 'eraser' | 'crop'>('none');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [menuContent, setMenuContent] = useState<'none' | 'version' | 'about'>('none');
  
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(20); 
  const [mosaicType, setMosaicType] = useState<'pixel' | 'blur'>('pixel');
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 100, h: 100 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleToolSelect = (tool: 'none' | 'brush' | 'mosaic' | 'eraser' | 'crop') => {
    if (activeTool === tool) {
      setIsSettingsOpen(!isSettingsOpen);
    } else {
      setActiveTool(tool);
      setIsSettingsOpen(true); 
      if (tool === 'crop') {
        setCropRect({ x: 0, y: 0, w: 100, h: 100 });
      }
    }
  };

  const closeSettingsPanel = () => {
    setIsSettingsOpen(false);
  };

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
          setIsSettingsOpen(false);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (imageSrc && canvasRef.current && originalImageObj) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = originalImageObj.width;
      canvas.height = originalImageObj.height;
      ctx.drawImage(originalImageObj, 0, 0);
    }
  }, [imageSrc, originalImageObj]);

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

  const applyMosaicEffect = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, type: 'pixel' | 'blur') => {
    const multiplier = 4; 
    const effectSize = size * multiplier; 
    let startX = x;
    let startY = y;
    
    if (type === 'pixel') {
      startX = Math.floor(x / effectSize) * effectSize;
      startY = Math.floor(y / effectSize) * effectSize;
    } else {
      startX = x - effectSize / 2;
      startY = y - effectSize / 2;
    }

    if (startX < 0) startX = 0;
    if (startY < 0) startY = 0;
    
    const sampleW = Math.min(effectSize, ctx.canvas.width - startX);
    const sampleH = Math.min(effectSize, ctx.canvas.height - startY);
    
    if (sampleW <= 0 || sampleH <= 0) return;

    const imageData = ctx.getImageData(startX, startY, sampleW, sampleH);
    const data = imageData.data;
    
    let r = 0, g = 0, b = 0;
    let count = 0;
    
    for (let i = 0; i < data.length; i += 16) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    
    if (count > 0) {
      r = Math.floor(r / count);
      g = Math.floor(g / count);
      b = Math.floor(b / count);
    }

    ctx.fillStyle = `rgb(${r},${g},${b})`;

    if (type === 'pixel') {
      ctx.fillRect(startX, startY, effectSize, effectSize);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, effectSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number, y: number } | null>(null);

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    if (activeTool === 'none' || activeTool === 'crop') return;
    
    // FIX: Auto-close settings panel when user touches canvas to draw
    if (isSettingsOpen) {
      closeSettingsPanel();
    }

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
      applyMosaicEffect(ctx, x, y, brushSize, mosaicType);
    } else if (activeTool === 'eraser' && originalImageObj) {
      // FIX: Increase eraser size multiplier to 5x for better mobile usability
      const eraserMultiplier = 5; 
      const effectiveEraserSize = brushSize * eraserMultiplier;
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, effectiveEraserSize, 0, Math.PI * 2);
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
        setIsSettingsOpen(false);
      };
      newImg.src = newUrl;
    }
  };

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
    if (activeTool === 'none' || activeTool === 'crop' || !isSettingsOpen) return null;

    return (
      <div 
        className="fixed bottom-20 w-full bg-white/95 backdrop-blur-md border-t border-gray-200 p-4 z-30 flex flex-col gap-3 shadow-lg animate-in slide-in-from-bottom-5"
        // FIX: Ensure toolbar itself doesn't catch scroll events that should be drags
        style={{ touchAction: 'none' }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">
            {activeTool === 'brush' ? '画笔设置' : activeTool === 'mosaic' ? '马赛克设置' : '橡皮设置'}
          </span>
          <button onClick={closeSettingsPanel} className="text-gray-400 p-2 -mr-2 active:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="flex items-center gap-4 pl-1">
          <span className="text-sm text-gray-600 whitespace-nowrap font-medium">粗细</span>
          <TouchSlider 
            value={brushSize}
            min={5}
            max={80}
            onChange={setBrushSize}
            className="flex-1 mx-2"
          />
          <div className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg bg-gray-50 shrink-0">
             <div className="rounded-full" style={{ backgroundColor: activeTool === 'brush' ? brushColor : '#9ca3af', width: Math.min(24, brushSize/2), height: Math.min(24, brushSize/2) }} />
          </div>
        </div>

        {activeTool === 'brush' && (
          <div className="flex items-center gap-3 overflow-x-auto pb-2 pt-1 no-scrollbar pl-1">
            {['#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#9900ff', '#ff00ff', '#000000', '#ffffff'].map(c => (
              <button key={c} onClick={() => setBrushColor(c)} className={`w-9 h-9 rounded-full border-2 shadow-sm shrink-0 ${brushColor === c ? 'border-blue-500 scale-110' : 'border-white'}`} style={{ backgroundColor: c }} />
            ))}
            <div className="relative w-9 h-9 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 bg-gradient-to-br from-red-500 via-green-500 to-blue-500">
                 <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
            </div>
          </div>
        )}

        {activeTool === 'mosaic' && (
          <div className="flex gap-3 pt-1 px-1">
            <button onClick={() => setMosaicType('pixel')} className={`flex-1 py-2.5 text-sm font-medium rounded-xl border shadow-sm transition-all ${mosaicType === 'pixel' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-700 active:bg-gray-50'}`}>方块像素</button>
            <button onClick={() => setMosaicType('blur')} className={`flex-1 py-2.5 text-sm font-medium rounded-xl border shadow-sm transition-all ${mosaicType === 'blur' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-700 active:bg-gray-50'}`}>模糊涂抹</button>
          </div>
        )}
      </div>
    );
  };

  const Footer = () => (
    <footer className="h-20 bg-white border-t border-gray-200 fixed bottom-0 w-full z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <div className="flex justify-around items-center h-full px-4 max-w-md mx-auto">
        <ToolButton 
          icon={<Palette size={26} />} 
          label="画笔" 
          isActive={activeTool === 'brush'}
          onClick={() => handleToolSelect('brush')} 
        />
        <ToolButton 
          icon={<Grid3X3 size={26} />} 
          label="马赛克" 
          isActive={activeTool === 'mosaic'}
          onClick={() => handleToolSelect('mosaic')} 
        />
        <ToolButton 
          icon={<Eraser size={26} />} 
          label="橡皮" 
          isActive={activeTool === 'eraser'}
          onClick={() => handleToolSelect('eraser')} 
        />
        <ToolButton 
          icon={<Scissors size={26} />} 
          label="裁剪" 
          isActive={activeTool === 'crop'}
          onClick={() => handleToolSelect('crop')} 
        />
      </div>
    </footer>
  );

  const CropOverlay = () => {
    type HandleType = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';
    const [activeHandle, setActiveHandle] = useState<HandleType | null>(null);
    const startPosRef = useRef<{x: number, y: number} | null>(null);
    const startRectRef = useRef(cropRect);

    const handlePointerDown = (type: HandleType, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveHandle(type);
      e.currentTarget.setPointerCapture(e.pointerId);
      startPosRef.current = { x: e.clientX, y: e.clientY };
      startRectRef.current = cropRect;
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      if (!activeHandle || !startPosRef.current || !containerRef.current) return;
      // FIX: Prevent browser behavior explicitly in move to keep events firing continuously
      e.preventDefault(); 
      e.stopPropagation();

      const deltaXPix = e.clientX - startPosRef.current.x;
      const deltaYPix = e.clientY - startPosRef.current.y;
      
      const { width: containerW, height: containerH } = containerRef.current.getBoundingClientRect();
      if (containerW === 0 || containerH === 0) return;

      const dX = (deltaXPix / containerW) * 100;
      const dY = (deltaYPix / containerH) * 100;

      let newRect = { ...startRectRef.current };
      // FIX: Minimal size set to 1% to allow virtually unlimited resizing
      const minSize = 1;

      switch (activeHandle) {
        case 'l': 
          const newXL = Math.min(Math.max(0, startRectRef.current.x + dX), startRectRef.current.x + startRectRef.current.w - minSize);
          newRect.x = newXL;
          newRect.w = startRectRef.current.w - (newXL - startRectRef.current.x);
          break;
        case 'r': 
          newRect.w = Math.max(minSize, Math.min(100 - startRectRef.current.x, startRectRef.current.w + dX));
          break;
        case 't': 
          const newYT = Math.min(Math.max(0, startRectRef.current.y + dY), startRectRef.current.y + startRectRef.current.h - minSize);
          newRect.y = newYT;
          newRect.h = startRectRef.current.h - (newYT - startRectRef.current.y);
          break;
        case 'b': 
          newRect.h = Math.max(minSize, Math.min(100 - startRectRef.current.y, startRectRef.current.h + dY));
          break;
        case 'tl':
          const newXTL = Math.min(Math.max(0, startRectRef.current.x + dX), startRectRef.current.x + startRectRef.current.w - minSize);
          newRect.x = newXTL;
          newRect.w = startRectRef.current.w - (newXTL - startRectRef.current.x);
          const newYTL = Math.min(Math.max(0, startRectRef.current.y + dY), startRectRef.current.y + startRectRef.current.h - minSize);
          newRect.y = newYTL;
          newRect.h = startRectRef.current.h - (newYTL - startRectRef.current.y);
          break;
        case 'tr':
          newRect.w = Math.max(minSize, Math.min(100 - startRectRef.current.x, startRectRef.current.w + dX));
          const newYTR = Math.min(Math.max(0, startRectRef.current.y + dY), startRectRef.current.y + startRectRef.current.h - minSize);
          newRect.y = newYTR;
          newRect.h = startRectRef.current.h - (newYTR - startRectRef.current.y);
          break;
        case 'bl':
          const newXBL = Math.min(Math.max(0, startRectRef.current.x + dX), startRectRef.current.x + startRectRef.current.w - minSize);
          newRect.x = newXBL;
          newRect.w = startRectRef.current.w - (newXBL - startRectRef.current.x);
          newRect.h = Math.max(minSize, Math.min(100 - startRectRef.current.y, startRectRef.current.h + dY));
          break;
        case 'br':
          newRect.w = Math.max(minSize, Math.min(100 - startRectRef.current.x, startRectRef.current.w + dX));
          newRect.h = Math.max(minSize, Math.min(100 - startRectRef.current.y, startRectRef.current.h + dY));
          break;
      }

      setCropRect(newRect);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
      if (activeHandle) {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setActiveHandle(null);
        startPosRef.current = null;
      }
    };

    const Handle = ({ type, cursor, style }: { type: HandleType, cursor: string, style: React.CSSProperties }) => (
      <div 
        className="absolute bg-blue-500 border-2 border-white rounded-full shadow-md z-50"
        // FIX: style touchAction 'none' is mandatory for consistent drag
        style={{ width: 24, height: 24, ...style, cursor, touchAction: 'none' }}
        onPointerDown={(e) => handlePointerDown(type, e)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    );

    const SideHandle = ({ type, cursor, style }: { type: HandleType, cursor: string, style: React.CSSProperties }) => (
      <div 
        className="absolute z-40"
        // FIX: style touchAction 'none' is mandatory for consistent drag
        style={{ ...style, cursor, backgroundColor: 'rgba(0,0,0,0)', touchAction: 'none' }} 
        onPointerDown={(e) => handlePointerDown(type, e)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    );

    return (
      // FIX: Ensure overlay itself doesn't trap scrolls
      <div className="absolute inset-0 z-20 bg-black/50" style={{ touchAction: 'none' }} onPointerUp={handlePointerUp}>
        <div 
          className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] box-content -ml-[2px] -mt-[2px]"
          style={{
            left: `${cropRect.x}%`,
            top: `${cropRect.y}%`,
            width: `${cropRect.w}%`,
            height: `${cropRect.h}%`,
          }}
        >
          <div className="absolute top-1/3 left-0 w-full h-px bg-white/40 pointer-events-none"></div>
          <div className="absolute top-2/3 left-0 w-full h-px bg-white/40 pointer-events-none"></div>
          <div className="absolute left-1/3 top-0 h-full w-px bg-white/40 pointer-events-none"></div>
          <div className="absolute left-2/3 top-0 h-full w-px bg-white/40 pointer-events-none"></div>
          
          <SideHandle type="t" cursor="ns-resize" style={{ top: -20, left: 10, right: 10, height: 40 }} />
          <SideHandle type="b" cursor="ns-resize" style={{ bottom: -20, left: 10, right: 10, height: 40 }} />
          <SideHandle type="l" cursor="ew-resize" style={{ left: -20, top: 10, bottom: 10, width: 40 }} />
          <SideHandle type="r" cursor="ew-resize" style={{ right: -20, top: 10, bottom: 10, width: 40 }} />

          <Handle type="tl" cursor="nw-resize" style={{ top: -12, left: -12 }} />
          <Handle type="tr" cursor="ne-resize" style={{ top: -12, right: -12 }} />
          <Handle type="bl" cursor="sw-resize" style={{ bottom: -12, left: -12 }} />
          <Handle type="br" cursor="se-resize" style={{ bottom: -12, right: -12 }} />
        </div>

        <div className="absolute bottom-8 left-0 w-full flex justify-center gap-16 pointer-events-auto z-50">
          <button onClick={() => { setActiveTool('none'); setIsSettingsOpen(false); }} className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-red-500 shadow-2xl active:scale-95 transition-transform">
            <X size={32} />
          </button>
          <button onClick={applyCrop} className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-2xl active:scale-95 transition-transform">
            <Check size={32} />
          </button>
        </div>
      </div>
    );
  };

  const Modal = () => {
    if (menuContent === 'none') return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl scale-100 animate-in zoom-in-95">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            {menuContent === 'version' ? <Info className="text-blue-500" size={28}/> : <ImageIcon className="text-purple-500" size={28}/>}
            {menuContent === 'version' ? '版本信息' : '关于应用'}
          </h2>
          
          {menuContent === 'version' ? (
            <div className="space-y-4 text-gray-600">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="font-medium">当前版本</span>
                <span className="font-mono bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm">v2.1.0</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                 <span className="font-medium">构建日期</span>
                 <span>2025-11-30</span>
              </div>
              <p className="text-sm pt-2">已针对移动端触控操作进行全面优化。</p>
            </div>
          ) : (
            <div className="space-y-4 text-gray-600">
              <p className="text-lg leading-relaxed">一个轻量级、纯前端的 Web 图片编辑器。</p>
              <ul className="list-disc list-inside space-y-2 text-sm pt-2">
                  <li>所有操作均在本地浏览器完成</li>
                  <li>无需上传图片到服务器</li>
                  <li>保护您的隐私安全</li>
              </ul>
              <p className="pt-6 text-center text-sm text-gray-400">Designed & Developed by Gemini</p>
            </div>
          )}
          
          <button 
            onClick={() => setMenuContent('none')}
            className="mt-8 w-full py-3.5 bg-gray-900 text-white rounded-2xl font-bold text-lg active:bg-gray-800 transition-colors shadow-md"
          >
            关闭
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-gray-100 font-sans select-none overflow-hidden touch-none fixed inset-0">
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      <Header />
      <Modal />
      
      <main className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
        {!imageSrc ? (
          <button onClick={() => fileInputRef.current?.click()} className="group flex flex-col items-center gap-6 p-10 rounded-3xl border-2 border-dashed border-gray-300 hover:border-blue-400 bg-white shadow-sm active:scale-95 transition-all">
            <div className="p-6 bg-gray-50 rounded-full group-hover:bg-blue-50 transition-colors">
              <Plus size={48} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <span className="text-lg text-gray-500 font-medium">点击添加图片</span>
          </button>
        ) : (
          <div 
            ref={containerRef}
            // FIX: Removed overflow-hidden so crop handles are visible and touchable outside the image bounds
            className="relative shadow-2xl bg-white inline-block rounded-lg"
            style={{ touchAction: 'none' }}
          >
            <canvas
              ref={canvasRef}
              className="block max-w-full max-h-[70vh] w-auto h-auto object-contain"
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

const ToolButton = ({ icon, label, isActive, onClick }: any) => (
  <button 
    onClick={onClick} 
    className={`flex flex-col items-center justify-center gap-1.5 p-2 w-20 transition-all duration-300 ${isActive ? 'text-blue-600 -translate-y-3' : 'text-gray-500 active:scale-95'}`}
  >
    <div className={`p-3 rounded-2xl transition-all shadow-sm ${isActive ? 'bg-blue-100 shadow-md scale-110' : 'bg-white border border-gray-100'}`}>
      {icon}
    </div>
    <span className={`text-xs font-bold transition-opacity ${isActive ? 'opacity-100' : 'opacity-70'}`}>{label}</span>
  </button>
);