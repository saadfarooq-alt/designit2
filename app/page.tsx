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
  
  const [activeTool, setActiveTool] = useState('cursor');
  const [activeColor, setActiveColor] = useState('#f97316');
  const [globalShowDots, setGlobalShowDots] = useState(true);

  const [draggingDot, setDraggingDot] = useState<{ shapeId: string, dotId: string } | null>(null);
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string } | null>(null);

  const workspaceRef = useRef<SVGSVGElement>(null);

  useEffect(() => { setMounted(true); }, []);

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
  }, [selectedImage]);

  useEffect(() => { if (selectedImage) runTrace(); }, [selectedImage, runTrace]);

  const getCoords = (e: any) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top, rawX: clientX, rawY: clientY };
  };

  const handleMove = (e: any) => {
    if (!workspaceRef.current || (!draggingDot && !draggingShapeId && !resizingId)) return;
    
    // Prevent scrolling ONLY when actively dragging/editing
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

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-slate-100 overflow-hidden text-slate-900"
         onClick={() => setContextMenu(null)}>
      
      {/* HEADER */}
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

      {/* BANNER */}
      <div className="bg-orange-400 text-white text-[10px] font-bold uppercase py-1.5 px-6 flex items-center justify-center gap-2 shrink-0">
        <span>⚠️ Studio Under Construction - Daily Updates ⚠️</span>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* SOURCE PANEL - Added touch-none here to prevent accidental scrolls while tapping paths */}
        <div className="h-[45%] md:h-full md:w-[25%] bg-slate-50 border-b md:border-r p-4 flex flex-col shrink-0 touch-none">
          <div className="flex-1 bg-white rounded-xl border border-slate-200 relative overflow-hidden shadow-inner">
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
              {sourceDots.map(dot => <circle key={dot.id} cx={dot.x} cy={dot.y} r="2.5" fill="#3b82f6" />)}
            </svg>
          </div>
          <button onClick={() => {
            setWorkspaceShapes(prev => [...prev, {
              id: `s-${Date.now()}`, img: selectedImage!, dots: [...sourceDots], dims: { ...imgDims },
              position: { x: 50, y: 50 }, scale: 0.4, showDots: true
            }]);
            setSourceDots([]);
          }} disabled={sourceDots.length === 0} className="mt-2 bg-slate-900 text-white py-3 rounded-lg font-bold text-[10px] uppercase disabled:opacity-30">
            Add to Workspace ↓
          </button>
        </div>

        {/* WORKSPACE - touch-none only here to ensure dot dragging works perfectly */}
        <main className="flex-1 bg-white relative overflow-hidden touch-none"
              onMouseMove={handleMove} onMouseUp={() => { setDraggingDot(null); setDraggingShapeId(null); setResizingId(null); }}
              onTouchMove={handleMove} onTouchEnd={() => { setDraggingDot(null); setDraggingShapeId(null); setResizingId(null); }}>
          <svg ref={workspaceRef} className="w-full h-full">
            {workspaceShapes.map(shape => (
              <g key={shape.id} style={{ transform: `translate(${shape.position.x}px, ${shape.position.y}px) scale(${shape.scale})` }}>
                <defs><clipPath id={`c-${shape.id}`}><path d={generatePathData(shape.dots)} /></clipPath></defs>
                <path d={generatePathData(shape.dots)} fill={shape.fillColor || "transparent"} />
                <image href={shape.img} width={shape.dims.width} height={shape.dims.height} clipPath={`url(#c-${shape.id})`}
                       className="cursor-move"
                       onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, id: shape.id }); }}
                       onMouseDown={(e: any) => {
                         e.stopPropagation();
                         if (activeTool === 'cursor') {
                           setDraggingShapeId(shape.id);
                           const c = getCoords(e);
                           setDragOffset({ x: c.x - shape.position.x, y: c.y - shape.position.y });
                         }
                         if (activeTool === 'fill') setWorkspaceShapes(prev => prev.map(s => s.id === shape.id ? {...s, fillColor: activeColor} : s));
                         if (activeTool === 'erase') setWorkspaceShapes(prev => prev.filter(s => s.id !== shape.id));
                       }}
                       onTouchStart={(e: any) => {
                         e.stopPropagation();
                         if (activeTool === 'cursor') {
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
          
          {/* CONTEXT MENU */}
          {contextMenu && (
            <div className="fixed bg-white border shadow-xl rounded-md py-1 z-[100] min-w-[120px]"
                 style={{ left: contextMenu.x, top: contextMenu.y }}>
              <button onClick={() => {
                const shape = workspaceShapes.find(s => s.id === contextMenu.id);
                if (shape) setWorkspaceShapes([...workspaceShapes.filter(s => s.id !== contextMenu.id), shape]);
                setContextMenu(null);
              }} className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase hover:bg-slate-50 border-b">
                Bring To Front
              </button>
              <button onClick={() => {
                setWorkspaceShapes(prev => prev.map(s => s.id === contextMenu.id ? {...s, showDots: !s.showDots} : s));
                setContextMenu(null);
              }} className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase hover:bg-slate-50">
                Toggle Dots
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

      {/* FOOTER - Removed touch-none here to allow template scrolling */}
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