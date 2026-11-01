import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Auth features will be disabled.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Where supabase-js keeps this project's session in localStorage. It names the
 * key after the first label of the project's host, so a key left by another
 * Supabase project on the same site (sb-other-auth-token) isn't ours.
 */
export function authStorageKey(url: string | undefined = supabaseUrl): string | undefined {
  if (!url) return undefined;
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return undefined;
  }
}

/**
 * The signed-in session's access token, refreshed by supabase-js when it has
 * expired, or undefined when nobody is signed in. Routes that act for a user
 * id check it names that same user.
 */
export async function sessionToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured) return undefined;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? undefined;
  } catch {
    return undefined;
  }
}
