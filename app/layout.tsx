import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Analytics } from "@vercel/analytics/next";
// app/layout.tsx
import React from "react";


export const metadata: Metadata = {
  title: "Design Studio — Visual Editor",
  description: "Design Studio v2 — trace/extract images, create vector shapes, draw, and edit designs in the browser.",
  openGraph: {
    title: "Design Studio — Visual Editor",
    description: "Trace images, create vector shapes, draw, and edit designs in the browser.",
    url: "https://idesignits.com/", // <- replace with your production URL
    siteName: "Design Studio",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Studio preview",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Design Studio — Visual Editor",
    description: "Trace images, create vector shapes, draw, and edit designs in the browser.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    // you can add more (like noimageindex) if desired
  },
  metadataBase: new URL("https://idesignits.com/"), // <- replace with your production URL
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  themeColor: "#800000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Structured data JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "url": "https://idesignits.com/", // <- update
    "name": "Design Studio",
    "description": "Design Studio v2 — trace/extract images, create vector shapes, draw, and edit designs in the browser.",
    "publisher": {
      "@type": "Organization",
      "name": "Learncapes inc.",
      "logo": {
        "@type": "ImageObject",
        "url": "https://idesignits.com/logo.png" // <- update or remove
      }
    }
  };

  return (
    <html lang="en">
      <head>
        {/* The Next.js metadata API will automatically inject the metadata above.
            We add JSON-LD here for structured data. */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
      <Analytics/>
    </html>
  );
}