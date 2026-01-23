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
interface Stroke { 
  id: string; 
  points: { id: string; x: number; y: number }[]; 
  color: string; 
  width: number; 
  fillColor?: string;
}
type HistoryItem = { shapes: DistortableShape[]; strokes: Stroke[] };
type Candidate = { id: string; d: string; area: number; selected: boolean; };

export function Studio({ onBack }: { onBack: () => void }) {
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Layout State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Canvas & UI State
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sourceDots, setSourceDots] = useState<Dot[]>([]);

  const [workspaceShapes, setWorkspaceShapes] = useState<DistortableShape[]>([]);
  const [activeTool, setActiveTool] = useState<"cursor" | "pen" | "fill" | "erase">("cursor");
  const [activeColor, setActiveColor] = useState("#27EEF5"); 
  const [globalShowDots, setGlobalShowDots] = useState(true);
  const [isLocked, setIsLocked] = useState(false); 
  const [strokes, setStrokes] = useState<Stroke[]>([]);

  // Interaction State
  const [draggingDot, setDraggingDot] = useState<{ shapeId: string; dotId: string } | null>(null);
  const [draggingStrokeDot, setDraggingStrokeDot] = useState<{ strokeId: string; dotId: string } | null>(null);
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const MAX_HISTORY = 50;

  const workspaceRef = useRef<SVGSVGElement | null>(null);
  const isPointerDownRef = useRef(false);
  const penRef = useRef<{ pointerId: number; lastX: number; lastY: number; strokeId: string } | null>(null);

  const PEN_SPACING = 12; 
  const ERASE_RADIUS = 30;

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string; type: "shape" | "stroke" } | null>(null);

  useEffect(() => { setMounted(true); }, []);

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
        setTemplates(["/template1.png", "/template2.png"]);
        setSelectedImage("/template1.png");
      }
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

  const saveForUndo = useCallback(() => {
    setHistory(h => {
      const snapshot = { 
        shapes: JSON.parse(JSON.stringify(workspaceShapes)), 
        strokes: JSON.parse(JSON.stringify(strokes))
      };
      return [...h, snapshot].slice(-MAX_HISTORY);
    });
  }, [workspaceShapes, strokes]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const next = [...history];
    const last = next.pop()!;
    setWorkspaceShapes(last.shapes);
    setStrokes(last.strokes);
    setHistory(next);
  }, [history]);

  const getCoords = (e: any) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, rx: 0, ry: 0 };
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top, rx: cx, ry: cy };
  };

  const erasePixelsFromShape = (shape: DistortableShape, workspaceX: number, workspaceY: number): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!shape.img) return resolve(null);
      const localX = (workspaceX - shape.position.x) / shape.scale;
      const localY = (workspaceY - shape.position.y) / shape.scale;
      const radius = ERASE_RADIUS / Math.max(0.1, shape.scale);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = shape.dims.width || img.width;
        canvas.height = shape.dims.height || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(localX, localY, radius, 0, Math.PI * 2);
        ctx.fill();
        resolve(canvas.toDataURL());
      };
      img.src = shape.img;
    });
  };

  const sweepErase = async (x: number, y: number) => {
    setStrokes(prev => prev.map(st => ({
      ...st,
      points: st.points.filter(p => Math.hypot(p.x - x, p.y - y) > ERASE_RADIUS)
    })).filter(st => st.points.length > 0));

    setWorkspaceShapes(prev => prev.map(s => ({
      ...s,
      dots: s.dots.filter(d => {
        const dotGlobalX = s.position.x + (d.x * s.scale);
        const dotGlobalY = s.position.y + (d.y * s.scale);
        return Math.hypot(dotGlobalX - x, dotGlobalY - y) > ERASE_RADIUS;
      })
    })));

    const updatedShapes = await Promise.all(
      workspaceShapes.map(async (shape) => {
        const newImg = await erasePixelsFromShape(shape, x, y);
        return newImg ? { ...shape, img: newImg } : shape;
      })
    );
    setWorkspaceShapes(updatedShapes);
  };

  const generatePathData = (pts: { x: number; y: number }[], close = true) => {
    if (!pts || pts.length === 0) return "";
    const d = `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map(p => ` L ${p.x} ${p.y}`).join("");
    return close ? d + " Z" : d;
  };

  const handleBringToFront = (id: string, type: "shape" | "stroke") => {
    saveForUndo();
    if (type === "shape") {
      setWorkspaceShapes(prev => {
        const item = prev.find(s => s.id === id);
        return item ? [...prev.filter(s => s.id !== id), item] : prev;
      });
    } else {
      setStrokes(prev => {
        const item = prev.find(s => s.id === id);
        return item ? [...prev.filter(s => s.id !== id), item] : prev;
      });
    }
    setContextMenu(null);
  };

  const handleSendToBack = (id: string, type: "shape" | "stroke") => {
    saveForUndo();
    if (type === "shape") {
      setWorkspaceShapes(prev => {
        const item = prev.find(s => s.id === id);
        return item ? [item, ...prev.filter(s => s.id !== id)] : prev;
      });
    } else {
      setStrokes(prev => {
        const item = prev.find(s => s.id === id);
        return item ? [item, ...prev.filter(s => s.id !== id)] : prev;
      });
    }
    setContextMenu(null);
  };

  const handleDeleteObject = (id: string, type: "shape" | "stroke") => {
    saveForUndo();
    if (type === "shape") setWorkspaceShapes(prev => prev.filter(s => s.id !== id));
    else setStrokes(prev => prev.filter(s => s.id !== id));
    setContextMenu(null);
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#F9F9FB] text-slate-900 overflow-hidden select-none touch-none font-sans" onClick={() => setContextMenu(null)}>
      
      {/* HEADER */}
      <header className="h-16 flex items-center justify-between px-4 lg:px-8 bg-white/80 backdrop-blur-md border-b border-slate-200 shrink-0 z-[100]">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(true)} 
            className="lg:hidden bg-yellow-400 text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm"
          >
            Trace
          </button>
          <div className="flex flex-col">
            <span className="text-[11px] font-black uppercase tracking-[0.2em]">DesignIt <span className="text-yellow-500">.</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={undo} className="px-4 py-2 bg-pink-50 text-pink-600 rounded-full text-[9px] font-black uppercase">Undo</button>
          <button onClick={() => setGlobalShowDots(!globalShowDots)} className={`px-4 py-2 rounded-full text-[9px] font-black uppercase border transition-all ${globalShowDots ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-white text-slate-400'}`}>
            {globalShowDots ? "Dots" : "Hide"}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        
        {/* RESPONSIVE SOURCE WINDOW / SIDEBAR */}
        <aside className={`
          fixed lg:static inset-0 lg:w-[320px] bg-white lg:border-r border-slate-200 flex flex-col z-[200] lg:z-0 transition-transform duration-300
          ${isSidebarOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}
        `}>
          <div className="p-6 shrink-0 bg-white border-b lg:border-0 border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Source Tracing</h3>
              <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-400 p-2">CLOSE ✕</button>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mb-3">
               <button onClick={() => {
                  const ns = "http://www.w3.org/2000/svg"; let pts: Dot[] = [];
                  candidates.filter(c => c.selected).forEach(c => {
                    const path = document.createElementNS(ns, "path"); path.setAttribute("d", c.d); document.body.appendChild(path);
                    const len = path.getTotalLength();
                    for (let i = 0; i <= len; i += Math.max(3, Math.round(len / 40))) { const p = path.getPointAtLength(i); pts.push({ id: `p-${Math.random()}`, x: p.x, y: p.y }); }
                    document.body.removeChild(path);
                  }); setSourceDots(pts);
               }} className="bg-yellow-50 hover:bg-yellow-100 text-yellow-700 py-4 lg:py-3 rounded-xl text-[10px] font-black uppercase transition-all border border-yellow-200">Sample</button>
               
               <button onClick={() => {
                  saveForUndo(); const forceScale = imgDims.width ? 150 / imgDims.width : 1;
                  setWorkspaceShapes(prev => [...prev, { id: `s-${Date.now()}`, img: selectedImage!, dots: [...sourceDots], dims: { ...imgDims }, position: { x: 50, y: 50 }, scale: forceScale, showDots: true }]);
                  setSourceDots([]);
                  setIsSidebarOpen(false); // Auto-close on add
               }} disabled={sourceDots.length === 0} className="bg-slate-900 text-yellow-400 py-4 lg:py-3 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg disabled:opacity-20">Add Design</button>
            </div>
            
            <button onClick={() => fileInputRef.current?.click()} className="w-full bg-white border border-yellow-200 text-yellow-600 py-4 lg:py-3 rounded-xl text-[10px] font-black uppercase mb-2">Upload Reference</button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={e => { const f = e.target.files?.[0]; if(f) setSelectedImage(URL.createObjectURL(f)); }} />
          </div>

          {/* THE PREVIEW WINDOW - SCROLLABLE FOR MOBILE */}
          <div className="flex-1 p-4 lg:p-6 overflow-hidden bg-slate-50 lg:bg-white">
            <div className="h-full bg-slate-100 rounded-[2rem] border border-slate-200 relative overflow-hidden flex items-center justify-center shadow-inner">
              <svg viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full max-h-[60vh] lg:max-h-none p-4 lg:p-6">
                {selectedImage && <image href={selectedImage} width={imgDims.width} height={imgDims.height} />}
                {candidates.map(c => (
                  <path 
                    key={c.id} 
                    d={c.d} 
                    fill={c.selected ? "rgba(250, 204, 21, 0.4)" : "transparent"} 
                    stroke={c.selected ? "#eab308" : "#cbd5e1"} 
                    strokeWidth={4} // Thicker for easier mobile tapping
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCandidates(prev => prev.map(x => x.id === c.id ? {...x, selected: !x.selected} : x));
                    }} 
                  />
                ))}
                {sourceDots.map(s => <circle key={s.id} cx={s.x} cy={s.y} r={6} fill="#eab308" />)}
              </svg>
            </div>
          </div>
        </aside>

        {/* MAIN WORKSPACE */}
        <main className="flex-1 bg-[#F9F9FB] relative overflow-hidden">
          
          {/* TOOLBAR */}
          <div className="absolute left-2 lg:left-8 top-1/2 -translate-y-1/2 flex flex-col gap-2 lg:gap-4 p-2 lg:p-3 bg-white/70 backdrop-blur-xl border border-white rounded-[2rem] shadow-xl z-50">
             {(["cursor", "pen", "fill", "erase"] as const).map((t) => (
                <button key={t} onClick={() => setActiveTool(t)} className={`w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-xl lg:rounded-2xl transition-all ${activeTool === t ? 'bg-yellow-400 text-black scale-110 shadow-lg' : 'text-slate-400'}`}>
                  <span className="text-[10px] lg:text-[12px] font-black uppercase">{t.charAt(0)}</span>
                </button>
             ))}
             <div className="p-1"><input type="color" value={activeColor} onChange={e => setActiveColor(e.target.value)} className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl cursor-pointer" /></div>
          </div>

          <div 
            className="w-full h-full flex items-center justify-center p-4 lg:p-20"
            onPointerDown={(e) => { 
                isPointerDownRef.current = true; const c = getCoords(e); 
                if (activeTool === "erase") { saveForUndo(); sweepErase(c.x, c.y); } 
                if (activeTool === "pen") { 
                    saveForUndo(); const sid = `st-${Date.now()}`; 
                    setStrokes(prev => [...prev, { id: sid, points: [{ id: `pt-${Date.now()}`, x: c.x, y: c.y }], color: activeColor, width: 4 }]); 
                    penRef.current = { pointerId: e.pointerId, lastX: c.x, lastY: c.y, strokeId: sid }; 
                } 
            }}
            onPointerMove={(e) => {
              const c = getCoords(e);
              if (activeTool === "erase" && isPointerDownRef.current) sweepErase(c.x, c.y);
              if (activeTool === "pen" && penRef.current && e.pointerId === penRef.current.pointerId) {
                if (Math.hypot(c.x - penRef.current.lastX, c.y - penRef.current.lastY) >= PEN_SPACING) {
                  setStrokes(prev => prev.map(s => s.id === penRef.current!.strokeId ? { ...s, points: [...s.points, { id: `pt-${Date.now()}`, x: c.x, y: c.y }] } : s));
                  penRef.current!.lastX = c.x; penRef.current!.lastY = c.y;
                }
              } else if (draggingStrokeDot) {
                setStrokes(prev => prev.map(s => s.id === draggingStrokeDot.strokeId ? { ...s, points: s.points.map(p => p.id === draggingStrokeDot.dotId ? { ...p, x: c.x, y: c.y } : p) } : s));
              } else if (draggingDot) {
                setWorkspaceShapes(prev => prev.map(s => s.id !== draggingDot.shapeId ? s : { ...s, dots: s.dots.map(d => d.id === draggingDot.dotId ? { ...d, x: (c.x - s.position.x)/s.scale, y: (c.y - s.position.y)/s.scale } : d) }));
              } else if (draggingShapeId && !isLocked) {
                setWorkspaceShapes(prev => prev.map(s => s.id === draggingShapeId ? { ...s, position: { x: c.x - dragOffset.x, y: c.y - dragOffset.y } } : s));
              } else if (resizingId) {
                setWorkspaceShapes(prev => prev.map(s => s.id === resizingId ? { ...s, scale: Math.max(0.1, s.scale + (c.rx - dragOffset.x) / 400) } : s));
                setDragOffset({ x: c.rx, y: c.ry });
              }
            }}
            onPointerUp={() => { isPointerDownRef.current = false; penRef.current = null; setDraggingShapeId(null); setDraggingDot(null); setDraggingStrokeDot(null); setResizingId(null); }}
          >
              <div className="w-full h-full bg-white shadow-xl rounded-[2.5rem] lg:rounded-[3rem] border border-slate-100 overflow-hidden relative">
                  <svg ref={workspaceRef} className="w-full h-full">
                    {strokes.map(s => (
                      <g key={s.id} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, id: s.id, type: "stroke" }); }}>
                        <path d={generatePathData(s.points)} stroke={s.color} strokeWidth={s.width} fill={s.fillColor || "transparent"} strokeLinecap="round" strokeLinejoin="round" onPointerDown={(e) => { if (activeTool === "fill") { e.stopPropagation(); saveForUndo(); setStrokes(prev => prev.map(st => st.id === s.id ? { ...st, fillColor: activeColor } : st)); } }} />
                        {globalShowDots && s.points.map((p) => <circle key={p.id} cx={p.x} cy={p.y} r={10} fill={s.color} onPointerDown={(e) => { if (activeTool === "cursor") { e.stopPropagation(); setDraggingStrokeDot({ strokeId: s.id, dotId: p.id }); } }} /> )}
                      </g>
                    ))}
                    {workspaceShapes.map(shape => (
                      <g key={shape.id} transform={`translate(${shape.position.x} ${shape.position.y}) scale(${shape.scale})`}>
                        <defs><clipPath id={`cl-${shape.id}`}><path d={generatePathData(shape.dots, true)} /></clipPath></defs>
                        <image href={shape.img} width={shape.dims.width} height={shape.dims.height} clipPath={`url(#cl-${shape.id})`} onPointerDown={(e) => {
                            if (activeTool === "fill") { saveForUndo(); setWorkspaceShapes(prev => prev.map(s => s.id === shape.id ? {...s, fillColor: activeColor} : s)); return; }
                            if (activeTool === "cursor" && !isLocked) { e.stopPropagation(); const c = getCoords(e); setDraggingShapeId(shape.id); setDragOffset({ x: c.x - shape.position.x, y: c.y - shape.position.y }); }
                        }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, id: shape.id, type: "shape" }); }} />
                        {globalShowDots && <path d={generatePathData(shape.dots, true)} fill={shape.fillColor || "transparent"} stroke="#3b82f6" strokeWidth={2 / shape.scale} strokeDasharray={`${4/shape.scale},${4/shape.scale}`} opacity={0.7} pointerEvents="none" />}
                        {globalShowDots && shape.dots.map(dot => <circle key={dot.id} cx={dot.x} cy={dot.y} r={14 / shape.scale} fill="#3b82f6" onPointerDown={(e) => { e.stopPropagation(); setDraggingDot({ shapeId: shape.id, dotId: dot.id }); }} /> )}
                        {globalShowDots && <rect x={shape.dims.width - 20} y={shape.dims.height - 20} width={45 / shape.scale} height={45 / shape.scale} fill="#f97316" rx={4} onPointerDown={(e) => { e.stopPropagation(); const c = getCoords(e); setResizingId(shape.id); setDragOffset({ x: c.rx, y: c.ry }); }} />}
                      </g>
                    ))}
                  </svg>
              </div>
          </div>

          {/* TEMPLATE DOCK */}
          <div className="absolute bottom-4 lg:bottom-10 left-1/2 -translate-x-1/2 w-[90%] lg:w-auto flex items-center gap-3 p-3 bg-white/40 backdrop-blur-2xl border border-white/20 rounded-[2rem] shadow-xl overflow-x-auto no-scrollbar">
            {templates.map((u, i) => <img key={i} src={u} onClick={() => setSelectedImage(u)} className={`h-12 w-12 lg:h-16 lg:w-16 rounded-xl object-cover cursor-pointer border-2 transition-all ${selectedImage === u ? 'border-slate-900 scale-105' : 'border-transparent opacity-50'}`} /> )}
          </div>
        </main>
      </div>

      {contextMenu && (
        <div className="fixed z-[300] bg-white border border-slate-200 rounded-xl shadow-2xl w-48 overflow-hidden font-bold" style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: contextMenu.y }}>
          <button className="w-full px-4 py-4 text-left text-[11px] uppercase border-b border-slate-100" onClick={() => handleBringToFront(contextMenu!.id, contextMenu!.type)}>Front</button>
          <button className="w-full px-4 py-4 text-left text-[11px] uppercase border-b border-slate-100" onClick={() => handleSendToBack(contextMenu!.id, contextMenu!.type)}>Back</button>
          <button className="w-full px-4 py-4 text-left text-[11px] uppercase text-red-600" onClick={() => handleDeleteObject(contextMenu!.id, contextMenu!.type)}>Delete</button>
        </div>
      )}
    </div>
  );
}