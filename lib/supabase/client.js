'use client';

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// When env vars are absent the app runs in local mode (no auth/persistence);
// callers check isSupabaseConfigured before using the client.
export const isSupabaseConfigured = Boolean(url && anonKey);

let _client = null;
let _initialHash = null;

export function getSupabase() {
  if (!isSupabaseConfigured) return null;
  if (!_client) {
    // Snapshot the URL hash before the client's detectSessionInUrl consumes
    // and clears it — AuthGuard and /welcome use this to recognize invite/
    // recovery landings (and surface link errors) even after the tokens
    // have been processed.
    if (typeof window !== 'undefined' && _initialHash === null) {
      _initialHash = window.location.hash || '';
    }
    _client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return _client;
}

// The location.hash exactly as it was when the auth client initialized.
export function getInitialAuthHash() {
  return _initialHash || '';
}

// One-shot consumption: AuthGuard clears the captured hash once it has
// acted on it, so post-setup navigation into the app never re-triggers the
// invite/recovery forward (the "set password page keeps resetting" loop).
export function clearInitialAuthHash() {
  _initialHash = '';
}
