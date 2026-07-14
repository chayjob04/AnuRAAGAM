// js/supabase-client.js
// Fill these in with your own Supabase project's values:
// Dashboard → Project Settings → API → Project URL / anon public key.
// The anon key is safe to expose publicly — it only grants what your
// Row Level Security policies (see supabase/schema.sql) allow.

const SUPABASE_URL = 'https://hhchwsztykktfuzxpsqd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QNszIsenmt0tKfbzHQovjg_Gf6rsCTG';

// Guarded: if the CDN script didn't load (network hiccup, ad-blocker, etc.)
// or the project hasn't been configured yet, pages should degrade gracefully
// instead of crashing outright.
let supabaseClient = null;
try {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error('Anuraagam: Supabase SDK did not load — check your connection or the CDN script tag.');
  }
} catch (err) {
  console.error('Anuraagam: Supabase client failed to initialise:', err);
}
