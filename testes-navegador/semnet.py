import asyncio, sys
sys.path.insert(0,'/tmp/qa')
from comum import preparar, pular_tour, SENHA
from playwright.async_api import async_playwright
U='http://localhost:8765/'
R=[]
def ok(n,c,x=''): R.append(('PASS' if c else 'FALHA',n,x))
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx=await b.new_context(viewport={'width':390,'height':844}); pg=await ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        await preparar(pg,U); await pular_tour(pg); await pg.wait_for_timeout(800)
        await pg.reload(); await pg.wait_for_selector('#senha')
        ok('Service worker controlando a página', await pg.evaluate("!!navigator.serviceWorker.controller"))
        await ctx.set_offline(True)
        await pg.reload(); await pg.wait_for_selector('#senha', timeout=10000)
        ok('Sem internet: abre a tela de senha', 'Olá, Thiago' in await pg.inner_text('body'))
        await pg.fill('#senha',SENHA); await pg.click('button[type=submit]'); await pg.wait_for_selector('#titulo-pagina', timeout=10000)
        ok('Sem internet: entra no sistema', True)
        await pg.goto(U+'#novo'); await pg.wait_for_timeout(500)
        await pg.fill('#f-valor','999'); await pg.fill('#f-descricao','Pão da manhã'); await pg.select_option('#f-categoria',label='Restaurantes/Padarias'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(600)
        await pg.goto(U+'#extrato'); await pg.wait_for_timeout(600)
        ok('Sem internet: lança e aparece no extrato', await pg.locator('[data-editar]', has_text='Pão da manhã').count()==1)
        ok('Nenhum aviso de "sem internet" (não precisa)', 'internet' not in (await pg.locator('#toasts').inner_text()).lower())
        await pg.close(); pg=await ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto(U); await pg.wait_for_selector('#senha', timeout=10000); await pg.fill('#senha',SENHA); await pg.click('button[type=submit]'); await pg.wait_for_selector('#titulo-pagina')
        await pg.goto(U+'#extrato'); await pg.wait_for_timeout(600)
        ok('Fechar e abrir de novo sem internet: dado continua lá', await pg.locator('[data-editar]', has_text='Pão da manhã').count()==1)
        ok('Sem erros de JavaScript', not errs, '; '.join(errs[:3]))
        await b.close()
    for r in R: print(*r)
    print(sum(r[0]=='PASS' for r in R),'passaram /',len(R))
asyncio.run(main())
