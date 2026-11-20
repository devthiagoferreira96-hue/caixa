"""QA da importação da planilha "Conta corrente arrendo": conferência linha a linha, escolhas
(produtor, crédito/débito, valor, produtos), gravação, conta corrente com insumos, desfazer,
reimportar sem duplicar (inclusive a planilha exportada pelo próprio sistema) e celular.
Uso: python importar_conta.py <planilha.xlsx> [pasta-de-saida]   (servidor do build em http://localhost:8765/)"""
import asyncio, sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from playwright.async_api import async_playwright
U = 'http://localhost:8765/'
PLANILHA = sys.argv[1]
SAIDA = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp()
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

async def ir(pg, r):
    await pg.evaluate("location.hash='#inicio'"); await pg.wait_for_timeout(200)
    await pg.evaluate(f"location.hash='#{r}'"); await pg.wait_for_timeout(800)
async def ultimo_toast(pg):
    t = await pg.locator('#toasts > *').all_inner_texts()
    return t[-1] if t else ''
async def limpar_toasts(pg):
    await pg.evaluate("document.getElementById('toasts').innerHTML=''")
async def adicionar(pg, secao, campos):
    await limpar_toasts(pg)
    d = pg.locator(f'[data-secao={secao}]')
    if not await d.evaluate('e=>e.open'): await d.locator('summary').click()
    f = d.locator('form[data-id=""]')
    for nome, valor in campos.items():
        c = f.locator(f'[name={nome}]')
        if await c.evaluate('e=>e.tagName') == 'SELECT': await c.select_option(valor)
        else: await c.fill(str(valor))
    await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(500)
    return await ultimo_toast(pg)
async def abrir_importacao(pg, arquivo):
    await ir(pg, 'conta-corrente')
    async with pg.expect_file_chooser() as fc: await pg.click('[data-importar]')
    await (await fc.value).set_files(arquivo)
    await pg.wait_for_timeout(1200)
