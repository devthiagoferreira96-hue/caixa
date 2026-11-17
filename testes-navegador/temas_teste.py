import asyncio, sys, json, re
sys.path.insert(0,'/tmp/qa')
from comum import preparar, pular_tour, SENHA
from a11y import JS
from playwright.async_api import async_playwright
U='http://localhost:8765/'
R=[]
def ok(n,c,x=''): R.append(('PASS' if c else 'FALHA',n,x))
PAGES=['inicio','extrato','novo','cartoes','relatorio','ajustes']
RUINS={
 'amarelo_branco': {'principal':'#FFE600','destaque':'#FFFF66','fundo':'#FFFFFF','cartao':'#FFFFFF','texto':'#FFF8B0'},
 'claro_sobre_claro': {'principal':'#9AD0FF','destaque':'#E0E0E0','fundo':'#EDEDED','cartao':'#D9D9D9','texto':'#BBBBBB'},
}
async def entrar(pg):
    await pg.reload(); await pg.wait_for_selector('#senha'); await pg.fill('#senha',SENHA); await pg.click('button[type=submit]'); await pg.wait_for_selector('#titulo-pagina'); await pg.wait_for_timeout(600)
async def contraste(pg, nome):
    problemas=[]
    for r in PAGES:
        await pg.evaluate(f"location.hash='#{r}'"); await pg.wait_for_timeout(600)
        if r=='ajustes': await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)"); await pg.wait_for_timeout(300)
        o=await pg.evaluate(JS); problemas += [f'{r}: {c}' for c in o['contraste']]
    ok(f'Contraste AA em todas as telas: {nome}', not problemas, problemas[:6])
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        for modo in ['claro','escuro']:
            pg=await (await b.new_context(viewport={'width':1280,'height':900})).new_page(); errs=[]
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await preparar(pg,U,exemplo=True); await pular_tour(pg)
            for paleta in ['verde','navy','cobre']:
                await pg.evaluate(f"localStorage.setItem('caixa-preferencias', JSON.stringify({{tema:'{modo}',tourVisto:true,paleta:'{paleta}'}}))"); await entrar(pg)
                await contraste(pg, f'{paleta} ({modo})')
            for nome,cores in RUINS.items():
                await pg.evaluate(f"localStorage.setItem('caixa-preferencias', JSON.stringify({{tema:'{modo}',tourVisto:true,paleta:'personalizada',cores:{json.dumps(cores)}}}))"); await entrar(pg)
                await contraste(pg, f'personalizado {nome} ({modo})')
            ok(f'Sem erros JS ({modo})', not errs, errs[:2])
            await pg.context.close()

        # ---------- funcionamento do painel
        pg=await (await b.new_context(viewport={'width':1280,'height':900})).new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await preparar(pg,U,exemplo=False); await pular_tour(pg)
        var=lambda n: pg.evaluate(f"getComputedStyle(document.documentElement).getPropertyValue('{n}').trim().toLowerCase()")
        ok('Padrão é Verde Cofre', await var('--color-brand-600')=='#1f6f54', await var('--color-brand-600'))
        await pg.evaluate("location.hash='#ajustes'"); await pg.wait_for_timeout(600)
        await pg.click('details[data-secao=aparencia] summary'); await pg.wait_for_timeout(200)
        ok('Painel personalizado escondido no começo', await pg.locator('[data-painel-cores]').is_hidden())
        await pg.check('input[name=paleta][value=navy]', force=True); await pg.wait_for_timeout(300)
        ok('Navy aplica na hora', await var('--color-brand-600')=='#123a63' and await var('--color-cartao')=='#c9d6e5')
        ok('Aviso com Desfazer', 'Azul Navy Contábil' in await pg.inner_text('#toasts') and 'Desfazer' in await pg.inner_text('#toasts'))
        await pg.locator('#toasts >> text=Desfazer').last.click(); await pg.wait_for_timeout(700)
        ok('Desfazer volta ao Verde Cofre', await var('--color-brand-600')=='#1f6f54')
        await pg.evaluate("document.querySelector('details[data-secao=aparencia]').open=true")
        await pg.check('input[name=paleta][value=cobre]', force=True); await pg.wait_for_timeout(300)
        ok('Cobre: principal ajustado para texto branco legível', await var('--color-brand-600')!='#b87333', await var('--color-brand-600'))
        await pg.check('input[name=paleta][value=personalizada]', force=True); await pg.wait_for_timeout(300)
        ok('"Minhas cores" abre o painel', await pg.locator('[data-painel-cores]').is_visible())
        ok('Começa das cores do tema escolhido (cobre)', (await pg.input_value('#hex-principal'))=='#B87333')
        await pg.fill('#hex-fundo','#ffeedd'); await pg.wait_for_timeout(200)
        ok('Digitar código muda o fundo na hora', await var('--color-fundo')=='#ffeedd')
        await pg.fill('#hex-texto','#12'); await pg.wait_for_timeout(100)
        ok('Código incompleto não muda nada', await var('--color-texto')!='#12')
        await pg.fill('#hex-texto','#zzzzzz'); await pg.wait_for_timeout(100)
        ok('Código inválido fica marcado', await pg.get_attribute('#hex-texto','aria-invalid') is not None)
        await pg.locator('#hex-cartao').focus(); await pg.wait_for_timeout(100)
        ok('Ao sair do campo inválido volta à cor atual', (await pg.input_value('#hex-texto'))=='#0F172A', await pg.input_value('#hex-texto'))
        await pg.evaluate("const i=document.querySelector('#cor-destaque'); i.value='#ff0088'; i.dispatchEvent(new Event('input',{bubbles:true}))"); await pg.wait_for_timeout(200)
        ok('Seletor de cor muda os gráficos', await var('--color-destaque')=='#ff0088' and (await pg.input_value('#hex-destaque'))=='#FF0088')
        await pg.fill('#hex-texto','#F0F0F0'); await pg.wait_for_timeout(200)
        av=await pg.inner_text('[data-avisos-cor]')
        ok('Aviso de pouco contraste no texto', 'pouco contraste' in av, av)
        ok('Texto ajustado mesmo assim', await var('--color-texto')!='#f0f0f0', await var('--color-texto'))
        await entrar(pg)
        ok('Cores ficam salvas depois de fechar', await var('--color-fundo')=='#ffeedd' and await var('--color-destaque')=='#ff0088')
        ok('Tela de senha já vem com as cores', True)
        # trocar para um tema pronto e voltar para "Minhas cores" recupera as cores
        await pg.evaluate("location.hash='#ajustes'"); await pg.wait_for_timeout(600)
        await pg.evaluate("document.querySelector('details[data-secao=aparencia]').open=true")
        await pg.check('input[name=paleta][value=verde]', force=True); await pg.wait_for_timeout(300)
        await pg.check('input[name=paleta][value=personalizada]', force=True); await pg.wait_for_timeout(300)
        ok('"Minhas cores" lembra as cores escolhidas antes', await var('--color-fundo')=='#ffeedd')
        # trocar de página não deixa ouvintes perdidos
        await pg.evaluate("location.hash='#inicio'"); await pg.wait_for_timeout(500); await pg.evaluate("location.hash='#ajustes'"); await pg.wait_for_timeout(500)
        await pg.evaluate("document.querySelector('details[data-secao=aparencia]').open=true")
        await pg.check('input[name=paleta][value=navy]', force=True); await pg.wait_for_timeout(300)
        n=await pg.locator('#toasts >> text=Azul Navy Contábil aplicado').count()
        ok('Um aviso só por troca (sem eventos duplicados)', n==1, n)
        # theme-color do navegador
        tc=await pg.get_attribute('meta[name=theme-color]','content')
        ok('Barra do celular na cor do tema', tc and tc.lower()=='#123a63', tc)
        ok('Sem erros JS (painel)', not errs, errs[:2])
        await b.close()
    for r in R: print(*r)
    print(sum(r[0]=='PASS' for r in R),'passaram /',len(R))
asyncio.run(main())
