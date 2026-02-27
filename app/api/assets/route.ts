import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const assetsDir = path.join(process.cwd(), 'public', 'assets');
    
    // Ensure directory exists
    if (!fs.existsSync(assetsDir)) {
      return NextResponse.json({ assets: [] });
    }

    const files = fs.readdirSync(assetsDir);
    
    // Filter for image files only
    const assets = files
      .filter(file => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(file))
      .map(file => ({
        name: file,
        path: `/assets/${file}`
      }));

    return NextResponse.json({ assets });
  } catch (error) {
    console.error('Error reading assets:', error);
    return NextResponse.json({ error: 'Failed to read assets' }, { status: 500 });
  }
}
