import asyncio, json, sys
from playwright.async_api import async_playwright
import sys as _s; _s.path.insert(0,'/tmp/qa')
from comum import pular_tour, guardar_codigo, SENHA
U='http://localhost:8765/'
PALAVRA='Manutençãodoequipamentodeirrigaçãodafazendasantaluziaregiãonorte'  # palavra enorme sem espaço
DESC=(PALAVRA+' com texto comprido para testar quebra de linha e corte no limite '*3)[:120]
N60=(PALAVRA*2)[:60]; N40=(PALAVRA)[:40]
CHECK=r"""(nome)=>{
 const vw=innerWidth, prob=[];
 const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('.sr-only')};
 if(document.documentElement.scrollWidth>vw+1) prob.push(`[${nome}] PÁGINA ROLA DE LADO: ${document.documentElement.scrollWidth}px > ${vw}px`);
 document.querySelectorAll('body *').forEach(e=>{
   if(!vis(e)||e.closest('svg')) return;
   const s=getComputedStyle(e), r=e.getBoundingClientRect();
   const corta=['hidden','auto','scroll','clip'].includes(s.overflowX);
   if(r.right>vw+1 && !e.closest('[class*=overflow-x]')) prob.push(`[${nome}] SAI DA TELA: <${e.tagName.toLowerCase()} class="${(e.className+'').slice(0,40)}"> "${(e.textContent||'').trim().slice(0,30)}" right=${Math.round(r.right)}`);
   if(!corta && e.scrollWidth>e.clientWidth+2 && e.clientWidth>0 && !['INPUT','SELECT','TEXTAREA'].includes(e.tagName))
     prob.push(`[${nome}] TEXTO VAZANDO: <${e.tagName.toLowerCase()} class="${(e.className+'').slice(0,40)}"> "${(e.textContent||'').trim().slice(0,30)}" ${e.scrollWidth}>${e.clientWidth}`);
   if(['INPUT','SELECT','TEXTAREA'].includes(e.tagName) && e.type!=='checkbox' && e.type!=='radio' && parseFloat(s.fontSize)<16) prob.push(`[${nome}] ZOOM NO IPHONE: campo ${e.name||e.id} com letra ${s.fontSize}`);
 });
 return [...new Set(prob)];
}"""
async def main(dev, grande=False):
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        d=dict(p.devices[dev]); d.pop('default_browser_type',None)
        ctx=await b.new_context(**d); pg=await ctx.new_page(); errs=[]; probs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        tag=dev.replace(' ','_')+('_grande' if grande else '')
        async def ver(nome, shot=True):
            probs.extend(await pg.evaluate(CHECK, nome))
            if shot: await pg.screenshot(path=f'/tmp/mob/{tag}_{nome}.png', full_page=True)
        async def ir(r): await pg.goto(U+'#'+r); await pg.wait_for_timeout(600)
        async def abrir_tudo(): await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        await pg.goto(U); await pg.wait_for_selector('#usuario', timeout=10000)
        await pg.fill('#usuario', N40); await ver('primeiro_acesso')
        await pg.fill('#senha', SENHA); await pg.fill('#confirmar', SENHA); await pg.check('[name=exemplo]')
        await pg.click('button[type=submit]'); await pg.wait_for_selector('dialog[open] [data-guardei]', timeout=10000); await pg.wait_for_timeout(300)
        await ver('codigo_recuperacao')
        await guardar_codigo(pg); await pg.wait_for_selector('#titulo-pagina', timeout=10000); await pg.wait_for_timeout(800)
        await ver('tour')
        await pular_tour(pg)
        if grande:
            await pg.evaluate("localStorage.setItem('caixa-preferencias', JSON.stringify({tema:'auto',textoGrande:true,tourVisto:true}))"); await pg.reload(); await pg.wait_for_selector('#senha'); await pg.fill('#senha', SENHA); await pg.click('button[type=submit]'); await pg.wait_for_selector('#titulo-pagina'); await pg.wait_for_timeout(600)
        # ---- cadastros com nomes no limite
        await ir('ajustes'); await abrir_tudo()
        for tab in ['contas','cartoes','categorias','pessoas']:
            await abrir_tudo()
            f=pg.locator(f'form[data-tabela={tab}][data-id=""]')
            await f.locator('input[name=nome]').fill(N60)
            if tab=='contas': await f.locator('input[name=saldo_inicial]').type('9999999999')
            if tab=='cartoes': await f.locator('input[name=dia_fechamento]').fill('31'); await f.locator('input[name=dia_vencimento]').fill('31')
            if tab=='categorias': await f.locator('input[name=grupo]').fill('Grupo'+PALAVRA[:30])
            await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(500)
        await abrir_tudo(); await pg.wait_for_timeout(200); await ver('ajustes')
        # ---- lançamento no limite
        await ir('novo'); await pg.click('#f-valor'); await pg.keyboard.type('9999999999'*2)
        await pg.fill('#f-descricao', DESC); await pg.select_option('#f-categoria', label=N60); await pg.select_option('#f-conta', label=N60)
        await pg.fill('#f-pessoa', N60); await pg.uncheck('[name=pago]'); await pg.select_option('#f-repetir','meses'); await pg.fill('#f-meses','24')
        await ver('novo_preenchido')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(700)
        await ver('novo_toast', shot=True)
        # cartão no limite
        await pg.click('label:has-text("Cartão")'); await pg.click('#f-valor'); await pg.keyboard.type('9999999999')
        await pg.fill('#f-descricao', DESC); await pg.select_option('#f-categoria', label=N60); await pg.select_option('#f-cartao', label=N60)
        await pg.select_option('#f-parcelas','24'); await pg.fill('#f-sub', N60); await pg.wait_for_timeout(200)
        await ver('novo_cartao')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(500)
        # mesmo valor e descrição do lançamento anterior -> aviso de repetido
        await ver('dialogo_parecido'); await pg.click('dialog >> text=Lançar mesmo assim'); await pg.wait_for_timeout(600)
        # ---- telas
        for r in ['inicio','extrato','cartoes','relatorio','ajuda']:
            await ir(r)
            if r=='cartoes':
                for _ in range(2):  # a compra (fecha 31) cai neste mês ou no próximo
                    if PALAVRA[:20] in await pg.inner_text('#conteudo'): break
                    await pg.click('[data-mes="1"]'); await pg.wait_for_timeout(500)
            await ver(r)
            if r=='inicio':
                btn=pg.locator('[data-categoria]:not([disabled])').first
                await btn.click(); await pg.wait_for_timeout(300); await ver('dialogo_categoria'); await pg.keyboard.press('Escape')
            if r=='extrato':
                await pg.locator('[data-editar]', has_text=PALAVRA[:15]).first.click(); await pg.wait_for_timeout(300); await ver('dialogo_editar')
                await pg.click('dialog [data-excluir]'); await pg.wait_for_timeout(300); await ver('dialogo_serie'); await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
                await pg.locator('[data-pagar]').first.click(); await pg.wait_for_timeout(400); await ver('toast_pago', shot=False)
            if r=='cartoes':
                b2=pg.locator('[data-pagar-fatura]').first
                if await b2.count(): await b2.click(); await pg.wait_for_timeout(300); await ver('dialogo_fatura'); await pg.keyboard.press('Escape')
        # backup e apagar tudo (diálogos)
        await ir('ajustes'); await abrir_tudo(); await pg.click('[data-trocar-senha]'); await pg.wait_for_timeout(300); await ver('dialogo_senha'); await pg.keyboard.press('Escape')
        await pg.click('[data-apagar-tudo]'); await pg.wait_for_timeout(300); await ver('dialogo_apagar'); await pg.keyboard.press('Escape')
        # tela de senha
        await pg.locator('[data-bloquear]:visible').first.click(); await pg.wait_for_selector('#senha'); await ver('senha')
        await pg.click('[data-esqueci]'); await pg.wait_for_timeout(300); await ver('dialogo_esqueci')
        await b.close()
        return probs, errs
async def run():
    devs=sys.argv[1:] or ['iPhone SE','iPhone 15','iPhone 15 Pro Max','Galaxy S8','Pixel 7']
    tudo={}
    for dv in devs:
        grande = dv.endswith('+grande'); nome=dv.replace('+grande','')
        probs,errs=await main(nome, grande)
        tudo[dv]={'problemas':probs,'erros':errs}
    print(json.dumps(tudo, ensure_ascii=False, indent=1))
asyncio.run(run())
