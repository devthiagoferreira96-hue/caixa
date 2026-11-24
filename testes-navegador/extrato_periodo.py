"""QA do período do Extrato: abre com o mês inteiro; "De" e "Até" + Filtrar mostram só aqueles dias (pode pegar mais de um mês).
Uso: python extrato_periodo.py [pasta-de-saida] [endereço]   (padrão: build em http://localhost:8765/)"""
import asyncio, sys, os, tempfile, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from insumos import ir
from playwright.async_api import async_playwright
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
U = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8765/'
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

# datas (AAAA-MM-DD) dos dias que aparecem na lista
LANC = "() => document.querySelectorAll('#resultado [data-editar]').length"

async def dias(pg):
    return await pg.evaluate("() => [...document.querySelectorAll('#resultado section[aria-label]')].map(s => s.getAttribute('aria-label'))")

async def filtrar(pg, de, ate):
    await pg.fill('#f-de', de); await pg.fill('#f-ate', ate)
    await pg.click('[data-filtrar-periodo]'); await pg.wait_for_timeout(700)

async def main():
    hoje = datetime.date.today()
    ini = hoje.replace(day=1)
    fim = (ini.replace(day=28) + datetime.timedelta(days=4)).replace(day=1) - datetime.timedelta(days=1)
    ant = (ini - datetime.timedelta(days=1)).replace(day=15)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        await preparar(pg, U, exemplo=True); await pular_tour(pg)

        await ir(pg, 'extrato'); await pg.wait_for_selector('#resultado section')
        ok('abre com o mês inteiro em De e Até', await pg.input_value('#f-de') == ini.isoformat() and await pg.input_value('#f-ate') == fim.isoformat(),
           (await pg.input_value('#f-de'), await pg.input_value('#f-ate')))
        ok('mês inteiro: projeção aparece', await pg.locator('[data-projecao]').count() == 1)
        ok('mês inteiro: sem botão "Mês inteiro"', await pg.locator('[data-mes-inteiro]').count() == 0)
        total = await pg.evaluate(LANC)
        dias_mes = await dias(pg)

        # digitar a data não muda a tela antes de Filtrar
        await pg.fill('#f-de', ini.replace(day=10).isoformat()); await pg.wait_for_timeout(400)
        ok('digitar não filtra sozinho', await pg.evaluate(LANC) == total)

        meio = ini.replace(day=10)
        await filtrar(pg, ini.isoformat(), meio.isoformat())
        parcial = await pg.evaluate(LANC)
        ok('filtrar até o dia 10: menos lançamentos', 0 < parcial < total or (parcial == total and len(dias_mes) <= 1), (parcial, total))
        ok('período: aviso com as datas', await pg.locator('[data-periodo-aviso]').count() == 1 and meio.strftime('%d/%m/%Y') in await pg.inner_text('[data-periodo-aviso]'))
        ok('período: projeção escondida', await pg.locator('[data-projecao]').count() == 0)
        ok('período: botão "Mês inteiro"', await pg.locator('[data-mes-inteiro]').count() == 1)
        ok('período: campos mantêm as datas', await pg.input_value('#f-ate') == meio.isoformat())
        # o resumo (Entradas/Saídas/Saldo) conta só o período
        resumo = await pg.inner_text('#resultado dl')
        ok('resumo conta só o período', f'({parcial} lançamento' in resumo, resumo)
        await pg.screenshot(path=os.path.join(SAIDA, 'extrato-periodo.png'))

        # de um mês para o outro
        await filtrar(pg, ant.isoformat(), ini.replace(day=18).isoformat())
        rot = await dias(pg)
        nome_ant = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][ant.month - 1]
        nome_atual = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][ini.month - 1]
        ok('pega dois meses', any(nome_ant in d.lower() for d in rot) and any(nome_atual in d.lower() for d in rot), rot)
        ok("não passa do dia 18", all(not (nome_atual in d.lower() and int(''.join(ch for ch in d.split(',')[1].split('de')[0] if ch.isdigit())) > 18) for d in rot), rot)

        # De depois de Até: troca sozinho
        await filtrar(pg, meio.isoformat(), ini.isoformat())
        ok('De depois de Até: inverte', await pg.input_value('#f-de') == ini.isoformat() and await pg.input_value('#f-ate') == meio.isoformat())

        # data inválida: avisa e não filtra
        await pg.fill('#f-ate', '')
        await pg.click('[data-filtrar-periodo]'); await pg.wait_for_timeout(300)
        ok('data vazia: avisa', await pg.locator('[data-periodo-erro]').is_visible())

        # Enter também filtra
        await pg.fill('#f-ate', meio.isoformat()); await pg.press('#f-ate', 'Enter'); await pg.wait_for_timeout(700)
        ok('Enter filtra', await pg.locator('[data-periodo-aviso]').count() == 1)

        # Mês inteiro volta
        await pg.click('[data-mes-inteiro]'); await pg.wait_for_timeout(700)
        ok('Mês inteiro volta ao normal', await pg.evaluate(LANC) == total and await pg.locator('[data-projecao]').count() == 1)

        # trocar o mês no topo volta ao mês inteiro
        await filtrar(pg, ini.isoformat(), meio.isoformat())
        await pg.click('[data-mes="-1"]'); await pg.wait_for_timeout(700)
        de = await pg.input_value('#f-de')
        ok('trocar o mês no topo: mês inteiro do novo mês', de == ini.replace(month=ini.month - 1 or 12, year=ini.year if ini.month > 1 else ini.year - 1).isoformat()
           and await pg.locator('[data-periodo-aviso]').count() == 0, de)

        # busca pelo nome da pessoa (o nome não está na descrição)
        await pg.click('[data-mes="1"]'); await pg.wait_for_timeout(500)
        await ir(pg, 'novo'); await pg.wait_for_timeout(500)
        await pg.fill('#f-valor', '4321'); await pg.fill('#f-descricao', 'Diária da roçada')
        cat = await pg.locator('#f-categoria option[value]:not([value=""])').first.get_attribute('value')
        await pg.select_option('#f-categoria', cat)
        await pg.fill('#f-pessoa', 'Joaquim Pereira')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)
        await ir(pg, 'extrato'); await pg.wait_for_selector('#resultado')
        await pg.fill('#f-busca', 'joaquim'); await pg.wait_for_timeout(300)
        achados = await pg.locator('#resultado [data-editar]').all_inner_texts()
        ok('busca pelo nome da pessoa', len(achados) == 1 and 'roçada' in achados[0], achados)
        await pg.fill('#f-busca', ''); await pg.wait_for_timeout(200)

        # celular
        await pg.set_viewport_size({'width': 360, 'height': 780}); await pg.wait_for_timeout(300)
        ok('celular: sem rolagem para o lado', await pg.evaluate('() => document.documentElement.scrollWidth <= innerWidth'))
        await pg.screenshot(path=os.path.join(SAIDA, 'extrato-periodo-celular.png'))
        ok('sem erros no console', not erros, erros)
        await b.close()
    for r in R: print(r[0], r[1], '' if r[0] == 'PASS' else r[2])
    print(f"{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")

if __name__ == '__main__':
    asyncio.run(main())
