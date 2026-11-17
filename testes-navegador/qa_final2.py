"""QA final, parte 2: planilhas difíceis, volume, ida e volta do backup, nomes maliciosos, falha ao gravar."""
import asyncio, sys, json, re, time, os
sys.path.insert(0, '/tmp/qa')
from comum import preparar, pular_tour, SENHA, guardar_codigo
from playwright.async_api import async_playwright
import openpyxl
from pypdf import PdfReader

U = 'http://localhost:8765/'
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))
XSS = '<img src=x onerror="window.__xss=2">'

async def ir(pg, r):
    await pg.evaluate(f"location.hash='#{r}'"); await pg.wait_for_timeout(600)

async def importar(pg, arquivo):
    await ir(pg, 'ajustes')
    async with pg.expect_file_chooser() as fc: await pg.click('[data-importar]')
    t0 = time.time()
    await (await fc.value).set_files(arquivo)
    await pg.wait_for_selector('dialog[open] [data-resumo], #toasts > *', timeout=60000)
    return time.time() - t0

async def resolver(pg, acao='criar'):
    await pg.wait_for_selector('dialog[open] [data-resumo]', timeout=60000)
    for r in await pg.locator(f'dialog[open] [data-pendencia] input[value={acao}]').all():
        await r.check(); await pg.wait_for_timeout(120)

