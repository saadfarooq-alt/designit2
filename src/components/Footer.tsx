import React from "react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-gradient-to-br from-slate-800 to-blue-900 text-white py-12 px-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <img src="/logo.png" alt="DesignIt" className="h-8 w-auto brightness-0 invert" />
            <span className="font-black text-2xl tracking-tight text-white">DesignIt ☀</span>
          </div>
          <p className="text-slate-300 text-sm max-w-xs">
            The ultimate digital studio for jewelry and clothes designers. Pull, trace, edit, and reimagine designs with professional vector tools.
          </p>
        </div>
        
        <div>
          <h3 className="font-black text-lg mb-4 text-yellow-500 uppercase">Quick Links</h3>
          <ul className="space-y-2">
            <li><Link href="/" className="text-slate-300 hover:text-white transition-colors">Home</Link></li>
            <li><Link href="/about" className="text-slate-300 hover:text-white transition-colors">About Us</Link></li>
            <li><Link href="/contact" className="text-slate-300 hover:text-white transition-colors">Contact</Link></li>
          </ul>
        </div>
        
        <div>
          <h3 className="font-black text-lg mb-4 text-yellow-500 uppercase">Legal</h3>
          <ul className="space-y-2">
            <li><Link href="/privacy-policy" className="text-slate-300 hover:text-white transition-colors">Privacy Policy</Link></li>
            <li><Link href="/terms-of-service" className="text-slate-300 hover:text-white transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
      </div>
      
      <div className="max-w-6xl mx-auto pt-8 border-t border-slate-700 text-center">
        <p className="text-slate-400 text-sm">&copy; {new Date().getFullYear()} Learncapes Inc. All rights reserved.</p>
      </div>
    </footer>
  );
}
