"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function CookieConsent() {
  const [showConsent, setShowConsent] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      setShowConsent(true);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem("cookie-consent", "accepted");
    setShowConsent(false);
  };

  const rejectCookies = () => {
    localStorage.setItem("cookie-consent", "rejected");
    setShowConsent(false);
  };

  if (!showConsent) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 z-[9999] shadow-2xl border-t border-slate-700">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-slate-300 text-center sm:text-left">
          We use cookies to personalize content and ads, to provide social media features and to analyze our traffic. We also share information about your use of our site with our social media, advertising and analytics partners. 
          <Link href="/privacy-policy" className="text-yellow-500 hover:underline ml-1">
            Learn more
          </Link>
        </div>
        <div className="flex gap-3 shrink-0">
          <button 
            onClick={rejectCookies}
            className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-6 rounded-full text-sm transition-colors whitespace-nowrap"
          >
            Reject All
          </button>
          <button 
            onClick={acceptCookies}
            className="bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-bold py-2 px-6 rounded-full text-sm transition-colors whitespace-nowrap"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
