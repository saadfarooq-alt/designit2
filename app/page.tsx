'use client';

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
  showDots: boolean; // Added to control visibility without losing data
}

export default function DesignStudio() {
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [sourceDots, setSourceDots] = useState<Dot[]>([]);
  const [workspaceShapes, setWorkspaceShapes] = useState<DistortableShape[]>([]);
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  
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

  const generatePathData = (dots: Dot[]) => {
    if (dots.length === 0) return "";
    return `M ${dots[0].x} ${dots[0].y} ` + dots.slice(1).map(d => `L ${d.x} ${d.y}`).join(' ') + " Z";
  };

  // Toggles visibility instead of deleting data
  const toggleDotsForShape = (id: string) => {
    setWorkspaceShapes(prev => prev.map(s => s.id === id ? { ...s, showDots: !s.showDots } : s));
    setMenu(null);
  };

  const hideAllDots = () => {
    setWorkspaceShapes(prev => prev.map(s => ({ ...s, showDots: false })));
  };

  const handleSourceClick = (e: React.MouseEvent) => {
    const target = e.target as SVGPathElement;
    if (target?.tagName.toLowerCase() === 'path') {
      const d = target.getAttribute('d') || '';
      const len = target.getTotalLength();
      const pts: Dot[] = [];
      for (let i = 0; i <= len; i += 12) {
        const p = target.getPointAtLength(i);
        pts.push({ id: Math.random().toString(36).substring(7), x: p.x, y: p.y });
      }
      setSourceDots(pts);
    }
  };

  const moveAllToWorkspace = () => {
    if (!selectedImage || sourceDots.length === 0) return;
    setWorkspaceShapes(prev => [...prev, {
      id: `shape-${Date.now()}`,
      img: selectedImage,
      dots: [...sourceDots],
      dims: { ...imgDims },
      position: { x: 100, y: 100 },
      scale: 0.5,
      showDots: true
    }]);
    setSourceDots([]);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!workspaceRef.current) return;
    const svg = workspaceRef.current;
    const CTM = svg.getScreenCTM();
    if (!CTM) return;
    const mouseX = (e.clientX - CTM.e) / CTM.a;
    const mouseY = (e.clientY - CTM.f) / CTM.d;

    if (resizingId) {
      const dx = e.clientX - dragOffset.x;
      setWorkspaceShapes(prev => prev.map(s => 
        s.id === resizingId ? { ...s, scale: Math.max(0.1, s.scale + (dx / 500)) } : s
      ));
      setDragOffset({ x: e.clientX, y: e.clientY });
      return;
    }

    if (draggingDot) {
      setWorkspaceShapes(prev => prev.map(s => {
        if (s.id !== draggingDot.shapeId) return s;
        return {
          ...s,
          dots: s.dots.map(d => d.id === draggingDot.dotId ? { 
            ...d, 
            x: (mouseX - s.position.x) / s.scale, 
            y: (mouseY - s.position.y) / s.scale 
          } : d)
        };
      }));
    } else if (draggingShapeId) {
      setWorkspaceShapes(prev => prev.map(s => 
        s.id === draggingShapeId ? { ...s, position: { x: mouseX - dragOffset.x, y: mouseY - dragOffset.y } } : s
      ));
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white overflow-hidden text-slate-800 font-sans select-none"
         onMouseMove={onMouseMove} 
         onMouseUp={() => { setDraggingDot(null); setDraggingShapeId(null); setResizingId(null); }}
         onClick={() => setMenu(null)}>
      
      <div className="h-[10%] flex items-center px-10 border-b border-slate-50 shrink-0">
        <label className="bg-[#FFD600] text-black px-8 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest shadow-[0_4px_0_0_#b89b00] cursor-pointer">
          Upload
          <input type="file" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setSelectedImage(URL.createObjectURL(f));
          }} />
        </label>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-[#FBFBFD] relative overflow-hidden">
        <div className="flex flex-col gap-3 pr-6 shrink-0">
          <button onClick={moveAllToWorkspace} className="bg-orange-500 text-white px-4 py-2 rounded text-[10px] font-bold uppercase shadow-sm">Bulk Move</button>
          <button onClick={hideAllDots} className="bg-orange-500 text-white px-4 py-2 rounded text-[10px] font-bold uppercase shadow-sm">Hide Dots</button>
          <button onClick={() => setWorkspaceShapes([])} className="bg-orange-500 text-white px-4 py-2 rounded text-[10px] font-bold uppercase shadow-sm">Clear All</button>
        </div>

        <div className="flex flex-row gap-10 h-full max-h-full">
          <div className="h-full aspect-square rounded-[2rem] bg-white shadow-xl border border-slate-100 relative overflow-hidden">
            <svg viewBox={`0 0 ${imgDims.width} ${imgDims.height}`} className="w-full h-full p-10 cursor-crosshair overflow-visible">
              {selectedImage && <image href={selectedImage} width={imgDims.width} height={imgDims.height} />}
              {svgContent && <g dangerouslySetInnerHTML={{ __html: svgContent }} onClick={handleSourceClick} className="opacity-0" style={{ fill: 'red', pointerEvents: 'auto' }} />}
              {sourceDots.map(dot => <circle key={dot.id} cx={dot.x} cy={dot.y} r="3" fill="#2563eb" />)}
            </svg>
          </div>

          <div className="h-full aspect-square rounded-[2rem] bg-white shadow-xl border border-slate-100 relative overflow-hidden">
             <svg ref={workspaceRef} viewBox="0 0 1000 1000" className="w-full h-full p-10 overflow-visible">
                {workspaceShapes.map(shape => (
                  <g key={shape.id} style={{ transform: `translate(${shape.position.x}px, ${shape.position.y}px) scale(${shape.scale})`, transformOrigin: '0 0' }}>
                    <defs>
                      <clipPath id={`clip-${shape.id}`}>
                        <path d={generatePathData(shape.dots)} />
                      </clipPath>
                    </defs>
                    
                    {shape.img && (
                      <image 
                        href={shape.img} width={shape.dims.width} height={shape.dims.height} 
                        clipPath={`url(#clip-${shape.id})`}
                        className="cursor-grab active:cursor-grabbing"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const svg = workspaceRef.current;
                          const CTM = svg?.getScreenCTM();
                          if (CTM) {
                            const mX = (e.clientX - CTM.e) / CTM.a;
                            const mY = (e.clientY - CTM.f) / CTM.d;
                            setDraggingShapeId(shape.id);
                            setDragOffset({ x: mX - shape.position.x, y: mY - shape.position.y });
                          }
                        }}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, id: shape.id }); }}
                      />
                    )}

                    {shape.showDots && shape.dots.length > 0 && (
                      <>
                        <path d={generatePathData(shape.dots)} fill="none" stroke="#2563eb" strokeWidth="1" strokeDasharray="4" pointerEvents="none" />
                        {shape.dots.map(dot => (
                          <circle 
                            key={dot.id} cx={dot.x} cy={dot.y} r="3.0" fill="#2563eb" 
                            className="cursor-move hover:fill-orange-500 transition-colors"
                            onMouseDown={(e) => { e.stopPropagation(); setDraggingDot({ shapeId: shape.id, dotId: dot.id }); }}
                          />
                        ))}
                        <rect 
                          x={shape.dims.width - 15} y={shape.dims.height - 15} width="30" height="30"
                          fill="#f97316" className="cursor-nwse-resize opacity-80"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setResizingId(shape.id);
                            setDragOffset({ x: e.clientX, y: e.clientY });
                          }}
                        />
                      </>
                    )}
                  </g>
                ))}
             </svg>
          </div>
        </div>
      </div>

      {/* GALLERY FOOTER */}
      <div className="h-[180px] w-full flex items-center px-12 border-t border-slate-100 bg-white shrink-0">
        <div className="flex gap-8 overflow-x-auto py-4 no-scrollbar w-full">
          {templates.map((url, i) => (
            <button key={i} onClick={() => setSelectedImage(url)} className={`flex-shrink-0 w-[100px] h-[100px] rounded-2xl border-2 transition-all overflow-hidden ${selectedImage === url ? 'scale-105 border-[#FFD600] shadow-lg' : 'opacity-40 border-transparent hover:opacity-100'}`}>
              <img src={url} className="w-full h-full object-cover" alt={`Template ${i}`} />
            </button>
          ))}
        </div>
      </div>

      {menu && (
        <div className="fixed z-[100] bg-white border border-slate-200 shadow-2xl rounded-lg py-1 min-w-[140px]" style={{ left: menu.x, top: menu.y }}>
          <button onClick={() => {
            const item = workspaceShapes.find(s => s.id === menu.id);
            if (item) setWorkspaceShapes([...workspaceShapes.filter(s => s.id !== menu.id), item]);
            setMenu(null);
          }} className="w-full px-4 py-3 text-[10px] font-bold uppercase text-orange-600 hover:bg-orange-50 text-left">
            Bring to Front
          </button>
          <button onClick={() => toggleDotsForShape(menu.id)} className="w-full px-4 py-3 text-[10px] font-bold uppercase text-blue-600 hover:bg-blue-50 text-left border-t border-slate-50">
            {workspaceShapes.find(s => s.id === menu.id)?.showDots ? 'Hide Handles' : 'Show Handles'}
          </button>
        </div>
      )}
    </div>
  );
}