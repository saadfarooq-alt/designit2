"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import ImageTracer from "imagetracerjs";

interface Dot { id: string; x: number; y: number; }
interface DistortableShape {
  id: string;
  img: string;
  dots: Dot[]; // local coordinates inside shape (for image shapes these are local; for converted pen shapes we store workspace coords with position 0,0)
  dims: { width: number; height: number };
  position: { x: number; y: number };
  scale: number;
  showDots: boolean;
  fillColor?: string;
}
interface Stroke { id: string; points: { x: number; y: number }[]; color: string; width: number; }
type HistoryItem = { shapes: DistortableShape[]; strokes: Stroke[]; penDots: Dot[] };

export default function DesignStudio() {
  const [mounted, setMounted] = useState(false);
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [sourceDots, setSourceDots] = useState<Dot[]>([]);
  const [workspaceShapes, setWorkspaceShapes] = useState<DistortableShape[]>([]);
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });

  const [sourceZoom, setSourceZoom] = useState(1);
  const [activeTool, setActiveTool] = useState<"cursor" | "pen" | "fill" | "erase">("cursor");
  const [activeColor, setActiveColor] = useState("#f97316");
  const [globalShowDots, setGlobalShowDots] = useState(true);

  const [draggingDot, setDraggingDot] = useState<{ shapeId: string; dotId: string } | null>(null);
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  // Pen/stroke state
  const [penDots, setPenDots] = useState<Dot[]>([]); // visual while drawing
  const [strokes, setStrokes] = useState<Stroke[]>([]); // persistent single-line strokes
  const penSpacing = 6;
  const defaultPenWidth = 4;

  // history (undo)
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const MAX_HISTORY = 50;

  const penRef = useRef<{ pointerId: number; lastX: number; lastY: number; strokeId: string } | null>(null);
  const isPointerDownRef = useRef(false);

  // pinch & long press
  const [initialPinchDist, setInitialPinchDist] = useState<number | null>(null);
  const [initialPinchScale, setInitialPinchScale] = useState<number | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const workspaceRef = useRef<SVGSVGElement | null>(null);

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
      } catch (e) { console.error(e); }
    }
    load();
  }, []);

  // tracing
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

  // gesture engine
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
    const handleTouch = (e: TouchEvent) => { if (e.touches.length > 1 && e.cancelable) e.preventDefault(); };
    workspace.addEventListener("wheel", handleWheel, { passive: false });
    workspace.addEventListener("touchstart", handleTouch, { passive: false });
    workspace.addEventListener("touchmove", handleTouch, { passive: false });
    return () => {
      workspace.removeEventListener("wheel", handleWheel);
      workspace.removeEventListener("touchstart", handleTouch);
      workspace.removeEventListener("touchmove", handleTouch);
    };
  }, [draggingShapeId]);

  const generatePathData = (dots: Dot[]) => {
    if (dots.length === 0) return "";
    return `M ${dots[0].x} ${dots[0].y} ` + dots.slice(1).map(d => `L ${d.x} ${d.y}`).join(" ") + " Z";
  };

  const getCoordsFromEvent = (e: any) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, rawX: 0, rawY: 0 };
    const clientX = "touches" in e && e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e && e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top, rawX: clientX, rawY: clientY };
  };

  // history / undo
  const saveForUndo = useCallback(() => {
    setHistory(h => {
      const snapshot: HistoryItem = { shapes: JSON.parse(JSON.stringify(workspaceShapes)), strokes: JSON.parse(JSON.stringify(strokes)), penDots: JSON.parse(JSON.stringify(penDots)) };
      const next = [...h, snapshot];
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
  }, [workspaceShapes, strokes, penDots]);

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const next = [...h];
      const last = next.pop()!;
      setWorkspaceShapes(last.shapes);
      setStrokes(last.strokes);
      setPenDots(last.penDots);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  // stroke helpers
  const strokePointsToPath = (pts: { x: number; y: number }[]) => {
    if (!pts.length) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.1} ${pts[0].y + 0.1}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], curr = pts[i];
      const qx = (prev.x + curr.x) / 2, qy = (prev.y + curr.y) / 2;
      d += ` Q ${prev.x} ${prev.y} ${qx} ${qy}`;
    }
    const last = pts[pts.length - 1];
    d += ` T ${last.x} ${last.y}`;
    return d;
  };

  // erase
  const eraseAtPoint = (clientX: number, clientY: number, radius = 18) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const coords = { x: clientX - rect.left, y: clientY - rect.top };

    // remove strokes with any point inside radius
    setStrokes(prev => prev.filter(st => {
      for (const p of st.points) {
        const dx = p.x - coords.x, dy = p.y - coords.y;
        if (Math.sqrt(dx*dx + dy*dy) <= radius) return false;
      }
      return true;
    }));

    // remove penDots
    setPenDots(prev => prev.filter(pd => {
      const dx = pd.x - coords.x, dy = pd.y - coords.y;
      return Math.sqrt(dx*dx + dy*dy) > radius;
    }));

    // remove shape dots near point
    setWorkspaceShapes(prev => prev.map(s => {
      const localX = (coords.x - s.position.x) / Math.max(1, s.scale);
      const localY = (coords.y - s.position.y) / Math.max(1, s.scale);
      const filtered = s.dots.filter(d => {
        const dx = d.x - localX, dy = d.y - localY;
        return Math.sqrt(dx*dx + dy*dy) > radius / Math.max(1, s.scale);
      });
      return { ...s, dots: filtered };
    }));
  };

  // pointer handlers
  const handlePointerDownWorkspace = (e: React.PointerEvent) => {
    const isPen = activeTool === "pen";
    const isErase = activeTool === "erase";

    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}

    isPointerDownRef.current = true;

    if (isPen || isErase) saveForUndo();

    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const coords = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (isPen) {
      // start stroke
      const strokeId = `st-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const newStroke: Stroke = { id: strokeId, points: [{ x: coords.x, y: coords.y }], color: activeColor, width: defaultPenWidth };
      setStrokes(prev => [...prev, newStroke]);
      penRef.current = { pointerId: e.pointerId, lastX: coords.x, lastY: coords.y, strokeId };
      setPenDots([{ id: `p-${Date.now()}`, x: coords.x, y: coords.y }]);
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (isErase) {
      eraseAtPoint(e.clientX, e.clientY, Math.max(8,18));
      if (e.cancelable) e.preventDefault();
      return;
    }
  };

  const handlePointerMoveWorkspace = (e: React.PointerEvent) => {
    if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!workspaceRef.current) return;

    if (penRef.current && e.pointerId === penRef.current.pointerId) {
      const rect = workspaceRef.current.getBoundingClientRect();
      const coords = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const dx = coords.x - penRef.current.lastX, dy = coords.y - penRef.current.lastY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist >= penSpacing) {
        setStrokes(prev => prev.map(s => s.id === penRef.current!.strokeId ? { ...s, points: [...s.points, { x: coords.x, y: coords.y }] } : s));
        setPenDots(prev => [...prev, { id: `p-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, x: coords.x, y: coords.y }]);
        penRef.current!.lastX = coords.x;
        penRef.current!.lastY = coords.y;
      }
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (activeTool === "erase" && isPointerDownRef.current) {
      eraseAtPoint(e.clientX, e.clientY, Math.max(8,18));
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (!draggingDot && !draggingShapeId && !resizingId) return;

    const coords = getCoordsFromEvent(e);

    if (resizingId) {
      const dx = coords.rawX - dragOffset.x;
      setWorkspaceShapes(prev => prev.map(s => s.id === resizingId ? { ...s, scale: Math.max(0.1, s.scale + dx/300) } : s));
      setDragOffset({ x: coords.rawX, y: coords.rawY });
      return;
    }
    if (draggingDot) {
      setWorkspaceShapes(prev => prev.map(s => s.id !== draggingDot.shapeId ? s : { ...s, dots: s.dots.map(d => d.id === draggingDot.dotId ? { ...d, x: (coords.x - s.position.x)/s.scale, y: (coords.y - s.position.y)/s.scale } : d) }));
      return;
    }
    if (draggingShapeId) {
      setWorkspaceShapes(prev => prev.map(s => s.id === draggingShapeId ? { ...s, position: { x: coords.x - dragOffset.x, y: coords.y - dragOffset.y } } : s));
      return;
    }
  };

  const handlePointerUpWorkspace = (e: React.PointerEvent) => {
    try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch {}
    isPointerDownRef.current = false;

    if (penRef.current && e.pointerId === penRef.current.pointerId) {
      penRef.current = null;
      setPenDots([]); // keep stroke in strokes[]
    }

    setDraggingDot(null);
    setDraggingShapeId(null);
    setResizingId(null);
  };

  // group-level pointer down so dragging works reliably
  const handlePointerDownOnShape = (e: React.PointerEvent, shape: DistortableShape) => {
    // allow pen to start over shapes; only stop propagation for non-pen
    if (activeTool !== "pen") e.stopPropagation();

    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}
    const coords = getCoordsFromEvent(e);

    if (activeTool === "cursor") {
      saveForUndo();
      setDraggingShapeId(shape.id);
      setDragOffset({ x: coords.x - shape.position.x, y: coords.y - shape.position.y });
      return;
    }

    if (activeTool === "fill") {
      saveForUndo();
      setWorkspaceShapes(prev => prev.map(s => s.id === shape.id ? { ...s, fillColor: activeColor } : s));
      return;
    }

    if (activeTool === "erase") {
      saveForUndo();
      isPointerDownRef.current = true;
      eraseAtPoint(e.clientX, e.clientY, Math.max(8,18));
      return;
    }

    // pen: let workspace handler start stroke
  };

  const handlePointerDownOnDot = (e: React.PointerEvent, shape: DistortableShape, dot: Dot) => {
    e.stopPropagation();
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}
    if (activeTool === "cursor") { saveForUndo(); setDraggingDot({ shapeId: shape.id, dotId: dot.id }); return; }
    if (activeTool === "erase") { saveForUndo(); setWorkspaceShapes(prev => prev.map(s => s.id !== shape.id ? s : { ...s, dots: s.dots.filter(d => d.id !== dot.id) })); return; }
  };

  // stroke click handler (convert to polygon + fill or erase)
  const handleStrokePointerDown = (e: React.PointerEvent, stroke: Stroke) => {
    e.stopPropagation();
    if (activeTool === "fill") {
      saveForUndo();
      // simple widen -> polygon algorithm (same as earlier)
      const polygon = (() => {
        const pts = stroke.points;
        if (pts.length < 2) return [];
        const normalize = (vx:number, vy:number) => { const len = Math.sqrt(vx*vx + vy*vy)||1; return { x: vx/len, y: vy/len }; };
        const left: {x:number;y:number}[] = [], right: {x:number;y:number}[] = [];
        for (let i=0;i<pts.length;i++){
          const prev = pts[Math.max(0,i-1)], curr = pts[i], next = pts[Math.min(pts.length-1, i+1)];
          const tx = next.x - prev.x, ty = next.y - prev.y; const t = normalize(tx,ty);
          const nx = -t.y, ny = t.x; const offset = stroke.width/2 + 4;
          left.push({ x: curr.x + nx*offset, y: curr.y + ny*offset });
          right.push({ x: curr.x - nx*offset, y: curr.y - ny*offset });
        }
        return [...left, ...right.reverse()];
      })();

      if (polygon.length >= 3) {
        const rect = workspaceRef.current?.getBoundingClientRect();
        const dims = rect ? { width: rect.width, height: rect.height } : { width: 1000, height: 1000 };
        const newShape: DistortableShape = {
          id: `stroke-${Date.now()}`,
          img: "",
          dots: polygon.map((p,i) => ({ id: `sp-${Date.now()}-${i}`, x: p.x, y: p.y })),
          dims,
          position: { x: 0, y: 0 },
          scale: 1,
          showDots: false,
          fillColor: activeColor,
        };
        setWorkspaceShapes(prev => [...prev, newShape]);
        setStrokes(prev => prev.filter(s => s.id !== stroke.id));
      }
      return;
    }

    if (activeTool === "erase") {
      saveForUndo();
      setStrokes(prev => prev.filter(s => s.id !== stroke.id));
      return;
    }

    // cursor/no-op otherwise
  };

  // add traced source
  const addSourceToWorkspace = () => {
    if (!selectedImage) return;
    if (sourceDots.length === 0) return;
    saveForUndo();
    setWorkspaceShapes(prev => [...prev, {
      id: `s-${Date.now()}`,
      img: selectedImage!,
      dots: [...sourceDots],
      dims: { ...imgDims },
      position: { x: 50, y: 50 },
      scale: 0.4,
      showDots: true,
    }]);
    setSourceDots([]);
  };

  // trace click
  const handleSourceClick = (e: any) => {
    const target = e.target as SVGPathElement;
    if (target?.tagName?.toLowerCase() === "path") {
      const len = target.getTotalLength();
      const pts: Dot[] = [];
      for (let i=0;i<=len;i+=15) {
        const p = target.getPointAtLength(i);
        pts.push({ id: Math.random().toString(36).substring(7), x: p.x, y: p.y });
      }
      setSourceDots(prev => [...prev, ...pts]);
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-slate-100 overflow-hidden text-slate-900"
      onClick={() => setContextMenu(null)} style={{ WebkitUserSelect: 'none', userSelect: 'none' }}>
      <header className="h-[60px] flex items-center justify-between px-6 bg-white border-b shrink-0 z-50">
        <span className="font-black text-xs uppercase tracking-tight">Studio v2</span>
        <div className="flex gap-4 items-center">
          <input type="color" value={activeColor} onChange={(e)=>setActiveColor(e.target.value)} className="w-8 h-8 rounded-full border-none cursor-pointer" />
          <label className="bg-blue-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase cursor-pointer">
            Upload <input type="file" className="hidden" onChange={(e)=>{ const f = e.target.files?.[0]; if (f) setSelectedImage(URL.createObjectURL(f)); }} />
          </label>

          <button onClick={() => undo()} className="px-3 py-2 rounded-lg bg-white border text-[10px] font-bold uppercase" disabled={history.length===0}>Undo</button>
          <button onClick={() => { saveForUndo(); setWorkspaceShapes([]); setPenDots([]); setStrokes([]); }} className="bg-red-50 text-red-500 px-3 py-2 rounded-lg text-[8px] font-bold uppercase">Reset</button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* SOURCE */}
        <div className="h-[50%] md:h-full md:w-[30%] bg-slate-50 border-b md:border-r p-4 flex flex-col shrink-0">
          <div className="flex justify-between items-center mb-2 px-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Source Zoom</span>
            <input type="range" min="1" max="5" step="0.1" value={sourceZoom} onChange={(e)=>setSourceZoom(parseFloat(e.target.value))} className="w-24 accent-blue-600" />
          </div>
          <div className="flex-1 bg-white rounded-xl border border-slate-200 relative overflow-auto shadow-inner">
            <div style={{ width: `${100 * sourceZoom}%`, height: `${100 * sourceZoom}%` }} className="relative">
              <svg viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full cursor-crosshair">
                {selectedImage && <image href={selectedImage} width={imgDims.width} height={imgDims.height} />}
                {svgContent && <g dangerouslySetInnerHTML={{ __html: svgContent }} onClick={handleSourceClick} className="opacity-0" style={{ pointerEvents: 'auto' }} />}
                {sourceDots.map(dot => <circle key={dot.id} cx={dot.x} cy={dot.y} r={3 / sourceZoom} fill="#3b82f6" />)}
              </svg>
            </div>
          </div>
          <button onClick={addSourceToWorkspace} disabled={sourceDots.length===0} className="mt-2 bg-slate-900 text-white py-3 rounded-lg font-bold text-[10px] uppercase">Add to Workspace ↓</button>
        </div>

        {/* WORKSPACE */}
        <main className="flex-1 bg-white relative overflow-hidden touch-none"
          style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
          onPointerDown={handlePointerDownWorkspace}
          onPointerMove={handlePointerMoveWorkspace}
          onPointerUp={handlePointerUpWorkspace}
          onPointerCancel={() => { isPointerDownRef.current = false; penRef.current = null; }}>
          <svg ref={workspaceRef} className="w-full h-full">
            {/* shapes */}
            {workspaceShapes.map(shape => (
              <g key={shape.id}
                 transform={`translate(${shape.position.x} ${shape.position.y}) scale(${shape.scale})`}
                 onPointerDown={(e) => handlePointerDownOnShape(e, shape)}
              >
                <defs><clipPath id={`c-${shape.id}`}><path d={generatePathData(shape.dots)} /></clipPath></defs>

                {shape.img && shape.img.length > 0 && (
                  <image href={shape.img} width={shape.dims.width} height={shape.dims.height} clipPath={`url(#c-${shape.id})`}
                    className="cursor-move" style={{ WebkitTouchCallout: 'none' }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, id: shape.id }); }}
                  />
                )}

                <path d={generatePathData(shape.dots)} fill={shape.fillColor || "transparent"} />

                <path d={generatePathData(shape.dots)} fill="transparent"
                  onPointerDown={(e) => {
                    if (activeTool === "fill") {
                      e.stopPropagation();
                      saveForUndo();
                      setWorkspaceShapes(prev => prev.map(s => s.id === shape.id ? { ...s, fillColor: activeColor } : s));
                    }
                  }}
                  style={{ pointerEvents: activeTool === "fill" ? 'auto' : 'none' }}
                />

                <path d={generatePathData(shape.dots)} fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4" />

                {globalShowDots && shape.dots.map(dot => (
                  <circle key={dot.id} cx={dot.x} cy={dot.y} r="3" fill="#3b82f6" onPointerDown={(e) => handlePointerDownOnDot(e, shape, dot)} />
                ))}

                {globalShowDots && <rect x={shape.dims.width - 10} y={shape.dims.height - 10} width="20" height="20" fill="#f97316" rx="4"
                  onPointerDown={(e) => { e.stopPropagation(); saveForUndo(); setResizingId(shape.id); setDragOffset({ x: (e as any).clientX, y: (e as any).clientY }); }} />}
              </g>
            ))}

            {/* strokes (single-line) - render visible stroke (pointerEvents none for normal editing) */}
            <g>
              {strokes.map(st => (
                <path key={st.id}
                  d={strokePointsToPath(st.points)}
                  stroke={st.color}
                  strokeWidth={st.width}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
              ))}

              {/* overlay, larger invisible stroke used as hit target when in fill/erase mode */}
              {strokes.map(st => (
                <path key={st.id + "-hit"}
                  d={strokePointsToPath(st.points)}
                  stroke="transparent"
                  strokeWidth={st.width + 14} // increase hit area
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  onPointerDown={(e) => handleStrokePointerDown(e, st)}
                  style={{ pointerEvents: (activeTool === "fill" || activeTool === "erase") ? 'auto' : 'none', cursor: (activeTool === "fill" || activeTool === "erase") ? 'pointer' : 'default' }}
                />
              ))}
            </g>

            {/* live penDots */}
            <g>
              {penDots.length > 0 && (
                <path d={strokePointsToPath(penDots.map(pd => ({ x: pd.x, y: pd.y })))}
                  stroke={activeColor} strokeWidth={defaultPenWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
              )}
              {penDots.map(pd => <circle key={pd.id} cx={pd.x} cy={pd.y} r={2} fill={activeColor} />)}
            </g>
          </svg>

          {contextMenu && (
            <div className="fixed bg-white border shadow-2xl rounded-lg py-2 z-[100] min-w-[150px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
              <button onClick={() => { const shape = workspaceShapes.find(s => s.id === contextMenu.id); if (shape) setWorkspaceShapes([...workspaceShapes.filter(s => s.id !== contextMenu.id), shape]); setContextMenu(null); }} className="w-full text-left px-5 py-3 text-[11px] font-bold uppercase hover:bg-slate-50 border-b">Bring To Front</button>
              <button onClick={() => { saveForUndo(); setWorkspaceShapes(prev => prev.filter(s => s.id !== contextMenu.id)); setContextMenu(null); }} className="w-full text-left px-5 py-3 text-[11px] font-bold uppercase text-red-500 hover:bg-red-50">Delete</button>
              <button onClick={() => setContextMenu(null)} className="w-full text-left px-5 py-3 text-[11px] font-bold uppercase">Cancel</button>
            </div>
          )}
        </main>

        <aside className="hidden md:flex w-28 border-l bg-white flex-col items-center py-6 gap-4 shrink-0">
          {(["cursor","pen","fill","erase"] as const).map(t => (
            <button key={t} onClick={() => setActiveTool(t)} className={`w-20 h-12 py-2 rounded-lg text-[10px] font-bold uppercase ${activeTool===t ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400'}`}>{t}</button>
          ))}
          <button onClick={() => setGlobalShowDots(!globalShowDots)} className={`w-20 h-12 py-2 rounded-lg text-[10px] font-bold uppercase ${globalShowDots ? 'bg-orange-100 text-orange-600' : 'bg-slate-50 text-slate-400'}`}>Dots</button>
        </aside>
      </div>

      <footer className="h-[130px] md:h-[90px] w-full bg-white border-t flex flex-col shrink-0">
        <div className="flex-1 flex items-center px-4 gap-3 overflow-x-auto border-b">
          {templates.map((url,i) => <img key={i} src={url} onClick={() => setSelectedImage(url)} className={`h-14 w-14 object-cover rounded-lg border-2 shrink-0 ${selectedImage===url ? 'border-blue-600' : 'border-slate-100'}`} />)}
        </div>
        <div className="h-[60px] md:hidden flex items-center justify-around px-2">
          {(["cursor","pen","fill","erase"] as const).map(t => (
            <button key={t} onClick={() => setActiveTool(t)} className={`flex-1 mx-1 py-2 rounded-lg text-[10px] font-bold uppercase ${activeTool===t ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400'}`}>{t}</button>
          ))}
          <button onClick={() => setGlobalShowDots(!globalShowDots)} className={`flex-1 mx-1 py-2 rounded-lg text-[10px] font-bold uppercase ${globalShowDots ? 'bg-orange-100 text-orange-600' : 'bg-slate-50 text-slate-400'}`}>Dots</button>
        </div>
      </footer>
    </div>
  );
}