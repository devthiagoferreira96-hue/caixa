"""QA da conta corrente do arrendamento: contas CNPJ/CPF, nota e destino na carga,
uma linha por produtor, recebimentos, saldo, exportar Excel, backup e celular.
Uso: python conta_corrente.py [pasta-de-saida]   (servidor do build em http://localhost:8765/)"""
import asyncio, sys, os, json, zipfile, re, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from playwright.async_api import async_playwright
U = 'http://localhost:8765/'
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

async def ir(pg, r):
    await pg.evaluate("location.hash='#inicio'"); await pg.wait_for_timeout(200)  # garante que a tela é desenhada de novo
    await pg.evaluate(f"location.hash='#{r}'"); await pg.wait_for_timeout(700)
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
        await f.locator(f'[name={nome}]').fill(str(valor))
    await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(500)
    return await ultimo_toast(pg)

async def nova_carga(pg, data, conta, nota, destino, peso, linhas):
    await ir(pg, 'carga'); await pg.wait_for_timeout(1500)
    await pg.fill('#c-data', data); await pg.locator('#c-data').dispatch_event('change'); await pg.wait_for_timeout(300)
    if conta: await pg.select_option('#c-titular', label=conta)
    await pg.fill('#c-nota', nota); await pg.fill('#c-destino', destino)
    await pg.fill('#c-peso-chegada', str(peso))
    for nome, tbs, arr in linhas:
        await pg.click('[data-adicionar]'); await pg.wait_for_timeout(150)
        li = pg.locator('[data-item]').last
        await li.locator('select').select_option(label=nome); await pg.wait_for_timeout(150)
        li = pg.locator('[data-item]').last
        await li.locator('[data-campo-item=tbs]').fill(str(tbs))
        await li.locator('[data-campo-item=arrendamento]').fill(str(arr))
    await limpar_toasts(pg)
    await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)
    return await ultimo_toast(pg)

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

        # 1. tela sem contas cadastradas
        await ir(pg, 'conta-corrente')
        ok('sem contas: pede o cadastro', 'Cadastre as contas' in await pg.inner_text('#conteudo'))
        ok('menu tem Conta corrente', await pg.locator('aside a[href="#conta-corrente"]').is_visible())

        # 2. cadastros
        await ir(pg, 'resina-cadastros')
        for n, a in [('João', 40), ('Pedro', 50)]:
            await adicionar(pg, 'resina_produtores', {'nome': n, 'arrendamento': a})
        await adicionar(pg, 'resina_precos', {'inicio': '2026-01-01', 'valor_kg': '500'})
        t = await adicionar(pg, 'resina_titulares', {'nome': 'Empresa', 'documento': '12.345.678/0001-90'}); ok('conta CNPJ cadastrada', 'adicionado' in t, t)
        t = await adicionar(pg, 'resina_titulares', {'nome': 'Proprietária', 'documento': '123.456.789-00'}); ok('conta CPF cadastrada', 'adicionado' in t, t)
        t = await adicionar(pg, 'resina_titulares', {'nome': 'empresa', 'documento': ''}); ok('conta repetida bloqueada', 'Já existe' in t, t)

        # 3. carga sem escolher conta (com duas cadastradas) é bloqueada
        await ir(pg, 'carga'); await pg.wait_for_timeout(1500)
        ok('carga tem campos Conta, Nota e Destino', all([await pg.locator(s).count() for s in ['#c-titular', '#c-nota', '#c-destino']]))
        await pg.fill('#c-peso-chegada', '2000')
        await pg.click('[data-adicionar]'); await pg.locator('[data-item] select').last.select_option(label='João')
        await pg.locator('[data-item] [data-campo-item=tbs]').last.fill('10')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(500)
        ok('sem conta não salva', 'Escolha em qual conta' in await pg.inner_text('#conteudo'))

        # 4. cargas: outubro e novembro no CNPJ, novembro no CPF
        t = await nova_carga(pg, '2026-10-20', 'Empresa · 12.345.678/0001-90', '1001', 'Usina Boa Vista', 2000, [('João', 6, 40), ('Pedro', 4, 50)])
        ok('carga de outubro salva', 'registrada' in t, t)
        t = await nova_carga(pg, '2026-11-05', 'Empresa · 12.345.678/0001-90', '1002', 'Usina Boa Vista', 1000, [('João', 5, 40)])
        ok('carga de novembro salva', 'registrada' in t, t)
        t = await nova_carga(pg, '2026-11-06', 'Proprietária · 123.456.789-00', 'NF 77', 'Resinas Sul', 1000, [('Pedro', 5, 50)])
        ok('carga no CPF salva', 'registrada' in t, t)
        await ir(pg, 'carga'); await pg.wait_for_timeout(1200)
        dests = await pg.evaluate("[...document.querySelectorAll('#c-destinos option')].map(o=>o.value)")
        ok('destino sugere os já usados (sem repetir)', sorted(dests) == ['Resinas Sul', 'Usina Boa Vista'], dests)
        ok('conta repete a da última carga', 'Proprietária' in await pg.locator('#c-titular option:checked').inner_text())

        # 5. lista de cargas mostra nota e destino
        await pg.evaluate("location.hash='#cargas'"); await pg.wait_for_timeout(400)
        await pg.evaluate("document.querySelector('[data-mes=\"0\"]')?.click()"); await pg.wait_for_timeout(600)
        txt = await pg.inner_text('#conteudo')
        ok('lista mostra nota e destino', 'Nota 1002' in txt and 'Destino: Usina Boa Vista' in txt, txt[:400])

        # 6. conta corrente CNPJ, novembro de 2026
        await ir(pg, 'conta-corrente')
        await pg.click('[data-conta]:has-text("Empresa")'); await pg.wait_for_timeout(500)
        txt = await pg.inner_text('#conteudo')
        # out: João 1200kg×5×40% = 2400; Pedro 800kg×5×50% = 2000 → saldo anterior −4400. Nov: João 1000×5×40% = 2000
        ok('saldo anterior = −4.400 (falta receber)', 'R$ 4.400,00' in txt and 'Falta receber' in txt, txt[:600])
        ok('débito do mês = 2.000', 'R$ 2.000,00' in txt)
        linhas = await pg.locator('table tbody tr').count()
        ok('tabela: saldo anterior + 1 linha', linhas == 2, linhas)
        row = await pg.locator('table tbody tr').nth(1).inner_text()
        # a coluna UNI. saiu da conta corrente em 18/11/2026 (tela e planilha)
        ok('linha tem nota, destino, tbs, %, kg, média', all(s in row for s in ['1002', 'Usina Boa Vista', '40%', '1.000', '200', '5,00', '2.000,00', '-6.400,00']), row)
        ok('CPF não aparece no CNPJ', 'NF 77' not in txt)

        # 7. lançar recebimento
        await limpar_toasts(pg)
        await pg.click('[data-lancar]'); await pg.wait_for_selector('dialog[open] #mv-valor')
        await pg.fill('#mv-data', '2026-11-10'); await pg.fill('#mv-valor', '150000'); await pg.fill('#mv-desc', 'PIX recebido')
        await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(800)
        ok('recebimento lançado', 'Lançado' in await ultimo_toast(pg), await ultimo_toast(pg))
        txt = await pg.inner_text('#conteudo')
        ok('saldo final = −4.400 − 2.000 + 1.500 = −4.900', 'R$ 4.900,00' in txt, txt[:700])
        ok('recebimento aparece no extrato', 'PIX recebido' in txt)
        await pg.click('[data-movimento]'); await pg.wait_for_selector('dialog[open] #mv-valor')
        ok('editar abre com o valor', await pg.input_value('#mv-valor') == '1.500,00', await pg.input_value('#mv-valor'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        # valor zero bloqueado
        await pg.click('[data-lancar]'); await pg.wait_for_selector('dialog[open] #mv-valor')
        await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(300)
        ok('valor vazio bloqueado', 'Informe o valor' in await pg.inner_text('dialog[open]'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        # 8. filtro por produtor
        await pg.select_option('[data-produtor]', label='Pedro'); await pg.wait_for_timeout(600)
        txt = await pg.inner_text('#conteudo')
        ok('filtro Pedro: só o saldo anterior dele (2.000)', 'R$ 2.000,00' in txt and 'Nada nesta conta' in txt, txt[:500])
        await pg.select_option('[data-produtor]', value=''); await pg.wait_for_timeout(600)

        # 9. exportar Excel
        async with pg.expect_download() as d: await pg.click('[data-exportar]')
        arq = os.path.join(SAIDA, 'conta.xlsx'); await (await d.value).save_as(arq)
        z = zipfile.ZipFile(arq); sh = z.read('xl/worksheets/sheet1.xml').decode()
        cab = re.findall(r'<row r="2">(.*?)</row>', sh)[0]  # como na planilha da empresa: título na linha 1, colunas na linha 2
        titulos = re.findall(r'<t[^>]*>([^<]*)</t>', cab)
        ok('Excel: cabeçalho igual ao da planilha da empresa (sem UNI.)', titulos == ['DATA', 'DESCRIÇÃO', 'NOTA', 'DESTINO CARGA', 'TAMBORES', '% ARRENDO', 'QUANTIDADE', 'MÉDIA', 'R$ UNITARIO', 'CRÉDITO', 'DÉBITO', 'SALDO'], titulos)
        ok('Excel: saldo em fórmula como na planilha', '<f>L3+J4+K4</f>' in sh and '<f>L4+J5+K5</f>' in sh, re.findall(r'<f>[^<]*</f>', sh))
        ok('Excel: débito negativo', '<v>-2000</v>' in sh)
        ok('Excel: saldo anterior −4400', '<v>-4400</v>' in sh)

        # 10. backup leva contas, movimentos e campos novos
        await ir(pg, 'ajustes'); await pg.click('[data-backup]'); await pg.wait_for_selector('dialog[open] [data-gerar]')
        await pg.check('input[name=formato][value=backup]', force=True)
        async with pg.expect_download() as d: await pg.click('dialog[open] [data-gerar]')
        bk_arq = os.path.join(SAIDA, 'backup.json'); await (await d.value).save_as(bk_arq); await pg.wait_for_timeout(500)
        tb = json.load(open(bk_arq, encoding='utf-8'))['tabelas']
        ok('backup: 2 contas e 1 movimento', len(tb['resina_titulares']) == 2 and len(tb['resina_movimentos']) == 1)
        ok('backup: carga com nota, destino e conta', all(c.get('titular_id') and c.get('nota') and c.get('destino') for c in tb['resina_cargas']))
        await pg.keyboard.press('Escape')

        # 11. excluir conta em uso é bloqueado
        await ir(pg, 'resina-cadastros'); await limpar_toasts(pg)
        d = pg.locator('[data-secao=resina_titulares]')
        if not await d.evaluate('e=>e.open'): await d.locator('summary').click()
        await d.locator('[data-excluir]').first.click(); await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(500)
        ok('conta usada não pode ser excluída', 'não pode ser excluído' in await ultimo_toast(pg), await ultimo_toast(pg))

        # 12. celular: cartões no lugar da tabela, sem rolagem lateral
        await pg.set_viewport_size({'width': 390, 'height': 844})
        await ir(pg, 'conta-corrente'); await pg.wait_for_timeout(500)
        ok('celular: menu de baixo tem Conta', await pg.locator('a.nav-baixo[href="#conta-corrente"]').is_visible())
        ok('celular: cartões visíveis', await pg.locator('#conteudo ul.md\\:hidden li').first.is_visible())
        largura = await pg.evaluate('document.documentElement.scrollWidth')
        ok('celular: sem rolagem lateral', largura <= 390, largura)
        await pg.screenshot(path=os.path.join(SAIDA, 'celular.png'), full_page=True)
        await pg.set_viewport_size({'width': 1280, 'height': 900}); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SAIDA, 'computador.png'), full_page=True)

        ok('sem erros no console', not erros, erros[:5])
        await b.close()
    for r in R: print(r[0], r[1], '' if r[0] == 'PASS' else r[2])
    print(f"{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")

asyncio.run(main())
