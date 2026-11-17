import asyncio, json
from playwright.async_api import async_playwright
import sys; sys.path.insert(0,'/tmp/qa')
from comum import preparar, pular_tour
U='http://localhost:8765/'
PAGES=['inicio','extrato','novo','cartoes','relatorio','ajustes','ajuda']
JS=r"""()=>{
const out={semRotulo:[],semNome:[],idsDuplicados:[],contraste:[],alvoPequeno:[],h1:document.querySelectorAll('h1').length};
const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[hidden]')&&!e.closest('.sr-only')};
const nome=e=>(e.getAttribute('aria-label')||(e.getAttribute('aria-labelledby')&&document.getElementById(e.getAttribute('aria-labelledby'))?.textContent)||e.textContent||e.title||'').trim();
document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(e=>{
  const ok=e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||(e.id&&document.querySelector(`label[for="${e.id}"]`))||e.closest('label');
  if(!ok) out.semRotulo.push(e.outerHTML.slice(0,90));});
document.querySelectorAll('button,a[href],summary').forEach(e=>{ if(!nome(e)) out.semNome.push(e.outerHTML.slice(0,90));
  if(vis(e)){const r=e.getBoundingClientRect(); if((r.width<24||r.height<24)&&!e.closest('p')&&!e.closest('li.text-sm')) out.alvoPequeno.push(nome(e).slice(0,30)+` ${Math.round(r.width)}x${Math.round(r.height)}`);} });
const ids={}; document.querySelectorAll('[id]').forEach(e=>ids[e.id]=(ids[e.id]||0)+1); out.idsDuplicados=Object.keys(ids).filter(k=>ids[k]>1);
const rgb=s=>{const m=s.match(/[\d.]+/g).map(Number);return m.length>=3?m:[0,0,0,1]};
const cvt=c=>{ // converte qualquer cor (oklch, etc.) para rgb via canvas
  const cx=document.createElement('canvas').getContext('2d'); cx.fillStyle='#000'; cx.fillStyle=c; cx.fillRect(0,0,1,1); const d=cx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]/255];};
const bgDe=e=>{ let cor=[255,255,255]; const pilha=[]; for(let n=e;n;n=n.parentElement){const c=cvt(getComputedStyle(n).backgroundColor); if(c[3]>0){pilha.push(c); if(c[3]>=1) break;}}
  if(!pilha.length||pilha[pilha.length-1][3]<1) pilha.push(document.documentElement.classList.contains('dark')?[12,10,9,1]:[245,245,244,1]);
  for(let i=pilha.length-1;i>=0;i--){const [r,g,b,a]=pilha[i]; cor=[r*a+cor[0]*(1-a),g*a+cor[1]*(1-a),b*a+cor[2]*(1-a)];} return cor;};
const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
const vistos=new Set();
document.querySelectorAll('body *').forEach(e=>{
  if(!vis(e)) return; const txt=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(''); if(!txt) return;
  if(e.closest('button:disabled')) return;
  const s=getComputedStyle(e); const fg=cvt(s.color); let bg=bgDe(e);
  const fgm=[fg[0]*fg[3]+bg[0]*(1-fg[3]),fg[1]*fg[3]+bg[1]*(1-fg[3]),fg[2]*fg[3]+bg[2]*(1-fg[3])];
  const L1=lum(fgm),L2=lum(bg); const cr=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
  const px=parseFloat(s.fontSize), bold=parseInt(s.fontWeight)>=700; const grande=px>=24||(bold&&px>=18.66);
  const min=grande?3:4.5; const k=txt.slice(0,25)+s.color;
  if(cr<min&&!vistos.has(k)){vistos.add(k); out.contraste.push(`${txt.slice(0,30)} = ${cr.toFixed(2)} (mín ${min})`);} });
return out;}"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        res={}
        for tema in ['light','dark']:
            ctx=await b.new_context(viewport={'width':1280,'height':900}, color_scheme=tema); pg=await ctx.new_page()
            await preparar(pg, U)
            await pular_tour(pg)
            for r in PAGES:
                await pg.goto(U+'#'+r); await pg.wait_for_timeout(700)
                if r=='ajustes':
                    await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
                o=await pg.evaluate(JS)
                for k,v in o.items():
                    if k=='h1':
                        if v!=1: print(tema,r,'h1 count',v)
                    elif v: res.setdefault(k,{}).setdefault(f'{tema}:{r}',v)
            # dialogo
            await pg.goto(U+'#extrato'); await pg.wait_for_timeout(600); await pg.locator('[data-editar]').first.click(); await pg.wait_for_timeout(300)
            o=await pg.evaluate(JS)
            for k,v in o.items():
                if k!='h1' and v: res.setdefault(k,{}).setdefault(f'{tema}:dialogo-editar',v)
            # foco preso no dialogo
            fora=0
            for _ in range(25):
                await pg.keyboard.press('Tab')
                if not await pg.evaluate("!!document.activeElement.closest('dialog[open]')"): fora+=1
            if fora: print(tema,'FOCO SAIU DO DIALOGO',fora,'vezes')
            await pg.keyboard.press('Escape')
            # login
            await pg.goto(U+'#ajustes'); await pg.wait_for_timeout(500); await pg.locator('[data-bloquear]:visible').first.click(); await pg.wait_for_selector('#senha', timeout=8000)
            o=await pg.evaluate(JS)
            for k,v in o.items():
                if k!='h1' and v: res.setdefault(k,{}).setdefault(f'{tema}:login',v)
            await ctx.close()
        # overflow
        for w in [320,375,768,1024,1440]:
            ctx=await b.new_context(viewport={'width':w,'height':800}); pg=await ctx.new_page()
            await preparar(pg, U); await pular_tour(pg)
            for r in PAGES:
                await pg.goto(U+'#'+r); await pg.wait_for_timeout(600)
                ov=await pg.evaluate("document.documentElement.scrollWidth - innerWidth")
                if ov>0:
                    culp=await pg.evaluate("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(-3).map(e=>e.tagName+'.'+e.className.toString().slice(0,50))")
                    print(f'OVERFLOW {w}px {r}: {ov}px', culp)
            await ctx.close()
        # teclado: Tab inicial
        ctx=await b.new_context(viewport={'width':1280,'height':900}); pg=await ctx.new_page()
        await preparar(pg, U); await pular_tour(pg); await pg.wait_for_timeout(300)
        await pg.keyboard.press('Tab'); print('1º Tab:', await pg.evaluate("document.activeElement.textContent.trim().slice(0,40)"))
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200); print('Depois de Enter, foco em:', await pg.evaluate("document.activeElement.id"))
        print(json.dumps(res, ensure_ascii=False, indent=1))
        await b.close()
asyncio.run(main())
