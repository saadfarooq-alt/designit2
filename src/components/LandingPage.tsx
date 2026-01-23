"use client";
import React from "react";

export default function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col min-h-screen bg-white text-slate-900">
      <nav className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="DesignIt" className="h-8 w-auto" />
          <span className="font-black text-xl tracking-tighter uppercase">DesignIt</span>
        </div>
        <button onClick={onStart} className="bg-[#800000] text-white px-6 py-2 rounded-full font-bold text-sm uppercase transition-transform hover:scale-105">
          Launch Studio
        </button>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-6xl md:text-8xl font-black mb-6 leading-tight">
          CRAFT YOUR <br /> <span className="text-[#800000]">Design.</span>
        </h1>
        <p className="text-slate-500 text-lg md:text-xl max-w-2xl mb-10 font-medium">
          The ultimate digital studio for jewelry and clothes designers. Pull, Trace, edit, and reimagine 
          designs with professional vector tools.
        </p>
        <div className="flex gap-4">
          <button onClick={onStart} className="bg-black text-white px-10 py-4 rounded-2xl font-black uppercase text-sm shadow-2xl hover:bg-[#800000] transition-colors">
            Start Designing
          </button>
        </div>
        
        {/* Mockup of the app */}
        <div className="mt-16 w-full max-w-4xl rounded-t-[3rem] border-x-[12px] border-t-[12px] border-slate-200 shadow-2xl overflow-hidden h-[300px] bg-slate-100">
           <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-400 flex items-center justify-center font-black text-white/50 italic uppercase">
             Studio Preview
           </div>
        </div>
      </main>
    </div>
  );
}