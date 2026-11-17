import asyncio, sys, subprocess, os, zipfile, json
sys.path.insert(0, '/tmp/qa')
from comum import preparar, pular_tour
from playwright.async_api import async_playwright
import openpyxl
from pypdf import PdfReader

U = 'http://localhost:8765/'
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))
OUT = '/tmp/qa/exp'; os.makedirs(OUT, exist_ok=True)

async def abrir_dialogo(pg):
    await pg.goto(U + '#ajustes'); await pg.wait_for_timeout(700)
    await pg.click('[data-backup]'); await pg.wait_for_selector('dialog[open] [data-gerar]')

async def gerar(pg, formato, periodo=None, nome=None):
    await abrir_dialogo(pg)
    await pg.check(f'dialog[open] input[name=formato][value={formato}]', force=True)
    if periodo: await pg.select_option('#exp-periodo', periodo)
    async with pg.expect_download() as d: await pg.click('dialog[open] [data-gerar]')
    dw = await d.value
    caminho = f'{OUT}/{nome or dw.suggested_filename}'
    await dw.save_as(caminho)
    await pg.wait_for_timeout(400)
    return dw.suggested_filename, caminho

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and print('CONSOLE', m.text))
        await preparar(pg, U, exemplo=True); await pular_tour(pg)

        # um lançamento com texto difícil: acentos, símbolos, aspas, & < >, emoji e texto enorme
        dificil = 'Açaí & pão "francês" <grande> (R$) ç ã õ — 😀 ' + 'muito longo ' * 12
        await pg.goto(U + '#novo'); await pg.wait_for_timeout(600)
        await pg.fill('#f-valor', '123456789'); await pg.fill('#f-descricao', dificil)
        await pg.select_option('#f-categoria', label='Lazer')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)
        if await pg.locator('dialog[open] [data-resposta=sim]').count(): await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(600)

        # ---------- janela de opções
        await abrir_dialogo(pg)
        txt = await pg.inner_text('dialog[open]')
        ok('Janela mostra as 3 opções', all(t in txt for t in ['Backup completo', 'Planilha do Excel', 'Relatório em PDF']))
        ok('Backup completo vem marcado', await pg.locator('input[name=formato][value=backup]').is_checked())
        ok('Período fica escondido no backup', await pg.locator('[data-periodo-bloco]').is_hidden())
        await pg.check('input[name=formato][value=excel]', force=True); await pg.wait_for_timeout(100)
        ok('Período aparece para Excel', await pg.locator('[data-periodo-bloco]').is_visible())
        ok('Botão muda para "Gerar planilha"', 'Gerar planilha' in await pg.inner_text('[data-gerar]'))
        ok('Aviso de que só o backup restaura', 'Backup completo' in await pg.inner_text('[data-periodo-bloco]'))
        await pg.check('input[name=formato][value=pdf]', force=True)
        ok('Botão muda para "Gerar PDF"', 'Gerar PDF' in await pg.inner_text('[data-gerar]'))
        opcoes = await pg.locator('#exp-periodo option').all_inner_texts()
        ok('3 períodos (mês, ano, tudo)', len(opcoes) == 3 and 'Mês aberto' in opcoes[0], opcoes)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        ok('Esc fecha a janela', await pg.locator('dialog[open]').count() == 0)

        # ---------- Excel do mês
        nome, x = await gerar(pg, 'excel', 'mes')
        ok('Nome da planilha do mês', nome.startswith('caixa-familia-') and nome.endswith('.xlsx') and len(nome) == len('caixa-familia-2026-11.xlsx'), nome)
        ok('Arquivo .xlsx é um zip válido', zipfile.is_zipfile(x) and zipfile.ZipFile(x).testzip() is None)
        wb = openpyxl.load_workbook(x)
        ok('Abas certas', wb.sheetnames == ['Resumo', 'Lançamentos', 'Cartões', 'Por categoria'], wb.sheetnames)
        L = wb['Lançamentos']
        cab = [c.value for c in L[1]]
        ok('Cabeçalho dos lançamentos', cab == ['Data', 'Descrição', 'Tipo', 'Categoria', 'Conta', 'Pessoa', 'Valor', 'Situação'], cab)
        descr = [r[1].value for r in L.iter_rows(min_row=2)]
        ok('Texto com acentos, aspas, & < > e emoji intacto', any(str(d).startswith('Açaí & pão "francês" <grande> (R$) ç ã õ — 😀') for d in descr))
        valores = [r[6].value for r in L.iter_rows(min_row=2, max_row=L.max_row - 1)]
        ok('Valor grande certo e negativo para saída', -1234567.89 in valores)
        import datetime
        ok('Datas são datas de verdade', isinstance(L['A2'].value, datetime.datetime), type(L['A2'].value))
        ok('Formato de moeda R$', 'R$' in L['G2'].number_format, L['G2'].number_format)
        tot = L.cell(L.max_row, 7).value
        ok('Linha de total com fórmula SUBTOTAL', str(tot).startswith('=SUBTOTAL(9,G2:G'), tot)
        ok('Filtro e cabeçalho congelado', L.auto_filter.ref and L.freeze_panes == 'A2', (L.auto_filter.ref, L.freeze_panes))
        G = wb['Por categoria']
        soma_pct = sum((r[5].value or 0) for r in G.iter_rows(min_row=2, max_row=G.max_row - 1))
        ok('Porcentagens das categorias somam 100%', abs(soma_pct - 1) < 0.001, soma_pct)
        grupos = {r[0].value: r[1].value for r in G.iter_rows(min_row=2, max_row=G.max_row - 1)}
        ok('Grupo certo na planilha (Fazenda não vira Casa)', grupos.get('Insumos Fazenda') == 'Fazenda' and grupos.get('Lazer') == 'Casa', grupos)
        C = wb['Cartões']
        ok('Aba de cartões tem compras', C.max_row > 2, C.max_row)
        Rz = wb['Resumo']
        ok('Resumo com título e período', Rz['A1'].value == 'Caixa da Família' and 'Período' in Rz['A2'].value)
        # LibreOffice abre e recalcula sem erro
        subprocess.run(['soffice', '--headless', '--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,2', '--outdir', OUT, x], capture_output=True, timeout=90)
        csv2 = f'{OUT}/{os.path.basename(x)[:-5]}-Lançamentos.csv'
        conteudo = open(csv2, encoding='utf-8').read() if os.path.exists(csv2) else ''
        ok('LibreOffice abre a planilha e calcula o total', 'Total' in conteudo and '#' not in conteudo.split('Total')[-1][:40], conteudo.split('\n')[-2][:80] if conteudo else 'não abriu')

        # ---------- Excel de tudo vs ano: tudo >= ano >= mês
        _, xa = await gerar(pg, 'excel', 'ano')
        _, xt = await gerar(pg, 'excel', 'tudo')
        n = lambda f: openpyxl.load_workbook(f)['Lançamentos'].max_row
        ok('Tudo ≥ Ano ≥ Mês', n(xt) >= n(xa) >= n(x), (n(x), n(xa), n(xt)))
        await pg.goto(U + '#ajustes'); await pg.wait_for_timeout(500)
        ok('Planilha não conta como backup', 'ainda não fez nenhum backup' in await pg.inner_text('#conteudo'))

        # ---------- PDF
        nome, pdf = await gerar(pg, 'pdf', 'mes')
        ok('Nome do PDF', nome.endswith('.pdf'), nome)
        r = PdfReader(pdf)
        texto = '\n'.join(pg_.extract_text() for pg_ in r.pages)
        ok('PDF abre e tem páginas', len(r.pages) >= 1, len(r.pages))
        for t in ['Caixa da Família', 'Gastos por categoria', 'Saldo das contas hoje', 'Lançamentos do caixa', 'Compras no cartão', 'Página 1 de']:
            ok(f'PDF contém "{t}"', t in texto)
        ok('Acentos certos no PDF', 'Açaí & pão "francês" <grande>' in texto)
        ok('Valor grande formatado', 'R$ 1.234.567,89' in texto)
        ok('Emoji não quebra o PDF (vira ?)', '😀' not in texto)
        ok('Texto enorme é cortado com …', '…' in texto)
        chk = subprocess.run(['pdftotext', pdf, '-'], capture_output=True)
        ok('pdftotext lê sem erro', chk.returncode == 0 and not chk.stderr, chk.stderr[:100])
        subprocess.run(['pdftoppm', '-png', '-r', '70', pdf, f'{OUT}/pdf_mes'])
        _, pdft = await gerar(pg, 'pdf', 'tudo')
        rt = PdfReader(pdft)
        ok('PDF de tudo quebra em várias páginas', len(rt.pages) >= 2, len(rt.pages))
        tt = rt.pages[-1].extract_text()
        ok('Cabeçalho da tabela repete na página nova', 'Valor' in rt.pages[1].extract_text())
        ok('Rodapé com total de páginas', f'Página {len(rt.pages)} de {len(rt.pages)}' in tt)
        subprocess.run(['pdftoppm', '-png', '-r', '70', pdft, f'{OUT}/pdf_tudo'])

        # ---------- backup pela janela continua funcionando e marca a data
        nome, j = await gerar(pg, 'backup')
        ok('Backup completo pela janela', nome.endswith('.json') and json.load(open(j))['app'] == 'caixa-familia', nome)
        await pg.goto(U + '#ajustes'); await pg.wait_for_timeout(600)
        ok('Data do último backup atualizada', 'Último backup:' in await pg.inner_text('#conteudo'))

        # ---------- período vazio
        await pg.goto(U + '#inicio'); await pg.wait_for_timeout(500)
        for _ in range(14):
            await pg.click('[data-mes="1"]'); await pg.wait_for_timeout(120)
        _, pv = await gerar(pg, 'pdf', 'mes')
        tv = PdfReader(pv).pages[0].extract_text()
        ok('PDF de mês vazio mostra "Nenhum..."', 'Nenhum lançamento neste período' in tv)
        _, xv = await gerar(pg, 'excel', 'mes')
        ok('Planilha de mês vazio abre', openpyxl.load_workbook(xv)['Lançamentos'].max_row == 2)

        # ---------- sem internet
        await ctx.set_offline(True)
        _, xo = await gerar(pg, 'excel', 'ano', 'offline.xlsx')
        ok('Gera planilha sem internet', zipfile.is_zipfile(xo))
        await ctx.set_offline(False)

        ok('Sem erros de JavaScript', not errs, errs[:3])
        await b.close()
    for r in R: print(*r)
    print(sum(r[0] == 'PASS' for r in R), 'passaram /', len(R))

asyncio.run(main())
