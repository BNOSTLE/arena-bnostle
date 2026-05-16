// src/lib/supabase.js
// Cliente do Supabase pra conversar com o banco
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Se não tiver as variáveis, app roda em modo demo (localStorage)
export const supabase = url && key ? createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null

export const hasSupabase = !!supabase