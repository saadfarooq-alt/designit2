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
  erasedPaths: string[];
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

  // Layout & Tutorial State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [ghostCursor, setGhostCursor] = useState({ x: 0, y: 0, active: false, clicking: false });

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string; type: "shape" | "stroke" } | null>(null);

  // Interaction State
  const [draggingDot, setDraggingDot] = useState<{ shapeId: string; dotId: string } | null>(null);
  const [draggingStrokeDot, setDraggingStrokeDot] = useState<{ strokeId: string; dotId: string } | null>(null);
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const workspaceRef = useRef<SVGSVGElement | null>(null);
  
  const isPointerDownRef = useRef(false);
  const penRef = useRef<{ pointerId: number; lastX: number; lastY: number; strokeId: string } | null>(null);

  const PEN_SPACING = 12; 
  const ERASE_RADIUS = 15; 

  useEffect(() => { setMounted(true); }, []);

  const saveForUndo = useCallback(() => {
    setHistory(h => [...h, { shapes: JSON.parse(JSON.stringify(workspaceShapes)), strokes: JSON.parse(JSON.stringify(strokes)) }].slice(-50));
  }, [workspaceShapes, strokes]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const next = [...history];
    const last = next.pop()!;
    setWorkspaceShapes(last.shapes);
    setStrokes(last.strokes);
    setHistory(next);
  }, [history]);

  // --- ORDERING LOGIC ---
  const bringToFront = (id: string, type: "shape" | "stroke") => {
    saveForUndo();
    if (type === "shape") {
      setWorkspaceShapes((prev) => {
        const item = prev.find((s) => s.id === id);
        if (!item) return prev;
        return [...prev.filter((s) => s.id !== id), item];
      });
    } else {
      setStrokes((prev) => {
        const item = prev.find((s) => s.id === id);
        if (!item) return prev;
        return [...prev.filter((s) => s.id !== id), item];
      });
    }
    setContextMenu(null);
  };

  const sendToBack = (id: string, type: "shape" | "stroke") => {
    saveForUndo();
    if (type === "shape") {
      setWorkspaceShapes((prev) => {
        const item = prev.find((s) => s.id === id);
        if (!item) return prev;
        return [item, ...prev.filter((s) => s.id !== id)];
      });
    } else {
      setStrokes((prev) => {
        const item = prev.find((s) => s.id === id);
        if (!item) return prev;
        return [item, ...prev.filter((s) => s.id !== id)];
      });
    }
    setContextMenu(null);
  };

  const tutorialSteps = [
  { text: "Select a template...", target: "template-0" },
  { text: "Open Tracing...", target: "trace-btn" },
  { text: "Choose paths...", target: "trace-svg-container", action: "choose" },
  { text: "Sample points...", target: "sample-btn" },
  { text: "Add to workspace!", target: "add-btn" },
  /* NEW STEP */
  { text: "Drag a dot to reshape!", target: "workspace-dot-0", action: "drag_dot" }, 
  { text: "Select Pen Tool", target: "pen-tool" },
  { text: "Draw something!", target: "workspace-svg", action: "draw" },
  { text: "Change color", target: "color-picker" },
  { text: "Select Fill Tool", target: "fill-tool" },
  { text: "Fill the shape", target: "workspace-svg", action: "fill_shape" },
  { text: "Select Erase Tool", target: "erase-tool" },
  { text: "Erase part of it", target: "workspace-svg", action: "erase_action" },
  { text: "Hide the dots", target: "dots-btn" },
  { text: "Lock movement", target: "lock-btn" },
  { text: "Right-click for Menu", target: "workspace-svg", action: "context_menu" },
  { text: "Reset Canvas", target: "reset-btn" },
  { text: "Lastly, Undo everything!", target: "undo-btn" }
];

 const runTutorial = async () => {
  setGhostCursor({ x: window.innerWidth / 2, y: window.innerHeight / 2, active: true, clicking: false });
  
  for (let i = 0; i < tutorialSteps.length; i++) {
    const step = tutorialSteps[i];
    setTutorialStep(i);
    const el = document.getElementById(step.target);
    if (!el) continue;

    const rect = el.getBoundingClientRect();
    let startX = rect.left + rect.width / 2;
    let startY = rect.top + rect.height / 2;

    // 1. Move to Target
    setGhostCursor({ x: startX, y: startY, active: true, clicking: false });
    await new Promise(r => setTimeout(r, 800));
    setGhostCursor(prev => ({ ...prev, clicking: true }));

    // 2. Action Logic
    if (step.action === "drag_dot") {
      saveForUndo(); // Save state before moving
      const dragAmount = 60;
      for (let j = 0; j <= 6; j++) {
        await new Promise(r => setTimeout(r, 60));
        const offset = (j / 6) * dragAmount;
        setGhostCursor({ x: startX + offset, y: startY + offset, active: true, clicking: true });

        setWorkspaceShapes(prev => {
          if (prev.length === 0) return prev;
          const newShapes = [...prev];
          const shape = newShapes[newShapes.length - 1]; 
          if (shape.dots.length > 0) {
            // Update the specific dot targeted by the tutorial
            shape.dots[0].x += (dragAmount / 6) / shape.scale;
            shape.dots[0].y += (dragAmount / 6) / shape.scale;
          }
          return newShapes;
        });
      }
    } 
    else if (step.action === "draw") {
      saveForUndo();
      const sid = `tuto-stroke`;
      setStrokes(prev => [...prev, { id: sid, points: [{ id: 'p1', x: 200, y: 200 }], color: activeColor, width: 6 }]);
      for(let j=0; j<10; j++) {
        await new Promise(r => setTimeout(r, 50));
        const newX = 200 + (j * 15);
        const newY = 200 + (Math.sin(j) * 20);
        // Move ghost cursor relative to the workspace SVG rect
        setGhostCursor({ x: rect.left + newX, y: rect.top + newY, active: true, clicking: true });
        setStrokes(p => p.map(s => s.id === sid ? { ...s, points: [...s.points, { id: `pt-${j}`, x: newX, y: newY }] } : s));
      }
    } 
    else if (step.action === "fill_shape") {
      saveForUndo();
      // Fill the tutorial stroke we just drew
      setStrokes(prev => prev.map(s => s.id === "tuto-stroke" ? { ...s, fillColor: activeColor } : s));
    }
    else if (step.action === "erase_action") {
      saveForUndo();
      for(let j=0; j<8; j++) {
        const ex = 220 + (j * 12);
        sweepErase(ex, 210);
        setGhostCursor({ x: rect.left + ex, y: rect.top + 210, active: true, clicking: true });
        await new Promise(r => setTimeout(r, 80));
      }
    }
    else if (step.action === "context_menu") {
      el.dispatchEvent(new MouseEvent('contextmenu', { 
        bubbles: true, clientX: startX, clientY: startY 
      }));
      await new Promise(r => setTimeout(r, 1000)); // Pause to see the menu
    }
    else {
      // Standard button clicks (Undo, Reset, Sample, etc.)
      if (step.action === "choose") {
        const targetPath = document.elementFromPoint(startX, startY);
        if (targetPath?.tagName === 'path') targetPath.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      } else {
        el.click();
      }
    }

    // 3. Wrap up step
    await new Promise(r => setTimeout(r, 700));
    setGhostCursor(prev => ({ ...prev, clicking: false }));
    await new Promise(r => setTimeout(r, 400));
  }
  
  setTutorialStep(null);
  setGhostCursor(p => ({ ...p, active: false }));
};

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/templates");
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) { setTemplates(data); setSelectedImage(data[0]); }
      } catch (e) { setTemplates(["/template1.png"]); setSelectedImage("/template1.png"); }
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
    Array.from(tmp.querySelectorAll("path")).forEach((p, pathIdx) => {
      const d = p.getAttribute("d") || "";
      const subs = d.match(/([Mm][^Mm]*)/g) || [];
      subs.forEach((sd, subIdx) => {
        results.push({ id: `path-${pathIdx}-${subIdx}`, d: sd, area: 0, selected: false });
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setSelectedImage(url);
      };
      reader.readAsDataURL(file);
    }
  };

  const sweepErase = (x: number, y: number) => {
    setStrokes(prev => prev.map(st => ({ 
      ...st, 
      points: st.points.filter(p => Math.hypot(p.x - x, p.y - y) > ERASE_RADIUS) 
    })).filter(st => st.points.length > 0));

    setWorkspaceShapes(prev => prev.map(s => {
      const localX = (x - s.position.x) / s.scale;
      const localY = (y - s.position.y) / s.scale;
      if (localX > -50 && localX < s.dims.width + 50 && localY > -50 && localY < s.dims.height + 50) {
        const r = ERASE_RADIUS / Math.max(0.001, s.scale);
        const hole = `M ${localX - r} ${localY} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 -${r * 2} 0`;
        return { 
          ...s, 
          erasedPaths: [...(s.erasedPaths || []), hole],
          dots: s.dots.filter(d => Math.hypot(s.position.x + d.x * s.scale - x, s.position.y + d.y * s.scale - y) > ERASE_RADIUS)
        };
      }
      return s;
    }));
  };

  const generatePathData = (pts: { x: number; y: number }[], close = true) => {
    if (!pts || pts.length === 0) return "";
    const d = `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map(p => ` L ${p.x} ${p.y}`).join("");
    return close ? d + " Z" : d;
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#F9F9FB] text-slate-900 overflow-hidden select-none touch-none" onClick={() => setContextMenu(null)}>
      
      <header className="h-16 flex items-center justify-between px-2 lg:px-8 bg-white border-b border-slate-200 shrink-0 z-[100]">
        <div className="flex items-center gap-2">
          <button id="trace-btn" onClick={() => setIsSidebarOpen(true)} className="lg:hidden bg-yellow-400 text-black px-3 py-2 rounded-xl text-[9px] font-black uppercase shadow-sm">Trace</button>
          <div onClick={onBack} className="flex flex-col cursor-pointer active:scale-95 px-2">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em]">DesignIt <span className="text-yellow-500">.</span></span>
            <span className="hidden xs:block text-[7px] font-medium uppercase text-slate-400">Home</span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button id="undo-btn" onClick={undo} className="px-2 sm:px-4 py-2 bg-pink-50 text-pink-600 rounded-full text-[8px] sm:text-[9px] font-black uppercase border border-pink-100">Undo</button>
          <button id="reset-btn" onClick={() => { if(confirm("Reset?")) { saveForUndo(); setWorkspaceShapes([]); setStrokes([]); } }} className="px-2 sm:px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[8px] sm:text-[9px] font-black uppercase border border-emerald-100">Reset</button>
          <button id="dots-btn" onClick={() => setGlobalShowDots(!globalShowDots)} className={`px-2 sm:px-4 py-2 rounded-full text-[8px] sm:text-[9px] font-black uppercase border transition-all ${globalShowDots ? 'bg-yellow-50 text-yellow-700' : 'bg-white text-slate-400'}`}>Dots</button>
          <button id="lock-btn"onClick={() => setIsLocked(!isLocked)} className={`px-2 sm:px-4 py-2 rounded-full text-[8px] sm:text-[9px] font-black uppercase border transition-all ${isLocked ? 'bg-sky-500 text-white' : 'bg-white text-sky-500'}`}>Lock</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <aside className={`fixed lg:static inset-0 lg:w-[320px] bg-white lg:border-r border-slate-200 flex flex-col z-[200] lg:z-0 transition-transform ${isSidebarOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}`}>
          <div className="p-6 shrink-0 bg-white">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-black uppercase text-slate-400">Source</h3>
              <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-400 text-xs">CLOSE ✕</button>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mb-3">
               <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-sky-50 text-sky-700 py-4 rounded-xl text-[9px] font-black uppercase border border-sky-100"
               >
                  Upload
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
               </button>

               <button id="sample-btn" onClick={() => {
                  const ns = "http://www.w3.org/2000/svg"; let pts: Dot[] = [];
                  candidates.filter(c => c.selected).forEach(c => {
                    const path = document.createElementNS(ns, "path"); path.setAttribute("d", c.d); document.body.appendChild(path);
                    const len = path.getTotalLength();
                    for (let i = 0; i <= len; i += Math.max(3, Math.round(len / 40))) { const p = path.getPointAtLength(i); pts.push({ id: `p-${Math.random()}`, x: p.x, y: p.y }); }
                    document.body.removeChild(path);
                  }); setSourceDots(pts);
               }} className="bg-yellow-50 text-yellow-700 py-4 rounded-xl text-[9px] font-black uppercase border">Sample</button>

               <button id="add-btn" onClick={() => {
                  saveForUndo(); const fs = imgDims.width ? 150 / imgDims.width : 1;
                  setWorkspaceShapes(prev => [...prev, { id: `s-${Date.now()}`, img: selectedImage!, dots: [...sourceDots], dims: { ...imgDims }, position: { x: 100, y: 100 }, scale: fs, showDots: true, erasedPaths: [] }]);
                  setSourceDots([]); setIsSidebarOpen(false);
               }} disabled={sourceDots.length === 0} className="bg-slate-900 text-yellow-400 py-4 rounded-xl text-[9px] font-black uppercase disabled:opacity-20">Add</button>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-hidden">
            <div className="h-full bg-slate-100 rounded-3xl overflow-hidden flex items-center justify-center relative">
              <svg id="trace-svg-container" viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full p-4">
                {selectedImage && <image href={selectedImage} width={imgDims.width} height={imgDims.height} />}
                {candidates.map((c, idx) => (
                  <path 
                    key={c.id} 
                    id={idx === 0 ? "path-0-0" : c.id} // Ensure first path has the tutorial ID
                    d={c.d} 
                    fill={c.selected ? "rgba(250, 204, 21, 0.4)" : "transparent"} 
                    stroke={c.selected ? "#eab308" : "#cbd5e1"} 
                    strokeWidth={4} 
                    className="cursor-pointer" 
                    onClick={() => setCandidates(prev => prev.map(x => x.id === c.id ? {...x, selected: !x.selected} : x))} 
                  />
                ))}
              </svg>
            </div>
          </div>
        </aside>

        <main className="flex-1 bg-[#F9F9FB] relative overflow-hidden">
          {ghostCursor.active && (
            <div className="fixed pointer-events-none z-[1000] transition-all duration-700 ease-in-out flex flex-col items-center" style={{ left: ghostCursor.x, top: ghostCursor.y, transform: 'translate(-50%, -50%)' }}>
              <div className={`w-8 h-8 rounded-full border-4 border-yellow-400 bg-yellow-400/30 transition-transform ${ghostCursor.clicking ? 'scale-75' : 'scale-100'}`} />
              {tutorialStep !== null && <div className="mt-2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1 rounded-lg shadow-xl">{tutorialSteps[tutorialStep].text}</div>}
            </div>
          )}

          {contextMenu && (
            <div 
              className="fixed z-[300] bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden py-1 min-w-[140px]" 
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => bringToFront(contextMenu.id, contextMenu.type)} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-[9px] font-black uppercase border-b border-slate-100">Bring to Front</button>
              <button onClick={() => sendToBack(contextMenu.id, contextMenu.type)} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-[9px] font-black uppercase border-b border-slate-100">Send to Back</button>
              <button onClick={() => { saveForUndo(); if (contextMenu.type === "shape") setWorkspaceShapes(prev => prev.filter(s => s.id !== contextMenu.id)); else setStrokes(prev => prev.filter(s => s.id !== contextMenu.id)); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-red-500 hover:bg-red-50 text-[9px] font-black uppercase">Delete Item</button>
            </div>
          )}

          <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 p-2 bg-white/80 rounded-[2rem] shadow-xl z-50">
             {(["cursor", "pen", "fill", "erase"] as const).map((t) => (
                <button key={t} id={`${t}-tool`} onClick={() => setActiveTool(t)} className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${activeTool === t ? 'bg-yellow-400 text-black' : 'text-slate-400'}`}>
                  <span className="text-[10px] font-black uppercase">{t.charAt(0)}</span>
                </button>
             ))}
             <input id="color-picker"type="color" value={activeColor} onChange={e => setActiveColor(e.target.value)} className="w-8 h-8 rounded-lg mt-2" />
          </div>

          <div className="w-full h-full p-4 lg:p-20" 
            onPointerDown={(e) => { 
              isPointerDownRef.current = true; 
              const c = getCoords(e); 
              if (activeTool === "erase") { saveForUndo(); sweepErase(c.x, c.y); } 
              if (activeTool === "pen") { 
                saveForUndo(); 
                const sid = `st-${Date.now()}`; 
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
              <svg id="workspace-svg" ref={workspaceRef} className="w-full h-full bg-white shadow-2xl rounded-[3rem]">
                {strokes.map(s => (
                  <g key={s.id} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, id: s.id, type: "stroke" }); }}>
                    <path d={generatePathData(s.points)} stroke={s.color} strokeWidth={s.width} fill={s.fillColor || "transparent"} strokeLinecap="round" strokeLinejoin="round" onPointerDown={(e) => { if (activeTool === "fill") { e.stopPropagation(); saveForUndo(); setStrokes(prev => prev.map(st => st.id === s.id ? { ...st, fillColor: activeColor } : st)); } }} />
                    {globalShowDots && s.points.map((p) => <circle key={p.id} cx={p.x} cy={p.y} r={8} fill={s.color} onPointerDown={(e) => { if (activeTool === "cursor") { e.stopPropagation(); setDraggingStrokeDot({ strokeId: s.id, dotId: p.id }); } }} /> )}
                  </g>
                ))}
                {workspaceShapes.map((shape, shapeIdx) => (
                  <g key={shape.id} transform={`translate(${shape.position.x} ${shape.position.y}) scale(${shape.scale})`} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, id: shape.id, type: "shape" }); }}>
                    <defs>
                      <clipPath id={`cl-${shape.id}`}><path d={generatePathData(shape.dots, true)} /></clipPath>
                      <mask id={`ms-${shape.id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={shape.dims.width} height={shape.dims.height}>
                        <rect x={0} y={0} width={shape.dims.width} height={shape.dims.height} fill="white" />
                        {shape.erasedPaths && shape.erasedPaths.map((p, i) => <path key={`er-${i}`} d={p} fill="black" />)}
                      </mask>
                    </defs>
                    <image
                      href={shape.img}
                      width={shape.dims.width}
                      height={shape.dims.height}
                      clipPath={`url(#cl-${shape.id})`}
                      mask={shape.erasedPaths && shape.erasedPaths.length > 0 ? `url(#ms-${shape.id})` : undefined}
                      onPointerDown={(e) => {
                        if (activeTool === "fill") { e.stopPropagation(); saveForUndo(); setWorkspaceShapes(prev => prev.map(s => s.id === shape.id ? {...s, fillColor: activeColor} : s)); return; }
                        if (activeTool === "cursor" && !isLocked) { e.stopPropagation(); const c = getCoords(e); setDraggingShapeId(shape.id); setDragOffset({ x: c.x - shape.position.x, y: c.y - shape.position.y }); }
                      }}
                    />
                    <path d={generatePathData(shape.dots, true)} fill={shape.fillColor || "transparent"} pointerEvents="none" />
                    {globalShowDots && <path d={generatePathData(shape.dots, true)} fill="transparent" stroke="#3b82f6" strokeWidth={2 / shape.scale} strokeDasharray="4,4" opacity={0.5} pointerEvents="none" />}
                    {globalShowDots && shape.dots.map((dot, dotIdx) => (
                      <circle key={dot.id} id={shapeIdx === 0 && dotIdx === 0 ? "workspace-dot-0" : undefined} cx={dot.x} cy={dot.y} r={14 / shape.scale} fill="#3b82f6" onPointerDown={(e) => { e.stopPropagation(); setDraggingDot({ shapeId: shape.id, dotId: dot.id }); }} />
                    ))}
                    {globalShowDots && <rect x={shape.dims.width - 20} y={shape.dims.height - 20} width={45/shape.scale} height={45/shape.scale} fill="#f97316" rx={4} onPointerDown={(e) => { e.stopPropagation(); const c = getCoords(e); setResizingId(shape.id); setDragOffset({ x: c.rx, y: c.ry }); }} />}
                  </g>
                ))}
              </svg>
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] lg:w-auto flex items-center gap-3 p-3 bg-white/40 backdrop-blur-xl rounded-[2rem] shadow-xl overflow-x-auto">
            {templates.map((u, i) => <img key={i} id={`template-${i}`} src={u} onClick={() => setSelectedImage(u)} className={`h-12 w-12 rounded-xl object-cover cursor-pointer border-2 transition-all ${selectedImage === u ? 'border-slate-900 scale-105' : 'border-transparent opacity-50'}`} /> )}
          </div>
          <button onClick={runTutorial} className="fixed bottom-6 right-6 w-12 h-12 bg-slate-900 text-yellow-400 rounded-full font-black shadow-2xl border-2 border-yellow-400">?</button>
        </main>
      </div>
    </div>
  );
}