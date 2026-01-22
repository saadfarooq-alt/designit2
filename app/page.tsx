"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import ImageTracer from 'imagetracerjs';

interface Dot { id: string; x: number; y: number; }
interface DistortableShape { 
  id: string; 
  img: string; 
  dots: Dot[]; 
  dims: { width: number; height: number };
  position: { x: number; y: number }; 
  scale: number;
  showDots: boolean;
  fillColor?: string;
}

export default function DesignStudio() {
  const [mounted, setMounted] = useState(false);
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [sourceDots, setSourceDots] = useState<Dot[]>([]);
  const [workspaceShapes, setWorkspaceShapes] = useState<DistortableShape[]>([]);
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  
  const [sourceZoom, setSourceZoom] = useState(1);
  const [activeTool, setActiveTool] = useState('cursor');
  const [activeColor, setActiveColor] = useState('#f97316');
  const [globalShowDots, setGlobalShowDots] = useState(true);

  const [draggingDot, setDraggingDot] = useState<{ shapeId: string, dotId: string } | null>(null);
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string } | null>(null);

  // Pinch & Long Press Tracking
  const [initialPinchDist, setInitialPinchDist] = useState<number | null>(null);
  const [initialPinchScale, setInitialPinchScale] = useState<number | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const workspaceRef = useRef<SVGSVGElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // --- PRODUCTION & MOBILE GESTURE ENGINE ---
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) { 
        e.preventDefault();
        const zoomSpeed = 0.01;
        const delta = -e.deltaY;
        setWorkspaceShapes(prev => {
            if (!draggingShapeId && prev.length === 0) return prev;
            const targetId = draggingShapeId || prev[prev.length - 1].id;
            return prev.map(s => s.id === targetId ? { ...s, scale: Math.max(0.05, s.scale + delta * zoomSpeed) } : s);
        });
      }
    };

    const handleTouch = (e: TouchEvent) => {
      // Prevent browser scale on multi-touch
      if (e.touches.length > 1 && e.cancelable) e.preventDefault();
    };

    // Use passive: false to ensure preventDefault() works in production
    workspace.addEventListener('wheel', handleWheel, { passive: false });
    workspace.addEventListener('touchstart', handleTouch, { passive: false });
    workspace.addEventListener('touchmove', handleTouch, { passive: false });

    return () => {
      workspace.removeEventListener('wheel', handleWheel);
      workspace.removeEventListener('touchstart', handleTouch);
      workspace.removeEventListener('touchmove', handleTouch);
    };
  }, [mounted, draggingShapeId]);

  const generatePathData = (dots: Dot[]) => {
    if (dots.length === 0) return "";
    return `M ${dots[0].x} ${dots[0].y} ` + dots.slice(1).map(d => `L ${d.x} ${d.y}`).join(' ') + " Z";
  };

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/templates');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) { 
          setTemplates(data); 
          setSelectedImage(data[0]); 
        }
      } catch (e) { console.error(e); }
    }
    load();
  }, []);

  const runTrace = useCallback(() => {
    if (!selectedImage) return;
    const img = new Image();
    img.crossOrigin = "anonymous"; 
    img.onload = () => {
      setImgDims({ width: img.width, height: img.height });
      ImageTracer.imageToSVG(selectedImage, (svgString: string) => {
        const inner = svgString.replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "").replace(/<rect[^>]*\/>/g, ""); 
        setSvgContent(inner);
      }, { numberofcolors: 2, ltres: 1, qtres: 1, scale: 1 });
    };
    img.src = selectedImage;
    setSourceZoom(1);
  }, [selectedImage]);

  useEffect(() => { if (selectedImage) runTrace(); }, [selectedImage, runTrace]);

  const getCoords = (e: any) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top, rawX: clientX, rawY: clientY };
  };

  const getTouchDist = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent, shapeId: string) => {
    // Clear any pending long-press if a new touch starts
    if (longPressTimer.current) clearTimeout(longPressTimer.current);

    if (e.touches.length === 2) {
      // Pinch Initialization
      const dist = getTouchDist(e.touches);
      const shape = workspaceShapes.find(s => s.id === shapeId);
      if (shape) {
        setInitialPinchDist(dist);
        setInitialPinchScale(shape.scale);
        setDraggingShapeId(shapeId);
      }
    } else if (e.touches.length === 1) {
      // Long Press Initialization for Mobile Menu
      const touch = e.touches[0];
      longPressTimer.current = setTimeout(() => {
        setContextMenu({ x: touch.clientX, y: touch.clientY, id: shapeId });
        if (window.navigator.vibrate) window.navigator.vibrate(50); // Feedback
      }, 600); // Trigger after 600ms
    }
  };

  const handleMove = (e: any) => {
    // If movement occurs, it's not a long press
    if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    }

    if (!workspaceRef.current || (!draggingDot && !draggingShapeId && !resizingId)) return;
    
    // PINCH ZOOM (Mobile)
    if (e.touches && e.touches.length === 2 && draggingShapeId && initialPinchDist && initialPinchScale !== null) {
      const currentDist = getTouchDist(e.touches);
      const factor = currentDist / initialPinchDist;
      setWorkspaceShapes(prev => prev.map(s => s.id === draggingShapeId ? { ...s, scale: Math.max(0.05, initialPinchScale * factor) } : s));
      return;
    }

    if (e.cancelable) e.preventDefault();
    const coords = getCoords(e);

    if (resizingId) {
      const dx = coords.rawX - dragOffset.x;
      setWorkspaceShapes(prev => prev.map(s => s.id === resizingId ? { ...s, scale: Math.max(0.1, s.scale + (dx / 300)) } : s));
      setDragOffset({ x: coords.rawX, y: coords.rawY });
    } else if (draggingDot) {
      setWorkspaceShapes(prev => prev.map(s => s.id !== draggingDot.shapeId ? s : {
        ...s, dots: s.dots.map(d => d.id === draggingDot.dotId ? { ...d, x: (coords.x - s.position.x) / s.scale, y: (coords.y - s.position.y) / s.scale } : d)
      }));
    } else if (draggingShapeId) {
      setWorkspaceShapes(prev => prev.map(s => s.id === draggingShapeId ? { ...s, position: { x: coords.x - dragOffset.x, y: coords.y - dragOffset.y } } : s));
    }
  };

  const clearInteraction = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    setDraggingDot(null);
    setDraggingShapeId(null);
    setResizingId(null);
    setInitialPinchDist(null);
    setInitialPinchScale(null);
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-slate-100 overflow-hidden text-slate-900" 
         onClick={() => setContextMenu(null)}
         style={{ WebkitUserSelect: 'none', userSelect: 'none' }}>
      
      <header className="h-[60px] flex items-center justify-between px-6 bg-white border-b shrink-0 z-50">
        <span className="font-black text-xs uppercase tracking-tight">Studio v2</span>
        <div className="flex gap-4 items-center">
           <input type="color" value={activeColor} onChange={(e) => setActiveColor(e.target.value)} className="w-8 h-8 rounded-full border-none cursor-pointer" />
           <label className="bg-blue-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase cursor-pointer">
             Upload <input type="file" className="hidden" onChange={(e) => {
               const f = e.target.files?.[0]; if (f) setSelectedImage(URL.createObjectURL(f));
             }} />
           </label>
           <button onClick={() => setWorkspaceShapes([])} className="bg-red-50 text-red-500 px-3 py-2 rounded-lg text-[8px] font-bold uppercase">Reset</button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <div className="h-[50%] md:h-full md:w-[30%] bg-slate-50 border-b md:border-r p-4 flex flex-col shrink-0">
          <div className="flex justify-between items-center mb-2 px-1">
             <span className="text-[10px] font-bold text-slate-500 uppercase">Source Zoom</span>
             <input type="range" min="1" max="5" step="0.1" value={sourceZoom} onChange={(e)=>setSourceZoom(parseFloat(e.target.value))} className="w-24 accent-blue-600" />
          </div>
          <div className="flex-1 bg-white rounded-xl border border-slate-200 relative overflow-auto shadow-inner">
            <div style={{ width: `${100 * sourceZoom}%`, height: `${100 * sourceZoom}%` }} className="relative">
              <svg viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full cursor-crosshair">
                {selectedImage && <image href={selectedImage} width={imgDims.width} height={imgDims.height} />}
                {svgContent && <g dangerouslySetInnerHTML={{ __html: svgContent }} onClick={(e:any) => {
                  const target = e.target as SVGPathElement;
                  if (target?.tagName.toLowerCase() === 'path') {
                    const len = target.getTotalLength();
                    const pts: Dot[] = [];
                    for (let i = 0; i <= len; i += 15) {
                      const p = target.getPointAtLength(i);
                      pts.push({ id: Math.random().toString(36).substring(7), x: p.x, y: p.y });
                    }
                    setSourceDots(pts);
                  }
                }} className="opacity-0" style={{ pointerEvents: 'auto' }} />}
                {sourceDots.map(dot => <circle key={dot.id} cx={dot.x} cy={dot.y} r={3 / sourceZoom} fill="#3b82f6" />)}
              </svg>
            </div>
          </div>
          <button onClick={() => {
            setWorkspaceShapes(prev => [...prev, {
              id: `s-${Date.now()}`, img: selectedImage!, dots: [...sourceDots], dims: { ...imgDims },
              position: { x: 50, y: 50 }, scale: 0.4, showDots: true
            }]);
            setSourceDots([]);
          }} disabled={sourceDots.length === 0} className="mt-2 bg-slate-900 text-white py-3 rounded-lg font-bold text-[10px] uppercase">
            Add to Workspace ↓
          </button>
        </div>

        <main className="flex-1 bg-white relative overflow-hidden touch-none"
              style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
              onMouseMove={handleMove} onMouseUp={clearInteraction}
              onTouchMove={handleMove} onTouchEnd={clearInteraction}>
          <svg ref={workspaceRef} className="w-full h-full">
            {workspaceShapes.map(shape => (
              <g key={shape.id} style={{ transform: `translate(${shape.position.x}px, ${shape.position.y}px) scale(${shape.scale})` }}>
                <defs><clipPath id={`c-${shape.id}`}><path d={generatePathData(shape.dots)} /></clipPath></defs>
                <path d={generatePathData(shape.dots)} fill={shape.fillColor || "transparent"} />
                <image href={shape.img} width={shape.dims.width} height={shape.dims.height} clipPath={`url(#c-${shape.id})`}
                       className="cursor-move"
                       style={{ WebkitTouchCallout: 'none' }}
                       onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, id: shape.id }); }}
                       onMouseDown={(e: any) => {
                         e.stopPropagation();
                         if (activeTool === 'cursor') {
                           setDraggingShapeId(shape.id);
                           const c = getCoords(e);
                           setDragOffset({ x: c.x - shape.position.x, y: c.y - shape.position.y });
                         }
                       }}
                       onTouchStart={(e: any) => {
                         e.stopPropagation();
                         handleTouchStart(e, shape.id); 
                         if (activeTool === 'cursor' && e.touches.length === 1) {
                           setDraggingShapeId(shape.id);
                           const c = getCoords(e);
                           setDragOffset({ x: c.x - shape.position.x, y: c.y - shape.position.y });
                         }
                         if (activeTool === 'fill') setWorkspaceShapes(prev => prev.map(s => s.id === shape.id ? {...s, fillColor: activeColor} : s));
                         if (activeTool === 'erase') setWorkspaceShapes(prev => prev.filter(s => s.id !== shape.id));
                       }} />
                {globalShowDots && (
                  <>
                    <path d={generatePathData(shape.dots)} fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4" />
                    {shape.dots.map(dot => (
                      <circle key={dot.id} cx={dot.x} cy={dot.y} r="3" fill="#3b82f6"
                              onMouseDown={(e) => { e.stopPropagation(); setDraggingDot({ shapeId: shape.id, dotId: dot.id }); }}
                              onTouchStart={(e) => { e.stopPropagation(); setDraggingDot({ shapeId: shape.id, dotId: dot.id }); }} />
                    ))}
                    <rect x={shape.dims.width - 10} y={shape.dims.height - 10} width="20" height="20" fill="#f97316" rx="4"
                          onMouseDown={(e:any) => { e.stopPropagation(); setResizingId(shape.id); setDragOffset({ x: e.clientX, y: e.clientY }); }}
                          onTouchStart={(e:any) => { e.stopPropagation(); setResizingId(shape.id); setDragOffset({ x: e.touches[0].clientX, y: e.touches[0].clientY }); }} />
                  </>
                )}
              </g>
            ))}
          </svg>
          
          {contextMenu && (
            <div className="fixed bg-white border shadow-2xl rounded-lg py-2 z-[100] min-w-[150px]"
                 style={{ left: contextMenu.x, top: contextMenu.y }}>
              <button onClick={() => {
                const shape = workspaceShapes.find(s => s.id === contextMenu.id);
                if (shape) setWorkspaceShapes([...workspaceShapes.filter(s => s.id !== contextMenu.id), shape]);
                setContextMenu(null);
              }} className="w-full text-left px-5 py-3 text-[11px] font-bold uppercase hover:bg-slate-50 border-b">
                Bring To Front
              </button>
              <button onClick={() => setContextMenu(null)} className="w-full text-left px-5 py-3 text-[11px] font-bold uppercase text-red-500 hover:bg-red-50">
                Cancel
              </button>
            </div>
          )}
        </main>

        <aside className="hidden md:flex w-24 border-l bg-white flex-col items-center py-6 gap-4 shrink-0">
          {['cursor', 'fill', 'erase'].map(t => (
            <button key={t} onClick={() => setActiveTool(t)} className={`w-16 h-16 py-2 rounded-lg text-[10px] font-bold uppercase ${activeTool === t ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400'}`}>{t}</button>
          ))}
          <button onClick={() => setGlobalShowDots(!globalShowDots)} className={`w-16 h-16 py-2 rounded-lg text-[10px] font-bold uppercase ${globalShowDots ? 'bg-orange-100 text-orange-600' : 'bg-slate-50 text-slate-400'}`}>Dots</button>
        </aside>
      </div>

      <footer className="h-[130px] md:h-[90px] w-full bg-white border-t flex flex-col shrink-0">
        <div className="flex-1 flex items-center px-4 gap-3 overflow-x-auto border-b">
           {templates.map((url, i) => (
             <img key={i} src={url} onClick={() => setSelectedImage(url)} 
                  className={`h-14 w-14 object-cover rounded-lg border-2 shrink-0 ${selectedImage === url ? 'border-blue-600' : 'border-slate-100'}`} />
           ))}
        </div>
        <div className="h-[60px] md:hidden flex items-center justify-around px-2">
          {['cursor', 'fill', 'erase'].map(t => (
            <button key={t} onClick={() => setActiveTool(t)} className={`flex-1 mx-1 py-2 rounded-lg text-[10px] font-bold uppercase ${activeTool === t ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400'}`}>{t}</button>
          ))}
          <button onClick={() => setGlobalShowDots(!globalShowDots)} className={`flex-1 mx-1 py-2 rounded-lg text-[10px] font-bold uppercase ${globalShowDots ? 'bg-orange-100 text-orange-600' : 'bg-slate-50 text-slate-400'}`}>Dots</button>
        </div>
      </footer>
    </div>
  );
}