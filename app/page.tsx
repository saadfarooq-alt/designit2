'use client';

import { useEffect, useState, useRef } from 'react';
import ImageTracer from 'imagetracerjs';

interface Dot { id: string; x: number; y: number; }

export default function DesignStudio() {
  const [templates, setTemplates] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [workspaceDots, setWorkspaceDots] = useState<Dot[]>([]);
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  const [isTracing, setIsTracing] = useState(false);

  useEffect(() => {
    async function loadTemplates() {
      const res = await fetch('/api/templates');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setTemplates(data);
        setSelectedImage(data[0]);
      }
    }
    loadTemplates();
  }, []);

  useEffect(() => {
    if (!selectedImage) return;
    const img = new Image();
    img.onload = () => setImgDims({ width: img.width, height: img.height });
    img.src = selectedImage;
    setWorkspaceDots([]);
  }, [selectedImage]);

  const handleTrace = () => {
    if (!selectedImage || isTracing) return;
    setIsTracing(true);

    ImageTracer.imageToSVG(selectedImage, (svgString: string) => {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = svgString;
      const paths = tempDiv.querySelectorAll('path');
      const newDots: Dot[] = [];

      paths.forEach((path) => {
        const length = path.getTotalLength();
        for (let i = 0; i < length; i += 8) {
          const point = path.getPointAtLength(i);
          newDots.push({
            id: crypto.randomUUID(),
            x: (point.x / imgDims.width) * 100,
            y: (point.y / imgDims.height) * 100
          });
        }
      });

      setWorkspaceDots(newDots);
      setIsTracing(false);
    }, { ltres: 0, qtres: 0, numberofcolors: 2, pathomit: 8 });
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white overflow-hidden text-slate-800">
      
      {/* ROW 1: BUTTON (10%) */}
      <div className="h-[10%] flex items-center justify-start px-10 shrink-0">
        <label className="cursor-pointer">
          <div className="bg-[#FFD600] text-black px-20 py-5 rounded-xl text-[14px] font-black uppercase tracking-[0.15em] 
            shadow-[0_10px_0_0_#b89b00] active:shadow-[0_2px_0_0_#b89b00] active:translate-y-[8px] transition-all flex items-center justify-center min-w-[300px]">
            Upload Custom Design
          </div>
          <input type="file" className="hidden" accept="image/*" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setSelectedImage(URL.createObjectURL(file));
          }} />
        </label>
      </div>

      {/* ROW 2: SQUARE WINDOWS (60%) */}
      <div className="h-[60%] flex items-center justify-center p-8 bg-[#FBFBFD] overflow-hidden">
        <div className="flex flex-row gap-10 h-full max-w-full">
          
          {/* SOURCE VIEW - FORCED SQUARE */}
          <div 
            onClick={handleTrace}
            className="h-full aspect-square rounded-[2.5rem] bg-white relative overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.08)] cursor-pointer"
          >
            <div className="absolute top-6 left-8 z-10 bg-white/60 px-2 py-1 rounded backdrop-blur-sm">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Source View</p>
            </div>
            {selectedImage && (
              <img src={selectedImage} className="w-full h-full object-contain bg-white" alt="Source" />
            )}
            {isTracing && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center z-20">
                <p className="font-black text-black animate-pulse tracking-widest text-xs">ANALYZING...</p>
              </div>
            )}
          </div>

          {/* WORKSPACE VIEW - FORCED SQUARE */}
          <div className="h-full aspect-square rounded-[2.5rem] bg-white relative overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.08)]">
            <div className="absolute top-6 left-8 z-10">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">Workspace</p>
            </div>
            <div className="w-full h-full relative bg-white">
              {workspaceDots.map((dot) => (
                <div 
                  key={dot.id}
                  className="absolute w-1 h-1 bg-blue-600 rounded-full"
                  style={{ left: `${dot.x}%`, top: `${dot.y}%`, transform: 'translate(-50%, -50%)' }}
                />
              ))}
              {workspaceDots.length === 0 && !isTracing && (
                <div className="w-full h-full flex items-center justify-center text-slate-200 text-[10px] font-black uppercase tracking-widest">
                  Canvas Empty
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ROW 3: GALLERY (30%) */}
      <div className="h-[30%] flex flex-col justify-center px-12 shrink-0">
        <div className="flex flex-row gap-8 overflow-x-auto pb-8 scrollbar-hide items-center">
          {templates.map((url, i) => (
            <button 
              key={i} 
              onClick={() => setSelectedImage(url)}
              className={`flex-shrink-0 w-[100px] h-[100px] rounded-[1.25rem] transition-all overflow-hidden ${
                selectedImage === url ? 'scale-110 shadow-2xl ring-4 ring-[#FFD600]' : 'opacity-30'
              }`}
            >
              <img src={url} className="w-full h-full object-cover" alt="thumb" />
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}