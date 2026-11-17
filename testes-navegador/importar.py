import asyncio, sys, re
sys.path.insert(0, '/tmp/qa')
from comum import preparar, pular_tour
from playwright.async_api import async_playwright

U = 'http://localhost:8765/'
ARQ = sys.argv[1] if len(sys.argv) > 1 else '/tmp/imp/caixa_teste.xlsx'
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

def reais(t):
    t = t.replace(' ', ' ').strip()
    neg = t.startswith('-') or t.startswith('−')
    v = float(re.sub(r'[^\d,]', '', t).replace(',', '.'))
    return -v if neg else v

async def ir(pg, r):
    await pg.evaluate(f"location.hash='#{r}'"); await pg.wait_for_timeout(700)

async def abrir(pg, arquivo):
    await ir(pg, 'ajustes')
    async with pg.expect_file_chooser() as fc: await pg.click('[data-importar]')
    await (await fc.value).set_files(arquivo); await pg.wait_for_timeout(900)

async def resolver_criando(pg):
    for r in await pg.locator('dialog[open] [data-pendencia] input[value=criar]').all():
        await r.check(); await pg.wait_for_timeout(150)

async def ir_mes(pg, alvo):
    """Vai até o mês 'Novembro de 2026' etc. usando as setas."""
    for _ in range(24):
        atual = await pg.inner_text('[data-mes-atual], #mes-atual, header [aria-live]') if await pg.locator('[data-mes-atual], #mes-atual').count() else ''
        if alvo.lower() in (await pg.inner_text('body')).lower()[:3000]: return
        await pg.click('[data-mes="-1"]'); await pg.wait_for_timeout(150)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await preparar(pg, U, exemplo=False); await pular_tour(pg)
        # o cartão Maria saiu dos dados iniciais; a planilha de teste usa ele, então cadastra antes
        await pg.evaluate("location.hash='#ajustes'"); await pg.wait_for_timeout(500)
        await pg.click('[data-secao=cartoes] summary')
        f = pg.locator('[data-secao=cartoes] form[data-id=""]')
        await f.locator('[name=nome]').fill('Cartão Maria'); await f.locator('[name=dia_fechamento]').fill('5'); await f.locator('[name=dia_vencimento]').fill('12')
        await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(500)

        # ---------- arquivos errados
        await abrir(pg, '/tmp/imp/antigo.xls')
        ok('Recusa .xls antigo com explicação', '.xls' in await pg.inner_text('#toasts') and 'Salvar como' in await pg.inner_text('#toasts'))
        await abrir(pg, '/tmp/imp/outro_modelo.xlsx')
        ok('Recusa planilha fora do modelo', 'não está no modelo' in await pg.inner_text('#toasts'))
        ok('Nenhuma janela aberta depois do erro', await pg.locator('dialog[open]').count() == 0)

        # ---------- prévia
        await abrir(pg, ARQ)
        ok('Categoria desconhecida bloqueia a importação', await pg.locator('dialog[open] [data-importar-confirmar]').is_disabled() and 'Resolva 1 pendência' in await pg.inner_text('dialog[open] [data-importar-confirmar]'))
        ok('Mensagem diz que não existe no sistema', 'Categoria Nova X' in await pg.inner_text('dialog[open] [data-pendencias]') and 'não existe no sistema' in await pg.inner_text('dialog[open] [data-pendencias]'))
        await resolver_criando(pg)
        ok('Abre a prévia', await pg.locator('dialog[open] [data-form-importar]').count() == 1)
        dlg = pg.locator('dialog[open]')
        txt = await dlg.inner_text()
        abas = await dlg.locator('[data-aba]').count()
        ok('Mostra as 3 abas do modelo', abas == 3, abas)
        ok('Aba "Resumo" aparece como ignorada', 'serão ignoradas: Resumo' in txt)
        nomes = [await dlg.locator('[data-aba]').nth(i).locator('.font-semibold').first.inner_text() for i in range(abas)]
        usar = [await dlg.locator('[data-aba]').nth(i).locator('[data-usar]').is_checked() for i in range(abas)]
        meses = [await dlg.locator('[data-aba]').nth(i).locator('[data-mes]').input_value() for i in range(abas)]
        anos = [await dlg.locator('[data-aba]').nth(i).locator('[data-ano]').input_value() for i in range(abas)]
        info = dict(zip(nomes, zip(usar, meses, anos)))
        ok('OUTUBRO marcada, mês 10, ano 2026', info['OUTUBRO'] == (True, '10', '2026'), info)
        ok('NOVEMBRO marcada, mês 11, ano 2026', info['NOVEMBRO'] == (True, '11', '2026'), info)
        ok('Aba modelo vazia vem desmarcada', info['DEZEMBRO (2)'][0] is False, info)
        ok('Contagem por aba', '8 no caixa · 4 no cartão' in txt or '7 no caixa' in txt, re.findall(r'\d+ no caixa · \d+ no cartão', txt))
        resumo = await dlg.locator('[data-resumo]').inner_text()
        ok('Vai importar 9 lançamentos e 4 compras', '9 lançamentos do caixa' in resumo and '4 compras no cartão' in resumo, resumo[:200])
        ok('Detecta 1 pagamento de fatura', '1 é pagamento de fatura' in resumo)
        ok('Parcelas futuras completadas (5)', '5 parcela(s)' in resumo, resumo)
        ok('Saldo inicial das linhas de saldo anterior', 'Espécie R$ 500,00' in resumo and 'MMP R$ 10.000,00' in resumo, resumo)
        ok('"T MP" e "M.C. " reconhecidas (sem contas novas)', 'Contas novas' not in resumo)
        ok('Categoria nova listada', 'Categoria Nova X' in resumo)
        ok('Pessoa nova listada', 'Zé Vaqueiro' in resumo)
        await dlg.locator('summary').click()
        avisos = await dlg.locator('details').inner_text()
        ok('Aviso: linha sem valor', 'Esqueci o valor' in avisos and 'linha 11' in avisos, avisos)
        ok('Aviso: estorno no cartão', 'Estorno camisa' in avisos)
        ok('Aviso: saldo anterior de novembro ignorado', 'saldo anterior' in avisos)
        botao = await dlg.locator('[data-importar-confirmar]').inner_text()
        ok('Botão diz quantos itens', 'Importar 13 itens' in botao, botao)
        # desmarcar uma aba muda a contagem
        await dlg.locator('[data-aba]').nth(nomes.index('NOVEMBRO')).locator('[data-usar]').uncheck(); await pg.wait_for_timeout(200)
        r2 = await dlg.locator('[data-resumo]').inner_text()
        ok('Desmarcar NOVEMBRO recalcula', '7 lançamentos do caixa' in r2, r2[:120])
        await dlg.locator('[data-aba]').nth(nomes.index('NOVEMBRO')).locator('[data-usar]').check(); await pg.wait_for_timeout(200)

        # ---------- importar
        await dlg.locator('[data-importar-confirmar]').click(); await pg.wait_for_timeout(1500)
        ok('Janela fecha depois de importar', await pg.locator('dialog[open]').count() == 0)
        ok('Mensagem com Desfazer', 'Planilha importada' in await pg.inner_text('#toasts') and 'Desfazer' in await pg.inner_text('#toasts'))

        await ir(pg, 'inicio')
        saldos = {}
        for li in await pg.locator('[aria-labelledby=t-saldo] li').all():
            partes = [x for x in (await li.inner_text()).split("\n") if x.strip()]; n, v = partes[0], partes[-1]
            saldos[n.strip()] = reais(v)
        ok('Saldo MMP = 10.000 + 12.000 − 500 + 2.500', saldos.get('MMP') == 24000, saldos)
        ok('Saldo Espécie = 500', saldos.get('Espécie') == 500, saldos)
        ok('Saldo TMP = −1.800 (conta "T MP")', saldos.get('TMP') == -1800, saldos)
        ok('Saldo Nubank = −350,40 −99,90 +12,34', abs(saldos.get('Nubank', 0) - (-437.96)) < 0.001, saldos)
        ok('M.C.: escola não paga não mexe no saldo', saldos.get('M.C.') == 0, saldos)
        # novembro (mês atual): fazenda e casa
        faz = pg.locator('[data-area=Fazenda]')
        ok('Fazenda em novembro: venda de leite 2.500', reais(await faz.locator('dd').first.inner_text()) == 2500)
        casa_saiu = reais(await pg.locator('[aria-labelledby=t-resumo] dd').nth(1).inner_text())
        ok('Casa em novembro: escola 420 + pneu 300 + tênis 150', casa_saiu == 870, casa_saiu)

        # cartões: parcelas futuras em dezembro
        await ir(pg, 'cartoes')
        await pg.click('[data-mes="1"]'); await pg.wait_for_timeout(600)
        dez = await pg.inner_text('#conteudo')
        ok('Dezembro tem a 3ª parcela do pneu (criada)', 'Pneu' in dez and '3/3' in dez, dez[:300])
        ok('Dezembro tem a 4ª parcela do tênis (criada)', 'Tênis' in dez and '4/6' in dez)
        await pg.click('[data-mes="-1"]'); await pg.click('[data-mes="-1"]'); await pg.wait_for_timeout(600)
        outb = await pg.inner_text('#conteudo')
        ok('Outubro: cinema e parcelas 1/3 e 2/6', 'Cinema' in outb and '1/3' in outb and '2/6' in outb)

        # extrato de outubro
        await ir(pg, 'extrato'); await pg.wait_for_timeout(300)
        ext = await pg.inner_text('#conteudo')
        ok('Extrato de outubro com lançamentos importados', 'Venda de bezerros Lote 3' in ext and 'Escola (3/12)' in ext, ext[:300])
        ok('Pagamento de fatura reconhecido', 'Pagamento fatura' in ext)
        ok('Saldo anterior não virou lançamento', 'SALDO ANTERIOR' not in ext.upper().replace('SALDO ANTERIOR DO', ''))

        # ---------- importar de novo: não duplica
        await abrir(pg, ARQ)
        dlg = pg.locator('dialog[open]')
        r3 = await dlg.locator('[data-resumo]').inner_text()
        ok('Segunda importação: tudo já existe', 'Nada para importar' in r3 or ('0 lançamentos' in r3 and '13 item(ns) já estão no sistema' in r3), r3[:200])
        ok('Botão desabilitado quando não há nada novo', await dlg.locator('[data-importar-confirmar]').is_disabled())
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        # ---------- desfazer a importação
        await abrir(pg, ARQ)  # (só para garantir que a janela abre de novo sem erro)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await ir(pg, 'ajustes')
        ok('Categoria nova criada em Ajustes', 'Categoria Nova X' in await pg.evaluate("[...document.querySelectorAll('input[name=nome]')].map(i=>i.value).join('|')"))

        ok('Sem erros de JavaScript', not errs, errs[:3])
        await ctx.close()

        # ---------- desfazer logo após importar
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900}); pg = await ctx.new_page()
        await preparar(pg, U, exemplo=True); await pular_tour(pg)
        await ir(pg, 'extrato'); antes = await pg.locator('[data-editar]').count()
        await abrir(pg, ARQ)
        await resolver_criando(pg)
        r4 = await pg.locator('dialog[open] [data-resumo]').inner_text()
        ok('Com dados já no sistema, saldo anterior não vira saldo inicial', 'Saldo inicial' not in r4)
        await pg.click('dialog[open] [data-importar-confirmar]'); await pg.wait_for_timeout(1500)
        await pg.locator('#toasts >> text=Desfazer').last.click(); await pg.wait_for_timeout(900)
        await ir(pg, 'extrato'); depois = await pg.locator('[data-editar]').count()
        ok('Desfazer volta tudo como estava', depois == antes, (antes, depois))
        await ir(pg, 'ajustes')
        ok('Desfazer remove a categoria criada', 'Categoria Nova X' not in await pg.evaluate("[...document.querySelectorAll('input[name=nome]')].map(i=>i.value).join('|')"))
        await b.close()
    for r in R: print(*r)
    print(sum(r[0] == 'PASS' for r in R), 'passaram /', len(R))

asyncio.run(main())
