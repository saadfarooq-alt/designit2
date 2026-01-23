import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Analytics } from "@vercel/analytics/next";
// app/layout.tsx
import React from "react";

export const metadata: Metadata = {
  title: "Design Studio — Manipulate images online",
  description:
    "Design Studio — an intuitive web app to trace, edit and manipulate images online. Powerful image editor and design tools to create professional visuals fast — a great alternative to Adobe and Canva.",
  keywords: [
    "manipulate images",
    "image editor",
    "online design",
    "vector trace",
    "photo editor",
    "graphic design",
    "Canva alternative",
    "Adobe alternative",
  ],
  openGraph: {
    title: "Design Studio — Manipulate images online",
    description:
      "Trace, edit and manipulate images in the browser. Create vector shapes, apply fills, remove backgrounds and export assets — fast and simple.",
    url: "https://idesignits.com/",
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
    title: "Design Studio — Manipulate images online",
    description:
      "Trace, edit and manipulate images in the browser. Create assets and export high-quality visuals — design faster than ever.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  metadataBase: new URL("https://idesignits.com/"),
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
    url: "https://idesignits.com/",
    name: "Design Studio",
    description:
      "Design Studio v2 — trace/extract images, create vector shapes, draw, and edit designs in the browser. Manipulate images online with powerful, easy-to-use tools.",
    publisher: {
      "@type": "Organization",
      name: "Learncapes inc.",
      logo: {
        "@type": "ImageObject",
        url: "https://idesignits.com/logo.png",
      },
    },
  };

  return (
    <html lang="en">
      <head>
        {/* The Next.js metadata API injects the metadata above. Add structured data and canonical link */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <link rel="canonical" href="https://idesignits.com/" />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}