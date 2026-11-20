"""QA da Projeção do caixa no Extrato (o fim de um mês é o começo do seguinte).
Uso: python projecao.py [pasta-de-saida] [endereço]   (padrão: build em http://localhost:8765/)"""
import asyncio, sys, os, re, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from insumos import ir
from playwright.async_api import async_playwright
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
U = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8765/'
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

def reais(t):
    m = re.search(r'([-−–]?)\s*R\$\s*([-−–]?)\s*([\d.]+,\d{2})', t)
    return (-1 if (m.group(1) or m.group(2)) else 1) * float(m.group(3).replace('.', '').replace(',', '.'))

async def proj(pg):
    await pg.wait_for_selector('[data-projecao]')
    return reais(await pg.inner_text('[data-proj-inicial]')), reais(await pg.inner_text('[data-proj-final]'))

async def mes(pg, n):
    await pg.click(f'[data-mes="{n}"]'); await pg.wait_for_timeout(700)

async def lancar(pg, tipo, valor, dia, desc):
    await ir(pg, 'novo'); await pg.wait_for_timeout(300)
    await pg.check(f'[name=modo][value={tipo}]', force=True); await pg.wait_for_timeout(150)
    await pg.fill('#f-valor', valor); await pg.fill('#f-descricao', desc)
    await pg.fill('[name=vencimento]', dia)
    cat = pg.locator('select[name=categoria_id]')
    await cat.select_option(index=1)
    pago = pg.locator('[name=pago]')
    if await pago.count() and await pago.is_checked(): await pago.uncheck()
    await pg.click('button[type=submit]'); await pg.wait_for_timeout(800)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        await preparar(pg, U, exemplo=True); await pular_tour(pg)

        await ir(pg, 'extrato')
        i0, f0 = await proj(pg)
        await mes(pg, 1); i1, f1 = await proj(pg)
        ok('mês seguinte começa com o fim previsto do mês atual', abs(i1 - f0) < 0.01, (f0, i1))
        await mes(pg, 1); i2, f2 = await proj(pg)
        ok('e o outro começa com o fim do seguinte', abs(i2 - f1) < 0.01, (f1, i2))
        ok('dias futuros mostram o saldo previsto', await pg.locator('[data-previsto]').count() > 0)
        txt = await pg.inner_text('[data-projecao]')
        ok('saldo inicial aparece como herdado do mês anterior (previsto)', 'herdado de' in txt and 'previsto' in txt, txt[:200])
        ent = abs(reais(await pg.inner_text('[data-proj-entradas]'))); sai = abs(reais(await pg.inner_text('[data-proj-saidas]')))
        res = reais(await pg.inner_text('[data-proj-resultado]'))
        ok('resultado do mês = receitas − despesas, separado do saldo herdado', abs(res - (ent - sai)) < 0.01 and abs(f2 - (i2 + res)) < 0.01, (i2, ent, sai, res, f2))
        ok('avisa que o saldo final vira o inicial do mês seguinte', await pg.locator('[data-proj-proximo]').count() == 1)

        # um gasto em aberto daqui a 2 meses diminui o fim desse mês e o começo do seguinte
        await pg.evaluate("location.hash='#inicio'"); await pg.wait_for_timeout(300)
        dia = await pg.evaluate("""() => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() + 2, 15);
          return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-15'; }""")
        await lancar(pg, 'saida', '50000', dia, 'Gasto planejado QA')
        await ir(pg, 'extrato'); await pg.wait_for_timeout(300)
        # store.mes continua no mês escolhido (2 meses à frente)
        i2b, f2b = await proj(pg)
        ok('gasto planejado entra na projeção do mês', abs((f2 - f2b) - 500) < 0.01 and abs(i2b - i2) < 0.01, (f2, f2b))
        await mes(pg, 1); i3, _ = await proj(pg)
        ok('e leva o saldo menor para o mês seguinte', abs(i3 - f2b) < 0.01, (f2b, i3))
        await mes(pg, -1)
        await pg.locator('[data-projecao]').scroll_into_view_if_needed()
        await pg.screenshot(path=os.path.join(SAIDA, 'projecao.png'))

        # voltar ao mês atual: começa com o saldo real
        await pg.click('[data-mes="0"]'); await pg.wait_for_timeout(700)
        ia, fa = await proj(pg)
        ok('mês atual continua igual', abs(ia - i0) < 0.01 and abs(fa - f0) < 0.01, (i0, f0, ia, fa))
        txt = await pg.inner_text('[data-projecao]')
        ok('mês atual: saldo inicial real, herdado do mês anterior', 'herdado de' in txt and 'real' in txt, txt[:200])
        # mês que já passou: sem "projetado" e sem o aviso do mês seguinte
        await pg.click('[data-mes="-1"]'); await pg.wait_for_timeout(700)
        txt = await pg.inner_text('[data-projecao]')
        ok('mês passado mostra "Saldo final" (sem projeção)', 'Saldo final' in txt and 'projetado' not in txt and await pg.locator('[data-proj-proximo]').count() == 0, txt[:200])
        await pg.click('[data-mes="0"]'); await pg.wait_for_timeout(700)

        # filtrar uma conta: projeção só dela e sem faturas
        await pg.click('[data-filtro-contas] summary')
        await pg.locator('[data-filtro-contas] [data-conta-f]').first.check(); await pg.wait_for_timeout(300)
        await pg.click('#titulo-pagina')
        txt = await pg.inner_text('[data-projecao]')
        ok('com conta no filtro a projeção muda e não cita faturas', 'faturas' not in txt and (await proj(pg)) != (ia, fa), txt[:160])

        # celular
        await pg.set_viewport_size({'width': 390, 'height': 860}); await ir(pg, 'extrato'); await pg.wait_for_selector('[data-projecao]')
        larg = await pg.evaluate('document.documentElement.scrollWidth')
        ok('sem rolagem para o lado no celular', larg <= 390, larg)
        await pg.screenshot(path=os.path.join(SAIDA, 'projecao-celular.png'))
        ok('sem erros no console', not erros, erros[:3])
        await b.close()
    for r in R: print(*r)
    print(f"\n{sum(r[0] == 'PASS' for r in R)}/{len(R)} passaram")
    sys.exit(0 if all(r[0] == 'PASS' for r in R) else 1)

asyncio.run(main())
