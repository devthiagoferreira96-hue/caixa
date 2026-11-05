// Conexão com o Supabase.
// Sem as variáveis do arquivo .env, o sistema roda em MODO DEMONSTRAÇÃO (dados de exemplo na memória).
import { createClient } from '@supabase/supabase-js';
import { criarDemo } from './demo-db.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const modoDemo = !url || !chave;
export const supabase = modoDemo ? criarDemo() : createClient(url, chave);
