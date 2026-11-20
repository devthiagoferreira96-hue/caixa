"""QA: nota de insumos com dois produtores, cada um na sua conta (CNPJ ou CPF).
A conta fica em cada linha de produto e a parte de cada produtor vai para a conta corrente da conta dele.
Uso: python conta_por_produtor.py [pasta-de-saida]   (servidor do build em http://localhost:8765/)"""
import asyncio, sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from insumos import ir, ultimo_toast, limpar_toasts, adicionar
from playwright.async_api import async_playwright
U = 'http://localhost:8765/'
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))
limpo = lambda s: s.replace('\xa0', ' ')
D = 'dialog[open]'

async def linha(pg, n):
    return pg.locator(f'{D} [data-linha]').nth(n)

async def escolher(pg, n, campo, rotulo):
    li = await linha(pg, n)
    sel = li.locator(f'[data-c={campo}]')
    v = await sel.evaluate("(s, n) => [...s.options].find(o => o.text.startsWith(n))?.value", rotulo)
    await sel.select_option(v); await pg.wait_for_timeout(150)

async def conta_sel(pg, n):
    li = await linha(pg, n)
    return (await li.locator('[data-c=titular_id]').evaluate('s => s.options[s.selectedIndex].text')).split(' · ')[0]

async def conta_corrente(pg, conta):
    await ir(pg, 'conta-corrente'); await pg.wait_for_timeout(400)
    b = pg.locator('[data-conta]', has_text=conta)
    if await b.count(): await b.first.click(); await pg.wait_for_timeout(400)
    t = limpo(await pg.inner_text('#conteudo'))
    return t[t.find('Movimento de'):]  # só a tabela do movimento (os botões de cima têm o nome das duas contas)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        await preparar(pg, U, exemplo=False); await pular_tour(pg)
        await ir(pg, 'ajustes')
        await pg.click('[data-secao=modulos] summary'); await pg.check('[data-modulo-resina]'); await pg.wait_for_timeout(800)
        await ir(pg, 'resina-cadastros')
        await adicionar(pg, 'resina_titulares', {'nome': 'Conta Itacury', 'documento': '111.111.111-11'})
        await adicionar(pg, 'resina_titulares', {'nome': 'Conta Zeca', 'documento': '222.222.222-22'})
        await adicionar(pg, 'resina_produtores', {'nome': 'Itacury', 'arrendamento': 40})
        await adicionar(pg, 'resina_produtores', {'nome': 'Zeca', 'arrendamento': 40})
        await adicionar(pg, 'resina_produtos', {'nome': 'Pasta 16%', 'unidade': 'kg', 'valor_unitario': '550'})
        await adicionar(pg, 'resina_produtos', {'nome': 'Arame', 'unidade': 'm', 'valor_unitario': '1000'})

        # ---------- lançar a nota com dois produtores
        await ir(pg, 'insumos'); await limpar_toasts(pg)
        await pg.click('[data-lancar]'); await pg.wait_for_selector(f'{D} [data-c=titular_id]')
        ok('não tem mais a conta única da nota', await pg.locator(f'{D} #in-conta').count() == 0)
        ok('cada produto tem a sua conta', await pg.locator(f'{D} [data-linha] [data-c=titular_id]').count() == 1)
        await pg.fill(f'{D} #in-data', '2026-11-13'); await pg.fill(f'{D} #in-nota', 'NF 267')
        await escolher(pg, 0, 'produto_id', 'Pasta 16%'); await escolher(pg, 0, 'produtor_id', 'Itacury')
        ok('com duas contas e produtor novo, pede para escolher', await conta_sel(pg, 0) == 'Escolha…', await conta_sel(pg, 0))
        li = await linha(pg, 0)
        await li.locator('[data-c=quantidade]').fill('150'); await li.locator('[data-c=pct]').fill('50')
        await pg.click(f'{D} button[type=submit]'); await pg.wait_for_timeout(300)
        ok('sem conta: não salva e avisa', 'Escolha a conta' in limpo(await ultimo_toast(pg)) and await pg.locator(D).count() == 1)
        await escolher(pg, 0, 'titular_id', 'Conta Itacury')
        await pg.click(f'{D} [data-mais-linha]'); await pg.wait_for_timeout(150)
        ok('produto novo vem com o produtor e a conta do anterior', await conta_sel(pg, 1) == 'Conta Itacury')
        await escolher(pg, 1, 'produto_id', 'Arame'); await escolher(pg, 1, 'produtor_id', 'Zeca')
        ok('trocar o produtor não deixa a conta do outro', await conta_sel(pg, 1) == 'Escolha…', await conta_sel(pg, 1))
        await escolher(pg, 1, 'titular_id', 'Conta Zeca')
        li = await linha(pg, 1)
        await li.locator('[data-c=quantidade]').fill('20'); await li.locator('[data-c=pct]').fill('30')
        div = limpo(await pg.inner_text(f'{D} [data-divisao]'))
        ok('resumo: cada produtor na sua conta', 'Cobrado de Itacury (Conta Itacury · 111.111.111-11): R$ 412,50' in div and 'Cobrado de Zeca (Conta Zeca · 222.222.222-22): R$ 60,00' in div, div)
        await pg.screenshot(path=os.path.join(SAIDA, 'insumos-conta-por-produto.png'), full_page=True)
        await pg.click(f'{D} button[type=submit]'); await pg.wait_for_timeout(800)
        ok('lançada', await pg.locator(D).count() == 0, await ultimo_toast(pg))

        # ---------- conta corrente: cada parte na conta certa
        c = await conta_corrente(pg, 'Conta Itacury')
        ok('Conta Itacury: só a parte do Itacury (R$ 412,50)', '412,50' in c and 'Zeca' not in c and '60,00' not in c, c[:900])
        c = await conta_corrente(pg, 'Conta Zeca')
        ok('Conta Zeca: só a parte do Zeca (R$ 60,00)', '60,00' in c and 'Itacury' not in c and '412,50' not in c, c[:900])

        # ---------- "a receber" no Caixa: um para cada produtor, e ao receber o crédito cai na conta dele
        await ir(pg, 'extrato'); await pg.wait_for_timeout(400)
        z = pg.locator('#conteudo li', has_text='Zeca')
        ok('Extrato: a receber do Zeca', await z.count() == 1 and 'R$ 60,00' in limpo(await z.inner_text()))
        await z.locator('[data-pagar]').click(); await pg.wait_for_timeout(800)
        c = await conta_corrente(pg, 'Conta Zeca')
        ok('recebido do Zeca entra na Conta Zeca', 'Recebido no Caixa' in c, c[:900])
        c = await conta_corrente(pg, 'Conta Itacury')
        ok('e não na Conta Itacury', 'Recebido no Caixa' not in c, c[:900])

        # ---------- da próxima vez, a conta vem sozinha com o produtor
        await ir(pg, 'insumos'); await pg.click('[data-lancar]'); await pg.wait_for_selector(f'{D} [data-c=titular_id]')
        await escolher(pg, 0, 'produto_id', 'Arame'); await escolher(pg, 0, 'produtor_id', 'Zeca')
        ok('próxima nota: conta do Zeca vem sozinha', await conta_sel(pg, 0) == 'Conta Zeca', await conta_sel(pg, 0))
        await escolher(pg, 0, 'produtor_id', 'Itacury')
        ok('trocar para o Itacury traz a conta dele', await conta_sel(pg, 0) == 'Conta Itacury', await conta_sel(pg, 0))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        # ---------- editar a nota: abre com a conta de cada linha
        await pg.click('[data-entrega] >> text=Zeca'); await pg.wait_for_selector(f'{D} [data-c=titular_id]')
        ok('editar: cada linha com a sua conta', await conta_sel(pg, 0) == 'Conta Itacury' and await conta_sel(pg, 1) == 'Conta Zeca')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        # ---------- celular
        await pg.set_viewport_size({'width': 360, 'height': 780})
        await pg.click('[data-lancar]'); await pg.wait_for_selector(f'{D} [data-c=titular_id]')
        larg = await pg.locator(D).evaluate('d => d.scrollWidth <= d.clientWidth')
        ok('celular: sem rolagem para o lado', larg)
        await pg.screenshot(path=os.path.join(SAIDA, 'insumos-conta-celular.png'))
        ok('sem erros no console', not erros, erros)
        await b.close()
    for r in R: print(r[0], r[1], '' if r[0] == 'PASS' else r[2])
    print(f"{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")

if __name__ == '__main__':
    asyncio.run(main())
