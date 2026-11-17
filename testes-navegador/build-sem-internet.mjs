import * as esbuild from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import { compile } from '/opt/npm-tools/node_modules/tailwindcss/dist/lib.mjs';
import fs from 'fs'; import path from 'path';
const APP=process.env.APP || process.cwd();
await esbuild.build({ entryPoints:[APP+'/src/main.js'], bundle:true, format:'esm', outfile:'/tmp/teste/out/app.js',
  alias:{'@supabase/supabase-js':'/tmp/teste/stub/supabase.js'}, loader:{'.css':'empty'},
  define:{'import.meta.env.VITE_SUPABASE_URL':'undefined','import.meta.env.VITE_SUPABASE_ANON_KEY':'undefined','import.meta.env.PROD':'true'}, logLevel:'warning' });
// tailwind
const TW='/opt/npm-tools/node_modules/tailwindcss';
const css=fs.readFileSync(APP+'/src/style.css','utf8');
const c=await compile(css,{ base:APP+'/src', loadStylesheet: async (id,base)=>{ const f=id==='tailwindcss'?TW+'/index.css':path.resolve(base,id); return {content:fs.readFileSync(f,'utf8'), base:path.dirname(f), path:f}; }});
const cand=new Set();
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).forEach(e=>{const p=d+'/'+e.name; if(e.isDirectory()) walk(p); else if(/\.(js|html)$/.test(e.name)) fs.readFileSync(p,'utf8').split(/[\s"'`<>]+/).forEach(t=>t&&cand.add(t));});
walk(APP+'/src'); fs.readFileSync(APP+'/index.html','utf8').split(/[\s"'`<>=]+/).forEach(t=>cand.add(t));
fs.writeFileSync('/tmp/teste/out/app.css', c.build([...cand]));
let html=fs.readFileSync(APP+'/index.html','utf8').replace('<script type="module" src="/src/main.js"></script>','<link rel="stylesheet" href="app.css"><script type="module" src="app.js"></script>');
fs.writeFileSync('/tmp/teste/out/index.html',html);
for (const f of fs.readdirSync(APP+'/public')) fs.copyFileSync(APP+'/public/'+f,'/tmp/teste/out/'+f);
console.log('ok', fs.statSync('/tmp/teste/out/app.css').size, fs.statSync('/tmp/teste/out/app.js').size);