async def exportar(pg, formato, periodo, destino):
    await ir(pg, 'ajustes'); await pg.click('[data-backup]'); await pg.wait_for_selector('dialog[open] [data-gerar]')
    await pg.check(f'input[name=formato][value={formato}]', force=True)
    if periodo: await pg.select_option('#exp-periodo', periodo)
    t0 = time.time()
    async with pg.expect_download(timeout=60000) as d: await pg.click('dialog[open] [data-gerar]')
    await (await d.value).save_as(destino); await pg.wait_for_timeout(400)
    return time.time() - t0

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await preparar(pg, U, exemplo=False, nome=XSS[:40]); await pular_tour(pg)
        ok('Nome de usuário com HTML: não executa', not await pg.evaluate('window.__xss===2'))

        # =============== 1. PLANILHA "SUJA"
        await importar(pg, '/tmp/qa/arq/lo/suja.xlsx')
        d = pg.locator('dialog[open]')
        pend = await d.locator('[data-pendencias]').inner_text()
        ok('Planilha suja: categoria com HTML vira pendência (sem executar)', 'img src' in pend and not await pg.evaluate('window.__xss===2'))
        chaves = await d.locator('[data-pendencia]').evaluate_all('els => els.map(e => e.dataset.pendencia)')
        ok('Planilha suja: " lazer " e " mmp " com espaços são reconhecidos (só a categoria com HTML fica pendente)', len(chaves) == 1 and chaves[0].startswith('categoria:IMG'), chaves)
        await resolver(pg, 'pular')
        await d.locator('summary').click() if await d.locator('summary').count() else None
        txt = await d.inner_text()
        ok('Aviso: valor em texto ("cento e vinte")', 'Valor com texto' in txt)
        ok('Aviso: valor acima do limite', 'Valor gigante' in txt and 'limite' in txt)
        ok('Aviso: fórmula com erro (#DIV/0!) fica sem valor', 'Erro de fórmula' in txt)
        botao = d.locator('[data-importar-confirmar]')
        await botao.click(); await pg.wait_for_timeout(1500)
        await ir(pg, 'extrato')
        # vai até março de 2026
        for _ in range(30):
            if 'Março de 2026' in await pg.inner_text('#seletor-mes'): break
            await pg.click('[data-mes="-1"]'); await pg.wait_for_timeout(120)
        ext = await pg.inner_text('#conteudo')
        ok('Data impossível 31/02 não quebra (vai para o mês da aba)', 'Data impossível' in ext)
        ok('Descrição só com espaços vira o nome da categoria', 'Lazer' in ext)
        ok('Valor "  -12,50 " com espaços é lido', 'Espaços e minúsculas' in ext and '12,50' in ext)
        ok('Fórmula na descrição: entra o resultado dela, como no Excel', 'http://x' in ext)
        ok('Descrição de 500 letras é cortada em 120', 'X' * 121 not in ext and 'X' * 100 in ext)
        ok('Emoji na descrição', '😀' in ext)
        ok('Valor 0,001 vira R$ 0,00 ou é recusado (sem quebrar)', 'NaN' not in ext)

        # =============== 2. PLANILHA GRANDE (12 meses, ~5.000 linhas)
        tempo = await importar(pg, '/tmp/qa/arq/grande.xlsx')
        ok('Planilha grande: prévia abre em menos de 15 s', tempo < 15, round(tempo, 1))
        await resolver(pg, 'criar')
        res = await pg.inner_text('dialog[open] [data-resumo]')
        n = re.search(r'(\d+) lançamentos do caixa', res)
        ok('Planilha grande: 1.440 lançamentos', n and int(n.group(1)) == 1440, res[:100])
        t0 = time.time(); await pg.click('dialog[open] [data-importar-confirmar]')
        await pg.wait_for_selector('#toasts >> text=Planilha importada', timeout=60000)
        ok('Planilha grande: importa em menos de 20 s', time.time() - t0 < 20, round(time.time() - t0, 1))
        for r in ['inicio', 'extrato', 'cartoes', 'relatorio']:
            t0 = time.time(); await ir(pg, r)
            ok(f'Com muitos dados, {r} abre rápido', time.time() - t0 < 4 and 'Não foi possível' not in await pg.inner_text('#conteudo'), round(time.time() - t0, 1))
        tx = await exportar(pg, 'excel', 'tudo', '/tmp/qa/arq/grande_export.xlsx')
        wb = openpyxl.load_workbook('/tmp/qa/arq/grande_export.xlsx')
        ok('Excel de tudo com muitos dados', wb['Lançamentos'].max_row > 1440 and tx < 15, (wb['Lançamentos'].max_row, round(tx, 1)))
        tp = await exportar(pg, 'pdf', 'tudo', '/tmp/qa/arq/grande_export.pdf')
        paginas = len(PdfReader('/tmp/qa/arq/grande_export.pdf').pages)
        ok('PDF de tudo com muitos dados', paginas > 30 and tp < 20, (paginas, round(tp, 1)))

        # =============== 3. IDA E VOLTA DO BACKUP (apagar tudo e restaurar no primeiro acesso)
        await ir(pg, 'inicio')
        saldo_antes = await pg.inner_text('[aria-labelledby=t-saldo]')
        await exportar(pg, 'backup', None, '/tmp/qa/arq/ida_volta.json')
        await ir(pg, 'ajustes'); await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        await pg.click('[data-apagar-tudo]'); await pg.fill('#confirmar-apagar', 'APAGAR'); await pg.click('dialog button[type=submit]')
        await pg.wait_for_selector('#usuario', timeout=10000)
        async with pg.expect_file_chooser() as fc: await pg.click('[data-restaurar]')
        await (await fc.value).set_files('/tmp/qa/arq/ida_volta.json'); await pg.wait_for_timeout(800)
        await pg.fill('#usuario', 'Thiago'); await pg.fill('#senha', SENHA); await pg.fill('#confirmar', SENHA)
        await pg.click('button[type=submit]'); await guardar_codigo(pg); await pg.wait_for_selector('#titulo-pagina', timeout=15000)
        await pular_tour(pg); await ir(pg, 'inicio')
        ok('Backup: ida e volta mantém todos os saldos', await pg.inner_text('[aria-labelledby=t-saldo]') == saldo_antes)

        # =============== 4. NOMES MALICIOSOS NOS CADASTROS
        await ir(pg, 'ajustes'); await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        for t in ['contas', 'categorias', 'pessoas', 'cartoes']:
            await pg.evaluate("""([t,n])=>{const f=document.querySelector(`form[data-tabela=${t}][data-id=""]`);f.elements.nome.value=n;f.requestSubmit();}""", [t, (XSS + t)[:60]])
            await pg.wait_for_timeout(500); await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        for r in ['inicio', 'extrato', 'novo', 'cartoes', 'relatorio', 'ajustes']:
            await ir(pg, r)
        ok('Nomes com HTML em contas, categorias, pessoas e cartões não executam', not await pg.evaluate('window.__xss===2'))
        await exportar(pg, 'pdf', 'tudo', '/tmp/qa/arq/nomes.pdf'); await exportar(pg, 'excel', 'tudo', '/tmp/qa/arq/nomes.xlsx')
        ok('Excel e PDF com nomes estranhos abrem', len(PdfReader('/tmp/qa/arq/nomes.pdf').pages) > 0 and openpyxl.load_workbook('/tmp/qa/arq/nomes.xlsx') is not None)

        # =============== 5. MESES MUITO NO PASSADO E NO FUTURO
        await ir(pg, 'extrato')
        for _ in range(40): await pg.click('[data-mes="1"]')
        await pg.wait_for_timeout(500)
        ok('Avançar 40 meses: tela vazia sem erro', 'Não foi possível' not in await pg.inner_text('#conteudo'))

        # =============== 6. APARELHO SEM ESPAÇO (gravação falha)
        await pg.evaluate("() => { IDBObjectStore.prototype.put = function(){ throw new DOMException('cheio','QuotaExceededError'); }; }")
        await ir(pg, 'novo'); await pg.check('input[name=modo][value=saida]', force=True)
        await pg.fill('#f-valor', '5000'); await pg.fill('#f-descricao', 'Sem espaço'); await pg.select_option('#f-categoria', index=1)
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(1500)
        if await pg.locator('dialog[open] [data-resposta=sim]').count(): await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(800)
        ok('Sem espaço no aparelho: avisa em vez de perder em silêncio', 'Não foi possível salvar neste aparelho' in await pg.inner_text('#toasts'), await pg.inner_text('#toasts'))

        erros_reais = [e for e in errs if 'cheio' not in e and 'Quota' not in e]
        ok('Sem erros de JavaScript', not erros_reais, erros_reais[:3])
        await b.close()
    for r in R: print(*r)
    print(sum(r[0] == 'PASS' for r in R), 'passaram /', len(R))

asyncio.run(main())
