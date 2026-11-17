import asyncio, sys
sys.path.insert(0,'/tmp/qa')
from comum import preparar, pular_tour, SENHA
from playwright.async_api import async_playwright
U='http://localhost:8765/'
R=[]
def ok(n,c,x=''): R.append(('PASS' if c else 'FALHA',n,x))
RECT="(s)=>{const r=document.querySelector(s).getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*10)/10)}"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        pg=await (await b.new_context(viewport={'width':1280,'height':900})).new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await preparar(pg,U,exemplo=True); await pular_tour(pg)
        for rota in ['extrato','cartoes','relatorio','ajustes','ajuda']:
            sel=f'aside a[data-nav={rota}]'
            antes_txt=await pg.evaluate(RECT, sel+' span:not(.ani-icone)')
            antes_ic=await pg.evaluate(RECT, sel+' .ani-icone')
            await pg.hover(sel); await pg.wait_for_timeout(60)
            ativo=await pg.evaluate(f"document.querySelector('{sel} .ani-icone').classList.contains('ani-ativo')")
            # amostra durante a animação
            mov_txt=set(); mov_ic=set(); animado=set()
            for _ in range(8):
                mov_txt.add(tuple(await pg.evaluate(RECT, sel+' span:not(.ani-icone)')))
                mov_ic.add(tuple(await pg.evaluate(RECT, sel+' .ani-icone')))
                animado.add(await pg.evaluate(f"""(()=>{{const s=document.querySelector('{sel} svg');return [...s.querySelectorAll('*')].map(e=>getComputedStyle(e).transform+getComputedStyle(e).strokeDashoffset+(e.getAttribute('x1')||'')).join()}})()"""))
                await pg.wait_for_timeout(70)
            ok(f'{rota}: ícone anima ao passar o mouse', ativo)
            ok(f'{rota}: desenho se mexe de verdade', len(animado)>1, len(animado))
            ok(f'{rota}: texto não sai do lugar', mov_txt=={tuple(antes_txt)}, mov_txt)
            ok(f'{rota}: caixa do ícone não muda de tamanho', mov_ic=={tuple(antes_ic)}, mov_ic)
            await pg.mouse.move(700,500); await pg.wait_for_timeout(1100)
        # sliders voltam ao lugar
        x=await pg.evaluate("[...document.querySelectorAll('aside ul[data-menu=caixa] a[data-nav=ajustes] line')].map(l=>l.getAttribute('x1')+','+l.getAttribute('x2')).join(' ')")
        ok('Ajustes: controles voltam à posição original', x=='21,14 10,3 14,14 21,12 8,3 8,8 21,16 12,3 16,16', x)
        # cor do texto igual no hover e no item ativo
        c1=await pg.evaluate("getComputedStyle(document.querySelector('aside a[data-nav=extrato] span:not(.ani-icone)')).color")
        await pg.hover('aside a[data-nav=extrato]'); await pg.wait_for_timeout(300)
        c2=await pg.evaluate("getComputedStyle(document.querySelector('aside a[data-nav=extrato] span:not(.ani-icone)')).color")
        ok('Texto não muda de cor no hover', c1==c2, (c1,c2))
        await pg.click('aside a[data-nav=extrato]'); await pg.wait_for_timeout(500)
        c3=await pg.evaluate("getComputedStyle(document.querySelector('aside a[data-nav=extrato] span:not(.ani-icone)')).color")
        w3=await pg.evaluate("getComputedStyle(document.querySelector('aside a[data-nav=extrato] span:not(.ani-icone)')).fontWeight")
        ok('Item ativo: texto com a mesma cor e peso', c3==c1 and w3=='500', (c3,w3))
        ic=await pg.evaluate("getComputedStyle(document.querySelector('aside a[data-nav=extrato] .ani-icone')).color")
        ok('Item ativo: só o ícone fica na cor do tema', ic!=c1, ic)
        # "+" gira no hover
        await pg.hover('aside a[data-nav=novo]'); await pg.wait_for_timeout(700)
        t=await pg.evaluate("getComputedStyle(document.querySelector('aside a[data-nav=novo] .ani-gira')).transform")
        ok('"+" do Novo lançamento gira', t not in ('none',''), t)
        # desligar em Ajustes
        await pg.evaluate("location.hash='#ajustes'"); await pg.wait_for_timeout(600)
        await pg.evaluate("document.querySelector('details[data-secao=aparencia]').open=true")
        await pg.uncheck('[data-animacoes]'); await pg.wait_for_timeout(200)
        await pg.mouse.move(5,5); await pg.hover('aside a[data-nav=cartoes]'); await pg.wait_for_timeout(60)
        ok('Desligado em Aparência: não anima', not await pg.evaluate("document.querySelector('aside a[data-nav=cartoes] .ani-icone').classList.contains('ani-ativo')"))
        await pg.reload(); await pg.wait_for_selector('#senha'); await pg.fill('#senha',SENHA); await pg.click('button[type=submit]'); await pg.wait_for_selector('#titulo-pagina')
        ok('Preferência fica salva', await pg.evaluate("document.documentElement.classList.contains('sem-animacao')"))
        ok('Sem erros JS', not errs, errs[:2])
        # reduzir movimento do sistema
        ctx=await b.new_context(viewport={'width':1280,'height':900}, reduced_motion='reduce'); pg2=await ctx.new_page()
        await preparar(pg2,U,exemplo=False); await pular_tour(pg2)
        await pg2.hover('aside a[data-nav=relatorio]'); await pg2.wait_for_timeout(60)
        ok('"Reduzir movimento" do aparelho: não anima', not await pg2.evaluate("document.querySelector('aside a[data-nav=relatorio] .ani-icone').classList.contains('ani-ativo')"))
        # celular: toque anima e texto parado
        ctx3=await b.new_context(**p.devices['iPhone 15']); pg3=await ctx3.new_page()
        await preparar(pg3,U,exemplo=False); await pular_tour(pg3)
        antes=await pg3.evaluate(RECT, 'nav a.nav-baixo[data-nav=cartoes] span:not(.ani-icone)')
        await pg3.tap('nav a.nav-baixo[data-nav=cartoes]'); await pg3.wait_for_timeout(250)
        depois=await pg3.evaluate(RECT, 'nav a.nav-baixo[data-nav=cartoes] span:not(.ani-icone)')
        ok('Celular: toque troca de tela e texto da barra fica parado', antes==depois and 'cartoes' in pg3.url, (antes,depois))
        await b.close()
    for r in R: print(*r)
    print(sum(r[0]=='PASS' for r in R),'passaram /',len(R))
asyncio.run(main())
