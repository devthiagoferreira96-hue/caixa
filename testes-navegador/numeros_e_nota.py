"""QA dos números digitados e do peso da nota fiscal na carga:
- pesos, kg, Tbs e % aceitam "5.230,5", "5230,5" e "5230.5"; "5.230" é milhar; o que não dá para entender avisa e não salva;
- peso da nota fiscal: avisa quando não bate, pergunta antes de salvar e deixa salvar assim mesmo (selo na lista);
- insumos: quantidade e % com vírgula;
- Cadastros: salvar uma linha não apaga o que está digitado em outra.
Uso: python numeros_e_nota.py [pasta-de-saida] [endereço]   (padrão: build em http://localhost:8765/)"""
import asyncio, sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from insumos import ir, adicionar, limpar_toasts, ultimo_toast
from playwright.async_api import async_playwright
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
U = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8765/'
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))
KG = '[data-item] [data-campo-item=kg_manual]'

async def digitar(pg, sel, txt):
    """Digita como a pessoa (tecla por tecla) e sai do campo."""
    loc = pg.locator(sel)
    await loc.fill(''); await loc.click(); await pg.keyboard.type(txt)
    await loc.evaluate('e => e.blur()'); await pg.wait_for_timeout(150)
    return await loc.input_value()

async def totais(pg): return await pg.inner_text('[data-totais]')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--lang=pt-BR']) if CHROME else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, locale='pt-BR')
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        await preparar(pg, U, exemplo=False); await pular_tour(pg)
        await ir(pg, 'ajustes')
        await pg.click('[data-secao=modulos] summary'); await pg.check('[data-modulo-resina]'); await pg.wait_for_timeout(800)
        await ir(pg, 'resina-cadastros')
        for n in ['Fernando', 'Itacury']:
            await adicionar(pg, 'resina_produtores', {'nome': n, 'arrendamento': 45})
        await adicionar(pg, 'resina_precos', {'inicio': '2026-01-01', 'valor_kg': '500'})
        await adicionar(pg, 'resina_produtos', {'nome': 'Pasta estimulante', 'unidade': 'kg', 'valor_unitario': '5000'})

        # ---------- números na carga
        await ir(pg, 'carga'); await pg.wait_for_timeout(1200)
        for nome, tbs in [('Fernando', 26), ('Itacury', 8)]:
            await pg.click('[data-adicionar]'); await pg.wait_for_timeout(150)
            await pg.locator('[data-item] select').last.select_option(label=nome); await pg.wait_for_timeout(150)
            await pg.locator('[data-item] [data-campo-item=tbs]').last.fill(str(tbs))
        v = await digitar(pg, '#c-peso-chegada', '5.230,5')
        ok('peso "5.230,5" = 5230,5 kg', v == '5230,5' and '5.230,5 kg' in await totais(pg), (v, await totais(pg)))
        v = await digitar(pg, '#c-peso-chegada', '5230.5')
        ok('peso "5230.5" = 5230,5 kg', v == '5230,5' and '5.230,5 kg' in await totais(pg), v)
        v = await digitar(pg, '#c-peso-chegada', '6.800')
        ok('peso "6.800" é milhar (6.800 kg, não 6,8)', v == '6800' and '6.800 kg' in await totais(pg), (v, await totais(pg)))
        auto = await pg.locator(KG).first.input_value()
        ok('kg automático com vírgula', auto == '5200', auto)
        await pg.fill('#c-peso-fazenda', '6.8x'); await pg.wait_for_timeout(150)
        ok('texto que não é número: aviso embaixo do campo', await pg.locator('#c-peso-fazenda-aviso').is_visible()
           and await pg.get_attribute('#c-peso-fazenda', 'aria-invalid') == 'true')
        await limpar_toasts(pg); await pg.click('button[type=submit]'); await pg.wait_for_timeout(400)
        ok('não salva com número que não deu para entender', 'não deu para entender' in await ultimo_toast(pg)
           and await pg.evaluate("document.activeElement.id") == 'c-peso-fazenda', await ultimo_toast(pg))
        await digitar(pg, '#c-peso-fazenda', '')
        ok('apagar tira o aviso', await pg.locator('#c-peso-fazenda-aviso').count() == 0)
        v = await digitar(pg, '[data-item] [data-campo-item=tbs] >> nth=0', '26,3')
        ok('Tbs 26,3 vira meio tambor (26,5) e aparece no campo', v == '26,5' and '34,5' in await totais(pg), (v, await totais(pg)))
        await digitar(pg, '[data-item] [data-campo-item=tbs] >> nth=0', '26')
        v = await digitar(pg, '[data-item] [data-campo-item=arrendamento] >> nth=0', '450')
        ok('arrendamento acima de 100: avisa (não vira 100 calado)', 'máximo é 100' in await pg.inner_text('[data-item] >> nth=0'))
        await digitar(pg, '[data-item] [data-campo-item=arrendamento] >> nth=0', '45,5')
        ok('arrendamento 45,5 aceito', await pg.locator('[data-item] [data-campo-item=arrendamento]').first.input_value() == '45,5'
           and await pg.locator('[data-item] .erro-campo').count() == 0)
        v = await digitar(pg, KG + ' >> nth=0', '5.300,25')
        ok('kg à mão "5.300,25" = 5300,25 (amarelo)', v == '5300,25' and await pg.locator('[data-item] .kg-manual').count() == 1, v)
        ok('o outro fica com o resto', await pg.locator(KG).nth(1).input_value() == '1499,75', await pg.locator(KG).nth(1).input_value())

        # ---------- peso da nota fiscal
        ok('sem peso da nota: nada a comparar', await pg.locator('[data-dif-nota]').is_hidden())
        await digitar(pg, '#c-kg-nota', '6.800')
        ok('nota igual à carga: "Bate com a nota"', 'Bate com a nota' in await pg.inner_text('[data-dif-nota]'), await pg.inner_text('[data-dif-nota]'))
        await digitar(pg, '#c-kg-nota', '6.750')
        dif = await pg.inner_text('[data-dif-nota]')
        ok('nota diferente: avisa kg e reais', 'Não bate com a nota' in dif and '50 kg a mais' in dif and 'R$ 250,00' in dif, dif)
        ok('aviso no resumo da carga', 'não batem com o peso da nota' in await pg.inner_text('[data-avisos]'))
        await pg.screenshot(path=os.path.join(SAIDA, 'carga-nota.png'), full_page=True)
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(500)
        ok('pergunta antes de salvar', await pg.locator('dialog[open]').count() == 1 and 'nota fiscal' in await pg.inner_text('dialog[open]'))
        await pg.click('dialog[open] [data-resposta=nao]'); await pg.wait_for_timeout(300)
        ok('Cancelar: continua na carga', (await pg.inner_text('#titulo-pagina')) == 'Nova carga')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(500)
        await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(1000)
        ok('"Salvar mesmo assim" salva com a diferença', (await pg.inner_text('#titulo-pagina')) == 'Cargas')
        lista = await pg.inner_text('#conteudo')
        ok('selo "Não bate com a nota" na lista', 'Não bate com a nota: +50 kg' in lista, lista[:400])
        await pg.locator('#conteudo a[href^="#carga/"]').first.click(); await pg.wait_for_timeout(1500)
        ok('reabrir: peso da nota e kg à mão no campo', await pg.input_value('#c-kg-nota') == '6750' and await pg.locator(KG).first.input_value() == '5300,25',
           (await pg.input_value('#c-kg-nota'), await pg.locator(KG).first.input_value()))
        # ajustar para bater e salvar sem pergunta
        await digitar(pg, '#c-kg-nota', '6800')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(1000)
        ok('batendo com a nota: salva sem perguntar', await pg.locator('dialog[open]').count() == 0 and (await pg.inner_text('#titulo-pagina')) == 'Cargas')
        ok('sem selo depois de bater', 'Não bate com a nota' not in await pg.inner_text('#conteudo'))

        # celular: o campo novo cabe na tela
        await pg.set_viewport_size({'width': 375, 'height': 800})
        await pg.locator('#conteudo a[href^="#carga/"]').first.click(); await pg.wait_for_timeout(1500)
        largura = await pg.evaluate('document.documentElement.scrollWidth')
        ok('celular: sem rolagem para o lado', largura <= 375, largura)
        await pg.locator('#c-kg-nota').scroll_into_view_if_needed()
        await pg.screenshot(path=os.path.join(SAIDA, 'carga-nota-celular.png'))
        await pg.set_viewport_size({'width': 1280, 'height': 900})

        # ---------- insumos: quantidade e % com vírgula
        await ir(pg, 'insumos'); await limpar_toasts(pg)
        await pg.click('[data-lancar]'); await pg.wait_for_selector('dialog[open] #in-data')
        li = pg.locator('dialog[open] [data-linha]').first
        sel = li.locator('[data-c=produto_id]')
        await sel.select_option(await sel.evaluate("s => [...s.options].find(o => o.text.startsWith('Pasta'))?.value")); await pg.wait_for_timeout(150)
        li = pg.locator('dialog[open] [data-linha]').first
        await li.locator('[data-c=produtor_id]').select_option(label='Fernando')
        await li.locator('[data-c=quantidade]').fill('2,5'); await pg.wait_for_timeout(150)
        ok('quantidade 2,5 × R$ 50 = R$ 125', await pg.inner_text('dialog[open] [data-total-geral]') == 'R$ 125,00', await pg.inner_text('dialog[open] [data-total-geral]'))
        await li.locator('[data-c=quantidade]').fill('1.000'); await pg.wait_for_timeout(150)
        ok('quantidade 1.000 é mil', await pg.inner_text('dialog[open] [data-total-geral]') == 'R$ 50.000,00', await pg.inner_text('dialog[open] [data-total-geral]'))
        await li.locator('[data-c=quantidade]').fill('2,5'); await pg.wait_for_timeout(150)
        await li.locator('[data-c=pct]').fill('50,5'); await pg.wait_for_timeout(150)
        ok('% do produtor 50,5', 'R$ 63,13' in await pg.inner_text('dialog[open]'), await pg.inner_text('dialog[open] [data-linha]'))
        await li.locator('[data-c=pct]').fill('5o'); await pg.wait_for_timeout(150)
        await limpar_toasts(pg); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(400)
        ok('insumo com % que não é número: não salva', 'não deu para entender' in await ultimo_toast(pg), await ultimo_toast(pg))
        await li.locator('[data-c=pct]').fill('50,5'); await pg.wait_for_timeout(150)
        await limpar_toasts(pg); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(900)
        ok('insumo salvo', await pg.locator('dialog[open]').count() == 0, await ultimo_toast(pg))
        ok('lista mostra 2,5 kg e 50,5%', '2,5 kg' in await pg.inner_text('#conteudo') and '50,5%' in await pg.inner_text('#conteudo'))

        # ---------- Cadastros: salvar uma linha não apaga o que está digitado em outra
        await ir(pg, 'resina-cadastros')
        d = pg.locator('[data-secao=resina_produtores]')
        if not await d.evaluate('e=>e.open'): await d.locator('summary').click()
        linhas = d.locator('form[data-id]:not([data-id=""])')
        await linhas.nth(0).locator('[name=arrendamento]').fill('30')       # Fernando: mexido, sem salvar
        await linhas.nth(1).locator('[name=arrendamento]').fill('40')       # Itacury: salva
        await linhas.nth(1).locator('button[type=submit]').click(); await pg.wait_for_timeout(800)
        linhas = pg.locator('[data-secao=resina_produtores] form[data-id]:not([data-id=""])')
        ok('salvar outra linha não apaga o que foi digitado', await linhas.nth(0).locator('[name=arrendamento]').input_value() == '30',
           await linhas.nth(0).locator('[name=arrendamento]').input_value())
        ok('a linha salva ficou com o valor novo', await linhas.nth(1).locator('[name=arrendamento]').input_value() == '40')
        await linhas.nth(0).locator('[name=arrendamento]').fill('45,5')
        await linhas.nth(0).locator('button[type=submit]').click(); await pg.wait_for_timeout(800)
        ok('cadastro aceita 45,5%', 'atualizado' in await ultimo_toast(pg)
           and await pg.locator('[data-secao=resina_produtores] form[data-id]:not([data-id=""])').nth(0).locator('[name=arrendamento]').input_value() == '45,5')

        ok('sem erros no console', not erros, erros)
        await b.close()
    for r in R: print(*r)
    print(f"{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")

asyncio.run(main())
