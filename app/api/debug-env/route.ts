
import { NextResponse } from 'next/server';
import { supabase } from '../../../src/lib/db';

export async function GET() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const adminPass = process.env.ADMIN_PASSWORD || '';
  
  // Try to query DB directly here just to be sure
  let dbResult = 'Skipped query';
  try {
     const { count, error } = await supabase.from('submissions').select('*', { count: 'exact', head: true });
     dbResult = error ? `Error: ${error.message}` : `Success. Count: ${count}`;
  } catch (e) {
     dbResult = `Exception: ${e}`;
  }
  
  // Check if process.env values match expected length/format
  const serviceKeyType = serviceKey.startsWith('sb_secret_') ? 'Native Secret' : (serviceKey.startsWith('eyJ') ? 'JWT' : 'Unknown');
  const anonKeyType = anonKey.startsWith('sb_publishable_') ? 'Native Publishable' : (anonKey.startsWith('eyJ') ? 'JWT' : 'Unknown');
  
  return NextResponse.json({
    serviceKeyType,
    anonKeyType,
    // ... rest same
    serviceKeyLength: serviceKey.length,
    serviceKeyStart: serviceKey.substring(0, 5) + '...',
    anonKeyLength: anonKey.length,
    anonKeyStart: anonKey.substring(0, 5) + '...',
    hasAdminPass: adminPass.length > 0,
    nodeEnv: process.env.NODE_ENV,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dbCheck: dbResult
  });
}
