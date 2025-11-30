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
  
  // Logic: Active Tool vs UI Visibility
  const [activeTool, setActiveTool] = useState<'none' | 'brush' | 'mosaic' | 'eraser' | 'crop'>('none');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Controls the visibility of the settings panel
  
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

  // --- Tool Switching Logic ---
  const handleToolSelect = (tool: 'none' | 'brush' | 'mosaic' | 'eraser' | 'crop') => {
    if (activeTool === tool) {
      // If clicking the same tool, toggle settings panel visibility
      // If it's closed, open it. If it's open, maybe close it? Let's just open it to be safe.
      setIsSettingsOpen(!isSettingsOpen);
    } else {
      // New tool selected
      setActiveTool(tool);
      setIsSettingsOpen(true); // Always show settings for new tool
      
      if (tool === 'crop') {
        setCropRect({ x: 0, y: 0, w: 100, h: 100 });
      }
    }
  };

  const closeSettingsPanel = () => {
    setIsSettingsOpen(false); // Only hide UI, keep tool active
  };

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
          setIsSettingsOpen(false);
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

  // --- Advanced Mosaic/Blur Implementation ---
  const applyMosaicEffect = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, type: 'pixel' | 'blur') => {
    // FIX: Significantly increased size multiplier for mobile visibility
    const multiplier = 4; 
    const effectSize = size * multiplier; 
    
    // Determine the area to sample
    // For pixel: snap to grid. For blur: center around click.
    let startX = x;
    let startY = y;
    
    if (type === 'pixel') {
      startX = Math.floor(x / effectSize) * effectSize;
      startY = Math.floor(y / effectSize) * effectSize;
    } else {
      startX = x - effectSize / 2;
      startY = y - effectSize / 2;
    }

    // Boundary checks
    if (startX < 0) startX = 0;
    if (startY < 0) startY = 0;
    
    // Sample color
    // Note: We try to sample a slightly larger area for better averaging
    const sampleW = Math.min(effectSize, ctx.canvas.width - startX);
    const sampleH = Math.min(effectSize, ctx.canvas.height - startY);
    
    if (sampleW <= 0 || sampleH <= 0) return;

    const imageData = ctx.getImageData(startX, startY, sampleW, sampleH);
    const data = imageData.data;
    
    let r = 0, g = 0, b = 0;
    let count = 0;
    
    // Optimization: Don't sample every single pixel for performance, skip every 4th pixel
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
      // FIX: Blur "Smear" effect implemented as overlapping circles of average color
      // This is much more performant and reliable on mobile than context filters
      ctx.beginPath();
      ctx.arc(x, y, effectSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number, y: number } | null>(null);

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    if (activeTool === 'none' || activeTool === 'crop') return;
    isDrawing.current = true;
    const { x, y } = getCanvasCoordinates(e);
    lastPos.current = { x, y };
    
    // Draw immediately for dots
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
        setIsSettingsOpen(false);
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
    // Only show if tool is active AND settings panel is explicitly open
    if (activeTool === 'none' || activeTool === 'crop' || !isSettingsOpen) return null;

    return (
      <div 
        className="fixed bottom-20 w-full bg-white/95 backdrop-blur-md border-t border-gray-200 p-4 z-30 flex flex-col gap-3 shadow-lg"
        // FIX: Prevent touch events on toolbar from passing through to canvas
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">
            {activeTool === 'brush' ? '画笔设置' : activeTool === 'mosaic' ? '马赛克设置' : '橡皮设置'}
          </span>
          {/* FIX: Close button only closes the panel, not the tool */}
          <button onClick={closeSettingsPanel} className="text-gray-400 p-2 -mr-2">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600 whitespace-nowrap">粗细</span>
          {/* FIX: Added touch-action: none for smooth sliding */}
          <input 
            type="range" 
            min="2" 
            max="50" 
            value={brushSize} 
            onChange={(e) => setBrushSize(parseInt(e.target.value))} 
            className="w-full h-4 bg-gray-200 rounded-lg accent-blue-500 touch-none" 
          />
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
          onClick={() => handleToolSelect('brush')} 
        />
        <ToolButton 
          icon={<Grid3X3 size={24} />} 
          label="马赛克" 
          isActive={activeTool === 'mosaic'}
          onClick={() => handleToolSelect('mosaic')} 
        />
        <ToolButton 
          icon={<Eraser size={24} />} 
          label="橡皮" 
          isActive={activeTool === 'eraser'}
          onClick={() => handleToolSelect('eraser')} 
        />
        <ToolButton 
          icon={<Scissors size={24} />} 
          label="裁剪" 
          isActive={activeTool === 'crop'}
          onClick={() => handleToolSelect('crop')} 
        />
      </div>
    </footer>
  );

  const CropOverlay = () => {
    type Mode = 'move' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | null;
    const [interactionMode, setInteractionMode] = useState<Mode>(null);
    const [startRect, setStartRect] = useState(cropRect);

    // FIX: Completely rewritten Crop Logic using ABSOLUTE COORDINATES instead of deltas.
    // This allows edges to move independently and prevents the "stuck" issue.
    const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
      if (!interactionMode || !containerRef.current) return;
      e.stopPropagation();
      e.preventDefault(); 

      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      
      const { left, top, width, height } = containerRef.current.getBoundingClientRect();
      
      // Calculate current mouse position as percentage of container (0-100)
      const mouseXPct = Math.max(0, Math.min(100, ((clientX - left) / width) * 100));
      const mouseYPct = Math.max(0, Math.min(100, ((clientY - top) / height) * 100));

      let newRect = { ...cropRect };
      // Allow shrinking to very small size (1%)
      const minSize = 1; 

      // Helper values
      const currentRight = cropRect.x + cropRect.w;
      const currentBottom = cropRect.y + cropRect.h;

      switch (interactionMode) {
        case 'move':
            // Logic for move remains delta-based or center-based, but here we can stick to previous start-offset logic
            // For simplicity and stability in this fix, we use the old logic for MOVE ONLY, but check bounds
             // (Skipped for brevity, using simple logic below:)
             // Actually, for Move, we need the start offset.
             // We'll skip complex move logic fix here assuming the user's main complaint was resizing.
             // But to make it work, we need to track start pos.
             // Let's rely on state update for resize which was the main complaint.
             break;

        case 'l': // Left Edge
            // Valid range: 0 to currentRight - minSize
            const newLeftL = Math.min(mouseXPct, currentRight - minSize);
            newRect.x = newLeftL;
            newRect.w = currentRight - newLeftL;
            break;
            
        case 'r': // Right Edge
            // Valid range: currentX + minSize to 100
            const newRightR = Math.max(cropRect.x + minSize, mouseXPct);
            newRect.w = newRightR - cropRect.x;
            break;

        case 't': // Top Edge
            const newTopT = Math.min(mouseYPct, currentBottom - minSize);
            newRect.y = newTopT;
            newRect.h = currentBottom - newTopT;
            break;

        case 'b': // Bottom Edge
            const newBottomB = Math.max(cropRect.y + minSize, mouseYPct);
            newRect.h = newBottomB - cropRect.y;
            break;

        case 'tl': // Top-Left
            const newLeftTL = Math.min(mouseXPct, currentRight - minSize);
            const newTopTL = Math.min(mouseYPct, currentBottom - minSize);
            newRect.x = newLeftTL;
            newRect.w = currentRight - newLeftTL;
            newRect.y = newTopTL;
            newRect.h = currentBottom - newTopTL;
            break;

        case 'tr': // Top-Right
            const newRightTR = Math.max(cropRect.x + minSize, mouseXPct);
            const newTopTR = Math.min(mouseYPct, currentBottom - minSize);
            newRect.w = newRightTR - cropRect.x;
            newRect.y = newTopTR;
            newRect.h = currentBottom - newTopTR;
            break;
            
        case 'bl': // Bottom-Left
            const newLeftBL = Math.min(mouseXPct, currentRight - minSize);
            const newBottomBL = Math.max(cropRect.y + minSize, mouseYPct);
            newRect.x = newLeftBL;
            newRect.w = currentRight - newLeftBL;
            newRect.h = newBottomBL - cropRect.y;
            break;

        case 'br': // Bottom-Right
            const newRightBR = Math.max(cropRect.x + minSize, mouseXPct);
            const newBottomBR = Math.max(cropRect.y + minSize, mouseYPct);
            newRect.w = newRightBR - cropRect.x;
            newRect.h = newBottomBR - cropRect.y;
            break;
      }
      
      // Special handler for Move (Center) which needs deltas
      if (interactionMode === 'move' && startPosRef.current) {
         // Re-implement move logic if needed, or keep existing if it worked ok
         // User didn't complain about Move, only boundaries.
         // Let's leave 'move' logic for next block or use ref
      } else {
         setCropRect(newRect);
      }
    };

    // Need Ref for Move calculation specifically
    const startPosRef = useRef<{x: number, y: number} | null>(null);
    const startRectRef = useRef(cropRect);

    const handleStart = (mode: Mode, e: React.TouchEvent | React.MouseEvent) => {
      e.stopPropagation();
      setInteractionMode(mode);
      
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      startPosRef.current = { x: clientX, y: clientY };
      startRectRef.current = cropRect;
    };
    
    // Separate logic for Move to keep it smooth
    const handleMoveWithMode = (e: React.TouchEvent | React.MouseEvent) => {
        if (!interactionMode) return;
        
        if (interactionMode === 'move' && startPosRef.current && containerRef.current) {
            e.preventDefault();
            e.stopPropagation();
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
            
            const { width, height } = containerRef.current.getBoundingClientRect();
            const dX = ((clientX - startPosRef.current.x) / width) * 100;
            const dY = ((clientY - startPosRef.current.y) / height) * 100;
            
            let newRect = { ...startRectRef.current };
            newRect.x = Math.max(0, Math.min(100 - newRect.w, newRect.x + dX));
            newRect.y = Math.max(0, Math.min(100 - newRect.h, newRect.y + dY));
            setCropRect(newRect);
        } else {
            handleMove(e);
        }
    }

    const handleEnd = () => {
      setInteractionMode(null);
    };

    // Helpers
    const Handle = ({ mode, cursor, style }: { mode: Mode, cursor: string, style: React.CSSProperties }) => (
      <div 
        className="absolute bg-blue-500 border-2 border-white rounded-full shadow-md z-50"
        style={{ width: 24, height: 24, ...style, cursor }}
        onTouchStart={(e) => handleStart(mode, e)}
        onMouseDown={(e) => handleStart(mode, e)}
      />
    );

    const SideHandle = ({ mode, cursor, style }: { mode: Mode, cursor: string, style: React.CSSProperties }) => (
      <div 
        className="absolute z-40"
        style={{ ...style, cursor, backgroundColor: 'rgba(0,0,0,0)', touchAction: 'none' }}
        onTouchStart={(e) => handleStart(mode, e)}
        onMouseDown={(e) => handleStart(mode, e)}
      />
    );

    return (
      <div 
        className="absolute inset-0 z-20 bg-black/50 touch-none" 
        onTouchMove={(e) => e.stopPropagation()} 
        onMouseMove={handleMoveWithMode}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchEnd={handleEnd}
      >
        <div className="absolute inset-0" onMouseMove={handleMoveWithMode} onTouchMove={handleMoveWithMode} />

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
          onTouchMove={handleMoveWithMode}
        >
          {/* Grid lines */}
          <div className="absolute top-1/3 left-0 w-full h-px bg-white/50 pointer-events-none"></div>
          <div className="absolute top-2/3 left-0 w-full h-px bg-white/50 pointer-events-none"></div>
          <div className="absolute left-1/3 top-0 h-full w-px bg-white/50 pointer-events-none"></div>
          <div className="absolute left-2/3 top-0 h-full w-px bg-white/50 pointer-events-none"></div>
          
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 active:opacity-100 transition-opacity">
            <span className="text-white/80 text-xs font-bold bg-black/20 px-2 py-1 rounded backdrop-blur">移动</span>
          </div>

          <SideHandle mode="t" cursor="ns-resize" style={{ top: -20, left: 20, right: 20, height: 40 }} />
          <SideHandle mode="b" cursor="ns-resize" style={{ bottom: -20, left: 20, right: 20, height: 40 }} />
          <SideHandle mode="l" cursor="ew-resize" style={{ left: -20, top: 20, bottom: 20, width: 40 }} />
          <SideHandle mode="r" cursor="ew-resize" style={{ right: -20, top: 20, bottom: 20, width: 40 }} />

          <Handle mode="tl" cursor="nw-resize" style={{ top: -12, left: -12 }} />
          <Handle mode="tr" cursor="ne-resize" style={{ top: -12, right: -12 }} />
          <Handle mode="bl" cursor="sw-resize" style={{ bottom: -12, left: -12 }} />
          <Handle mode="br" cursor="se-resize" style={{ bottom: -12, right: -12 }} />
        </div>

        <div className="absolute bottom-6 left-0 w-full flex justify-center gap-12 pointer-events-auto z-40">
          <button onClick={() => { setActiveTool('none'); setIsSettingsOpen(false); }} className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-red-500 shadow-xl active:scale-95 transition-transform"><X size={28} /></button>
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
            {menuContent === 'version' ? <p>v1.3.0 (Mobile Optimized)</p> : <p>轻量级 Web 图片编辑器</p>}
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
      
      <main className="flex-1 flex items-center justify-center p-4 overflow-hidden bg-gray-100/50">
        {!imageSrc ? (
          <button onClick={() => fileInputRef.current?.click()} className="group flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-gray-300 hover:border-blue-400 bg-white">
            <Plus size={40} className="text-gray-400 group-hover:text-blue-500" />
            <span className="text-gray-500">点击添加图片</span>
          </button>
        ) : (
          <div 
            ref={containerRef}
            className="relative shadow-lg bg-white inline-block"
            style={{ touchAction: 'none' }}
          >
            <canvas
              ref={canvasRef}
              className="block max-w-full max-h-[75vh] w-auto h-auto object-contain"
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
  <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 p-2 w-16 ${isActive ? 'text-blue-600 -translate-y-2' : 'text-gray-500'}`}>
    <div className={`p-2 rounded-xl ${isActive ? 'bg-blue-100' : ''}`}>{icon}</div>
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);