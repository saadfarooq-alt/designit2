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
interface StrokeDot { id: string; x: number; y: number; }
interface Stroke { 
  id: string; 
  points: StrokeDot[]; 
  color: string; 
  width: number; 
  fillColor?: string;
}
type HistoryItem = { shapes: DistortableShape[]; strokes: Stroke[] };
type Candidate = { id: string; d: string; area: number; selected: boolean; };

export default function DesignStudio() {
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pages state
  const [activePage, setActivePage] = useState<"studio" | "about" | "contact">("studio");

  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sourceDots, setSourceDots] = useState<Dot[]>([]);

  const [workspaceShapes, setWorkspaceShapes] = useState<DistortableShape[]>([]);
  const [activeTool, setActiveTool] = useState<"cursor" | "pen" | "fill" | "erase">("cursor");
  const [activeColor, setActiveColor] = useState("#f97316");
  const [globalShowDots, setGlobalShowDots] = useState(true);
  const [isLocked, setIsLocked] = useState(false); 
  const [strokes, setStrokes] = useState<Stroke[]>([]);

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

  const getCoords = (e: any) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, rx: 0, ry: 0 };
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top, rx: cx, ry: cy };
  };

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
  };

  const generatePathData = (dots: Dot[] | StrokeDot[], close = true) => {
    if (dots.length === 0) return "";
    const d = `M ${dots[0].x} ${dots[0].y} ` + dots.slice(1).map(d => `L ${d.x} ${d.y}`).join(" ");
    return close ? d + " Z" : d;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-slate-100 overflow-hidden select-none touch-none font-sans">
      
      {/* HEADER */}
      <header className="h-[65px] flex items-center justify-between px-4 bg-[#800000] border-b-2 border-[#660000] shrink-0 z-[100] shadow-md">
        <div className="flex items-center gap-4">
          <span className="font-black text-[14px] uppercase tracking-tighter text-white">Studio v2</span>
          <nav className="hidden md:flex gap-3 ml-4">
            <button onClick={() => setActivePage("studio")} className={`text-[10px] font-bold uppercase transition-colors ${activePage === 'studio' ? 'text-yellow-400' : 'text-white/70 hover:text-white'}`}>Canvas</button>
            <button onClick={() => setActivePage("about")} className={`text-[10px] font-bold uppercase transition-colors ${activePage === 'about' ? 'text-yellow-400' : 'text-white/70 hover:text-white'}`}>About</button>
            <button onClick={() => setActivePage("contact")} className={`text-[10px] font-bold uppercase transition-colors ${activePage === 'contact' ? 'text-yellow-400' : 'text-white/70 hover:text-white'}`}>Contact</button>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setIsLocked(!isLocked)} className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all shadow-sm ${isLocked ? 'bg-white text-[#800000]' : 'bg-[#a03a3a] text-white'}`}>{isLocked ? "Unlock Move" : "Lock Move"}</button>
          <button onClick={() => setGlobalShowDots(!globalShowDots)} className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all shadow-sm ${globalShowDots ? 'bg-white text-[#800000]' : 'bg-[#a03a3a] text-white'}`}>{globalShowDots ? "Hide Dots" : "Show Dots"}</button>
          <button onClick={undo} className="px-3 py-2 bg-white text-[#800000] rounded-xl text-[9px] font-bold uppercase shadow-sm active:scale-95 transition-transform">Undo</button>
          <button onClick={() => { saveForUndo(); setWorkspaceShapes([]); setStrokes([]); }} className="px-3 py-2 bg-red-600 text-white rounded-xl text-[9px] font-bold uppercase shadow-lg active:scale-95 transition-transform">Reset</button>
        </div>
      </header>

      {/* OVERLAY PAGES */}
      {activePage !== "studio" && (
        <div className="fixed inset-0 top-[65px] bg-slate-100 z-[90] p-6 md:p-12 overflow-y-auto animate-in slide-in-from-bottom duration-300">
          <div className="max-w-3xl mx-auto">
            <button onClick={() => setActivePage("studio")} className="mb-8 flex items-center gap-2 text-[#800000] font-black uppercase text-[12px]">
              ← Back to Studio
            </button>

            {activePage === "about" ? (
              <section className="bg-white p-8 rounded-[2rem] shadow-xl">
                <h1 className="text-4xl font-black text-[#800000] mb-6 uppercase italic">About the Studio</h1>
                <p className="text-slate-600 leading-relaxed mb-4">
                  SVG Design Studio v2 is a high-performance vector manipulation tool designed for creators who want to transform static images into fluid, distortable assets.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                  <div className="bg-slate-50 p-4 rounded-xl border-l-4 border-yellow-400">
                    <h3 className="font-black uppercase text-[12px] mb-2">Image Tracing</h3>
                    <p className="text-[13px] text-slate-500">Powered by ImageTracerJS, we convert raster pixels into editable SVG paths instantly.</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border-l-4 border-pink-500">
                    <h3 className="font-black uppercase text-[12px] mb-2">Distortion Engine</h3>
                    <p className="text-[13px] text-slate-500">Move individual anchor points to stretch, warp, and redesign shapes in real-time.</p>
                  </div>
                </div>
              </section>
            ) : (
              <section className="bg-[#800000] text-white p-8 rounded-[2rem] shadow-xl">
                <h1 className="text-4xl font-black mb-6 uppercase italic">Get in Touch</h1>
                <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); alert("Message Sent!"); setActivePage("studio"); }}>
                  <input type="text" placeholder="Your Name" className="bg-white/10 border border-white/20 p-4 rounded-xl placeholder:text-white/40 outline-none focus:bg-white/20 transition-all" required />
                  <input type="email" placeholder="Email Address" className="bg-white/10 border border-white/20 p-4 rounded-xl placeholder:text-white/40 outline-none focus:bg-white/20 transition-all" required />
                  <textarea placeholder="Tell us about your project..." className="bg-white/10 border border-white/20 p-4 rounded-xl h-32 placeholder:text-white/40 outline-none focus:bg-white/20 transition-all" required></textarea>
                  <button type="submit" className="bg-yellow-400 text-[#800000] py-4 rounded-xl font-black uppercase tracking-widest hover:bg-white transition-all active:scale-95 mt-4">Send Message</button>
                </form>
              </section>
            )}
          </div>
        </div>
      )}

      {/* MAIN STUDIO AREA */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden p-3 gap-3">
        <aside className="h-[35%] md:h-full w-full md:w-[350px] p-3 bg-white rounded-[2rem] shadow-xl flex flex-row gap-3 shrink-0">
          <div className="flex flex-col gap-2 w-[80px] shrink-0">
            <button onClick={() => {
                const ns = "http://www.w3.org/2000/svg";
                let pts: Dot[] = [];
                candidates.filter(c => c.selected).forEach(c => {
                  const path = document.createElementNS(ns, "path");
                  path.setAttribute("d", c.d);
                  document.body.appendChild(path);
                  const len = path.getTotalLength();
                  for (let i = 0; i <= len; i += Math.max(3, Math.round(len / 40))) {
                    const p = path.getPointAtLength(i);
                    pts.push({ id: `p-${Math.random()}`, x: p.x, y: p.y });
                  }
                  document.body.removeChild(path);
                });
                setSourceDots(pts);
            }} className="w-full h-10 bg-green-500 text-white border-b-4 border-green-700 rounded-lg text-[9px] font-black uppercase shadow-md">Sample</button>
            <button onClick={() => {
                saveForUndo();
                const forceScale = imgDims.width ? 150 / imgDims.width : 1;
                setWorkspaceShapes(prev => [...prev, { id: `s-${Date.now()}`, img: selectedImage!, dots: [...sourceDots], dims: { ...imgDims }, position: { x: 100, y: 100 }, scale: forceScale, showDots: true }]);
                setSourceDots([]);
            }} disabled={sourceDots.length === 0} className="w-full h-10 bg-green-500 text-white border-b-4 border-green-700 rounded-lg text-[9px] font-black uppercase disabled:opacity-30 shadow-md">Add</button>
            <button onClick={() => fileInputRef.current?.click()} className="w-full h-10 bg-black text-white rounded-lg text-[9px] font-black uppercase mt-auto">Upload</button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={e => { const f = e.target.files?.[0]; if(f) setSelectedImage(URL.createObjectURL(f)); }} />
          </div>
          <div className="flex-1 bg-slate-50 rounded-xl relative overflow-hidden flex items-center justify-center border border-slate-200">
            <svg viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full">
              {selectedImage && <image href={selectedImage} width={imgDims.width} height={imgDims.height} />}
              {candidates.map(c => (
                <path key={c.id} d={c.d} fill={c.selected ? activeColor : "transparent"} stroke={c.selected ? "#3b82f6" : "#cbd5e1"} strokeWidth={2} opacity={0.5} onClick={() => setCandidates(prev => prev.map(x => x.id === c.id ? {...x, selected: !x.selected} : x))} />
              ))}
              {sourceDots.map(s => <circle key={s.id} cx={s.x} cy={s.y} r={5} fill="#3b82f6" />)}
            </svg>
          </div>
        </aside>

        <div className="flex-1 flex flex-row gap-3 min-h-0">
          <main className="flex-1 bg-white rounded-[2rem] border border-white shadow-xl relative overflow-hidden"
            onPointerDown={(e) => {
              isPointerDownRef.current = true;
              const c = getCoords(e);
              if (activeTool === "erase") { saveForUndo(); sweepErase(c.x, c.y); }
              if (activeTool === "pen") {
                saveForUndo();
                const strokeId = `st-${Date.now()}`;
                setStrokes(prev => [...prev, { id: strokeId, points: [{ id: `pt-${Date.now()}`, x: c.x, y: c.y }], color: activeColor, width: 4 }]);
                penRef.current = { pointerId: e.pointerId, lastX: c.x, lastY: c.y, strokeId };
              }
            }}
            onPointerMove={(e) => {
              const c = getCoords(e);
              if (activeTool === "erase" && isPointerDownRef.current) sweepErase(c.x, c.y);
              if (activeTool === "pen" && penRef.current && e.pointerId === penRef.current.pointerId) {
                const dist = Math.hypot(c.x - penRef.current.lastX, c.y - penRef.current.lastY);
                if (dist >= PEN_SPACING) {
                  setStrokes(prev => prev.map(s => s.id === penRef.current!.strokeId ? { ...s, points: [...s.points, { id: `pt-${Date.now()}`, x: c.x, y: c.y }] } : s));
                  penRef.current.lastX = c.x; penRef.current.lastY = c.y;
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
            onPointerUp={() => {
              isPointerDownRef.current = false;
              penRef.current = null;
              setDraggingShapeId(null); setDraggingDot(null); setDraggingStrokeDot(null); setResizingId(null);
            }}
          >
            <svg ref={workspaceRef} className="w-full h-full">
              {strokes.map(s => (
                <g key={s.id}>
                  <path d={generatePathData(s.points, !!s.fillColor)} stroke={s.color} strokeWidth={s.width} fill={s.fillColor || "transparent"} strokeLinecap="round" strokeLinejoin="round" 
                    onPointerDown={(e) => { if (activeTool === "fill") { e.stopPropagation(); saveForUndo(); setStrokes(prev => prev.map(st => st.id === s.id ? { ...st, fillColor: activeColor } : st)); } }}
                  />
                  {globalShowDots && s.points.map((p) => (
                    <circle key={p.id} cx={p.x} cy={p.y} r={6} fill={s.color} className="cursor-move" onPointerDown={(e) => { if (activeTool === "cursor") { e.stopPropagation(); setDraggingStrokeDot({ strokeId: s.id, dotId: p.id }); } }} />
                  ))}
                </g>
              ))}
              {workspaceShapes.map(shape => (
                <g key={shape.id} transform={`translate(${shape.position.x} ${shape.position.y}) scale(${shape.scale})`}>
                  <defs><clipPath id={`cl-${shape.id}`}><path d={generatePathData(shape.dots, true)} /></clipPath></defs>
                  <image href={shape.img} width={shape.dims.width} height={shape.dims.height} clipPath={`url(#cl-${shape.id})`} onPointerDown={(e) => {
                      if (activeTool === "fill") { saveForUndo(); setWorkspaceShapes(prev => prev.map(s => s.id === shape.id ? {...s, fillColor: activeColor} : s)); return; }
                      if (activeTool === "cursor" && !isLocked) { e.stopPropagation(); const c = getCoords(e); setDraggingShapeId(shape.id); setDragOffset({ x: c.x - shape.position.x, y: c.y - shape.position.y }); }
                  }} />
                  {globalShowDots && <path d={generatePathData(shape.dots, true)} fill={shape.fillColor || "transparent"} stroke="#3b82f6" strokeWidth={2 / shape.scale} strokeDasharray={`${4/shape.scale},${4/shape.scale}`} opacity={0.7} pointerEvents="none" />}
                  {globalShowDots && shape.dots.map(dot => (
                    <circle key={dot.id} cx={dot.x} cy={dot.y} r={10 / shape.scale} fill="#3b82f6" onPointerDown={(e) => { e.stopPropagation(); setDraggingDot({ shapeId: shape.id, dotId: dot.id }); }} />
                  ))}
                  {globalShowDots && <rect x={shape.dims.width - 15} y={shape.dims.height - 15} width={35 / shape.scale} height={35 / shape.scale} fill="#f97316" rx={4} onPointerDown={(e) => { e.stopPropagation(); const c = getCoords(e); setResizingId(shape.id); setDragOffset({ x: c.rx, y: c.ry }); }} />}
                </g>
              ))}
            </svg>
          </main>

          <aside className="w-[50px] md:w-[60px] h-full bg-yellow-400 rounded-[2rem] border-2 border-yellow-500 shadow-xl flex flex-col items-center py-4 gap-4 shrink-0">
            <div className="flex flex-col gap-2 p-1 bg-yellow-500/30 rounded-2xl">
              {(["cursor", "pen", "fill", "erase"] as const).map((tool) => (
                <button key={tool} onClick={() => setActiveTool(tool)} className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${activeTool === tool ? 'bg-pink-500 text-white scale-105 shadow-lg font-black' : 'bg-yellow-600/20 text-black/60'}`}>
                  <span className="text-[12px] font-black uppercase">{tool.charAt(0)}</span>
                </button>
              ))}
            </div>
            <input type="color" value={activeColor} onChange={e => setActiveColor(e.target.value)} className="w-8 h-8 rounded-full border-4 border-white shadow-lg cursor-pointer mt-auto" />
          </aside>
        </div>
      </div>

      {/* FOOTER GALLERY */}
      <footer className="h-[90px] px-3 pb-3 shrink-0">
        <div className="h-full bg-black rounded-[2rem] flex items-center px-6 gap-4 overflow-x-auto no-scrollbar">
            {templates.map((url, i) => (
              <img key={i} src={url} onClick={() => setSelectedImage(url)} className={`h-14 w-14 rounded-xl object-cover cursor-pointer border-2 transition-all ${selectedImage === url ? 'border-yellow-400 scale-110' : 'border-white/20'}`} />
            ))}
        </div>
      </footer>
    </div>
  );
}