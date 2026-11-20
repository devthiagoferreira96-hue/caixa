"""QA da transferência entre contas (saque, Pix de uma conta para outra).
Uso: python transferencia.py [pasta-de-saida]   (servidor do build em http://localhost:8765/)"""
import asyncio, sys, os, re, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from insumos import ir, ultimo_toast, limpar_toasts
from playwright.async_api import async_playwright
U = 'http://localhost:8765/'
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))
limpo = lambda s: s.replace('\xa0', ' ')

async def saldo(pg, conta):
    return limpo(await pg.locator('section[aria-labelledby=t-saldo] li', has_text=conta).locator('p[title]').get_attribute('title'))

async def inicio(pg):
    await ir(pg, 'inicio'); await pg.wait_for_selector('#t-saldo'); await pg.wait_for_timeout(300)
    total = limpo(await pg.inner_text('section[aria-labelledby=t-saldo] p.text-2xl'))
    resumos = [limpo(t) for t in await pg.locator('#conteudo dl').all_inner_texts()]
    return {'total': total, 'cc': await saldo(pg, 'Conta corrente'), 'esp': await saldo(pg, 'Espécie'), 'resumos': resumos}

async def filtrar(pg, contas):
    """Extrato filtrado nessas contas: (entradas, saídas) em número. Volta para "Todas as contas" no fim."""
    await ir(pg, 'extrato'); await pg.wait_for_selector('#resultado dl')
    m = pg.locator('[data-filtro-contas]')
    await m.locator('summary').click()
    for c in contas: await m.get_by_role('checkbox', name=c, exact=True).check()
    await pg.wait_for_timeout(200)
    vals = [reais(x) for x in await pg.locator('#resultado dl dd').all_inner_texts()]
    await m.get_by_role('checkbox', name='Todas as contas', exact=True).check(); await pg.keyboard.press('Escape')
    return round(vals[0], 2), round(vals[1], 2)

def reais(s):
    return float(re.sub(r'[^\d,-]', '', s.replace('−', '-')).replace(',', '.'))

