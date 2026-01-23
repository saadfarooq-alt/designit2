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
  zIndex: number;
}
interface Stroke { 
  id: string; 
  points: Dot[]; 
  color: string; 
  width: number; 
  fillColor?: string; 
  zIndex: number;
}
type HistoryItem = { shapes: DistortableShape[]; strokes: Stroke[] };

export default function DesignStudio() {
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  const [candidates, setCandidates] = useState<{id: string, d: string, selected: boolean}[]>([]);
  const [sourceDots, setSourceDots] = useState<Dot[]>([]);

  const [workspaceShapes, setWorkspaceShapes] = useState<DistortableShape[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [activeTool, setActiveTool] = useState<"cursor" | "pen" | "fill" | "erase">("cursor");
  const [activeColor, setActiveColor] = useState("#f97316");
  const [globalShowDots, setGlobalShowDots] = useState(true);
  const [isLocked, setIsLocked] = useState(false); 
  
  const [draggingDot, setDraggingDot] = useState<{ parentId: string; dotId: string; type: 'shape' | 'stroke' } | null>(null);
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string, type: 'shape' | 'stroke' } | null>(null);
  const [hoveredTip, setHoveredTip] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const workspaceRef = useRef<SVGSVGElement | null>(null);
  const isPointerDownRef = useRef(false);
  const penRef = useRef<{ pointerId: number; lastX: number; lastY: number; strokeId: string } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/templates").catch(() => null);
      const data = res ? await res.json() : ["/template1.png", "/template2.png"];
      setTemplates(data);
      setSelectedImage(data[0]);
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
        const tmp = document.createElement("div"); tmp.innerHTML = inner;
        const paths = Array.from(tmp.querySelectorAll("path")).map(p => ({
          id: Math.random().toString(36).slice(2, 7),
          d: p.getAttribute("d") || "",
          selected: false
        }));
        setCandidates(paths);
      }, { numberofcolors: 2, scale: 1 });
    };
    img.src = selectedImage;
  }, [selectedImage]);

  useEffect(() => { runTrace(); }, [selectedImage, runTrace]);

  const getCoords = (e: any) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, rx: 0, ry: 0 };
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top, rx: cx, ry: cy };
  };

  const saveForUndo = useCallback(() => {
    setHistory(h => [...h, { shapes: JSON.parse(JSON.stringify(workspaceShapes)), strokes: JSON.parse(JSON.stringify(strokes)) }].slice(-50));
  }, [workspaceShapes, strokes]);

  const generatePathData = (pts: { x: number; y: number }[], close = false) => {
    if (pts.length === 0) return "";
    let d = `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
    return close ? d + " Z" : d;
  };

  const handleLayering = (id: string, type: 'shape' | 'stroke', action: 'front' | 'back') => {
    const allZs = [...workspaceShapes.map(s => s.zIndex), ...strokes.map(s => s.zIndex), 0];
    const maxZ = Math.max(...allZs);
    const minZ = Math.min(...allZs);
    if (type === 'shape') setWorkspaceShapes(prev => prev.map(s => s.id === id ? { ...s, zIndex: action === 'front' ? maxZ + 1 : minZ - 1 } : s));
    else setStrokes(prev => prev.map(s => s.id === id ? { ...s, zIndex: action === 'front' ? maxZ + 1 : minZ - 1 } : s));
    setContextMenu(null);
  };

  if (!mounted) return null;

  const sortedElements = [
    ...workspaceShapes.map(s => ({ ...s, type: 'shape' as const })),
    ...strokes.map(s => ({ ...s, type: 'stroke' as const }))
  ].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-slate-100 overflow-hidden select-none touch-none" onClick={() => setContextMenu(null)}>
      <header className="h-[60px] flex items-center justify-between px-3 bg-red-950 border-b border-red-900 shrink-0 z-50">
        <span className="font-black text-[12px] uppercase text-pink-400">Studio</span>
        <div className="flex items-center gap-2">
          <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-black text-white rounded-lg text-[10px] font-black uppercase border border-white/20">Upload</button>
          
          <div className="relative group">
            <button onClick={() => setGlobalShowDots(!globalShowDots)} 
              onMouseEnter={() => setHoveredTip("Toggle Edit Dots")} onMouseLeave={() => setHoveredTip(null)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase ${globalShowDots ? 'bg-pink-500 text-white shadow-inner' : 'bg-red-900 text-pink-200 border border-white/5'}`}>
              {globalShowDots ? "Hide Dots" : "Show Dots"}
            </button>
            {hoveredTip === "Toggle Edit Dots" && <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-black text-white text-[8px] rounded whitespace-nowrap z-[60]">Hide or show edit points</div>}
          </div>

          <div className="relative group">
            <button onClick={() => setIsLocked(!isLocked)} 
              onMouseEnter={() => setHoveredTip("Lock Movement")} onMouseLeave={() => setHoveredTip(null)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase ${isLocked ? 'bg-pink-500 text-white' : 'bg-red-900 text-pink-200'}`}>
              {isLocked ? "Locked" : "Unlocked"}
            </button>
            {hoveredTip === "Lock Movement" && <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-black text-white text-[8px] rounded whitespace-nowrap z-[60]">Freeze shape positions</div>}
          </div>

          <button onClick={() => { if (history.length) { const last = history[history.length-1]; setWorkspaceShapes(last.shapes); setStrokes(last.strokes); setHistory(h => h.slice(0,-1)); } }} className="px-2.5 py-1.5 bg-white text-black rounded-lg text-[10px] font-bold">Undo</button>
          <button onClick={() => { if(confirm("Clear all?")) { saveForUndo(); setWorkspaceShapes([]); setStrokes([]); } }} className="px-2.5 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-bold uppercase">Reset</button>
          <input type="file" ref={fileInputRef} className="hidden" onChange={e => { if(e.target.files?.[0]) setSelectedImage(URL.createObjectURL(e.target.files[0])); }} />
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden p-2 gap-2">
        {/* TRACING PANEL */}
        <aside className="h-[30%] md:h-full w-full md:w-[280px] p-2 bg-white rounded-3xl shadow-xl flex flex-row gap-2 shrink-0">
          <div className="flex flex-col gap-1.5 w-[65px]">
            <button onClick={() => {
                const ns = "http://www.w3.org/2000/svg";
                let pts: Dot[] = [];
                candidates.filter(c => c.selected).forEach(c => {
                  const path = document.createElementNS(ns, "path"); path.setAttribute("d", c.d); document.body.appendChild(path);
                  const len = path.getTotalLength();
                  for (let i = 0; i <= len; i += len / 30) { const p = path.getPointAtLength(i); pts.push({ id: `p-${Math.random()}`, x: p.x, y: p.y }); }
                  document.body.removeChild(path);
                });
                setSourceDots(pts);
            }} className="w-full h-8 bg-green-500 text-white rounded-md text-[8px] font-black uppercase">Sample</button>
            <button onClick={() => {
                saveForUndo();
                setWorkspaceShapes(prev => [...prev, { id: `s-${Date.now()}`, img: selectedImage!, dots: [...sourceDots], dims: { ...imgDims }, position: { x: 50, y: 50 }, scale: 150/imgDims.width, showDots: true, zIndex: prev.length + strokes.length }]);
                setSourceDots([]);
            }} disabled={sourceDots.length === 0} className="w-full h-8 bg-green-500 text-white rounded-md text-[8px] font-black uppercase disabled:opacity-30">Add</button>
          </div>
          <div className="flex-1 bg-slate-50 rounded-xl overflow-hidden border border-slate-200">
            <svg viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full">
              {selectedImage && <image href={selectedImage} width={imgDims.width} height={imgDims.height} />}
              {candidates.map(c => <path key={c.id} d={c.d} fill={c.selected ? activeColor : "transparent"} stroke={c.selected ? "#3b82f6" : "#cbd5e1"} strokeWidth={2} opacity={0.5} onClick={() => setCandidates(prev => prev.map(x => x.id === c.id ? {...x, selected: !x.selected} : x))} />)}
            </svg>
          </div>
        </aside>

        <div className="flex-1 flex flex-row gap-2 min-h-0 relative">
          {/* MAIN WORKSPACE - Left Side */}
          <main className="flex-1 bg-white rounded-3xl border border-white shadow-xl relative overflow-hidden"
            onPointerDown={(e) => {
              isPointerDownRef.current = true;
              const c = getCoords(e);
              if (activeTool === "pen") {
                saveForUndo();
                const strokeId = `st-${Date.now()}`;
                setStrokes(prev => [...prev, { id: strokeId, points: [{ id: `pt-${Date.now()}`, x: c.x, y: c.y }], color: activeColor, width: 4, zIndex: prev.length + workspaceShapes.length }]);
                penRef.current = { pointerId: e.pointerId, lastX: c.x, lastY: c.y, strokeId };
              }
            }}
            onPointerMove={(e) => {
              const c = getCoords(e);
              if (penRef.current) {
                if (Math.hypot(c.x - penRef.current.lastX, c.y - penRef.current.lastY) > 15) {
                  setStrokes(prev => prev.map(s => s.id === penRef.current!.strokeId ? { ...s, points: [...s.points, { id: `pt-${Math.random()}`, x: c.x, y: c.y }] } : s));
                  penRef.current.lastX = c.x; penRef.current.lastY = c.y;
                }
              } else if (draggingDot) {
                if (draggingDot.type === 'shape') {
                  setWorkspaceShapes(prev => prev.map(s => s.id !== draggingDot.parentId ? s : { ...s, dots: s.dots.map(d => d.id === draggingDot.dotId ? { ...d, x: (c.x - s.position.x)/s.scale, y: (c.y - s.position.y)/s.scale } : d) }));
                } else {
                  setStrokes(prev => prev.map(s => s.id !== draggingDot.parentId ? s : { ...s, points: s.points.map(p => p.id === draggingDot.dotId ? { ...p, x: c.x, y: c.y } : p) }));
                }
              } else if (draggingShapeId && !isLocked) {
                setWorkspaceShapes(prev => prev.map(s => s.id === draggingShapeId ? { ...s, position: { x: c.x - dragOffset.x, y: c.y - dragOffset.y } } : s));
              } else if (resizingId) {
                setWorkspaceShapes(prev => prev.map(s => s.id === resizingId ? { ...s, scale: Math.max(0.1, s.scale + (c.rx - dragOffset.x) / 400) } : s));
                setDragOffset({ x: c.rx, y: c.ry });
              }
            }}
            onPointerUp={() => { isPointerDownRef.current = false; penRef.current = null; setDraggingShapeId(null); setDraggingDot(null); setResizingId(null); }}>
            
            <svg ref={workspaceRef} className="w-full h-full">
              <defs>
                {workspaceShapes.map(s => (
                  <clipPath key={`clip-${s.id}`} id={`cl-${s.id}`}><path d={generatePathData(s.dots, true)} /></clipPath>
                ))}
              </defs>

              {sortedElements.map(el => (
                el.type === 'stroke' ? (
                  <g key={el.id} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, id: el.id, type: 'stroke' }); }}>
                    <path d={generatePathData(el.points, true)} 
                      fill={el.fillColor || "transparent"} 
                      onClick={(e) => { 
                        if (activeTool === "fill") { e.stopPropagation(); saveForUndo(); setStrokes(prev => prev.map(st => st.id === el.id ? {...st, fillColor: activeColor} : st)); }
                        if (activeTool === "erase") { e.stopPropagation(); saveForUndo(); setStrokes(prev => prev.filter(st => st.id !== el.id)); }
                      }} 
                      pointerEvents={(activeTool === "fill" || activeTool === "erase") ? "fill" : "none"} 
                    />
                    <path d={generatePathData(el.points)} fill="none" stroke={el.color} strokeWidth={6} strokeDasharray="0, 15" strokeLinecap="round" pointerEvents="none" />
                    {globalShowDots && el.points.map(p => (
                      <circle key={p.id} cx={p.x} cy={p.y} r={6} fill="#3b82f6" onPointerDown={(e) => { 
                        if (activeTool === "erase") { e.stopPropagation(); saveForUndo(); setStrokes(prev => prev.map(st => st.id === el.id ? { ...st, points: st.points.filter(dot => dot.id !== p.id) } : st)); }
                        else { e.stopPropagation(); setDraggingDot({ parentId: el.id, dotId: p.id, type: 'stroke' }); }
                      }} className="cursor-move" />
                    ))}
                  </g>
                ) : (
                  <g key={el.id} transform={`translate(${el.position.x} ${el.position.y}) scale(${el.scale})`} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, id: el.id, type: 'shape' }); }}>
                    <image href={el.img} width={el.dims.width} height={el.dims.height} clipPath={`url(#cl-${el.id})`} onPointerDown={(e) => {
                        if (activeTool === "fill") { e.stopPropagation(); saveForUndo(); setWorkspaceShapes(prev => prev.map(s => s.id === el.id ? {...s, fillColor: activeColor} : s)); }
                        else if (activeTool === "erase") { e.stopPropagation(); saveForUndo(); setWorkspaceShapes(prev => prev.filter(s => s.id !== el.id)); }
                        else if (activeTool === "cursor" && !isLocked) { e.stopPropagation(); const coords = getCoords(e); setDraggingShapeId(el.id); setDragOffset({ x: coords.x - el.position.x, y: coords.y - el.position.y }); }
                    }} className="cursor-move" />
                    <path d={generatePathData(el.dots, true)} fill={el.fillColor || "transparent"} opacity={0.5} pointerEvents="none" />
                    {globalShowDots && el.dots.map(dot => (
                      <circle key={dot.id} cx={dot.x} cy={dot.y} r={10 / el.scale} fill="#3b82f6" onPointerDown={(e) => { 
                        if (activeTool === "erase") { e.stopPropagation(); saveForUndo(); setWorkspaceShapes(prev => prev.map(s => s.id === el.id ? { ...s, dots: s.dots.filter(d => d.id !== dot.id) } : s)); }
                        else { e.stopPropagation(); setDraggingDot({ parentId: el.id, dotId: dot.id, type: 'shape' }); }
                      }} className="cursor-crosshair" />
                    ))}
                    {globalShowDots && (
                      <rect x={el.dims.width-15} y={el.dims.height-15} width={35/el.scale} height={35/el.scale} fill="#f97316" rx={4} onPointerDown={(e) => { e.stopPropagation(); const c = getCoords(e); setResizingId(el.id); setDragOffset({ x: c.rx, y: c.ry }); }} className="cursor-nwse-resize" />
                    )}
                  </g>
                )
              ))}
            </svg>
          </main>

          {/* TOOLBAR - Right Side */}
          <aside className="w-[55px] bg-yellow-400 rounded-3xl border border-yellow-500 flex flex-col items-center py-5 gap-4 shrink-0 relative">
            {[
              { id: "cursor", label: "C", tip: "Cursor: Select & Move" },
              { id: "pen", label: "P", tip: "Pen: Draw Shapes" },
              { id: "fill", label: "F", tip: "Fill: Color Shapes" },
              { id: "erase", label: "E", tip: "Erase: Remove dots or items" }
            ].map(tool => (
              <div key={tool.id} className="relative flex items-center justify-center">
                {/* TOOLTIP ON THE LEFT */}
                {hoveredTip === tool.tip && (
                  <div className="absolute right-full mr-3 px-2 py-1 bg-black text-white text-[8px] rounded whitespace-nowrap z-[60] pointer-events-none after:content-[''] after:absolute after:top-1/2 after:left-full after:-translate-y-1/2 after:border-4 after:border-transparent after:border-l-black">
                    {tool.tip}
                  </div>
                )}
                <button 
                  onClick={() => setActiveTool(tool.id as any)} 
                  onMouseEnter={() => setHoveredTip(tool.tip)}
                  onMouseLeave={() => setHoveredTip(null)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[12px] transition-all ${activeTool === tool.id ? 'bg-pink-500 text-white shadow-lg scale-110' : 'bg-yellow-600/20'}`}
                >
                  {tool.label}
                </button>
              </div>
            ))}
            <input type="color" value={activeColor} onChange={e => setActiveColor(e.target.value)} className="w-8 h-8 rounded-full mt-auto cursor-pointer border-2 border-white" />
          </aside>
        </div>
      </div>

      {contextMenu && (
        <div className="fixed bg-white shadow-2xl rounded-xl border border-slate-200 p-1 z-[100] w-40" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button className="w-full text-left px-3 py-2 text-[10px] font-bold hover:bg-slate-100 rounded-lg uppercase" onClick={() => handleLayering(contextMenu.id, contextMenu.type, 'front')}>Bring to Front</button>
          <button className="w-full text-left px-3 py-2 text-[10px] font-bold hover:bg-slate-100 rounded-lg uppercase" onClick={() => handleLayering(contextMenu.id, contextMenu.type, 'back')}>Send to Back</button>
          <button className="w-full text-left px-3 py-2 text-[10px] font-bold hover:bg-red-50 text-red-600 rounded-lg uppercase" onClick={() => { 
            saveForUndo(); 
            if(contextMenu.type === 'shape') setWorkspaceShapes(prev => prev.filter(s => s.id !== contextMenu.id));
            else setStrokes(prev => prev.filter(s => s.id !== contextMenu.id));
            setContextMenu(null);
          }}>Delete</button>
        </div>
      )}

      <footer className="h-[80px] px-2 pb-2 shrink-0">
        <div className="h-full bg-black rounded-3xl flex items-center px-4 gap-3 overflow-x-auto no-scrollbar shadow-inner">
            {templates.map((url, i) => <img key={i} src={url} onClick={() => setSelectedImage(url)} className={`h-12 w-12 rounded-lg object-cover cursor-pointer border-2 transition-all ${selectedImage === url ? 'border-yellow-400 scale-105' : 'border-white/10 opacity-60'}`} />)}
        </div>
      </footer>
    </div>
  );
}