def linha(pg, n): return pg.locator(f'dialog[open] [data-linha="{n}"]')
async def situacao(pg, n): return (await pg.inner_text(f'dialog[open] [data-situacao="{n}"]')).strip()
async def tabelas(pg): return await pg.evaluate("Object.fromEntries(Object.entries(window.__tabelas?.() || {}).map(([k,v])=>[k,v.length]))")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        await preparar(pg, U, exemplo=False); await pular_tour(pg)
        await ir(pg, 'ajustes')
        await pg.click('[data-secao=modulos] summary'); await pg.check('[data-modulo-resina]'); await pg.wait_for_timeout(800)

        await ir(pg, 'resina-cadastros')
        for n, a in [('Carlos', '100'), ('Nosso', '55'), ('Beatriz', '55')]:
            await adicionar(pg, 'resina_produtores', {'nome': n, 'arrendamento': a})
        await adicionar(pg, 'resina_titulares', {'nome': 'Empresa', 'documento': '12.345.678/0001-90'})
        await adicionar(pg, 'resina_titulares', {'nome': 'Maria', 'documento': '123.456.789-00'})
        t = await adicionar(pg, 'resina_produtos', {'nome': 'Pasta', 'unidade': 'kg', 'valor_unitario': ''}); ok('produto Pasta já cadastrado', 'adicionado' in t, t)

        # 1. abrir a planilha da empresa
        await abrir_importacao(pg, PLANILHA)
        dlg = pg.locator('dialog[open]')
        ok('abre a conferência', await dlg.locator('h2', has_text='Importar conta corrente').count() == 1)
        txt = await dlg.inner_text()
        ok('conta as linhas por tipo', '47 linhas' in txt and '8 de carga' in txt and '21 de insumo' in txt and '17 de PIX' in txt, txt[:300])
        ok('linha 5 entendida como carga', 'Carga' in await linha(pg, 5).inner_text() and '57 Tbs' in await linha(pg, 5).inner_text())
        ok('linha 5 mostra o débito (arrendamento)', 'R$ 29.044,40' in await linha(pg, 5).inner_text(), await linha(pg, 5).inner_text())
        ok('linha 14 (resumo) não importa', 'Não importa' in await linha(pg, 14).inner_text())
        ok('linha 3 é insumo de Pasta', 'Insumo' in await linha(pg, 3).inner_text() and '125 kg de PASTA' in await linha(pg, 3).inner_text())
        ok('Pasta usa o produto do cadastro', await dlg.locator('[data-produto="PASTA"] option:checked').inner_text() == 'Pasta (kg)')
        ok('Arame será criado', (await dlg.locator('[data-produto="ARAME"] option:checked').inner_text()).startswith('Criar'))
        ok('PIX começa sem crédito/débito', await linha(pg, 6).locator('[data-tipo]').input_value() == '')
        ok('linha 36 acha a Beatriz', await linha(pg, 36).locator('[data-produtor]').input_value() != '')
        ok('aviso dos tambores da linha 42', 'TAMBORES diz 20' in await dlg.locator('[data-resumo]').text_content())
        ok('carga sem produtor fica pendente', await situacao(pg, 5) == 'Escolha o produtor')
        ok('PIX pede a escolha', await situacao(pg, 6) == 'Escolha crédito ou débito')
        await pg.screenshot(path=os.path.join(SAIDA, 'importar-1.png'), full_page=False)

        # 2. escolhas
        await dlg.locator('[data-padrao]').select_option(label='Nosso'); await pg.wait_for_timeout(200)
        ok('produtor padrão vale para as cargas', await situacao(pg, 5) == 'Pronta')
        ok('insumo sem valor pede o valor', await situacao(pg, 3) == 'Falta o valor')
        ok('produtor padrão não mexe no que achou no texto', await linha(pg, 36).locator('[data-produtor]').evaluate('s=>s.options[s.selectedIndex].text') == 'Beatriz')
        await linha(pg, 15).locator('[data-produtor]').select_option(label='Carlos'); await pg.wait_for_timeout(200)
        await linha(pg, 6).locator('[data-tipo]').select_option('credito')
        await linha(pg, 6).locator('[data-valor]').fill('2000000'); await pg.wait_for_timeout(200)
        ok('PIX completo fica pronto', await situacao(pg, 6) == 'Pronta')
        await linha(pg, 9).locator('[data-tipo]').select_option('debito')
        await linha(pg, 9).locator('[data-valor]').fill('50000')
        await linha(pg, 3).locator('[data-valor]').fill('150000')
        await linha(pg, 4).locator('[data-valor]').fill('6200')
        await linha(pg, 36).locator('[data-valor]').fill('4000'); await pg.wait_for_timeout(200)
        ok('insumo com valor fica pronto', await situacao(pg, 3) == 'Pronta')
        await linha(pg, 49).locator('[data-incluir]').uncheck(); await pg.wait_for_timeout(200)
        ok('desmarcar deixa de fora', await situacao(pg, 49) == 'Fica de fora')
        resumo = await dlg.locator('[data-resumo]').inner_text()
        ok('resumo: 6 cargas, 3 insumos, 2 lançamentos', '6 cargas' in resumo and '3 insumos' in resumo and '2 lançamentos' in resumo, resumo)
        ok('resumo: produto novo criado', 'criando 1 produto' in resumo, resumo)
        ok('botão com a quantidade', 'Importar 11 itens' in await dlg.locator('[data-confirmar]').inner_text())
        await pg.screenshot(path=os.path.join(SAIDA, 'importar-2.png'), full_page=False)

        # 3. importar
        await limpar_toasts(pg)
        await dlg.locator('[data-confirmar]').click(); await pg.wait_for_timeout(1200)
        t = await ultimo_toast(pg)
        ok('importou', 'Importado: 6 cargas, 3 insumos e 2 lançamentos' in t, t)
        ok('janela fechou', await pg.locator('dialog[open]').count() == 0)

        # 4. conta corrente de abril (cargas juntadas e insumo)
        await ir(pg, 'conta-corrente')
        # muda o mês pelo seletor do topo até abril
        for _ in range(12):
            mes = (await pg.inner_text('#conteudo')).lower()
            if 'movimento de abril' in mes: break
            await pg.locator('[data-mes="-1"]').first.click(); await pg.wait_for_timeout(500)
        cc = await pg.inner_text('#conteudo')
        ok('abril: carga juntada com Carlos e Nosso', cc.count('Carga C-2026-') == 3 and 'Carlos' in cc and 'Nosso' in cc, cc[:600])
        ok('abril: débito do Carlos 100% (29.217,60)', '29.217,60' in cc)
        for _ in range(3):
            await pg.locator('[data-mes="-1"]').first.click(); await pg.wait_for_timeout(500)
        cc = await pg.inner_text('#conteudo')
        ok('janeiro: insumo de Pasta como débito', '125 kg Pasta' in cc and '1.500,00' in cc, cc[:800])
        ok('janeiro: insumo com a nota', 'NF 150 - VENC. 26/02' in cc)
        await pg.screenshot(path=os.path.join(SAIDA, 'importar-3-janeiro.png'), full_page=True)
        await pg.locator('[data-mes="1"]').first.click(); await pg.wait_for_timeout(500)
        cc = await pg.inner_text('#conteudo')
        ok('fevereiro: PIX de crédito', 'PIX VIA IN RESINAS' in cc and '20.000,00' in cc)

        # 5. abrir o insumo pela conta corrente
        await ir(pg, 'conta-corrente')
        for _ in range(12):
            if 'movimento de janeiro' in (await pg.inner_text('#conteudo')).lower(): break
            await pg.locator('[data-mes="-1"]').first.click(); await pg.wait_for_timeout(400)
        await pg.locator('#conteudo [data-entrega]').first.click(); await pg.wait_for_timeout(400)
        ok('abre a entrega de insumos', await pg.locator('dialog[open] [data-linha] [data-c=produtor_id]').count() >= 1)
        ok('entrega mostra a nota', await pg.locator('dialog[open] #in-nota').input_value() == 'NF 150 - VENC. 26/02')
        ok('entrega mostra a conta', 'Empresa' in await pg.locator('dialog[open] [data-linha] [data-c=titular_id]').first.evaluate('s=>s.options[s.selectedIndex].text'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        # 6. importar de novo não duplica
        await abrir_importacao(pg, PLANILHA)
        dlg = pg.locator('dialog[open]')
        await dlg.locator('[data-padrao]').select_option(label='Nosso'); await pg.wait_for_timeout(200)
        await linha(pg, 15).locator('[data-produtor]').select_option(label='Carlos'); await pg.wait_for_timeout(200)
        ok('reimportar: carga já está no sistema', await situacao(pg, 5) == 'Já está no sistema')
        await linha(pg, 3).locator('[data-valor]').fill('150000'); await pg.wait_for_timeout(200)
        ok('reimportar: insumo já está no sistema', await situacao(pg, 3) == 'Já está no sistema')
        ok('reimportar: só a carga desmarcada antes fica pronta', 'Importar 1 item' in await dlg.locator('[data-confirmar]').inner_text(),
           await dlg.locator('[data-confirmar]').inner_text())
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        # 7. celular
        await pg.set_viewport_size({'width': 390, 'height': 844})
        await abrir_importacao(pg, PLANILHA)
        larg = await pg.evaluate("(() => { const d = document.querySelector('dialog[open]'); return [d.scrollWidth, d.clientWidth]; })()")
        ok('celular: conferência sem rolagem lateral', larg[0] <= larg[1] + 1, larg)
        await pg.screenshot(path=os.path.join(SAIDA, 'importar-celular.png'), full_page=False)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await pg.set_viewport_size({'width': 1280, 'height': 900})

        # 8. desfazer a importação inteira
        await abrir_importacao(pg, PLANILHA)
        dlg = pg.locator('dialog[open]')
        await dlg.locator('[data-padrao]').select_option(label='Nosso'); await pg.wait_for_timeout(200)
        await limpar_toasts(pg)
        await dlg.locator('[data-confirmar]').click(); await pg.wait_for_timeout(1200)
        ok('importa a carga que faltava', 'Importado: 1 carga,' in await ultimo_toast(pg), await ultimo_toast(pg))
        await pg.locator('#toasts button', has_text='Desfazer').last.click(); await pg.wait_for_timeout(900)
        await ir(pg, 'cargas')
        await pg.evaluate("document.querySelector('[data-mes=\"0\"]')?.click()"); await pg.wait_for_timeout(600)
        ok('desfazer tira a carga de novembro', 'C-2026-' not in await pg.inner_text('#conteudo'))

        ok('sem erros no console', not erros, erros[:3])
        await b.close()

asyncio.run(main())
for r in R: print(r[0], '|', r[1], '|', r[2] if r[0] != 'PASS' else '')
print(f"\n{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")
