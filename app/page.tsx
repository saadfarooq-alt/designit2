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
interface StrokeDot { id: string; x: number; y: string | number; }
interface Stroke { 
  id: string; 
  points: { id: string; x: number; y: number }[]; 
  color: string; 
  width: number; 
  fillColor?: string;
}
type HistoryItem = { shapes: DistortableShape[]; strokes: Stroke[] };
type Candidate = { id: string; d: string; area: number; selected: boolean; };

export default function DesignStudio() {
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI State
  const [activePage, setActivePage] = useState<"studio" | "about" | "contact">("studio");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Canvas State
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

  // Context menu state
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

  const undo = () => {
    if (history.length === 0) return;
    const next = [...history];
    const last = next.pop()!;
    setWorkspaceShapes(last.shapes);
    setStrokes(last.strokes);
    setHistory(next);
  };

  const getCoords = (e: any) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, rx: 0, ry: 0 };
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top, rx: cx, ry: cy };
  };

  // Helper: erase pixels from a shape's raster image at workspace coordinates (x,y)
  const erasePixelsFromShape = (shape: DistortableShape, workspaceX: number, workspaceY: number, eraseRadius = ERASE_RADIUS): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!shape.img) return resolve(null);
      const localX = (workspaceX - shape.position.x) / shape.scale;
      const localY = (workspaceY - shape.position.y) / shape.scale;
      const radius = eraseRadius / Math.max(1, shape.scale);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
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
          ctx.globalCompositeOperation = "source-over";
          const url = canvas.toDataURL();
          resolve(url);
        } catch (err) {
          console.warn("erasePixelsFromShape error", err);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = shape.img;
    });
  };

  // Sweep erase: removes stroke points, shape dots, AND erases image pixels inside shapes
  const sweepErase = (x: number, y: number) => {
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
    })).filter(s => s.dots.length > 0));

    // Erase pixels from shapes' raster images where applicable
    // Use current snapshot of shapes (not state variable inside loop) to avoid stale closure issues
    const shapesSnapshot = workspaceShapes.slice();
    shapesSnapshot.forEach(shape => {
      const bboxLeft = shape.position.x;
      const bboxTop = shape.position.y;
      const bboxRight = shape.position.x + shape.dims.width * shape.scale;
      const bboxBottom = shape.position.y + shape.dims.height * shape.scale;
      const margin = ERASE_RADIUS + 2;
      if (x + margin < bboxLeft || x - margin > bboxRight || y + margin < bboxTop || y - margin > bboxBottom) {
        return;
      }
      erasePixelsFromShape(shape, x, y, ERASE_RADIUS).then(newDataUrl => {
        if (newDataUrl) {
          setWorkspaceShapes(prev => prev.map(s => s.id === shape.id ? { ...s, img: newDataUrl } : s));
        }
      }).catch(err => console.warn("erasePixelsFromShape failed", err));
    });
  };

  // path generator (works with both Dot[] and StrokeDot[])
  const generatePathData = (pts: { x: number; y: number }[], close = true) => {
    if (!pts || pts.length === 0) return "";
    const d = `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map(p => ` L ${p.x} ${p.y}`).join("");
    return close ? d + " Z" : d;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  // Context menu actions: bring to front, send to back, delete
  const handleBringToFront = (id: string, type: "shape" | "stroke") => {
    if (type === "shape") {
      setWorkspaceShapes(prev => {
        const idx = prev.findIndex(s => s.id === id);
        if (idx === -1) return prev;
        const item = prev[idx];
        const others = prev.slice(0, idx).concat(prev.slice(idx + 1));
        return [...others, item];
      });
    } else {
      setStrokes(prev => {
        const idx = prev.findIndex(s => s.id === id);
        if (idx === -1) return prev;
        const item = prev[idx];
        const others = prev.slice(0, idx).concat(prev.slice(idx + 1));
        return [...others, item];
      });
    }
    setContextMenu(null);
  };

  const handleSendToBack = (id: string, type: "shape" | "stroke") => {
    if (type === "shape") {
      setWorkspaceShapes(prev => {
        const idx = prev.findIndex(s => s.id === id);
        if (idx === -1) return prev;
        const item = prev[idx];
        const others = prev.slice(0, idx).concat(prev.slice(idx + 1));
        return [item, ...others];
      });
    } else {
      setStrokes(prev => {
        const idx = prev.findIndex(s => s.id === id);
        if (idx === -1) return prev;
        const item = prev[idx];
        const others = prev.slice(0, idx).concat(prev.slice(idx + 1));
        return [item, ...others];
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
    <div className="flex flex-col h-[100dvh] w-full bg-slate-100 overflow-hidden select-none touch-none font-sans" onClick={() => setContextMenu(null)}>
      
      {/* HEADER */}
      <header className="h-[65px] flex items-center justify-between px-4 bg-[#800000] border-b-2 border-[#660000] shrink-0 z-[100] shadow-md relative">
        <div className="flex items-center gap-2">
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden p-2 text-white bg-white/10 rounded-lg">
            <span className="text-[10px] font-black uppercase">{isMobileMenuOpen ? "Close" : "Menu"}</span>
          </button>
          {/* NEW LOGO SECTION */}
    <div className="flex items-center ml-1 cursor-pointer" onClick={() => setActivePage("studio")}>
      <img 
        src="/logo.png" 
        alt="DesignIt Logo" 
        className="h-8 w-auto object-contain mr-2" 
      />
      <span className="hidden sm:inline font-black text-[16px] uppercase tracking-tighter text-white">
        DesignIt
      </span>
    </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-1 md:gap-3">
          <div className="flex bg-black/20 rounded-xl p-1 gap-1">
            <button 
              onClick={() => setIsLocked(!isLocked)} 
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${isLocked ? 'bg-white text-[#800000]' : 'text-white/70 hover:text-white'}`}
            >
              {isLocked ? "Unlock" : "Lock"}
            </button>
            <button 
              onClick={() => setGlobalShowDots(!globalShowDots)} 
              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${!globalShowDots ? 'bg-white text-[#800000]' : 'text-white/70 hover:text-white'}`}
            >
              {globalShowDots ? "Hide Dots" : "Show Dots"}
            </button>
          </div>
          
          <div className="w-[1px] h-6 bg-white/10 mx-1 hidden md:block" />

          <button onClick={undo} className="px-3 py-2 bg-white text-[#800000] rounded-xl text-[10px] font-bold uppercase shadow-sm active:scale-95">Undo</button>
          <button onClick={() => { saveForUndo(); setWorkspaceShapes([]); setStrokes([]); }} className="px-3 py-2 bg-red-600 text-white rounded-xl text-[10px] font-bold uppercase shadow-lg active:scale-95">Reset</button>
        </div>

        {isMobileMenuOpen && (
          <div className="absolute top-[65px] left-0 w-full bg-[#800000] p-6 gap-6 md:hidden z-[101] shadow-2xl flex flex-col border-b-4 border-[#660000]">
            <button onClick={() => { setActivePage("studio"); setIsMobileMenuOpen(false); }} className="text-white font-black uppercase text-sm text-left">Canvas</button>
            <button onClick={() => { setActivePage("about"); setIsMobileMenuOpen(false); }} className="text-white font-black uppercase text-sm text-left">About Studio</button>
            <button onClick={() => { setActivePage("contact"); setIsMobileMenuOpen(false); }} className="text-white font-black uppercase text-sm text-left">Contact Us</button>
          </div>
        )}
      </header>

      {/* STUDIO BODY */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden p-3 gap-3">
        {/* LEFT PANEL */}
        <aside className="h-[30%] md:h-full w-full md:w-[320px] p-3 bg-white rounded-[2rem] shadow-xl flex flex-row gap-3 shrink-0">
          <div className="flex flex-col gap-2 w-[80px] shrink-0">
            <button onClick={() => {
                const ns = "http://www.w3.org/2000/svg"; let pts: Dot[] = [];
                candidates.filter(c => c.selected).forEach(c => {
                  const path = document.createElementNS(ns, "path"); path.setAttribute("d", c.d); document.body.appendChild(path);
                  const len = path.getTotalLength();
                  for (let i = 0; i <= len; i += Math.max(3, Math.round(len / 40))) { const p = path.getPointAtLength(i); pts.push({ id: `p-${Math.random()}`, x: p.x, y: p.y }); }
                  document.body.removeChild(path);
                }); setSourceDots(pts);
            }} className="w-full h-10 bg-green-500 text-white border-b-4 border-green-700 rounded-lg text-[9px] font-black uppercase">Sample</button>
            
            <button onClick={() => {
                saveForUndo(); const forceScale = imgDims.width ? 150 / imgDims.width : 1;
                setWorkspaceShapes(prev => [...prev, { id: `s-${Date.now()}`, img: selectedImage!, dots: [...sourceDots], dims: { ...imgDims }, position: { x: 100, y: 100 }, scale: forceScale, showDots: true }]);
                setSourceDots([]);
            }} disabled={sourceDots.length === 0} className="w-full h-10 bg-green-500 text-white border-b-4 border-green-700 rounded-lg text-[9px] font-black uppercase disabled:opacity-30">Add</button>
            
            <button onClick={() => fileInputRef.current?.click()} className="w-full h-10 bg-black text-white rounded-lg text-[9px] font-black uppercase mt-auto">Upload</button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={e => { const f = e.target.files?.[0]; if(f) setSelectedImage(URL.createObjectURL(f)); }} />
          </div>
          <div className="flex-1 bg-slate-50 rounded-xl relative overflow-hidden flex items-center justify-center border border-slate-200">
            <svg viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full">
              {selectedImage && <image href={selectedImage} width={imgDims.width} height={imgDims.height} />}
              {candidates.map(c => <path key={c.id} d={c.d} fill={c.selected ? activeColor : "transparent"} stroke={c.selected ? "#3b82f6" : "#cbd5e1"} strokeWidth={2} opacity={0.5} onClick={() => setCandidates(prev => prev.map(x => x.id === c.id ? {...x, selected: !x.selected} : x))} />)}
              {sourceDots.map(s => <circle key={s.id} cx={s.x} cy={s.y} r={5} fill="#3b82f6" />)}
            </svg>
          </div>
        </aside>

        {/* WORKSPACE */}
        <div className="flex-1 flex flex-row gap-3 min-h-0 relative">
          <main className="flex-1 bg-white rounded-[2rem] shadow-2xl relative overflow-hidden"
            onPointerDown={(e) => { isPointerDownRef.current = true; const c = getCoords(e); if (activeTool === "erase") { saveForUndo(); sweepErase(c.x, c.y); } if (activeTool === "pen") { saveForUndo(); const strokeId = `st-${Date.now()}`; setStrokes(prev => [...prev, { id: strokeId, points: [{ id: `pt-${Date.now()}`, x: c.x, y: c.y }], color: activeColor, width: 4 }]); penRef.current = { pointerId: e.pointerId, lastX: c.x, lastY: c.y, strokeId }; } }}
            onPointerMove={(e) => {
              const c = getCoords(e);
              if (activeTool === "erase" && isPointerDownRef.current) sweepErase(c.x, c.y);
              if (activeTool === "pen" && penRef.current && e.pointerId === penRef.current.pointerId) {
                const dist = Math.hypot(c.x - penRef.current.lastX, c.y - penRef.current.lastY);
                if (dist >= PEN_SPACING) {
                  setStrokes(prev => prev.map(s => s.id === penRef.current!.strokeId ? { ...s, points: [...s.points, { id: `pt-${Date.now()}`, x: c.x, y: c.y }] } : s));
                  penRef.current!.lastX = c.x;
                  penRef.current!.lastY = c.y;
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
            <svg ref={workspaceRef} className="w-full h-full">
              {strokes.map(s => (
                <g key={s.id} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, id: s.id, type: "stroke" }); }}>
                  <path d={generatePathData(s.points)} stroke={s.color} strokeWidth={s.width} fill={s.fillColor || "transparent"} strokeLinecap="round" strokeLinejoin="round" onPointerDown={(e) => { if (activeTool === "fill") { e.stopPropagation(); saveForUndo(); setStrokes(prev => prev.map(st => st.id === s.id ? { ...st, fillColor: activeColor } : st)); } }} />
                  {globalShowDots && s.points.map((p) => (
                    <circle key={p.id} cx={p.x} cy={p.y} r={6} fill={s.color} className="cursor-move" onPointerDown={(e) => { if (activeTool === "cursor") { e.stopPropagation(); setDraggingStrokeDot({ strokeId: s.id, dotId: p.id }); } }} />
                  ))}
                </g>
              ))}
              {workspaceShapes.map(shape => (
                <g key={shape.id} transform={`translate(${shape.position.x} ${shape.position.y}) scale(${shape.scale})`} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, id: shape.id, type: "shape" }); }}>
                  <defs><clipPath id={`cl-${shape.id}`}><path d={generatePathData(shape.dots, true)} /></clipPath></defs>
                  <image href={shape.img} width={shape.dims.width} height={shape.dims.height} clipPath={`url(#cl-${shape.id})`} onPointerDown={(e) => {
                      if (activeTool === "fill") { saveForUndo(); setWorkspaceShapes(prev => prev.map(s => s.id === shape.id ? {...s, fillColor: activeColor} : s)); return; }
                      if (activeTool === "cursor" && !isLocked) { e.stopPropagation(); const c = getCoords(e); setDraggingShapeId(shape.id); setDragOffset({ x: c.x - shape.position.x, y: c.y - shape.position.y }); }
                  }} />
                  {globalShowDots && <path d={generatePathData(shape.dots, true)} fill={shape.fillColor || "transparent"} stroke="#3b82f6" strokeWidth={2 / shape.scale} strokeDasharray={`${4/shape.scale},${4/shape.scale}`} opacity={0.7} pointerEvents="none" />}
                  {globalShowDots && shape.dots.map(dot => ( <circle key={dot.id} cx={dot.x} cy={dot.y} r={10 / shape.scale} fill="#3b82f6" onPointerDown={(e) => { e.stopPropagation(); setDraggingDot({ shapeId: shape.id, dotId: dot.id }); }} /> ))}
                  {globalShowDots && <rect x={shape.dims.width - 15} y={shape.dims.height - 15} width={35 / shape.scale} height={35 / shape.scale} fill="#f97316" rx={4} onPointerDown={(e) => { e.stopPropagation(); const c = getCoords(e); setResizingId(shape.id); setDragOffset({ x: c.rx, y: c.ry }); }} />}
                </g>
              ))}
            </svg>
          </main>

          {/* SIDEBAR TOOLS */}
          <aside className="w-[50px] md:w-[65px] h-full bg-yellow-400 rounded-[2rem] border-2 border-yellow-500 shadow-xl flex flex-col items-center py-6 gap-4 shrink-0 z-10">
            <div className="flex flex-col gap-3 p-1 bg-yellow-600/20 rounded-2xl">
              {(["cursor", "pen", "fill", "erase"] as const).map((tool) => (
                <button key={tool} onClick={() => setActiveTool(tool)} className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-xl transition-all ${activeTool === tool ? 'bg-pink-600 text-white scale-110 shadow-lg' : 'bg-transparent text-black/60'}`}>
                  <span className="text-[12px] font-black uppercase">{tool.charAt(0)}</span>
                </button>
              ))}
            </div>
            <div className="mt-auto flex flex-col items-center gap-2">
               <input type="color" value={activeColor} onChange={e => setActiveColor(e.target.value)} className="w-10 h-10 rounded-full border-4 border-white shadow-lg cursor-pointer" />
            </div>
          </aside>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed z-50" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className="bg-white border rounded-lg shadow-lg w-40">
            <button className="w-full px-3 py-2 text-left text-[13px] hover:bg-slate-50" onClick={() => handleBringToFront(contextMenu!.id, contextMenu!.type)}>Bring to front</button>
            <button className="w-full px-3 py-2 text-left text-[13px] hover:bg-slate-50" onClick={() => handleSendToBack(contextMenu!.id, contextMenu!.type)}>Send to back</button>
            <button className="w-full px-3 py-2 text-left text-[13px] hover:bg-red-50 text-red-600" onClick={() => handleDeleteObject(contextMenu!.id, contextMenu!.type)}>Delete</button>
            <button className="w-full px-3 py-2 text-left text-[13px] hover:bg-slate-50" onClick={() => setContextMenu(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* FOOTER - PURE BLACK */}
      <footer className="h-[100px] px-3 pb-4 shrink-0">
        <div className="h-full bg-black rounded-[2.5rem] flex items-center px-8 gap-6 overflow-x-auto no-scrollbar border border-white/5 shadow-2xl">
            {templates.map((url, i) => (
              <img key={i} src={url} onClick={() => setSelectedImage(url)} className={`h-16 w-16 min-w-[64px] rounded-2xl object-cover cursor-pointer border-2 transition-all ${selectedImage === url ? 'border-yellow-400 scale-110' : 'border-white/10 opacity-60 hover:opacity-100'}`} />
            ))}
        </div>
      </footer>
    </div>
  );
}