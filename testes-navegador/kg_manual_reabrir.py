"""QA do kg digitado à mão na carga: depois de salvar, ao abrir a carga de novo o número aparece no campo (amarelo),
e continua lá ao adicionar ou tirar outro produtor.
Uso: python kg_manual_reabrir.py [pasta-de-saida] [endereço]   (padrão: build em http://localhost:8765/)"""
import asyncio, sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from insumos import ir, adicionar, limpar_toasts
from playwright.async_api import async_playwright
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
U = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8765/'
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))
KG = '[data-item] [data-campo-item=kg_manual]'

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
        for n in ['Fernando', 'Itacury', 'Carlos']:
            await adicionar(pg, 'resina_produtores', {'nome': n, 'arrendamento': 45})
        await adicionar(pg, 'resina_precos', {'inicio': '2026-01-01', 'valor_kg': '500'})

        # carga: Fernando 26 Tbs, Itacury 8 Tbs, 6.800 kg; o kg do Fernando digitado para bater com a nota
        await ir(pg, 'carga'); await pg.wait_for_timeout(1200)
        await pg.fill('#c-peso-chegada', '6800')
        for nome, tbs in [('Fernando', 26), ('Itacury', 8)]:
            await pg.click('[data-adicionar]'); await pg.wait_for_timeout(150)
            await pg.locator('[data-item] select').last.select_option(label=nome); await pg.wait_for_timeout(150)
            await pg.locator('[data-item] [data-campo-item=tbs]').last.fill(str(tbs))
        await pg.locator(KG).first.fill('5230.5'); await pg.wait_for_timeout(200)
        await pg.locator('#c-obs').click()
        ok('kg do outro produtor é o resto', await pg.locator(KG).nth(1).input_value() == '1569.5', await pg.locator(KG).nth(1).input_value())
        await limpar_toasts(pg); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1000)
        ok('salvou', (await pg.inner_text('#titulo-pagina')) == 'Cargas')

        # abrir de novo
        await pg.locator('#conteudo a[href^="#carga/"]').first.click(); await pg.wait_for_timeout(1500)
        v = await pg.locator(KG).first.input_value()
        ok('ao abrir de novo, o kg digitado aparece no campo', v == '5230.5', v)
        ok('campo continua amarelo com ↺', await pg.locator('[data-item]').first.locator('.kg-manual').count() == 1
           and await pg.locator('[data-item]').first.locator('[data-kg-auto]:not([hidden])').count() == 1)
        ok('o outro produtor segue com o resto', await pg.locator(KG).nth(1).input_value() == '1569.5', await pg.locator(KG).nth(1).input_value())
        tot = await pg.inner_text('[data-totais]')
        ok('total da carga continua 6.800 kg', '6.800 kg' in tot, tot)
        await pg.screenshot(path=os.path.join(SAIDA, 'kg-manual-reaberto.png'))

        # adicionar e tirar um produtor não apaga o kg digitado
        await pg.click('[data-adicionar]'); await pg.wait_for_timeout(200)
        await pg.locator('[data-item] select').last.select_option(label='Carlos'); await pg.wait_for_timeout(200)
        ok('adicionar produtor não apaga o kg', await pg.locator(KG).first.input_value() == '5230.5', await pg.locator(KG).first.input_value())
        await pg.locator('[data-item]').last.locator('[data-remover]').click(); await pg.wait_for_timeout(200)
        ok('tirar produtor não apaga o kg', await pg.locator(KG).first.input_value() == '5230.5', await pg.locator(KG).first.input_value())

        # mudar o kg e salvar de novo: fica o novo valor
        await pg.locator(KG).first.fill('5300'); await pg.wait_for_timeout(200)
        await limpar_toasts(pg); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1000)
        await pg.locator('#conteudo a[href^="#carga/"]').first.click(); await pg.wait_for_timeout(1500)
        ok('editar e salvar de novo guarda o novo kg', await pg.locator(KG).first.input_value() == '5300', await pg.locator(KG).first.input_value())

        # ↺ e salvar: volta ao automático de verdade
        await pg.locator('[data-item]').first.locator('[data-kg-auto]').click(); await pg.wait_for_timeout(200)
        await pg.locator('#c-obs').click()
        await limpar_toasts(pg); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1000)
        await pg.locator('#conteudo a[href^="#carga/"]').first.click(); await pg.wait_for_timeout(1500)
        v = await pg.locator(KG).first.input_value()
        ok('↺ + salvar volta ao automático (sem amarelo)', v == '5200' and await pg.locator('[data-item] .kg-manual').count() == 0, v)

        ok('sem erros no console', not erros, erros)
        await b.close()
    for r in R: print(*r)
    print(f"{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")

asyncio.run(main())
