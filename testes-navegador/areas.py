import asyncio, sys, json, re
sys.path.insert(0, '/tmp/qa')
from comum import preparar, pular_tour
from playwright.async_api import async_playwright

U = 'http://localhost:8765/'
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

def reais(t):
    t = t.replace(' ', ' ').strip()
    neg = t.startswith('-') or t.startswith('−')
    v = float(re.sub(r'[^\d,]', '', t).replace(',', '.'))
    return -v if neg else v

async def ir(pg, r):
    await pg.evaluate(f"location.hash='#{r}'"); await pg.wait_for_timeout(700)

async def opcoes_categoria(pg):
    return await pg.eval_on_selector_all('#f-categoria option', 'os => os.map(o => o.textContent.trim())')

async def tipo_da(pg, nome):
    return await pg.evaluate("""(n) => { const f=[...document.querySelectorAll('form[data-tabela=categorias]')].find(f=>f.elements.nome?.value===n); return f ? {tipo:f.elements.tipo.value, grupo:f.elements.grupo.value} : null }""", nome)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await preparar(pg, U, exemplo=True); await pular_tour(pg)

        # ---------------- Início: casa x fazenda
        await ir(pg, 'inicio')
        txt = await pg.inner_text('#conteudo')
        ok('Título "Resumo da casa"', 'Resumo da casa em' in txt)
        res = pg.locator('[aria-labelledby=t-resumo] dd')
        casa = [reais(await res.nth(i).inner_text()) for i in range(3)]
        ok('Casa: entrou só o rendimento (venda é da fazenda)', casa[0] == 38.5, casa)
        faz = pg.locator('[data-area=Fazenda]')
        ok('Quadro da Fazenda aparece', await faz.count() == 1)
        fz = [reais(await faz.locator('dd').nth(i).inner_text()) for i in range(3)]
        ok('Fazenda: vendas = R$ 8.500', fz[0] == 8500, fz)
        ok('Fazenda: despesas incluem ração e salário', fz[1] >= 650 + 2400, fz)
        rot = await faz.locator('dt').nth(2).inner_text()
        ok('Fazenda: diz Lucro ou Prejuízo', rot in ('Lucro', 'Prejuízo'), rot)
        ok('Fazenda: valor do lucro bate', abs(fz[0] - fz[1]) == fz[2], fz)
        ok('Fazenda: lista entradas por categoria', 'Venda' in await faz.inner_text())
        nomes_barras = await faz.locator('[data-categoria]').all_inner_texts()
        ok('Fazenda: barras só de categorias da fazenda', any('Insumos' in n for n in nomes_barras) and not any('Lazer' in n or 'Veículo' in n for n in nomes_barras), nomes_barras)
        geral = reais(await pg.inner_text('[data-resultado-geral] strong'))
        ok('Resultado geral = casa + fazenda', abs(geral - (casa[2] + (fz[0] - fz[1]))) < 0.01, (geral, casa[2], fz))
        ok('Empresa sem lançamentos não aparece', await pg.locator('[data-area=Empresa]').count() == 0)
        # clicar na barra da fazenda abre o detalhe
        await faz.locator('[data-categoria]').first.click(); await pg.wait_for_timeout(300)
        ok('Barra da fazenda abre o detalhe', await pg.locator('dialog[open]').count() == 1)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        # gráfico da casa continua sem fazenda
        graf = await pg.locator('[aria-labelledby=t-grafico] [data-categoria]').all_inner_texts()
        ok('Gráfico do Início continua sem Fazenda', not any('Fazenda' in g or 'Venda' in g for g in graf))

        # ---------------- Formulário: categorias por tipo
        await ir(pg, 'novo')
        await pg.check('input[name=modo][value=saida]', force=True); await pg.wait_for_timeout(150)
        o = await opcoes_categoria(pg)
        ok('Saída: tem Lazer e Empréstimos', 'Lazer' in o and 'Empréstimos Bancários' in o, o)
        ok('Saída: não tem Venda nem Rendimentos', 'Venda' not in o and 'Rendimentos Bancários' not in o)
        await pg.check('input[name=modo][value=entrada]', force=True); await pg.wait_for_timeout(150)
        o = await opcoes_categoria(pg)
        ok('Entrada: tem Venda, Rendimentos, Empréstimos e Ajuste', all(x in o for x in ['Venda', 'Rendimentos Bancários', 'Empréstimos Dívidas', 'Ajuste Caixa']), o)
        ok('Entrada: não tem Lazer', 'Lazer' not in o)
        ok('Dica explica o filtro', 'entrada' in await pg.inner_text('[data-dica-categoria]'))
        await pg.select_option('#f-categoria', label='Empréstimos Bancários')
        await pg.check('input[name=modo][value=saida]', force=True); await pg.wait_for_timeout(150)
        ok('Categoria "os dois" continua escolhida ao trocar', await pg.eval_on_selector('#f-categoria', 'e => e.selectedOptions[0].textContent') == 'Empréstimos Bancários')
        await pg.check('input[name=modo][value=entrada]', force=True); await pg.select_option('#f-categoria', label='Venda')
        await pg.check('input[name=modo][value=cartao]', force=True); await pg.wait_for_timeout(150)
        ok('Trocar para cartão limpa "Venda"', await pg.eval_on_selector('#f-categoria', 'e => e.value') == '')
        ok('Aviso de que Venda não é de saída', 'não é de saída' in await pg.inner_text('[data-dica-categoria]'))
        ok('Cartão: sem categorias de entrada', 'Venda' not in await opcoes_categoria(pg))
        # salvar uma entrada da fazenda e ver o quadro mudar
        await pg.check('input[name=modo][value=entrada]', force=True)
        await pg.fill('#f-valor', '100000'); await pg.fill('#f-descricao', 'Venda de leite'); await pg.select_option('#f-categoria', label='Venda')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)
        await ir(pg, 'inicio')
        fz2 = reais(await pg.locator('[data-area=Fazenda] dd').first.inner_text())
        casa2 = reais(await pg.locator('[aria-labelledby=t-resumo] dd').first.inner_text())
        ok('Nova venda soma na Fazenda, não na casa', fz2 == fz[0] + 1000 and casa2 == casa[0], (fz2, casa2))

        # ---------------- Edição: trocar tipo
        await ir(pg, 'extrato')
        await pg.locator('[data-editar]', has_text='Venda de leite').click(); await pg.wait_for_timeout(300)
        ok('Edição mostra Venda selecionada', await pg.eval_on_selector('dialog[open] #f-categoria', 'e => e.selectedOptions[0].textContent') == 'Venda')
        await pg.check('dialog[open] input[name=tipo][value=saida]', force=True); await pg.wait_for_timeout(150)
        ok('Edição: trocar para saída limpa a categoria', await pg.eval_on_selector('dialog[open] #f-categoria', 'e => e.value') == '')
        await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(300)
        ok('Edição: não salva sem categoria', await pg.locator('dialog[open]').count() == 1)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)

        # ---------------- Ajustes: tipo da categoria
        await ir(pg, 'ajustes')
        await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        ok('Venda é Entrada e está no grupo Fazenda', await tipo_da(pg, 'Venda') == {'tipo': 'entrada', 'grupo': 'Fazenda'}, await tipo_da(pg, 'Venda'))
        ok('Empréstimos é "Os dois"', (await tipo_da(pg, 'Empréstimos Bancários'))['tipo'] == 'ambos')
        ok('Lazer é Saída', (await tipo_da(pg, 'Lazer'))['tipo'] == 'saida')
        # tentar mudar Venda (com entradas) para Saída
        await pg.evaluate("""() => { const f=[...document.querySelectorAll('form[data-tabela=categorias]')].find(f=>f.elements.nome?.value==='Venda'); f.elements.tipo.value='saida'; f.requestSubmit(); }""")
        await pg.wait_for_timeout(500)
        ok('Bloqueia mudar Venda para Saída (já tem entradas)', 'já tem entradas' in await pg.inner_text('#toasts'))
        await pg.evaluate("""() => { const f=[...document.querySelectorAll('form[data-tabela=categorias]')].find(f=>f.elements.nome?.value==='Lazer'); f.elements.tipo.value='ambos'; f.requestSubmit(); }""")
        await pg.wait_for_timeout(600)
        await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        ok('Muda Lazer para "Os dois"', (await tipo_da(pg, 'Lazer'))['tipo'] == 'ambos')
        # nova categoria de entrada
        await pg.evaluate("""() => { const f=document.querySelector('form[data-tabela=categorias][data-id=""]'); f.elements.nome.value='Aluguel recebido'; f.elements.tipo.value='entrada'; f.requestSubmit(); }""")
        await pg.wait_for_timeout(600)
        await ir(pg, 'novo'); await pg.check('input[name=modo][value=entrada]', force=True); await pg.wait_for_timeout(150)
        ok('Nova categoria de entrada aparece em Entrada', 'Aluguel recebido' in await opcoes_categoria(pg))
        await pg.check('input[name=modo][value=saida]', force=True); await pg.wait_for_timeout(150)
        ok('...e não aparece em Saída', 'Aluguel recebido' not in await opcoes_categoria(pg))

        # ---------------- Empresa aparece quando tem lançamento
        await pg.fill('#f-valor', '50000'); await pg.fill('#f-descricao', 'Contador'); await pg.select_option('#f-categoria', label='Jurídico')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)
        await ir(pg, 'inicio')
        ok('Quadro da Empresa aparece com lançamento', await pg.locator('[data-area=Empresa]').count() == 1)
        ok('Resultado geral cita a empresa', 'empresa' in (await pg.inner_text('[data-resultado-geral]')).lower())

        # ---------------- PDF / Excel com áreas
        await ir(pg, 'ajustes'); await pg.click('[data-backup]'); await pg.wait_for_selector('dialog[open] [data-gerar]')
        async with pg.expect_download() as d: await pg.click('dialog[open] [data-gerar]')
        caminho = '/tmp/qa/areas-backup.json'; await (await d.value).save_as(caminho); await pg.wait_for_timeout(400)

        await ir(pg, 'ajustes'); await pg.click('[data-backup]'); await pg.wait_for_selector('dialog[open] [data-gerar]')
        await pg.check('input[name=formato][value=excel]', force=True)
        async with pg.expect_download() as d: await pg.click('dialog[open] [data-gerar]')
        x = '/tmp/qa/areas.xlsx'; await (await d.value).save_as(x); await pg.wait_for_timeout(400)
        import openpyxl
        rz = [[c.value for c in r] for r in openpyxl.load_workbook(x)['Resumo'].iter_rows()]
        areas = {r[0]: r for r in rz if r[0] in ('Casa', 'Fazenda', 'Empresa')}
        ok('Excel: resultado por área', set(areas) == {'Casa', 'Fazenda', 'Empresa'} and areas['Fazenda'][1] == fz[0] + 1000, areas)
        await ir(pg, 'ajustes'); await pg.click('[data-backup]'); await pg.wait_for_selector('dialog[open] [data-gerar]')
        await pg.check('input[name=formato][value=pdf]', force=True)
        async with pg.expect_download() as d: await pg.click('dialog[open] [data-gerar]')
        pdf = '/tmp/qa/areas.pdf'; await (await d.value).save_as(pdf); await pg.wait_for_timeout(400)
        from pypdf import PdfReader
        t = PdfReader(pdf).pages[0].extract_text()
        ok('PDF: resultado por área', 'Resultado por área' in t and 'Casa (sem Fazenda e Empresa)' in t and 'Fazenda' in t, t[:200])

        # ---------------- Migração de dados antigos (sem tipo) via restaurar backup
        bk = json.load(open(caminho))
        cats = bk['tabelas']['categorias']
        for c in cats:
            c.pop('tipo', None)
            if c['nome'] == 'Venda': c['grupo'] = 'Financeiro'
        cid = lambda n: next(c['id'] for c in cats if c['nome'] == n)
        cats += [{'id': 'c-bico', 'nome': 'Bicos', 'grupo': 'Casa', 'no_grafico': True},
                 {'id': 'c-misto', 'nome': 'Misto', 'grupo': 'Casa', 'no_grafico': True},
                 {'id': 'c-nunca', 'nome': 'Nunca usada', 'grupo': 'Casa', 'no_grafico': True}]
        conta = bk['tabelas']['contas'][0]['id']
        base = {'conta_id': conta, 'vencimento': '2026-11-02', 'pago': True, 'criado_em': '2026-11-02T10:00:00Z'}
        bk['tabelas']['lancamentos'] += [
            {**base, 'id': 'l1', 'tipo': 'entrada', 'valor': 70, 'descricao': 'Bico de sábado', 'categoria_id': 'c-bico'},
            {**base, 'id': 'l2', 'tipo': 'entrada', 'valor': 10, 'descricao': 'Misto entra', 'categoria_id': 'c-misto'},
            {**base, 'id': 'l3', 'tipo': 'saida', 'valor': 5, 'descricao': 'Misto sai', 'categoria_id': 'c-misto'},
            {**base, 'id': 'l4', 'tipo': 'saida', 'valor': 7, 'descricao': 'Venda estranha', 'categoria_id': cid('Venda')},
        ]
        json.dump(bk, open('/tmp/qa/areas-antigo.json', 'w'))
        await ir(pg, 'ajustes')
        async with pg.expect_file_chooser() as fc: await pg.click('[data-restaurar]')
        await (await fc.value).set_files('/tmp/qa/areas-antigo.json'); await pg.wait_for_timeout(500)
        await pg.click('dialog [data-resposta=sim]'); await pg.wait_for_timeout(900)
        await ir(pg, 'ajustes'); await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        ok('Migração: categoria usada só em entrada vira Entrada', (await tipo_da(pg, 'Bicos'))['tipo'] == 'entrada')
        ok('Migração: usada nos dois vira "Os dois"', (await tipo_da(pg, 'Misto'))['tipo'] == 'ambos')
        ok('Migração: nunca usada vira Saída', (await tipo_da(pg, 'Nunca usada'))['tipo'] == 'saida')
        ok('Migração: Venda usada como saída vira "Os dois" (nada fica inválido)', (await tipo_da(pg, 'Venda'))['tipo'] == 'ambos')
        ok('Migração: Venda vai para o grupo Fazenda', (await tipo_da(pg, 'Venda'))['grupo'] == 'Fazenda')
        ok('Migração: Rendimentos vira Entrada', (await tipo_da(pg, 'Rendimentos Bancários'))['tipo'] == 'entrada')
        ok('Migração: Lazer continua Saída', (await tipo_da(pg, 'Lazer'))['tipo'] == 'saida')
        # editar lançamento antigo continua possível
        await ir(pg, 'extrato'); await pg.locator('[data-editar]', has_text='Bico de sábado').click(); await pg.wait_for_timeout(300)
        await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(500)
        ok('Lançamento antigo salva sem erro', await pg.locator('dialog[open]').count() == 0)

        ok('Sem erros de JavaScript', not errs, errs[:3])
        await b.close()
    for r in R: print(*r)
    print(sum(r[0] == 'PASS' for r in R), 'passaram /', len(R))

asyncio.run(main())
