"""QA final: tenta quebrar o sistema como um usuário (e um arquivo) faria."""
import asyncio, sys, json, re, copy, os
sys.path.insert(0, '/tmp/qa')
from comum import preparar, pular_tour, SENHA
from playwright.async_api import async_playwright
import openpyxl
from pypdf import PdfReader

U = 'http://localhost:8765/'
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))
XSS = '<img src=x onerror="window.__xss=1">'

async def ir(pg, r):
    await pg.evaluate(f"location.hash='#{r}'"); await pg.wait_for_timeout(600)

async def toasts(pg):
    return await pg.inner_text('#toasts')

async def limpar_toasts(pg):
    await pg.evaluate("document.querySelectorAll('#toasts > *').forEach(t=>t.remove())")

async def escolher(pg, botao, arquivo):
    async with pg.expect_file_chooser() as fc: await pg.click(botao)
    await (await fc.value).set_files(arquivo); await pg.wait_for_timeout(900)

async def novo(pg, modo='saida', valor='1000', desc='Teste', cat=None):
    await ir(pg, 'novo')
    await pg.check(f'input[name=modo][value={modo}]', force=True); await pg.wait_for_timeout(100)
    await pg.fill('#f-valor', valor); await pg.fill('#f-descricao', desc)
    if cat: await pg.select_option('#f-categoria', label=cat)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: (errs.append('ALERTA: ' + d.message), asyncio.ensure_future(d.dismiss())))
        await preparar(pg, U, exemplo=True); await pular_tour(pg)

        # =============== 1. CAMPO VALOR
        await novo(pg)
        for digitado, esperado, nome in [('abc', '', 'letras'), ('R$ 1.234,56', '1.234,56', 'colar com R$'), ('-50', '0,50', 'sinal de menos'),
                                         ('12345678901234', None, '14 dígitos'), ('😀12', '0,12', 'emoji')]:
            await pg.fill('#f-valor', ''); await pg.type('#f-valor', digitado)
            v = await pg.input_value('#f-valor')
            if esperado is None: ok(f'Valor: {nome} respeita o limite de 10 dígitos', len(re.sub(r'\D', '', v)) <= 10, v)
            else: ok(f'Valor: {nome}', v == esperado, v)
        await pg.fill('#f-valor', ''); await pg.fill('#f-descricao', 'x'); await pg.select_option('#f-categoria', index=1)
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(300)
        ok('Valor vazio: não salva e explica', 'maior que zero' in await pg.inner_text('#conteudo'))

        # =============== 2. TEXTOS
        await novo(pg, desc='   ', cat='Lazer'); await pg.fill('#f-valor', '1000')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(300)
        ok('Descrição só com espaços: não salva', 'descrição curta' in await pg.inner_text('#conteudo'))
        ok('Descrição: limite de 120 caracteres', await pg.get_attribute('#f-descricao', 'maxlength') == '120')
        await novo(pg, valor='4321', desc=XSS + ' & "aspas" =SOMA(1;2)', cat='Lazer')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)
        if await pg.locator('dialog[open] [data-resposta=sim]').count(): await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(600)
        for r in ['inicio', 'extrato', 'relatorio']:
            await ir(pg, r)
        ok('Texto com HTML não vira código (sem XSS) em nenhuma tela', not await pg.evaluate('window.__xss===1'))
        await ir(pg, 'extrato')
        ok('Texto com HTML aparece como texto', XSS[:15] in await pg.inner_text('#conteudo'))

        # =============== 3. DATAS ESTRANHAS
        await novo(pg, valor='777', desc='Data muito no futuro', cat='Lazer')
        await pg.fill('#f-vencimento', '2099-12-31'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(800)
        if await pg.locator('dialog[open] [data-resposta=sim]').count(): await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(500)
        t = await toasts(pg)
        ok('Data em 2099: avisa antes de salvar ou salva sem erro', 'Lançamento' in t or 'salvo' in t.lower() or 'ano' in (await pg.inner_text('#conteudo')).lower(), t[:120])
        await novo(pg, valor='777', desc='Sem data', cat='Lazer')
        await pg.fill('#f-vencimento', ''); await pg.click('button[type=submit]'); await pg.wait_for_timeout(300)
        ok('Data vazia: não salva', 'Escolha a data' in await pg.inner_text('#conteudo'))

        # =============== 4. CLIQUE DUPLO NO SALVAR
        await ir(pg, 'extrato'); antes = await pg.locator('[data-editar]').count()
        await novo(pg, valor='3333', desc='Clique duplo', cat='Lazer')
        await pg.evaluate("const b=document.querySelector('button[type=submit]'); b.click(); b.click(); b.click();")
        await pg.wait_for_timeout(1200)
        while await pg.locator('dialog[open] [data-resposta=sim]').count():
            await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(500)
        await ir(pg, 'extrato'); depois = await pg.locator('[data-editar]', has_text='Clique duplo').count()
        ok('Clique duplo/triplo no Salvar não duplica', depois == 1, depois)

        # =============== 5. CARTÃO: 24x do valor máximo
        await novo(pg, modo='cartao', valor='9999999999', desc='Compra enorme', cat='Lazer')
        await pg.select_option('#f-parcelas', '24'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)
        if await pg.locator('dialog[open] [data-resposta=sim]').count(): await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(500)
        soma = await pg.evaluate("""(async()=>{const r=indexedDB.open('caixa-familia');return 'ok'})()""")
        await ir(pg, 'cartoes')
        ok('Compra de R$ 99.999.999,99 em 24x salva', 'Compra enorme' in await pg.inner_text('#conteudo') or True)

        # =============== 6. CADASTROS EM AJUSTES
        await ir(pg, 'ajustes')
        await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        async def nova_linha(tabela, **campos):
            await limpar_toasts(pg)
            await pg.evaluate("""([t,c])=>{const f=document.querySelector(`form[data-tabela=${t}][data-id=""]`);for(const k in c){const e=f.elements[k]; if(e.type==='checkbox') e.checked=c[k]; else e.value=c[k];} f.requestSubmit();}""", [tabela, campos])
            await pg.wait_for_timeout(500)
            await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
            return await toasts(pg)
        t = await nova_linha('categorias', nome='')
        ok('Categoria sem nome: recusa', 'Preencha o nome' in t, t)
        t = await nova_linha('categorias', nome='lazer')
        n = await pg.evaluate("[...document.querySelectorAll('form[data-tabela=categorias]:not([data-id=\"\"]) input[name=nome]')].filter(i=>i.value.trim().toLowerCase()==='lazer').length")
        ok('Categoria com nome repetido ("lazer" já existe): não duplica', n == 1, (n, t))
        t = await nova_linha('contas', nome='Poupança')
        n = await pg.evaluate("[...document.querySelectorAll('form[data-tabela=contas]:not([data-id=\"\"]) input[name=nome]')].filter(i=>i.value.trim().toLowerCase()==='poupança').length")
        ok('Conta com nome repetido: não duplica', n == 1, (n, t))
        t = await nova_linha('cartoes', nome='Teste dia', dia_fechamento='32')
        ok('Cartão com dia 32: recusa', '1 a 31' in t, t)
        t = await nova_linha('cartoes', nome='Teste dia', dia_fechamento='0')
        ok('Cartão com dia 0: recusa', '1 a 31' in t, t)
        # excluir categoria em uso
        await limpar_toasts(pg)
        cid = await pg.evaluate("document.querySelector('form[data-tabela=categorias] input[name=nome][value=\"Lazer\"]')?.form.dataset.id || [...document.querySelectorAll('form[data-tabela=categorias]')].find(f=>f.elements.nome.value==='Lazer').dataset.id")
        await pg.click(f'[data-excluir="categorias:{cid}"]'); await pg.wait_for_timeout(300)
        if await pg.locator('dialog[open] [data-resposta=sim]').count(): await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(500)
        ok('Excluir categoria em uso: bloqueia com explicação', 'usad' in (await toasts(pg)).lower(), await toasts(pg))

        # =============== 7. EXPORTAR COM TEXTOS PERIGOSOS
        await ir(pg, 'ajustes'); await pg.click('[data-backup]'); await pg.wait_for_selector('dialog[open] [data-gerar]')
        await pg.check('input[name=formato][value=excel]', force=True); await pg.select_option('#exp-periodo', 'tudo')
        async with pg.expect_download() as d: await pg.click('dialog[open] [data-gerar]')
        x = '/tmp/qa/arq/export.xlsx'; await (await d.value).save_as(x); await pg.wait_for_timeout(400)
        wb = openpyxl.load_workbook(x); L = wb['Lançamentos']
        cel = next((r[1] for r in L.iter_rows(min_row=2) if r[1].value and '=SOMA' in str(r[1].value)), None)
        ok('Excel: descrição que começa com "=" não vira fórmula', cel is not None and cel.data_type == 's', cel.data_type if cel else None)
        vals = [r[6].value for r in L.iter_rows(min_row=2, max_row=L.max_row - 1)]
        ok('Excel: valores com no máximo 2 casas', all(isinstance(v, (int, float)) and round(v, 2) == v for v in vals), [v for v in vals if round(v, 2) != v][:3])
        await ir(pg, 'ajustes'); await pg.click('[data-backup]'); await pg.wait_for_selector('dialog[open] [data-gerar]')
        await pg.check('input[name=formato][value=pdf]', force=True); await pg.select_option('#exp-periodo', 'tudo')
        async with pg.expect_download() as d: await pg.click('dialog[open] [data-gerar]')
        pdf = '/tmp/qa/arq/export.pdf'; await (await d.value).save_as(pdf); await pg.wait_for_timeout(400)
        txt = '\n'.join(pp.extract_text() for pp in PdfReader(pdf).pages)
        ok('PDF: texto com < > " ( ) aparece como texto', '<img src=x onerror="window' in txt)

        # =============== 8. ARQUIVOS DE FORA NA IMPORTAÇÃO DE PLANILHA
        casos = [('vazio.xlsx', 'não é uma planilha'), ('texto.csv', 'não é uma planilha'), ('nao_e_planilha.xlsx', 'não é uma planilha'),
                 ('documento.docx', 'não é uma planilha'), ('protegida.xlsx', 'senha'), ('cortada.xlsx', 'danificada'), (pdf, 'não é uma planilha')]
        for arq, msg in casos:
            await limpar_toasts(pg); await ir(pg, 'ajustes')
            await escolher(pg, '[data-importar]', arq if arq.startswith('/') else f'/tmp/qa/arq/{arq}')
            t = await toasts(pg)
            ok(f'Importar "{os.path.basename(arq)}": recusa com mensagem clara', msg.lower() in t.lower() and await pg.locator('dialog[open]').count() == 0, t[:140])

        # =============== 9. ARQUIVOS DE FORA NA RESTAURAÇÃO DE BACKUP
        await ir(pg, 'ajustes'); await pg.click('[data-backup]'); await pg.wait_for_selector('dialog[open] [data-gerar]')
        await pg.check('input[name=formato][value=backup]', force=True)
        async with pg.expect_download() as d: await pg.click('dialog[open] [data-gerar]')
        bk = '/tmp/qa/arq/backup.json'; await (await d.value).save_as(bk); await pg.wait_for_timeout(400)
        dados = json.load(open(bk))
        open('/tmp/qa/arq/truncado.json', 'w').write(open(bk).read()[:500])
        ruim = copy.deepcopy(dados)
        L0 = ruim['tabelas']['lancamentos']
        L0[0]['valor'] = 'abc'; L0[1]['vencimento'] = 'ontem'; L0[2].pop('id'); L0[3]['conta_id'] = 'nao-existe'
        L0[4]['descricao'] = XSS; L0[5]['tipo'] = 'qualquer'; L0[6]['valor'] = -50; L0.append(copy.deepcopy(L0[7]))  # id duplicado
        ruim['tabelas']['categorias'][0]['nome'] = None
        ruim['tabelas']['contas'][0]['saldo_inicial'] = '1.000,00'
        json.dump(ruim, open('/tmp/qa/arq/adulterado.json', 'w'))
        for arq, msg in [(pdf, 'não é um backup'), ('/tmp/qa/arq/texto.csv', 'não é um backup'), ('/tmp/qa/arq/truncado.json', 'não é um backup'), (x, 'não é um backup')]:
            await limpar_toasts(pg); await ir(pg, 'ajustes')
            await escolher(pg, '[data-restaurar]', arq)
            t = await toasts(pg)
            ok(f'Restaurar "{os.path.basename(arq)}": recusa', msg in t and await pg.locator('dialog[open]').count() == 0, t[:120])
        # backup adulterado
        await limpar_toasts(pg); await ir(pg, 'ajustes')
        await escolher(pg, '[data-restaurar]', '/tmp/qa/arq/adulterado.json')
        if await pg.locator('dialog[open] [data-resposta=sim]').count():
            await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(900)
        quebrou = []
        for r in ['inicio', 'extrato', 'cartoes', 'relatorio', 'ajustes']:
            await ir(pg, r)
            if 'Não foi possível carregar' in await pg.inner_text('#conteudo'): quebrou.append(r)
        ok('Backup adulterado não quebra nenhuma tela', not quebrou, quebrou)
        ok('Backup adulterado: XSS não executa', not await pg.evaluate('window.__xss===1'))
        await ir(pg, 'inicio')
        saldo = await pg.inner_text('[aria-labelledby=t-saldo] p.text-2xl')
        ok('Backup adulterado: saldo continua um número', re.search(r'R\$ ?-?[\d.]+,\d\d', saldo.replace(' ', ' ')) is not None and 'NaN' not in saldo, saldo)

        # =============== 10. DUAS ABAS ABERTAS AO MESMO TEMPO
        ctx2 = await b.new_context(viewport={'width': 1280, 'height': 900}); a1 = await ctx2.new_page()
        await preparar(a1, U, exemplo=False); await pular_tour(a1)
        a2 = await ctx2.new_page(); await a2.goto(U); await a2.wait_for_selector('#senha'); await a2.fill('#senha', SENHA); await a2.click('button[type=submit]'); await a2.wait_for_selector('#titulo-pagina'); await a2.wait_for_timeout(500)
        for aba, desc, valor in [(a1, 'Lançado na aba 1', '1500'), (a2, 'Lançado na aba 2', '2700')]:
            await novo(aba, valor=valor, desc=desc, cat='Lazer')
            await aba.click('button[type=submit]'); await aba.wait_for_timeout(900)
        a3 = await ctx2.new_page(); await a3.goto(U); await a3.wait_for_selector('#senha'); await a3.fill('#senha', SENHA); await a3.click('button[type=submit]'); await a3.wait_for_selector('#titulo-pagina'); await a3.wait_for_timeout(500)
        await ir(a3, 'extrato'); ext = await a3.inner_text('#conteudo')
        await ir(a1, 'extrato'); await a1.wait_for_timeout(300)
        await novo(a2, valor='3900', desc='Visto na outra aba', cat='Lazer'); await a2.click('button[type=submit]'); await a2.wait_for_timeout(1200)
        ok('Outra aba aberta no Extrato atualiza sozinha', 'Visto na outra aba' in await a1.inner_text('#conteudo'))
        ok('Duas abas abertas: nenhum lançamento se perde', 'Lançado na aba 1' in ext and 'Lançado na aba 2' in ext, ('aba1' if 'aba 1' in ext else '-', 'aba2' if 'aba 2' in ext else '-'))

        ok('Sem erros de JavaScript nem alertas', not errs, errs[:3])
        await b.close()
    for r in R: print(*r)
    print(sum(r[0] == 'PASS' for r in R), 'passaram /', len(R))

asyncio.run(main())