async def nova_transferencia(pg, valor, de, para, desc='', data=None):
    await ir(pg, 'novo'); await limpar_toasts(pg)
    await pg.check('[name=modo][value=transferencia]', force=True); await pg.wait_for_timeout(150)
    await pg.fill('#f-valor', str(valor))
    if desc: await pg.fill('#f-descricao', desc)
    await pg.select_option('[name=transf_de]', label=de)
    await pg.select_option('[name=transf_para]', label=para)
    if data: await pg.fill('[name=transf_data]', data)
    await pg.click('button[type=submit]'); await pg.wait_for_timeout(700)
    return await ultimo_toast(pg)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        await preparar(pg, U, exemplo=True); await pular_tour(pg)
        hoje = await pg.evaluate("(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()")

        antes = await inicio(pg)
        f_cc, f_duas = await filtrar(pg, ['Conta corrente']), await filtrar(pg, ['Conta corrente', 'Espécie'])

        # ---------- tela Novo lançamento
        await ir(pg, 'novo')
        ok('opção Transferência no Novo lançamento', await pg.locator('[name=modo][value=transferencia]').count() == 1)
        await pg.check('[name=modo][value=transferencia]', force=True); await pg.wait_for_timeout(150)
        ok('esconde categoria e campos de saída/entrada', not await pg.locator('#f-categoria').is_visible() and not await pg.locator('#f-conta').is_visible())
        ok('mostra origem e destino', await pg.locator('[name=transf_de]').is_visible() and await pg.locator('[name=transf_para]').is_visible())
        ok('descrição é opcional', '(opcional)' in await pg.inner_text('label[for=f-descricao]'))
        await pg.select_option('[name=transf_de]', label='Conta corrente'); await pg.select_option('[name=transf_para]', label='Conta corrente')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(300)
        t = await pg.inner_text('#conteudo form')
        ok('sem valor e mesma conta: avisa', 'Digite quanto foi transferido' in t and 'conta diferente' in t)
        await pg.select_option('[name=transf_para]', label='Espécie')
        await pg.fill('#f-valor', '20000'); await pg.wait_for_timeout(100)
        ok('resumo ao vivo', 'R$ 200,00 saem de Conta corrente e entram em Espécie' in limpo(await pg.inner_text('[data-transf-resumo]')))
        await pg.click('[data-inverter]'); await pg.wait_for_timeout(100)
        ok('botão de trocar as contas', await pg.locator('[name=transf_de] option:checked').inner_text() == 'Espécie'
           and await pg.locator('[name=transf_para] option:checked').inner_text() == 'Conta corrente')
        await pg.click('[data-inverter]')
        await pg.screenshot(path=os.path.join(SAIDA, 'transferencia-novo.png'), full_page=True)
        await pg.fill('#f-descricao', 'Saque'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(700)
        toast = limpo(await ultimo_toast(pg))
        ok('salva com aviso', 'Transferência salva: R$ 200,00 de Conta corrente para Espécie' in toast, toast)
        ok('volta limpo para a próxima', await pg.input_value('#f-valor') == '' and await pg.locator('[name=transf_de]').is_visible())

        # ---------- saldos mudam, resumo do mês não
        depois = await inicio(pg)
        ok('Conta corrente perde R$ 200', round(reais(antes['cc']) - reais(depois['cc']), 2) == 200, (antes['cc'], depois['cc']))
        ok('Espécie ganha R$ 200', round(reais(depois['esp']) - reais(antes['esp']), 2) == 200, (antes['esp'], depois['esp']))
        ok('saldo total não muda', antes['total'] == depois['total'], (antes['total'], depois['total']))
        ok('entradas e gastos do mês não mudam', antes['resumos'] == depois['resumos'], (antes['resumos'], depois['resumos']))

        # ---------- Extrato
        await ir(pg, 'extrato'); await pg.wait_for_selector('#resultado dl')
        itens = pg.locator('#conteudo li', has_text='Saque')
        ok('Extrato: aparece a saída e a entrada', await itens.count() == 2)
        txt = limpo(' | '.join(await itens.all_inner_texts()))
        ok('Extrato: diz para onde e de onde', 'Transferência para Espécie' in txt and 'Transferência de Conta corrente' in txt and 'Feita' in txt, txt)
        await pg.screenshot(path=os.path.join(SAIDA, 'transferencia-extrato.png'))
        g_cc, g_duas = await filtrar(pg, ['Conta corrente']), await filtrar(pg, ['Conta corrente', 'Espécie'])
        ok('filtrando só a origem, a transferência conta como saída dela', g_cc == (f_cc[0], round(f_cc[1] + 200, 2)), (f_cc, g_cc))
        ok('filtrando as duas contas, uma ponta anula a outra', g_duas == f_duas, (f_duas, g_duas))

        # ---------- editar: as duas pontas mudam juntas
        await ir(pg, 'extrato'); await pg.wait_for_selector('#resultado dl')
        await pg.locator('#conteudo li', has_text='Transferência de Conta corrente').locator('[data-editar]').click()
        await pg.wait_for_selector('dialog[open] [name=transf_de]')
        d = 'dialog[open]'
        ok('editar abre a transferência inteira', await pg.input_value(f'{d} #f-valor') == '200,00' and await pg.locator(f'{d} [name=transf_de] option:checked').inner_text() == 'Conta corrente'
           and await pg.locator(f'{d} [name=transf_para] option:checked').inner_text() == 'Espécie' and await pg.input_value(f'{d} #f-descricao') == 'Saque')
        await pg.fill(f'{d} #f-valor', '25000'); await pg.select_option(f'{d} [name=transf_para]', label='Poupança')
        await pg.click(f'{d} button[type=submit]'); await pg.wait_for_timeout(700)
        txt = limpo(' | '.join(await pg.locator('#conteudo li', has_text='Saque').all_inner_texts()))
        ok('editado: valor e destino mudam nas duas pontas', txt.count('250,00') == 2 and 'Transferência para Poupança' in txt and 'Transferência de Conta corrente' in txt and 'Espécie' not in txt, txt)
        depois2 = await inicio(pg)
        ok('editado: Espécie volta ao saldo de antes', depois2['esp'] == antes['esp'], (antes['esp'], depois2['esp']))
        ok('editado: Conta corrente com −R$ 250', round(reais(antes['cc']) - reais(depois2['cc']), 2) == 250, (antes['cc'], depois2['cc']))

        # ---------- marcar como não feita: as duas pontas
        await ir(pg, 'extrato'); await pg.wait_for_selector('#resultado dl')
        await pg.locator('#conteudo li', has_text='Transferência para Poupança').locator('[data-pagar]').click(); await pg.wait_for_timeout(700)
        txt = limpo(' | '.join(await pg.locator('#conteudo li', has_text='Saque').all_inner_texts()))
        ok('desmarcar: as duas pontas voltam para em aberto', 'Feita' not in txt and txt.count('Agendada') + txt.count('Atrasada') == 2, txt)
        ok('desmarcar: saldo da Conta corrente volta', (await inicio(pg))['cc'] == antes['cc'])
        await ir(pg, 'extrato'); await pg.wait_for_selector('#resultado dl')
        await pg.locator('#conteudo li', has_text='Transferência para Poupança').locator('[data-pagar]').click(); await pg.wait_for_timeout(700)
        ok('marcar de novo: as duas feitas', limpo(' | '.join(await pg.locator('#conteudo li', has_text='Saque').all_inner_texts())).count('Feita') == 2)

        # ---------- excluir: as duas pontas, com desfazer
        await pg.locator('#conteudo li', has_text='Transferência de Conta corrente').locator('[data-editar]').click()
        await pg.wait_for_selector('dialog[open] [data-excluir]'); await pg.click('dialog[open] [data-excluir]')
        await pg.wait_for_selector('dialog[open] [data-resposta=sim]'); await limpar_toasts(pg)
        await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(700)
        ok('excluir: some a saída e a entrada', await pg.locator('#conteudo li', has_text='Saque').count() == 0)
        await pg.click('#toasts button:has-text("Desfazer")'); await pg.wait_for_timeout(800)
        ok('desfazer a exclusão: voltam as duas', await pg.locator('#conteudo li', has_text='Saque').count() == 2)

        # ---------- desfazer logo depois de lançar
        await nova_transferencia(pg, 5000, 'Nubank', 'Espécie', 'Pix teste')
        await pg.click('#toasts button:has-text("Desfazer")'); await pg.wait_for_timeout(800)
        await ir(pg, 'extrato'); await pg.wait_for_selector('#resultado dl')
        ok('desfazer o lançamento: some a transferência', await pg.locator('#conteudo li', has_text='Pix teste').count() == 0)

        # ---------- Relatório e backup
        await ir(pg, 'relatorio'); await pg.wait_for_timeout(600)
        ok('Relatório: transferência não aparece como gasto', 'Saque' not in await pg.inner_text('#conteudo'))
        ok('sem erros no console', not erros, erros)

        # ---------- celular
        await pg.set_viewport_size({'width': 360, 'height': 780})
        await ir(pg, 'novo'); await pg.check('[name=modo][value=transferencia]', force=True); await pg.wait_for_timeout(200)
        larg = await pg.evaluate('document.documentElement.scrollWidth')
        ok('celular: sem rolagem para o lado', larg <= 360, larg)
        await pg.screenshot(path=os.path.join(SAIDA, 'transferencia-celular.png'), full_page=True)
        await ir(pg, 'extrato'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SAIDA, 'transferencia-extrato-celular.png'))
        await b.close()
    for r in R: print(r[0], r[1], '' if r[0] == 'PASS' else r[2])
    print(f"{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")

if __name__ == "__main__": asyncio.run(main())
