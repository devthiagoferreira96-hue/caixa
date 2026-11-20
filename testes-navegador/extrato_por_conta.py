"""QA do Extrato separado por conta dentro de cada dia (com transferência entre contas).
Uso: python extrato_por_conta.py [pasta-de-saida] [endereço]   (padrão: build em http://localhost:8765/)"""
import asyncio, sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from insumos import ir
from playwright.async_api import async_playwright
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
U = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8765/'
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

# para cada dia: lista de grupos [(conta_id, nome, [textos dos itens])]
LER = """() => [...document.querySelectorAll('#resultado section[aria-label]')].map(s => ({
  dia: s.getAttribute('aria-label'),
  grupos: [...s.querySelectorAll('[data-grupo-conta]')].map(g => ({
    id: g.dataset.grupoConta, nome: g.querySelector('h3').innerText.split('\\n')[0].trim(),
    saldo: !!g.querySelector('h3 [title^="Saldo"]'),
    itens: [...g.querySelectorAll('li')].map(li => li.innerText) })),
  soltos: s.querySelectorAll('ul.card > li').length }))"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        await preparar(pg, U, exemplo=True); await pular_tour(pg)

        await ir(pg, 'extrato'); await pg.wait_for_selector('#resultado section')
        dias = await pg.evaluate(LER)
        ok('dias com grupos por conta', dias and all(d['grupos'] for d in dias), dias[:1])
        repetida = [d['dia'] for d in dias if len({g['id'] for g in d['grupos']}) != len(d['grupos'])]
        ok('nenhuma conta aparece duas vezes no mesmo dia', not repetida, repetida)
        ok('nenhum lançamento fora de um grupo', all(d['soltos'] == 0 for d in dias))
        varias = [d for d in dias if len(d['grupos']) >= 2]
        ok('existe dia com mais de uma conta', bool(varias))
        def item_da_conta(g):
            if not g['id']: return all('Fatura' in t for t in g['itens'])
            return all(g['nome'] in t for t in g['itens'])
        errados = [(d['dia'], g['nome']) for d in dias for g in d['grupos'] if not item_da_conta(g)]
        ok('cada item está no grupo da sua conta', not errados, errados[:3])
        ok('faturas a pagar ficam por último no dia', all(d['grupos'][-1]['id'] == '' for d in dias if any(not g['id'] for g in d['grupos'])))

        # transferência: as duas pontas, cada uma no grupo da sua conta
        await ir(pg, 'novo'); await pg.wait_for_timeout(500)
        await pg.check('[name=modo][value=transferencia]', force=True); await pg.wait_for_timeout(150)
        opcoes = await pg.locator('[name=transf_de] option').evaluate_all('os => os.map(o => o.textContent.trim()).filter(Boolean)')
        a, b2 = opcoes[0], opcoes[1]
        await pg.fill('#f-valor', '12345')
        await pg.select_option('[name=transf_de]', label=a); await pg.select_option('[name=transf_para]', label=b2)
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)
        await ir(pg, 'extrato'); await pg.wait_for_selector('#resultado section')
        dias = await pg.evaluate(LER)
        pontas = [(d['dia'], g['nome'], t) for d in dias for g in d['grupos'] for t in g['itens'] if '123,45' in t]
        ok('transferência aparece duas vezes', len(pontas) == 2, pontas)
        ok('saída no grupo da conta de origem', any(n == a and f'para {b2}' in t for _, n, t in pontas), pontas)
        ok('entrada no grupo da conta de destino', any(n == b2 and f'de {a}' in t for _, n, t in pontas), pontas)
        g_hoje = next((d for d in dias if any('123,45' in t for g in d['grupos'] for t in g['itens'])), {'grupos': []})
        ok('grupos com saldo do fim do dia', g_hoje['grupos'] and all(g['saldo'] for g in g_hoje['grupos'] if g['id']))
        await pg.locator('#resultado section', has_text='123,45').first.scroll_into_view_if_needed()
        await pg.screenshot(path=os.path.join(SAIDA, 'extrato-por-conta.png'))

        # uma conta só no filtro: sem subtítulos
        await pg.click('[data-filtro-contas] summary')
        await pg.locator('[data-filtro-contas] [data-conta-f]').first.check(); await pg.wait_for_timeout(300)
        ok('com uma conta no filtro não separa', await pg.locator('#resultado [data-grupo-conta]').count() == 0 and await pg.locator('#resultado ul.card li').count() > 0)
        await pg.locator('[data-filtro-contas] [data-conta-f]').nth(1).check(); await pg.wait_for_timeout(300)
        ok('com duas contas no filtro separa de novo', await pg.locator('#resultado [data-grupo-conta]').count() > 0)
        await pg.click('#titulo-pagina')

        # selecionar para somar continua funcionando com os grupos
        await pg.click('[data-sel-entrar]'); await pg.wait_for_timeout(200)
        ok('caixinhas aparecem dentro dos grupos', await pg.locator('#resultado [data-grupo-conta] input[type=checkbox]').count() > 0)

        # celular
        await pg.set_viewport_size({'width': 390, 'height': 860}); await ir(pg, 'extrato'); await pg.wait_for_selector('#resultado section')
        larg = await pg.evaluate('document.documentElement.scrollWidth')
        ok('sem rolagem para o lado no celular', larg <= 390, larg)
        await pg.screenshot(path=os.path.join(SAIDA, 'extrato-por-conta-celular.png'))
        ok('sem erros no console', not erros, erros[:3])
        await b.close()
    for r in R: print(*r)
    print(f"\n{sum(r[0] == 'PASS' for r in R)}/{len(R)} passaram")
    sys.exit(0 if all(r[0] == 'PASS' for r in R) else 1)

asyncio.run(main())
