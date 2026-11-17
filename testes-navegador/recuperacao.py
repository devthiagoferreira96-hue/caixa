import asyncio, re, sys
sys.path.insert(0,'/tmp/qa')
from comum import pular_tour, guardar_codigo, SENHA
from playwright.async_api import async_playwright
U='http://localhost:8765/'
R=[]
def ok(n,c,x=''): R.append(('PASS' if c else 'FALHA',n,x))
FORMATO=re.compile(r'^[A-HJKMNP-Z2-9]{4}(-[A-HJKMNP-Z2-9]{4}){3}$')
async def ir(pg,r): await pg.goto(U+'#'+r); await pg.wait_for_timeout(600)
async def entrar(pg, senha):
    await pg.reload(); await pg.wait_for_selector('#senha'); await pg.fill('#senha', senha); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1500)
    return await pg.locator('#titulo-pagina').count()==1
async def esqueci(pg, codigo, nova):
    await pg.reload(); await pg.wait_for_selector('#senha'); await pg.click('[data-esqueci]'); await pg.wait_for_selector('dialog[open] #codigo')
    await pg.fill('#codigo', codigo); await pg.fill('#nova', nova); await pg.fill('#repetir', nova); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(1800)
# Cria dados no formato da VERSÃO ANTERIOR (senha cifrava os dados direto)
CRIAR_V1 = r"""async ([senha])=>{
  const enc=new TextEncoder(); const sal=crypto.getRandomValues(new Uint8Array(16));
  const base=await crypto.subtle.importKey('raw',enc.encode(senha),'PBKDF2',false,['deriveKey']);
  const k=await crypto.subtle.deriveKey({name:'PBKDF2',salt:sal,iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const cif=async(o)=>{const iv=crypto.getRandomValues(new Uint8Array(12));return {iv,dados:await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(JSON.stringify(o)))}};
  const tabelas={contas:[{id:'c1',nome:'Espécie',saldo_inicial:100,ativa:true}],cartoes:[],categorias:[{id:'k1',nome:'Lazer',grupo:'Casa',no_grafico:true}],pessoas:[],
    lancamentos:[{id:'l1',tipo:'saida',valor:55,descricao:'Cinema antigo',categoria_id:'k1',conta_id:'c1',vencimento:new Date().toISOString().slice(0,10),pago:true}],compras_cartao:[],parcelas:[]};
  const conta={usuario:'Maria',sal,verificador:await cif('caixa-ok'),criada_em:new Date().toISOString()};
  const dados=await cif({tabelas,ultimoBackup:null});
  await new Promise((r,j)=>{const q=indexedDB.open('caixa-familia',1);q.onupgradeneeded=()=>q.result.createObjectStore('chaves');q.onsuccess=()=>{const tx=q.result.transaction('chaves','readwrite');tx.objectStore('chaves').put(conta,'conta');tx.objectStore('chaves').put(dados,'dados');tx.oncomplete=r;tx.onerror=j}});
}"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx=await b.new_context(viewport={'width':1280,'height':900}, permissions=['clipboard-read','clipboard-write']); pg=await ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        # ---------- código no primeiro acesso
        await pg.goto(U); await pg.wait_for_selector('#usuario')
        await pg.fill('#usuario','Thiago'); await pg.fill('#senha',SENHA); await pg.fill('#confirmar',SENHA); await pg.click('button[type=submit]')
        await pg.wait_for_selector('dialog[open] [data-guardei]', timeout=8000)
        cod1=(await pg.inner_text('dialog[open] output')).strip()
        ok('Código aparece ao criar o acesso', bool(FORMATO.match(cod1)), cod1)
        ok('"Continuar" desativado até confirmar que guardou', await pg.locator('[data-continuar]').is_disabled())
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        ok('Esc não fecha a janela do código', await pg.locator('dialog[open] [data-guardei]').count()==1)
        href=await pg.get_attribute('[data-whatsapp]','href')
        ok('Botão do WhatsApp leva o código', href.startswith('https://wa.me/?text=') and cod1.replace('-','') in href.replace('-',''), href[:70])
        await pg.click('[data-copiar]'); await pg.wait_for_timeout(300)
        ok('Copiar o código', (await pg.evaluate("navigator.clipboard.readText()"))==cod1)
        await pg.check('[data-guardei]'); await pg.click('[data-continuar]'); await pg.wait_for_selector('#titulo-pagina'); await pg.wait_for_timeout(500); await pular_tour(pg)
        ok('Depois de guardar, entra no sistema', True)
        await ir(pg,'novo'); await pg.fill('#f-valor','4500'); await pg.fill('#f-descricao','Feira do sábado'); await pg.select_option('#f-categoria',label='Alimentação/Produtos Limpeza'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(500)
        # ---------- esqueci a senha
        await esqueci(pg,'ABCD-EFGH','nova1234')
        ok('Código com formato errado: avisa', 'são 16 letras' in await pg.inner_text('dialog[open]'))
        await pg.fill('#codigo','ABCD-EFGH-JKMN-PQRS'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(1500)
        ok('Código errado: recusa', 'Código incorreto' in await pg.inner_text('dialog[open]'))
        await pg.fill('#codigo', cod1.lower().replace('-',' ')); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(1800)
        txt=await pg.inner_text('dialog[open]') if await pg.locator('dialog[open]').count() else ''
        ok('Código certo (minúsculas, sem traço) cria senha nova', 'Senha nova criada' in txt, txt[:60])
        cod2=(await pg.inner_text('dialog[open] output')).strip()
        ok('Mostra um código NOVO depois de recuperar', FORMATO.match(cod2) and cod2!=cod1)
        await pg.check('[data-guardei]'); await pg.click('[data-continuar]'); await pg.wait_for_selector('#titulo-pagina'); await pg.wait_for_timeout(500)
        await ir(pg,'extrato'); ok('Dados intactos depois de recuperar', await pg.locator('[data-editar]', has_text='Feira do sábado').count()==1)
        ok('Senha antiga não funciona mais', not await entrar(pg, SENHA))
        ok('Senha nova funciona', await entrar(pg, 'nova1234'))
        await esqueci(pg, cod1, 'outra123')
        ok('Código já usado deixa de valer', 'Código incorreto' in await pg.inner_text('dialog[open]'))
        # ---------- novo código em Ajustes
        ok('Entra de novo', await entrar(pg,'nova1234'))
        await ir(pg,'ajustes'); await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        await pg.click('[data-novo-codigo]'); await pg.fill('#senha-codigo','errada'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(1500)
        ok('Novo código exige a senha certa', 'incorreta' in await pg.inner_text('dialog[open]'))
        await pg.fill('#senha-codigo','nova1234'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(1800)
        cod3=(await pg.inner_text('dialog[open] output')).strip()
        ok('Gera código novo', FORMATO.match(cod3) and cod3 not in (cod1,cod2) and 'novo código' in (await pg.inner_text('dialog[open]')).lower())
        await pg.check('[data-guardei]'); await pg.click('[data-continuar]'); await pg.wait_for_timeout(300)
        await esqueci(pg, cod2, 'outra123'); ok('Código anterior deixa de valer', 'Código incorreto' in await pg.inner_text('dialog[open]'))
        await pg.fill('#codigo', cod3); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(1800)
        ok('Código novo funciona', 'Senha nova criada' in await pg.inner_text('dialog[open]'))
        await guardar_codigo(pg); await pg.wait_for_selector('#titulo-pagina')
        # ---------- migração da versão anterior (sem código)
        ctx2=await b.new_context(viewport={'width':390,'height':844}); pg2=await ctx2.new_page(); pg2.on('pageerror',lambda e:errs.append(str(e)))
        await pg2.goto(U+'?vazio'); await pg2.wait_for_selector('#usuario')
        await pg2.evaluate(CRIAR_V1, ['senhaAntiga'])
        await pg2.reload(); await pg2.wait_for_selector('#senha')
        ok('Versão anterior: pede a senha normalmente', 'Olá, Maria' in await pg2.inner_text('body'))
        await pg2.fill('#senha','errada'); await pg2.click('button[type=submit]'); await pg2.wait_for_timeout(1500)
        ok('Versão anterior: senha errada recusada', 'Senha incorreta' in await pg2.inner_text('body'))
        await pg2.fill('#senha','senhaAntiga'); await pg2.click('button[type=submit]'); await pg2.wait_for_selector('dialog[open] [data-guardei]', timeout=8000)
        ok('Versão anterior: ganha código de recuperação ("Novidade")', 'Novidade' in await pg2.inner_text('dialog[open]'))
        codm=(await pg2.inner_text('dialog[open] output')).strip()
        await pg2.check('[data-guardei]'); await pg2.click('[data-continuar]'); await pg2.wait_for_selector('#titulo-pagina'); await pular_tour(pg2)
        await pg2.evaluate("location.hash='#extrato'"); await pg2.wait_for_timeout(600)
        await pg2.wait_for_timeout(800); await pg2.screenshot(path='/tmp/qa/mig.png')
        ok('Versão anterior: dados preservados', await pg2.locator('[data-editar]', has_text='Cinema antigo').count()==1)
        await pg2.reload(); await pg2.wait_for_selector('#senha'); await pg2.fill('#senha','senhaAntiga'); await pg2.click('button[type=submit]'); await pg2.wait_for_selector('#titulo-pagina', timeout=8000)
        ok('Depois da migração: entra sem pedir de novo o código', await pg2.locator('dialog[open] [data-guardei]').count()==0)
        await pg2.reload(); await pg2.wait_for_selector('#senha'); await pg2.click('[data-esqueci]'); await pg2.fill('#codigo',codm); await pg2.fill('#nova','maria123'); await pg2.fill('#repetir','maria123'); await pg2.click('dialog[open] button[type=submit]'); await pg2.wait_for_timeout(1800)
        ok('Depois da migração: o código recupera a senha', 'Senha nova criada' in await pg2.inner_text('dialog[open]'))
        ok('Sem erros de JavaScript', not errs, '; '.join(errs[:3]))
        await b.close()
    for r in R: print(*r)
    print(sum(r[0]=='PASS' for r in R),'passaram /',len(R))
asyncio.run(main())
