"""QA do filtro de contas do Extrato com mais de uma conta marcada.
Uso: python filtro_contas.py [pasta-de-saida]   (servidor do build em http://localhost:8765/)"""
import asyncio, sys, os, re, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from insumos import ir
from playwright.async_api import async_playwright
U = 'http://localhost:8765/'
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

MENU = '[data-filtro-contas]'

async def quantos(pg):
    t = await pg.inner_text('#resultado dl')
    m = re.search(r'\((\d+) lançamentos?\)', t)
    return int(m.group(1)) if m else 0

async def marcar(pg, nome, sim=True):
    if not await pg.locator(MENU).evaluate('d => d.open'): await pg.click(f'{MENU} summary')
    cx = pg.locator(MENU).get_by_role('checkbox', name=re.compile('^' + re.escape(nome) + r'( \(fora d[eo] (uso|saldo)\))?$'))
    await (cx.check() if sim else cx.uncheck()); await pg.wait_for_timeout(200)

async def todas(pg):
    if not await pg.locator(MENU).evaluate('d => d.open'): await pg.click(f'{MENU} summary')
    await pg.check(f'{MENU} [data-conta-todas]'); await pg.wait_for_timeout(200)

async def faturas(pg):
    return await pg.locator('#resultado [data-pagar^="fatura:"]').count()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        await preparar(pg, U, exemplo=True); await pular_tour(pg)
        await ir(pg, 'extrato'); await pg.wait_for_selector(MENU)

        nomes = [t.strip() for t in await pg.locator(f'{MENU} [data-conta-f]').evaluate_all('xs => xs.map(x => x.closest("label").textContent)')]
        ok('menu lista as contas', len(nomes) >= 2, nomes)
        ok('começa em "Todas as contas"', (await pg.inner_text(f'{MENU} [data-contas-rotulo]')) == 'Todas as contas')
        todos = await quantos(pg)
        fat = await faturas(pg)
        a, b2 = nomes[0], nomes[1]

        await marcar(pg, a)
        n_a = await quantos(pg)
        ok('filtrando: a fatura do cartão a pagar continua', fat > 0 and await faturas(pg) == fat, (fat, await faturas(pg)))
        ok('uma conta: rótulo com o nome', (await pg.inner_text(f'{MENU} [data-contas-rotulo]')) == a)
        ok('"Todas as contas" desmarca sozinho', not await pg.locator(f'{MENU} [data-conta-todas]').is_checked())
        ok('menu continua aberto ao marcar', await pg.locator(MENU).evaluate('d => d.open'))
        await marcar(pg, b2)
        n_ab = await quantos(pg)
        ok('duas contas: rótulo com os dois nomes', (await pg.inner_text(f'{MENU} [data-contas-rotulo]')) == f'{a}, {b2}')
        await marcar(pg, a, False)
        n_b = await quantos(pg)
        ok('duas contas mostram a soma das duas (a fatura sem conta, uma vez)', n_ab == n_a + n_b - fat and n_ab <= todos, (todos, n_a, n_b, n_ab))
        await marcar(pg, a)
        titulos = await pg.locator('#resultado h2 [title^="Saldo"]').evaluate_all('xs => xs.map(x => x.title)')
        ok('saldo do dia fala das contas escolhidas', not titulos or 'contas escolhidas' in titulos[0], titulos[:1])
        await pg.screenshot(path=os.path.join(SAIDA, 'extrato-filtro-contas.png'))

        # fechar: tocar fora e Esc
        await pg.click('#titulo-pagina'); await pg.wait_for_timeout(150)
        ok('fecha ao tocar fora', not await pg.locator(MENU).evaluate('d => d.open'))
        await pg.click(f'{MENU} summary'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
        ok('fecha com Esc e volta o foco', not await pg.locator(MENU).evaluate('d => d.open')
           and await pg.evaluate("document.activeElement.matches('[data-filtro-contas] summary')"))

        # continua escolhido ao sair e voltar
        await ir(pg, 'extrato'); await pg.wait_for_selector(MENU)
        ok('filtro guardado ao voltar para o Extrato', await quantos(pg) == n_ab and (await pg.inner_text(f'{MENU} [data-contas-rotulo]')) == f'{a}, {b2}')

        # "Todas as contas" limpa
        await todas(pg)
        ok('"Todas as contas" volta tudo', await quantos(pg) == todos and (await pg.inner_text(f'{MENU} [data-contas-rotulo]')) == 'Todas as contas'
           and await pg.locator(f'{MENU} [data-conta-f]:checked').count() == 0)

        # combinado com a busca: "Limpar filtros" limpa as contas também
        await marcar(pg, a)
        await pg.fill('#f-busca', 'zzz-nada-assim'); await pg.wait_for_timeout(200)
        ok('fecha quando o foco vai para a busca', not await pg.locator(MENU).evaluate('d => d.open'))
        await pg.click('[data-limpar]'); await pg.wait_for_timeout(800)
        ok('"Limpar filtros" limpa as contas', await quantos(pg) == todos and (await pg.inner_text(f'{MENU} [data-contas-rotulo]')) == 'Todas as contas')

        # conta fora do saldo (Ajustes > "No saldo" desmarcado): some do Extrato até ser marcada no filtro
        await ir(pg, 'ajustes')
        sec = pg.locator('[data-secao=contas]')
        if not await sec.evaluate('e=>e.open'): await sec.locator('summary').click()
        f = sec.locator('form[data-tabela=contas]').filter(has=pg.locator(f'[name=nome][value="{a}"]'))
        await f.locator('[name=no_saldo]').uncheck(); await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(600)
        await ir(pg, 'extrato'); await pg.wait_for_selector(MENU)
        ok('sem filtro: conta fora do saldo não aparece', await quantos(pg) == todos - (n_a - fat) and (await pg.inner_text(f'{MENU} [data-contas-rotulo]')) == 'Contas do saldo', (await quantos(pg), todos, n_a))
        ok('sem filtro: fatura do cartão continua', await faturas(pg) == fat)
        rot = next((t for t in await pg.locator(f'{MENU} [data-conta-f]').evaluate_all('xs => xs.map(x => x.closest("label").textContent.trim())') if t.startswith(a)), '')
        ok('menu marca "(fora do saldo)"', rot == f'{a} (fora do saldo)', rot)
        await marcar(pg, a)
        ok('marcando no filtro, ela aparece', await quantos(pg) == n_a, (await quantos(pg), n_a))
        await todas(pg); await pg.keyboard.press('Escape')
        await ir(pg, 'ajustes')
        if not await sec.evaluate('e=>e.open'): await sec.locator('summary').click()
        await f.locator('[name=no_saldo]').check(); await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(600)

        # conta fora de uso: continua no menu, no fim, e dá para somar o histórico dela
        await ir(pg, 'ajustes')
        if not await sec.evaluate('e=>e.open'): await sec.locator('summary').click()
        f = sec.locator('form[data-tabela=contas]').filter(has=pg.locator(f'[name=nome][value="{b2}"]'))
        await f.locator('[name=ativa]').uncheck(); await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(600)
        await ir(pg, 'extrato'); await pg.wait_for_selector(MENU)
        ultima = (await pg.locator(f'{MENU} [data-conta-f]').evaluate_all('xs => xs.map(x => x.closest("label").textContent.trim())'))[-1]
        ok('conta fora de uso aparece no fim do menu', ultima.startswith(b2) and '(fora de uso)' in ultima, ultima)
        await marcar(pg, a, False); await marcar(pg, b2)
        ok('conta fora de uso: dá para filtrar só ela', await quantos(pg) == n_b, (await quantos(pg), n_b))
        await todas(pg); await pg.keyboard.press('Escape')

        # celular
        await pg.set_viewport_size({'width': 360, 'height': 780}); await pg.wait_for_timeout(300)
        await marcar(pg, a); await marcar(pg, b2)
        larg = await pg.evaluate('document.documentElement.scrollWidth')
        caixa = await pg.locator(f'{MENU} fieldset').bounding_box()
        ok('celular: sem rolagem para o lado e menu cabe na tela', larg <= 360 and caixa['x'] >= 0 and caixa['x'] + caixa['width'] <= 360, (larg, caixa))
        alturas = await pg.locator(f'{MENU} label').evaluate_all('xs => xs.map(x => x.getBoundingClientRect().height)')
        ok('celular: opções com altura de toque', min(alturas) >= 44, alturas)
        await pg.screenshot(path=os.path.join(SAIDA, 'extrato-filtro-contas-celular.png'))

        await pg.emulate_media(color_scheme='dark'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=os.path.join(SAIDA, 'extrato-filtro-contas-escuro.png'))
        ok('sem erros no console', not erros, erros)
        await b.close()
    for r in R: print(r[0], r[1], '' if r[0] == 'PASS' else r[2])
    print(f"{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")

asyncio.run(main())
