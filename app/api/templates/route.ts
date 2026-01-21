import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Looks in public/templates
    const templatesDir = path.join(process.cwd(), 'public/templates');
    
    // Create the folder if it doesn't exist yet to avoid errors
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
    }

    const filenames = fs.readdirSync(templatesDir);
    
    const images = filenames
      .filter(file => /\.(png|jpe?g|svg|webp)$/i.test(file))
      .map(file => `/templates/${file}`);

    return NextResponse.json(images);
  } catch (error) {
    console.error("Template API Error:", error);
    return NextResponse.json([], { status: 200 }); // Return empty array instead of error
  }
}