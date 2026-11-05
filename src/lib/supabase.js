// Conexão com o Supabase (biblioteca carregada direto do CDN, sem npm).
// Sem os dados em src/config.js, o sistema roda em MODO DEMONSTRAÇÃO (dados de exemplo na memória).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { criarDemo } from './demo-db.js';

export const modoDemo = !SUPABASE_URL || !SUPABASE_ANON_KEY;
export const supabase = modoDemo ? criarDemo() : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
