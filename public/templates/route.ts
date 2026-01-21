import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Path to your public/templates folder
    const templatesDirectory = path.join(process.cwd(), 'public/templates');
    
    // Read the filenames
    const filenames = fs.readdirSync(templatesDirectory);
    
    // Filter for images and create the public URL paths
    const images = filenames
      .filter(file => /\.(png|jpe?g|svg|webp)$/i.test(file))
      .map(file => `/templates/${file}`);

    return NextResponse.json(images);
  } catch (error) {
    return NextResponse.json({ error: "Could not load templates" }, { status: 500 });
  }
}