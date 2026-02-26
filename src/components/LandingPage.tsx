"use client";
import React from "react";
import Link from "next/link";

export default function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 text-slate-900">
      <nav className="flex items-center justify-between px-6 py-5 border-b-2 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 shadow-md">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="DesignIt" className="h-8 w-auto" />
          <span className="font-black text-2xl tracking-tight bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">DesignIt ☀</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/about" className="text-slate-700 hover:text-amber-600 font-semibold text-sm uppercase transition-colors">
            About
          </Link>
          <Link href="/contact" className="text-slate-700 hover:text-amber-600 font-semibold text-sm uppercase transition-colors">
            Contact
          </Link>
          <button onClick={onStart} className="bg-gradient-to-r from-blue-900 to-blue-800 text-white px-8 py-3 rounded-full font-bold text-sm uppercase transition-all hover:scale-105 shadow-lg hover:shadow-xl">
            Launch Studio
          </button>
        </div>
      </nav>

      <main className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 px-6 lg:px-12 py-12 max-w-[1400px] mx-auto w-full">
        <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left">
          <h1 className="text-6xl md:text-7xl xl:text-8xl font-black mb-6 leading-tight text-slate-800">
            CRAFT YOUR <br /> <span className="text-[#800000]">Design.</span>
          </h1>
          <p className="text-slate-600 text-lg md:text-2xl max-w-2xl mb-10 font-semibold">
            The ultimate digital studio for jewelry and clothes designers. Pull, Trace, edit, and reimagine 
            designs with professional vector tools.
          </p>
          <div className="flex gap-4">
            <button onClick={onStart} className="bg-black text-white px-12 py-5 rounded-full font-black uppercase text-sm shadow-2xl hover:shadow-3xl hover:scale-105 transition-all hover:bg-slate-800">
              Start Designing →
            </button>
          </div>
        </div>
        
        {/* Prominent Video Section */}
        <div className="flex-1 w-full max-w-3xl rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden border-8 border-white bg-white">
           <video 
             src="/demo_video.mp4" 
             controls
             autoPlay
             muted
             loop
             playsInline
             className="w-full h-auto object-cover rounded-xl"
             poster="/logo.png"
           >
             Your browser does not support the video tag.
           </video>
        </div>
      </main>
    </div>
  );
}