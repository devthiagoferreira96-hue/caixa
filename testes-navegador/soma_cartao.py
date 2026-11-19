"""QA da seleção para somar compras na tela Cartões (igual à do Extrato).
Uso: python soma_cartao.py [pasta-de-saida]   (servidor do build em http://localhost:8765/)"""
import asyncio, sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from recorrencia_cartao import ir, mes, conteudo, novo_cartao
from playwright.async_api import async_playwright
U = 'http://localhost:8765/'
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

async def barra(pg): return (await pg.inner_text('#barra-soma')).replace('\xa0', ' ')
async def marcar(pg, desc):
    await pg.locator('#conteudo li[data-parcela]', has_text=desc).first.locator('[data-sel]').check(); await pg.wait_for_timeout(150)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        pg = await (await b.new_context(viewport={'width': 1280, 'height': 900})).new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        await preparar(pg, U, exemplo=False); await pular_tour(pg)
        for v, d in [('10000', 'Mercado do mês'), ('5000', 'Farmácia'), ('2550', 'Padaria')]:
            await novo_cartao(pg, 'compra', v, d)
        await novo_cartao(pg, 'estorno', '3000', 'Estorno da farmácia')
        await ir(pg, 'cartoes')
        for n in range(4):  # a fatura em que as compras de hoje caíram
            await mes(pg, n)
            if 'Mercado do mês' in await conteudo(pg): break

        ok('botão Selecionar para somar', await pg.locator('[data-sel-entrar]').is_visible())
        ok('caixinhas escondidas antes', not await pg.locator('[data-sel]').first.is_visible())
        await pg.click('[data-sel-entrar]'); await pg.wait_for_timeout(200)
        ok('caixinhas aparecem', await pg.locator('[data-sel]').first.is_visible() and not await pg.locator('[data-sel-entrar]').is_visible())
        ok('barra pede para marcar', 'Marque as compras' in await barra(pg))
        await marcar(pg, 'Mercado do mês'); await marcar(pg, 'Farmácia')
        t = await barra(pg)
        ok('2 compras: soma R$ 150', '2 selecionadas' in t and 'Soma: R$ 150,00' in t, t)
        ok('linha marcada fica destacada', 'bg-brand-50/70' in (await pg.locator('li[data-parcela]', has_text='Farmácia').first.get_attribute('class')))
        await marcar(pg, 'Estorno da farmácia')
        t = await barra(pg)
        ok('reembolso desconta: 150 − 30 = 120', 'R$ 150,00' in t and '− R$ 30,00 reembolso' in t and '= R$ 120,00' in t, t)
        cx = pg.locator('[data-sel-cartao]:visible').first
        ok('caixinha do cartão meio marcada', await cx.evaluate('c => c.indeterminate'))
        await cx.check(); await pg.wait_for_timeout(150)
        t = await barra(pg)
        ok('cartão inteiro: 4 itens = R$ 145,50', '4 selecionadas' in t and '= R$ 145,50' in t, t)
        # busca: o marcado escondido continua na soma e é avisado
        await pg.fill('#c-busca', 'padaria'); await pg.wait_for_timeout(300)
        t = await barra(pg)
        ok('busca: avisa os fora da busca', '(3 fora da busca)' in t, t)
        await cx.uncheck(); await pg.wait_for_timeout(150)
        t = await barra(pg)
        ok('caixinha do cartão com busca: só tira a encontrada', '3 selecionadas' in t and 'Padaria' not in t, t)
        await pg.fill('#c-busca', ''); await pg.wait_for_timeout(300)
        # editar uma compra e voltar mantém a seleção
        await pg.evaluate("location.hash='#inicio'"); await pg.wait_for_timeout(300)
        await pg.evaluate("location.hash='#cartoes'"); await pg.wait_for_timeout(700)
        t = await barra(pg)
        ok('voltar para a tela mantém a seleção', '3 selecionadas' in t and await pg.locator('li[data-parcela]', has_text='Farmácia').first.locator('[data-sel]').is_checked(), t)
        await pg.screenshot(path=os.path.join(SAIDA, 'cartoes-soma.png'))
        await pg.click('[data-sel-limpar]'); await pg.wait_for_timeout(150)
        ok('Limpar zera', 'Marque as compras' in await barra(pg) and not await pg.locator('[data-sel]:checked').count())
        await pg.click('[data-sel-sair]'); await pg.wait_for_timeout(150)
        ok('Concluir esconde a barra e as caixinhas', (await barra(pg)).strip() == '' and not await pg.locator('[data-sel]').first.is_visible())
        # celular
        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(300)
        await pg.click('[data-sel-entrar]'); await marcar(pg, 'Mercado do mês')
        ok('celular: sem rolagem para o lado', await pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        ok('celular: barra visível', await pg.locator('#barra-soma [data-sel-sair]').is_visible())
        await pg.screenshot(path=os.path.join(SAIDA, 'cartoes-soma-celular.png'))
        ok('sem erros na página', not erros, erros)
        await b.close()
    for r in R:
        print(*r)
    print(f"{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")

asyncio.run(main())
