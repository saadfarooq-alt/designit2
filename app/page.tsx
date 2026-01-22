"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import ImageTracer from "imagetracerjs";

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
interface Stroke { id: string; points: { x: number; y: number }[]; color: string; width: number; }
type HistoryItem = { shapes: DistortableShape[]; strokes: Stroke[]; penDots: Dot[] };

type Candidate = {
  id: string;
  d: string;
  area: number;
  selected: boolean;
};

export default function DesignStudio() {
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Tracing & Source State ---
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sourceDots, setSourceDots] = useState<Dot[]>([]);
  const [sourceZoom, setSourceZoom] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  // --- Workspace & Tool State ---
  const [workspaceShapes, setWorkspaceShapes] = useState<DistortableShape[]>([]);
  const [activeTool, setActiveTool] = useState<"cursor" | "pen" | "fill" | "erase">("cursor");
  const [activeColor, setActiveColor] = useState("#f97316");
  const [globalShowDots, setGlobalShowDots] = useState(true);
  const [strokes, setStrokes] = useState<Stroke[]>([]);

  // --- Interaction State ---
  const [draggingDot, setDraggingDot] = useState<{ shapeId: string; dotId: string } | null>(null);
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  
  const [initialPinchDist, setInitialPinchDist] = useState<number | null>(null);
  const [initialPinchScale, setInitialPinchScale] = useState<number | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const MAX_HISTORY = 50;

  const workspaceRef = useRef<SVGSVGElement | null>(null);
  const isPointerDownRef = useRef(false);
  const penRef = useRef<{ pointerId: number; lastX: number; lastY: number; strokeId: string } | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { 
    setMounted(true); 
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 1. Load Templates
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/templates");
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setTemplates(data);
          setSelectedImage(data[0]);
        }
      } catch (e) {
        const fallbacks = ["/template1.png", "/template2.png"];
        setTemplates(fallbacks);
        setSelectedImage(fallbacks[0]);
      }
    }
    load();
  }, []);

  // 2. Tracing Logic
  const runTrace = useCallback(() => {
    if (!selectedImage) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImgDims({ width: img.width, height: img.height });
      ImageTracer.imageToSVG(selectedImage, (svgString: string) => {
        const inner = svgString.replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "").replace(/<rect[^>]*\/>/g, "");
        setSvgContent(inner);
        setCandidates([]);
        setSourceDots([]);
      }, { numberofcolors: 2, ltres: 1, qtres: 1, scale: 1 });
    };
    img.src = selectedImage;
  }, [selectedImage]);

  useEffect(() => { if (selectedImage) runTrace(); }, [selectedImage, runTrace]);

  useEffect(() => {
    if (!svgContent) return;
    const ns = "http://www.w3.org/2000/svg";
    const tmp = document.createElementNS(ns, "svg");
    tmp.innerHTML = svgContent;
    const results: Candidate[] = [];
    Array.from(tmp.querySelectorAll("path")).forEach(p => {
      const d = p.getAttribute("d") || "";
      const subs = d.match(/([Mm][^Mm]*)/g) || [];
      subs.forEach(sd => {
        results.push({ id: Math.random().toString(36).slice(2, 9), d: sd, area: 0, selected: false });
      });
    });
    setCandidates(results);
  }, [svgContent]);

  // 3. Coordinate Helpers
  const getCoords = (e: any) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, rx: 0, ry: 0 };
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top, rx: cx, ry: cy };
  };

  const getPinchDist = (touches: TouchList | React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 4. Undo Logic
  const saveForUndo = useCallback(() => {
    setHistory(h => {
      const snapshot = { 
        shapes: JSON.parse(JSON.stringify(workspaceShapes)), 
        strokes: JSON.parse(JSON.stringify(strokes)),
        penDots: [] 
      };
      return [...h, snapshot].slice(-MAX_HISTORY);
    });
  }, [workspaceShapes, strokes]);

  const undo = () => {
    if (history.length === 0) return;
    const next = [...history];
    const last = next.pop()!;
    setWorkspaceShapes(last.shapes);
    setStrokes(last.strokes);
    setHistory(next);
  };

  const bringToFront = (id: string) => {
    saveForUndo();
    setWorkspaceShapes(prev => {
      const target = prev.find(s => s.id === id);
      if (!target) return prev;
      const rest = prev.filter(s => s.id !== id);
      return [...rest, target];
    });
    setContextMenu(null);
  };

  const generatePathData = (dots: Dot[]) => {
    if (dots.length === 0) return "";
    return `M ${dots[0].x} ${dots[0].y} ` + dots.slice(1).map(d => `L ${d.x} ${d.y}`).join(" ") + " Z";
  };

  const strokePointsToPath = (pts: { x: number; y: number }[]) => {
    if (!pts.length) return "";
    return `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
  };

  const eraseAtPoint = (clientX: number, clientY: number) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left, y = clientY - rect.top;
    const radius = 20;
    setStrokes(prev => prev.filter(st => !st.points.some(p => Math.hypot(p.x - x, p.y - y) < radius)));
    setWorkspaceShapes(prev => prev.map(s => ({
      ...s,
      dots: s.dots.filter(d => Math.hypot((s.position.x + d.x * s.scale) - x, (s.position.y + d.y * s.scale) - y) > radius)
    })));
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setSelectedImage(url);
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-slate-200 overflow-hidden select-none touch-none" 
      onClick={() => setContextMenu(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      
      {/* HEADER */}
      <header className="h-[65px] flex items-center justify-between px-6 bg-white border-b shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-6">
          <span className="font-black text-[12px] uppercase tracking-[0.2em] text-slate-900 hidden md:block">Studio v2</span>
        </div>
        
        <div className="flex items-center gap-3">
          <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*" />
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="px-5 py-2.5 bg-slate-900 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg active:scale-95 transition-all"
          >
            Upload
          </button>
          
          <div className="w-px h-6 bg-slate-200 mx-1 hidden md:block" />

          <button 
            onClick={undo} 
            className="px-5 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-bold uppercase shadow-sm active:scale-95 transition-all"
          >
            Undo
          </button>
          
          <button 
            onClick={() => { saveForUndo(); setWorkspaceShapes([]); setStrokes([]); }} 
            className="px-5 py-2.5 bg-red-500 text-white rounded-2xl text-[10px] font-bold uppercase shadow-lg shadow-red-100 active:scale-95 transition-all"
          >
            Reset
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden p-3 gap-3">
        {/* SOURCE PANEL */}
        <aside className="h-[49%] md:h-full w-full md:w-[380px] p-3 md:p-6 bg-white rounded-[2.5rem] border border-white shadow-xl flex flex-row md:flex-col gap-3 shrink-0 overflow-hidden">
          
          {/* Use flex-col-reverse on mobile to put buttons at the top visually */}
          <div className="flex flex-col-reverse md:flex-col gap-4 shrink-0 w-[65px] md:w-full items-center md:order-2">
            
            <div className="flex-1 flex items-center justify-center w-full min-h-[100px]">
                <input 
                    type="range" 
                    min={0.5} 
                    max={4} 
                    step={0.1} 
                    value={sourceZoom} 
                    onChange={e => setSourceZoom(parseFloat(e.target.value))} 
                    className="accent-slate-900 cursor-pointer"
                    style={{
                        writingMode: isMobile ? 'vertical-lr' : 'horizontal-tb',
                        WebkitAppearance: isMobile ? 'slider-vertical' : 'none',
                        height: isMobile ? '130px' : 'auto',
                        width: isMobile ? '12px' : '100%'
                    } as React.CSSProperties}
                />
            </div>

            <div className="flex flex-col md:flex-row gap-2 w-full shrink-0">
              <button onClick={() => {
                const ns = "http://www.w3.org/2000/svg";
                let pts: Dot[] = [];
                candidates.filter(c => c.selected).forEach(c => {
                  const path = document.createElementNS(ns, "path");
                  path.setAttribute("d", c.d);
                  document.body.appendChild(path);
                  const len = path.getTotalLength();
                  for (let i = 0; i <= len; i += len / 40) {
                    const p = path.getPointAtLength(i);
                    pts.push({ id: `p-${Math.random()}`, x: p.x, y: p.y });
                  }
                  document.body.removeChild(path);
                });
                setSourceDots(pts);
              }} className="w-full h-12 md:h-14 bg-slate-100 text-slate-900 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase shadow-sm active:bg-slate-200 transition-colors">
                Sample
              </button>
              
              <button onClick={() => {
                saveForUndo();
                setWorkspaceShapes(prev => [...prev, { id: `s-${Date.now()}`, img: selectedImage!, dots: [...sourceDots], dims: { ...imgDims }, position: { x: 50, y: 50 }, scale: 0.5, showDots: true }]);
                setSourceDots([]);
              }} disabled={sourceDots.length === 0} className="w-full h-12 md:h-14 bg-blue-600 text-white rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase disabled:opacity-30 shadow-lg shadow-blue-100">
                {isMobile ? "Add" : "Add Unit"}
              </button>
            </div>
          </div>

          <div className="flex-1 bg-slate-50 rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 relative overflow-hidden shadow-inner flex items-center justify-center md:order-1">
            <svg viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full" style={{ transform: `scale(${sourceZoom})` }}>
              {selectedImage && <image href={selectedImage} width={imgDims.width} height={imgDims.height} />}
              {candidates.map(c => (
                <path key={c.id} d={c.d} fill={c.selected ? activeColor : "transparent"} stroke={c.selected ? "#3b82f6" : "#cbd5e1"} 
                  strokeWidth={2} opacity={0.5} className="cursor-pointer" onClick={() => setCandidates(prev => prev.map(x => x.id === c.id ? {...x, selected: !x.selected} : x))} />
              ))}
              {sourceDots.map(s => <circle key={s.id} cx={s.x} cy={s.y} r={3} fill="#3b82f6" />)}
            </svg>
          </div>
        </aside>

        {/* WORKSPACE */}
        <main className="flex-1 bg-white rounded-[2.5rem] border border-white shadow-xl relative overflow-hidden min-h-[300px]" 
          onPointerDown={(e) => {
            isPointerDownRef.current = true;
            const c = getCoords(e);
            if (activeTool === "pen") {
                saveForUndo();
                const strokeId = `st-${Date.now()}`;
                setStrokes(prev => [...prev, { id: strokeId, points: [{ x: c.x, y: c.y }], color: activeColor, width: 4 }]);
                penRef.current = { pointerId: e.pointerId, lastX: c.x, lastY: c.y, strokeId };
            }
          }}
          onPointerMove={(e) => {
            const c = getCoords(e);
            if (activeTool === "erase" && isPointerDownRef.current) eraseAtPoint(e.clientX, e.clientY);
            if (penRef.current && e.pointerId === penRef.current.pointerId) {
                setStrokes(prev => prev.map(s => s.id === penRef.current!.strokeId ? { ...s, points: [...s.points, { x: c.x, y: c.y }] } : s));
                return;
            }
            if (draggingDot) {
              setWorkspaceShapes(prev => prev.map(s => s.id !== draggingDot.shapeId ? s : { 
                ...s, dots: s.dots.map(d => d.id === draggingDot.dotId ? { ...d, x: (c.x - s.position.x)/s.scale, y: (c.y - s.position.y)/s.scale } : d) 
              }));
            } else if (draggingShapeId) {
              setWorkspaceShapes(prev => prev.map(s => s.id === draggingShapeId ? { ...s, position: { x: c.x - dragOffset.x, y: c.y - dragOffset.y } } : s));
            } else if (resizingId) {
               const dx = c.rx - dragOffset.x;
               setWorkspaceShapes(prev => prev.map(s => s.id === resizingId ? { ...s, scale: Math.max(0.1, s.scale + dx / 400) } : s));
               setDragOffset({ x: c.rx, y: c.ry });
            }
          }} 
          onPointerUp={() => { 
            isPointerDownRef.current = false; penRef.current = null;
            setDraggingShapeId(null); setDraggingDot(null); setResizingId(null);
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
          }}>
          <svg ref={workspaceRef} className="w-full h-full">
            {strokes.map(s => (
                <path key={s.id} d={strokePointsToPath(s.points)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {workspaceShapes.map(shape => (
              <g key={shape.id} transform={`translate(${shape.position.x} ${shape.position.y}) scale(${shape.scale})`}>
                <defs><clipPath id={`cl-${shape.id}`}><path d={generatePathData(shape.dots)} /></clipPath></defs>
                <image href={shape.img} width={shape.dims.width} height={shape.dims.height} clipPath={`url(#cl-${shape.id})`}
                  className="touch-none"
                  onPointerDown={(e) => {
                    if (longPressTimer.current) clearTimeout(longPressTimer.current);
                    longPressTimer.current = setTimeout(() => {
                      setContextMenu({ x: e.clientX, y: e.clientY, id: shape.id });
                    }, 1300);
                    if (activeTool === "fill") { saveForUndo(); setWorkspaceShapes(prev => prev.map(s => s.id === shape.id ? {...s, fillColor: activeColor} : s)); return; }
                    if (activeTool === "cursor") {
                        e.stopPropagation(); const c = getCoords(e); setDraggingShapeId(shape.id);
                        setDragOffset({ x: c.x - shape.position.x, y: c.y - shape.position.y });
                    }
                  }}
                />
                <path d={generatePathData(shape.dots)} fill={shape.fillColor || "transparent"} pointerEvents="none" opacity={0.6} />
                {globalShowDots && shape.dots.map(dot => (
                  <circle key={dot.id} cx={dot.x} cy={dot.y} r={4.5 / shape.scale} fill="#3b82f6" 
                    onPointerDown={(e) => { if (activeTool === "cursor") { e.stopPropagation(); setDraggingDot({ shapeId: shape.id, dotId: dot.id }); } }} />
                ))}
                {globalShowDots && (
                  <rect x={shape.dims.width - 10} y={shape.dims.height - 10} width={20 / shape.scale} height={20 / shape.scale} fill="#f97316" rx={4}
                    onPointerDown={(e) => { e.stopPropagation(); saveForUndo(); const c = getCoords(e); setResizingId(shape.id); setDragOffset({ x: c.rx, y: c.ry }); }} />
                )}
              </g>
            ))}
          </svg>

          {contextMenu && (
            <div className="fixed bg-white border border-slate-200 shadow-2xl rounded-[2rem] py-3 z-[100] min-w-[200px] overflow-hidden" 
                 style={{ left: Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 220), top: Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 1000) - 150) }}>
              <button onClick={(e) => { e.stopPropagation(); bringToFront(contextMenu.id); }} className="w-full text-left px-6 py-4 text-[10px] font-black uppercase text-slate-900 hover:bg-slate-50 transition-colors border-b border-slate-100">Bring to Front</button>
              <button onClick={(e) => { e.stopPropagation(); saveForUndo(); setWorkspaceShapes(prev => prev.filter(s => s.id !== contextMenu.id)); setContextMenu(null); }} className="w-full text-left px-6 py-4 text-[10px] font-black uppercase text-red-500 hover:bg-red-50 transition-colors">Delete Unit</button>
              <button onClick={() => setContextMenu(null)} className="w-full text-left px-6 py-4 text-[10px] font-black uppercase hover:bg-slate-50 transition-colors">Cancel</button>
            </div>
          )}
        </main>

        {/* TOOL PANEL */}
        <aside className="w-full md:w-[100px] h-[80px] md:h-full bg-white rounded-[2.5rem] border border-white shadow-xl flex md:flex-col flex-row items-center md:py-8 px-4 md:px-0 gap-6 shrink-0">
          <div className="flex md:flex-col flex-row gap-3 p-2 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner">
            {(["cursor", "pen", "fill", "erase"] as const).map(tool => (
              <button key={tool} onClick={() => setActiveTool(tool)} className={`w-10 h-10 md:w-14 md:h-14 flex items-center justify-center rounded-[1.25rem] transition-all duration-300 ${activeTool === tool ? 'bg-white shadow-md text-blue-600 scale-110' : 'text-slate-400 hover:text-slate-900'}`}>
                <span className="text-[12px] md:text-[16px] font-black uppercase">{tool.charAt(0)}</span>
              </button>
            ))}
          </div>
          <div className="flex-1 flex md:flex-col flex-row items-center justify-center gap-6">
            <input type="color" value={activeColor} onChange={e => setActiveColor(e.target.value)} className="w-10 h-10 md:w-12 md:h-12 rounded-full border-4 border-white cursor-pointer shadow-lg transition-transform" />
            <button onClick={() => setGlobalShowDots(!globalShowDots)} className={`w-10 h-10 md:w-14 md:h-14 flex items-center justify-center rounded-2xl text-[8px] md:text-[10px] font-black uppercase transition-all ${globalShowDots ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
              {globalShowDots ? "ON" : "OFF"}
            </button>
          </div>
        </aside>
      </div>

      {/* FOOTER */}
      <footer className="h-[110px] px-3 pb-3 shrink-0">
        <div className="h-full bg-white/80 backdrop-blur-md rounded-[2.5rem] border border-white shadow-md flex items-center px-10">
          <div className="flex-1 flex gap-6 overflow-x-auto py-2 no-scrollbar items-center">
            {templates.map((url, i) => (
              <img key={i} src={url} onClick={() => setSelectedImage(url)} className={`h-16 w-16 rounded-2xl object-cover cursor-pointer border-4 transition-all ${selectedImage === url ? 'border-blue-500 scale-110 shadow-xl' : 'border-white opacity-40'}`} />
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}