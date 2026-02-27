
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; 

if (!supabaseUrl || !supabaseKey) {
  console.warn('Missing Supabase environment variables');
} else {
  console.log('[DB] Supabase initialized with URL:', supabaseUrl);
  console.log('[DB] Using Key starting with:', supabaseKey.substring(0, 10) + '...');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

