"use client";

import React from "react";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-slate-900">
      <nav className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="DesignIt" className="h-8 w-auto" />
          <span className="font-black text-xl tracking-tighter uppercase">DesignIt</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/" className="text-slate-600 hover:text-slate-900 font-medium text-sm uppercase">
            Home
          </Link>
          <Link href="/about" className="text-[#800000] font-bold text-sm uppercase">
            About
          </Link>
          <Link href="/contact" className="text-slate-600 hover:text-slate-900 font-medium text-sm uppercase">
            Contact
          </Link>
          <Link href="/" className="bg-[#800000] text-white px-6 py-2 rounded-full font-bold text-sm uppercase transition-transform hover:scale-105">
            Launch Studio
          </Link>
        </div>
      </nav>

      <main className="flex-1 px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-black mb-8 leading-tight">
            About <span className="text-[#800000]">DesignIt</span>
          </h1>
          
          <div className="prose prose-lg max-w-none">
            <section className="mb-12">
              <h2 className="text-3xl font-black mb-4 text-slate-900">Our Mission</h2>
              <p className="text-slate-600 leading-relaxed text-lg mb-4">
                DesignIt is a cutting-edge digital design studio built for jewelry and clothing designers 
                who demand professional tools without the complexity. We believe that powerful design 
                software should be accessible, intuitive, and lightning-fast.
              </p>
              <p className="text-slate-600 leading-relaxed text-lg">
                Our platform combines advanced image tracing, vector manipulation, and real-time editing 
                capabilities to help you bring your creative vision to life—all in your browser.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-3xl font-black mb-4 text-slate-900">What We Offer</h2>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-slate-50 p-6 rounded-2xl">
                  <h3 className="text-xl font-black mb-3 text-[#800000]">Image Tracing</h3>
                  <p className="text-slate-600">
                    Convert bitmap images into editable vector shapes with our intelligent tracing engine. 
                    Perfect for transforming sketches and photos into professional designs.
                  </p>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl">
                  <h3 className="text-xl font-black mb-3 text-[#800000]">Vector Editing</h3>
                  <p className="text-slate-600">
                    Manipulate shapes with precision using distortable control points. Create unique 
                    silhouettes and patterns with complete creative freedom.
                  </p>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl">
                  <h3 className="text-xl font-black mb-3 text-[#800000]">Dress Form Tools</h3>
                  <p className="text-slate-600">
                    Design clothes with customizable mannequin measurements. Drape garments using 
                    neck-to-neck alignment for realistic visualization.
                  </p>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl">
                  <h3 className="text-xl font-black mb-3 text-[#800000]">Drawing & Painting</h3>
                  <p className="text-slate-600">
                    Add details with pen, fill, and erase tools. Work with multiple colors and layers 
                    to create rich, detailed designs.
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-12">
              <h2 className="text-3xl font-black mb-4 text-slate-900">Why Choose DesignIt?</h2>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="text-[#800000] font-black text-xl">✓</span>
                  <div>
                    <strong className="font-black text-slate-900">No Installation Required:</strong>
                    <span className="text-slate-600"> Work directly in your browser with no downloads or plugins.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[#800000] font-black text-xl">✓</span>
                  <div>
                    <strong className="font-black text-slate-900">Professional Results:</strong>
                    <span className="text-slate-600"> Export high-quality designs ready for production or presentation.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[#800000] font-black text-xl">✓</span>
                  <div>
                    <strong className="font-black text-slate-900">Fast & Responsive:</strong>
                    <span className="text-slate-600"> Built with modern web technology for smooth, real-time editing.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-[#800000] font-black text-xl">✓</span>
                  <div>
                    <strong className="font-black text-slate-900">Designer-Focused:</strong>
                    <span className="text-slate-600"> Created by designers, for designers. Every feature is built with your workflow in mind.</span>
                  </div>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-3xl font-black mb-4 text-slate-900">Behind the Project</h2>
              <p className="text-slate-600 leading-relaxed text-lg mb-4">
                DesignIt is developed by Learncapes Inc., a team passionate about creating innovative 
                tools that empower creative professionals. We're constantly improving and adding new 
                features based on feedback from our community of designers.
              </p>
              <p className="text-slate-600 leading-relaxed text-lg">
                Have questions or suggestions? We'd love to hear from you. Visit our{" "}
                <Link href="/contact" className="text-[#800000] font-bold underline hover:no-underline">
                  contact page
                </Link>{" "}
                to get in touch.
              </p>
            </section>
          </div>

          <div className="mt-16 text-center">
            <Link href="/" className="inline-block bg-black text-white px-10 py-4 rounded-2xl font-black uppercase text-sm shadow-2xl hover:bg-[#800000] transition-colors">
              Start Designing Now
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t py-8 px-6 text-center text-slate-500 text-sm">
        <p>&copy; {new Date().getFullYear()} Learncapes Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}
