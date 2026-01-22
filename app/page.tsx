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

interface DrawingPath {
  id: string;
  points: string;
  color: string;
  width: number;
}

export default function DesignStudio() {
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [sourceDots, setSourceDots] = useState<Dot[]>([]);
  const [workspaceShapes, setWorkspaceShapes] = useState<DistortableShape[]>([]);
  const [drawingPaths, setDrawingPaths] = useState<DrawingPath[]>([]);
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  
  const [activeTool, setActiveTool] = useState('cursor');
  const [activeColor, setActiveColor] = useState('#f97316');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState("");

  const [draggingDot, setDraggingDot] = useState<{ shapeId: string, dotId: string } | null>(null);
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [menu, setMenu] = useState<{ x: number, y: number, id: string } | null>(null);

  const workspaceRef = useRef<SVGSVGElement>(null);

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

  const handleSourceClick = (e: React.MouseEvent) => {
    const target = e.target as SVGPathElement;
    if (target?.tagName.toLowerCase() === 'path') {
      const len = target.getTotalLength();
      const pts: Dot[] = [];
      for (let i = 0; i <= len; i += 12) {
        const p = target.getPointAtLength(i);
        pts.push({ id: Math.random().toString(36).substring(7), x: p.x, y: p.y });
      }
      setSourceDots(pts);
    }
  };

  const toggleAllDots = () => {
    const anyVisible = workspaceShapes.some(s => s.showDots);
    setWorkspaceShapes(prev => prev.map(s => ({ ...s, showDots: !anyVisible })));
  };

  const generatePathData = (dots: Dot[]) => {
    if (dots.length === 0) return "";
    return `M ${dots[0].x} ${dots[0].y} ` + dots.slice(1).map(d => `L ${d.x} ${d.y}`).join(' ') + " Z";
  };

  const moveAllToWorkspace = () => {
    if (!selectedImage || sourceDots.length === 0) return;
    setWorkspaceShapes(prev => [...prev, {
      id: `shape-${Date.now()}`,
      img: selectedImage,
      dots: [...sourceDots],
      dims: { ...imgDims },
      position: { x: 50, y: 50 },
      scale: 0.5,
      showDots: true
    }]);
    setSourceDots([]);
    setActiveTool('cursor');
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!workspaceRef.current) return;
    const rect = workspaceRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'pen') {
      setIsDrawing(true);
      setCurrentPath(`M ${x} ${y}`);
    } else if (activeTool === 'erase') {
      setIsDrawing(true); 
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!workspaceRef.current) return;
    const rect = workspaceRef.current.getBoundingClientRect();
    const mX = e.clientX - rect.left;
    const mY = e.clientY - rect.top;

    if (isDrawing && activeTool === 'erase') {
       setDrawingPaths(prev => prev.filter(p => !p.points.includes(`${Math.round(mX)}`)));
       setWorkspaceShapes(prev => prev.filter(s => {
          const bx = s.position.x, by = s.position.y;
          const bw = s.dims.width * s.scale, bh = s.dims.height * s.scale;
          return !(mX > bx && mX < bx + bw && mY > by && mY < by + bh);
       }));
       return;
    }

    if (isDrawing && activeTool === 'pen') {
      setCurrentPath(prev => `${prev} L ${mX} ${mY}`);
      return;
    }

    if (resizingId) {
      const dx = e.clientX - dragOffset.x;
      setWorkspaceShapes(prev => prev.map(s => s.id === resizingId ? { ...s, scale: Math.max(0.05, s.scale + (dx / 200)) } : s));
      setDragOffset({ x: e.clientX, y: e.clientY });
    } else if (draggingDot) {
      setWorkspaceShapes(prev => prev.map(s => s.id !== draggingDot.shapeId ? s : {
        ...s, dots: s.dots.map(d => d.id === draggingDot.dotId ? { ...d, x: (mX - s.position.x) / s.scale, y: (mY - s.position.y) / s.scale } : d)
      }));
    } else if (draggingShapeId) {
      setWorkspaceShapes(prev => prev.map(s => s.id === draggingShapeId ? { ...s, position: { x: mX - dragOffset.x, y: mY - dragOffset.y } } : s));
    }
  };

  const onMouseUp = () => {
    if (isDrawing && currentPath && activeTool === 'pen') {
      setDrawingPaths(prev => [...prev, { id: `p-${Date.now()}`, points: currentPath, color: activeColor, width: 5 }]);
    }
    setIsDrawing(false); 
    setCurrentPath(""); 
    setDraggingDot(null); 
    setDraggingShapeId(null); 
    setResizingId(null);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white overflow-hidden text-slate-800 font-sans select-none"
          onMouseMove={onMouseMove} onMouseUp={onMouseUp} onClick={() => setMenu(null)}>
      
      <div className="w-full bg-orange-500 text-white text-[10px] font-black uppercase py-2 text-center tracking-[0.2em] z-50">
        🚧 Site Under Construction 🚧
      </div>

      <header className="h-[8%] flex items-center justify-between px-10 border-b bg-white shrink-0 z-40">
        <div className="flex items-center gap-4">
           <h1 className="text-xs font-black uppercase tracking-tighter">Design Studio</h1>
           <label className="bg-slate-900 text-white px-4 py-2 rounded text-[9px] font-bold uppercase cursor-pointer hover:bg-orange-500 transition-colors">
            Upload Image
            <input type="file" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setSelectedImage(URL.createObjectURL(f));
            }} />
          </label>
        </div>
        <input type="color" value={activeColor} onChange={(e) => setActiveColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-none" />
      </header>

      <div className="flex-1 flex overflow-hidden">
        
        {/* SOURCE PANEL WITH BULK MOVE */}
        <div className="w-[30%] border-r flex flex-col p-6 bg-slate-50">
          <span className="text-[9px] font-bold text-slate-400 uppercase mb-4">Source Image</span>
          <div className="flex-1 bg-white rounded-2xl shadow-inner border border-slate-100 relative overflow-hidden">
            <svg viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full p-4 overflow-visible cursor-crosshair">
              {selectedImage && <image href={selectedImage} width={imgDims.width} height={imgDims.height} />}
              {svgContent && <g dangerouslySetInnerHTML={{ __html: svgContent }} onClick={handleSourceClick} className="opacity-0" style={{ pointerEvents: 'auto' }} />}
              {sourceDots.map(dot => <circle key={dot.id} cx={dot.x} cy={dot.y} r="2.5" fill="#3b82f6" />)}
            </svg>
          </div>
          {/* MOVE BUTTON PLACED HERE */}
          <button 
            onClick={moveAllToWorkspace} 
            disabled={sourceDots.length === 0}
            className="mt-4 w-full bg-orange-500 text-white py-4 rounded-xl font-bold text-xs uppercase shadow-lg hover:bg-orange-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale"
          >
            <span>➜</span> MOVE TO WORKSPACE
          </button>
        </div>

        {/* WORKSPACE */}
        <main className="flex-1 bg-slate-100 relative overflow-hidden">
          <svg 
            ref={workspaceRef} 
            className={`w-full h-full bg-white shadow-inner ${activeTool === 'pen' ? 'cursor-crosshair' : 'cursor-default'}`} 
            onMouseDown={onMouseDown}
          >
            {workspaceShapes.map(shape => (
              <g key={shape.id} style={{ transform: `translate(${shape.position.x}px, ${shape.position.y}px) scale(${shape.scale})`, transformOrigin: '0 0' }}>
                <defs><clipPath id={`clip-${shape.id}`}><path d={generatePathData(shape.dots)} /></clipPath></defs>
                <path d={generatePathData(shape.dots)} fill={shape.fillColor || "transparent"} />
                <image 
                  href={shape.img} width={shape.dims.width} height={shape.dims.height} clipPath={`url(#clip-${shape.id})`}
                  className={activeTool === 'cursor' ? "cursor-grab active:cursor-grabbing" : "pointer-events-auto"}
                  onMouseDown={(e) => {
                    if (activeTool === 'fill') {
                      e.stopPropagation();
                      setWorkspaceShapes(prev => prev.map(s => s.id === shape.id ? { ...s, fillColor: activeColor } : s));
                    } else if (activeTool === 'cursor') {
                      e.stopPropagation();
                      const rect = workspaceRef.current?.getBoundingClientRect();
                      if (rect) {
                        setDraggingShapeId(shape.id);
                        setDragOffset({ x: (e.clientX - rect.left) - shape.position.x, y: (e.clientY - rect.top) - shape.position.y });
                      }
                    }
                  }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, id: shape.id }); }}
                />
                {shape.showDots && (
                  <>
                    <path d={generatePathData(shape.dots)} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4" pointerEvents="none" />
                    {shape.dots.map(dot => (
                      <circle key={dot.id} cx={dot.x} cy={dot.y} r="3.5" fill="#3b82f6" className="cursor-move hover:fill-orange-500"
                        onMouseDown={(e) => { e.stopPropagation(); setDraggingDot({ shapeId: shape.id, dotId: dot.id }); }} />
                    ))}
                    <rect x={shape.dims.width - 10} y={shape.dims.height - 10} width="20" height="20" fill="#f97316" rx="4" className="cursor-nwse-resize"
                      onMouseDown={(e) => { e.stopPropagation(); setResizingId(shape.id); setDragOffset({ x: e.clientX, y: e.clientY }); }} />
                  </>
                )}
              </g>
            ))}

            {drawingPaths.map(p => <path key={p.id} d={p.points} fill="none" stroke={p.color} strokeWidth={p.width} strokeLinecap="round" strokeLinejoin="round" />)}
            {isDrawing && activeTool === 'pen' && <path d={currentPath} fill="none" stroke={activeColor} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        </main>

        {/* RIGHT SIDEBAR */}
        <aside className="w-24 bg-white border-l flex flex-col items-center py-8 gap-6 shrink-0 z-30">
          {['cursor', 'pen', 'fill', 'erase'].map(t => (
            <button key={t} onClick={() => setActiveTool(t)} 
              className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all ${activeTool === t ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
              <span className="text-xl">
                {t === 'cursor' ? '➚' : t === 'pen' ? '🖊️' : t === 'fill' ? '🫗' : '🧼'}
              </span>
              <span className="text-[7px] font-black uppercase mt-1">{t}</span>
            </button>
          ))}

          <div className="mt-auto flex flex-col gap-4 mb-4">
             <button onClick={toggleAllDots} className="text-[8px] font-bold text-slate-400 uppercase hover:text-orange-500 text-center">Toggle Dots</button>
             <button onClick={() => { setWorkspaceShapes([]); setDrawingPaths([]); }} className="text-[8px] font-bold text-red-400 uppercase hover:text-red-600 text-center">Clear All</button>
          </div>
        </aside>
      </div>

      <footer className="h-[12%] w-full bg-white border-t flex items-center px-10 gap-4 overflow-x-auto no-scrollbar shrink-0">
        {templates.map((url, i) => (
          <button key={i} onClick={() => setSelectedImage(url)} 
            className={`flex-shrink-0 w-16 h-16 rounded-xl border-2 transition-all overflow-hidden ${selectedImage === url ? 'border-orange-500 scale-105' : 'border-slate-100 hover:border-slate-200'}`}>
            <img src={url} className="w-full h-full object-cover" alt="thumb" />
          </button>
        ))}
      </footer>

      {menu && (
        <div className="fixed z-[100] bg-white shadow-2xl rounded-lg py-1 border text-[9px] font-bold uppercase min-w-[140px]" style={{ left: menu.x, top: menu.y }}>
          <button onClick={() => {
            const item = workspaceShapes.find(s => s.id === menu.id);
            if (item) setWorkspaceShapes([...workspaceShapes.filter(s => s.id !== menu.id), item]);
            setMenu(null);
          }} className="w-full px-4 py-3 text-slate-700 hover:bg-slate-50 text-left">Bring Front</button>
          <button onClick={() => {
            setWorkspaceShapes(prev => prev.map(s => s.id === menu.id ? { ...s, showDots: !s.showDots } : s));
            setMenu(null);
          }} className="w-full px-4 py-3 text-blue-600 hover:bg-slate-50 text-left border-t border-slate-50">Toggle Handles</button>
        </div>
      )}
    </div>
  );
}