'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import ImageTracer from 'imagetracerjs';

interface Dot { id: string; x: number; y: number; color: string; r: number; }
interface ExtractedShape { 
  id: string; img: string; dots: Dot[]; pathData: string; 
  dims: { width: number; height: number };
  position: { x: number; y: number }; scale: number; 
}

export default function DesignStudio() {
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [sourceDots, setSourceDots] = useState<Dot[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [workspaceShapes, setWorkspaceShapes] = useState<ExtractedShape[]>([]);
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [menu, setMenu] = useState<{ x: number, y: number, id: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/templates');
        const data = await res.json();
        if (data?.length > 0) { setTemplates(data); setSelectedImage(data[0]); }
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
      ImageTracer.imageToSVG(selectedImage, (svg) => {
        setSvgContent(svg.replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "").replace(/<rect[^>]*\/>/g, ""));
      }, { numberofcolors: 2, scale: 1 });
    };
    img.src = selectedImage;
  }, [selectedImage]);

  useEffect(() => { if (selectedImage) runTrace(); }, [selectedImage, runTrace]);

  // BRING TO FRONT LOGIC
  const bringToFront = (id: string) => {
    setWorkspaceShapes(prev => {
      const item = prev.find(s => s.id === id);
      if (!item) return prev;
      return [...prev.filter(s => s.id !== id), item];
    });
    setMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, id });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (draggingId) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setWorkspaceShapes(prev => prev.map(s => 
        s.id === draggingId ? { ...s, position: { x: s.position.x + dx, y: s.position.y + dy } } : s
      ));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
    if (resizingId) {
      const dx = e.clientX - dragStart.x;
      setWorkspaceShapes(prev => prev.map(s => 
        s.id === resizingId ? { ...s, scale: Math.max(0.1, s.scale + (dx / 300)) } : s
      ));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const moveAllToWorkspace = () => {
    if (!selectedImage || !activePath) return;
    setWorkspaceShapes(prev => [...prev, {
      id: `s-${Date.now()}`, img: selectedImage, dots: sourceDots, pathData: activePath,
      dims: { ...imgDims }, position: { x: 50, y: 50 }, scale: 0.4
    }]);
    setSourceDots([]); setActivePath(null);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white overflow-hidden text-slate-800 font-sans select-none" 
         onMouseMove={onMouseMove} 
         onMouseUp={() => { setDraggingId(null); setResizingId(null); }}
         onClick={() => setMenu(null)}>
      
      {/* HEADER */}
      <div className="h-[10%] flex items-center px-10 border-b border-slate-50 shrink-0">
        <label className="bg-[#FFD600] text-black px-10 py-4 rounded-xl text-[12px] font-black uppercase tracking-widest shadow-[0_6px_0_0_#b89b00] cursor-pointer">
          Upload Design
          <input type="file" className="hidden" onChange={(e) => {
             const f = e.target.files?.[0];
             if (f) setSelectedImage(URL.createObjectURL(f));
          }} />
        </label>
      </div>

      <div className="h-[60%] flex items-center justify-center p-8 bg-[#FBFBFD] relative">
        <div className="flex flex-col gap-3 pr-6 shrink-0">
          <button onClick={moveAllToWorkspace} className="bg-orange-500 text-white px-4 py-2 rounded text-[10px] font-bold uppercase shadow-sm">Bulk Move</button>
          <button onClick={() => setWorkspaceShapes([])} className="bg-orange-500 text-white px-4 py-2 rounded text-[10px] font-bold uppercase shadow-sm">Clear All</button>
        </div>

        <div className="flex flex-row gap-10 h-full">
          {/* SOURCE PANEL */}
          <div className="h-full aspect-square rounded-[2.5rem] bg-white shadow-xl border border-slate-100 relative overflow-hidden">
            <svg viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full p-10 cursor-crosshair overflow-visible">
              <image href={selectedImage || ''} width={imgDims.width} height={imgDims.height} />
              {svgContent && <g dangerouslySetInnerHTML={{ __html: svgContent }} onClick={(e) => {
                const target = e.target as SVGPathElement;
                if (target?.tagName.toLowerCase() === 'path') {
                  const d = target.getAttribute('d') || '';
                  setActivePath(d);
                  const len = target.getTotalLength();
                  const pts: Dot[] = [];
                  for (let i = 0; i <= len; i += 12) {
                    const p = target.getPointAtLength(i);
                    pts.push({ id: Math.random().toString(36), x: p.x, y: p.y, color: '#2563eb', r: 5 });
                  }
                  setSourceDots(pts);
                }
              }} className="opacity-0" style={{ fill: 'red', pointerEvents: 'auto' }} />}
              {sourceDots.map(dot => <circle key={dot.id} cx={dot.x} cy={dot.y} r={dot.r/2} fill={dot.color} />)}
            </svg>
          </div>

          {/* WORKSPACE PANEL */}
          <div className="h-full aspect-square rounded-[2.5rem] bg-white shadow-xl border border-slate-100 relative overflow-hidden">
             <svg viewBox="0 0 1000 1000" className="w-full h-full p-10 overflow-visible">
                <defs>
                  {workspaceShapes.map(shape => (
                    <clipPath key={`clip-${shape.id}`} id={`clip-${shape.id}`}>
                      <path d={shape.pathData} />
                    </clipPath>
                  ))}
                </defs>
                
                {workspaceShapes.map(shape => (
                  <g 
                    key={shape.id}
                    style={{ transform: `translate(${shape.position.x}px, ${shape.position.y}px) scale(${shape.scale})`, transformOrigin: '0 0' }}
                  >
                    {/* Object Body: Handles Move and Right Click */}
                    <g 
                      onMouseDown={(e) => { e.stopPropagation(); setDraggingId(shape.id); setDragStart({ x: e.clientX, y: e.clientY }); }}
                      onContextMenu={(e) => handleContextMenu(e, shape.id)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <image href={shape.img} width={shape.dims.width} height={shape.dims.height} clipPath={`url(#clip-${shape.id})`} />
                      {shape.dots.map(dot => (
                        <circle key={dot.id} cx={dot.x} cy={dot.y} r={dot.r/2} fill="#2563eb" />
                      ))}
                    </g>

                    {/* Resize Handle: Orange square in bottom-right */}
                    <rect 
                      x={shape.dims.width - 20} y={shape.dims.height - 20} width="60" height="60" 
                      fill="#f97316" className="cursor-nwse-resize opacity-80 hover:opacity-100"
                      onMouseDown={(e) => { e.stopPropagation(); setResizingId(shape.id); setDragStart({ x: e.clientX, y: e.clientY }); }}
                    />
                  </g>
                ))}
             </svg>
          </div>
        </div>

        {/* CUSTOM CONTEXT MENU */}
        {menu && (
          <div 
            className="fixed z-[100] bg-white border border-slate-200 shadow-2xl rounded-lg overflow-hidden py-1 min-w-[140px]"
            style={{ left: menu.x, top: menu.y }}
          >
            <button 
              onClick={() => bringToFront(menu.id)}
              className="w-full px-4 py-3 text-[10px] font-bold uppercase text-orange-600 hover:bg-orange-50 transition-colors text-left border-b border-slate-50 last:border-0"
            >
              Bring to Front
            </button>
            <button 
              onClick={() => {
                setWorkspaceShapes(prev => prev.filter(s => s.id !== menu.id));
                setMenu(null);
              }}
              className="w-full px-4 py-3 text-[10px] font-bold uppercase text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors text-left"
            >
              Delete Object
            </button>
          </div>
        )}
      </div>

      {/* GALLERY */}
      <div className="h-[30%] flex items-center px-12 border-t border-slate-50 bg-white">
        <div className="flex gap-8 overflow-x-auto pb-4 no-scrollbar">
          {templates.map((url, i) => (
            <button key={i} onClick={() => setSelectedImage(url)} className={`flex-shrink-0 w-[80px] h-[80px] rounded-2xl border-2 transition-all ${selectedImage === url ? 'scale-110 border-[#FFD600] shadow-lg' : 'opacity-30 border-transparent hover:opacity-100'}`}>
              <img src={url} className="w-full h-full object-cover" alt="thumb" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}