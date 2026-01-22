'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import ImageTracer from 'imagetracerjs';

interface Dot { id: string; x: number; y: number; color: string; r: number; }
interface ExtractedShape { 
  id: string; 
  img: string; 
  dots: Dot[]; 
  pathData: string; 
  dims: { width: number; height: number };
  position: { x: number; y: number }; 
  scale: number; 
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
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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
  const bringToFront = (id: string | null) => {
    if (!id) return;
    setWorkspaceShapes(prev => {
      const item = prev.find(s => s.id === id);
      if (!item) return prev;
      const rest = prev.filter(s => s.id !== id);
      return [...rest, item]; // Puts selected item at the end of the array (top layer)
    });
  };

  const handleSourceClick = (e: React.MouseEvent) => {
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
  };

  const moveAllToWorkspace = () => {
    if (!selectedImage || !activePath) return;
    setWorkspaceShapes(prev => [...prev, {
      id: `s-${Date.now()}`,
      img: selectedImage,
      dots: sourceDots,
      pathData: activePath,
      dims: { ...imgDims },
      position: { x: 0, y: 0 },
      scale: 1
    }]);
    setSourceDots([]);
    setActivePath(null);
  };

  const handleWheel = (e: React.WheelEvent, id: string) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setWorkspaceShapes(prev => prev.map(s => 
      s.id === id ? { ...s, scale: Math.min(Math.max(s.scale * factor, 0.1), 5) } : s
    ));
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingId) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setWorkspaceShapes(prev => prev.map(s => 
      s.id === draggingId ? { ...s, position: { x: s.position.x + dx, y: s.position.y + dy } } : s
    ));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white overflow-hidden text-slate-800 font-sans select-none" onMouseMove={onMouseMove} onMouseUp={() => setDraggingId(null)}>
      
      <div className="h-[10%] flex items-center px-10 border-b border-slate-50 shrink-0">
        <label className="bg-[#FFD600] text-black px-10 py-4 rounded-xl text-[12px] font-black uppercase tracking-widest shadow-[0_6px_0_0_#b89b00] cursor-pointer active:translate-y-1">
          Upload
          <input type="file" className="hidden" onChange={(e) => {
             const f = e.target.files?.[0];
             if (f) setSelectedImage(URL.createObjectURL(f));
          }} />
        </label>
        <p className="ml-8 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
          Tip: Double-click an object to bring it to front
        </p>
      </div>

      <div className="h-[60%] flex items-center justify-center p-8 bg-[#FBFBFD]">
        <div className="flex flex-col gap-3 pr-6">
          <button onClick={moveAllToWorkspace} className="bg-orange-500 text-white px-4 py-2 rounded text-[10px] font-bold uppercase shadow-sm active:scale-95">Bulk Move</button>
          <button onClick={() => bringToFront(draggingId || workspaceShapes[workspaceShapes.length - 1]?.id)} className="bg-orange-500 text-white px-4 py-2 rounded text-[10px] font-bold uppercase shadow-sm active:scale-95">Bring Front</button>
          <button onClick={() => setWorkspaceShapes([])} className="bg-orange-500 text-white px-4 py-2 rounded text-[10px] font-bold uppercase shadow-sm active:scale-95">Clear Workspace</button>
        </div>

        <div className="flex flex-row gap-10 h-full">
          {/* SOURCE PANEL */}
          <div className="h-full aspect-square rounded-[2.5rem] bg-white shadow-xl border border-slate-100 relative overflow-hidden">
            <svg viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full p-10 cursor-crosshair overflow-visible">
              <image href={selectedImage || ''} width={imgDims.width} height={imgDims.height} />
              {svgContent && <g dangerouslySetInnerHTML={{ __html: svgContent }} onClick={handleSourceClick} className="opacity-0" style={{ fill: 'red', pointerEvents: 'auto' }} />}
              {sourceDots.map(dot => <circle key={dot.id} cx={dot.x} cy={dot.y} r={dot.r/2} fill={dot.color} />)}
            </svg>
          </div>

          {/* WORKSPACE PANEL */}
          <div className="h-full aspect-square rounded-[2.5rem] bg-white shadow-xl border border-slate-100 relative overflow-hidden">
             <svg viewBox="0 0 1000 1000" className="w-full h-full p-10">
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
                    onMouseDown={(e) => { 
                      setDraggingId(shape.id); 
                      setDragStart({ x: e.clientX, y: e.clientY }); 
                    }}
                    onDoubleClick={() => bringToFront(shape.id)}
                    onWheel={(e) => handleWheel(e, shape.id)}
                    className="cursor-grab active:cursor-grabbing"
                    style={{ 
                      transform: `translate(${shape.position.x}px, ${shape.position.y}px) scale(${shape.scale})`,
                      transformOrigin: '50% 50%' 
                    }}
                  >
                    <image href={shape.img} width={shape.dims.width} height={shape.dims.height} clipPath={`url(#clip-${shape.id})`} />
                    {shape.dots.map(dot => (
                      <circle key={dot.id} cx={dot.x} cy={dot.y} r={dot.r/2} fill="#2563eb" />
                    ))}
                  </g>
                ))}
             </svg>
          </div>
        </div>
      </div>

      <div className="h-[30%] flex items-center px-12 border-t border-slate-50 bg-white overflow-hidden">
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