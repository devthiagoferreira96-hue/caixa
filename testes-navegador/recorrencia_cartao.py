"""QA da repetição (nº de meses, sempre, anual), assinatura no cartão, excluir parcelas
(só esta / esta e as próximas / tudo), pessoa na compra do cartão, reembolso e adiantamento da fatura.
Uso: python recorrencia_cartao.py [pasta-de-saida]   (servidor do build em http://localhost:8765/)"""
import asyncio, sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from playwright.async_api import async_playwright
U = 'http://localhost:8765/'
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

async def ir(pg, r):
    await pg.evaluate("location.hash='#inicio'"); await pg.wait_for_timeout(200)
    await pg.evaluate(f"location.hash='#{r}'"); await pg.wait_for_timeout(700)
async def mes(pg, n):
    """Vai para o mês atual + n (no seletor do topo)"""
    await pg.evaluate("document.querySelector('[data-mes=\"0\"]')?.click()"); await pg.wait_for_timeout(400)
    for _ in range(n):
        await pg.locator('[data-mes="1"]').first.click(); await pg.wait_for_timeout(350)
async def ultimo_toast(pg):
    t = await pg.locator('#toasts > *').all_inner_texts()
    return t[-1] if t else ''
async def limpar_toasts(pg):
    await pg.evaluate("document.getElementById('toasts').innerHTML=''")
async def conteudo(pg): return (await pg.inner_text('#conteudo')).replace('\xa0', ' ')

async def novo_caixa(pg, valor, desc, repetir, n=None, cat='Despesas Fixas Casa'):
    await ir(pg, 'novo'); await limpar_toasts(pg)
    await pg.check('[name=modo][value=saida]', force=True); await pg.wait_for_timeout(150)
    await pg.fill('#f-valor', valor); await pg.fill('#f-descricao', desc)
    await pg.select_option('#f-categoria', label=cat)
    await pg.select_option('#f-repetir', repetir)
    if n is not None: await pg.fill('#f-meses', str(n))
    await pg.click('button[type=submit]'); await pg.wait_for_timeout(700)
    return await ultimo_toast(pg)

async def novo_cartao(pg, oque, valor, desc, parcelas=None, pessoa=None, cat='Despesas Fixas Casa'):
    await ir(pg, 'novo'); await limpar_toasts(pg)
    await pg.check('[name=modo][value=cartao]', force=True); await pg.wait_for_timeout(150)
    await pg.check(f'[name=no_cartao][value={oque}]', force=True); await pg.wait_for_timeout(150)
    await pg.fill('#f-valor', valor)
    if desc is not None: await pg.fill('#f-descricao', desc)
    if oque != 'adiantamento': await pg.select_option('#f-categoria', label=cat)
    if parcelas: await pg.select_option('#f-parcelas', parcelas)
    if pessoa: await pg.fill('#f-pessoa-cartao', pessoa)
    await pg.click('button[type=submit]'); await pg.wait_for_timeout(800)
    # "lançamento repetido?" (compra parecida já lançada)
    if await pg.locator('dialog[open] [data-r=sim]').count(): await pg.click('dialog[open] [data-r=sim]'); await pg.wait_for_timeout(600)
    return await ultimo_toast(pg)

async def excluir_no_extrato(pg, desc, escolha):
    await pg.locator('#conteudo [data-editar]', has_text=desc).first.click(); await pg.wait_for_timeout(400)
    await pg.click('dialog[open] [data-excluir]'); await pg.wait_for_timeout(400)
    await pg.click(f'dialog[open] [data-r="{escolha}"]'); await pg.wait_for_timeout(700)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        await preparar(pg, U, exemplo=True); await pular_tour(pg)

        # 1. repetir por N meses (digitado)
        await ir(pg, 'novo')
        opcoes = await pg.locator('#f-repetir option').all_inner_texts()
        ok('opções de repetição', opcoes == ['Não, só esta vez', 'Toda semana, por algumas semanas', 'Toda semana, sempre (até eu parar)', 'Todo mês, por alguns meses', 'Todo mês, sempre (até eu parar)', 'Todo ano, por alguns anos', 'Todo ano, sempre (até eu parar)'], opcoes)
        t = await novo_caixa(pg, '9990', 'Internet fibra', 'meses', 1)
        ok('1 mês é recusado', 'entre 2 e 120' in await pg.inner_text('#conteudo'))
        t = await novo_caixa(pg, '9990', 'Internet fibra', 'meses', 5)
        ok('5 meses digitados', 'próximas 5 vezes (todo mês)' in t, t)
        await ir(pg, 'extrato'); await mes(pg, 4)
        c = await conteudo(pg)
        ok('5º mês lançado (5/5)', 'Internet fibra' in c and 'parcela 5/5' in c)
        await mes(pg, 5)
        ok('6º mês não existe', 'Internet fibra' not in await conteudo(pg))

        # 2. sempre (todo mês)
        t = await novo_caixa(pg, '4590', 'Streaming casa', 'sempre')
        ok('sempre: avisa', 'todo mês (até você parar)' in t, t)
        await ir(pg, 'extrato'); await mes(pg, 12)
        c = await conteudo(pg)
        ok('sempre: 12 meses à frente lançados', 'Streaming casa' in c and 'todo mês' in c)
        await mes(pg, 13)
        ok('sempre: não passa do limite', 'Streaming casa' not in await conteudo(pg))
        # excluir este e os próximos (em 3 meses) encerra
        await mes(pg, 3); await limpar_toasts(pg)
        await excluir_no_extrato(pg, 'Streaming casa', 'todos')
        t = await ultimo_toast(pg)
        ok('sempre: este e os próximos exclui', 'lançamentos excluídos' in t, t)
        ok('sempre: some do mês', 'Streaming casa' not in await conteudo(pg))
        await mes(pg, 2)
        c = await conteudo(pg)
        ok('sempre: meses anteriores ficam, sem repetir', 'Streaming casa' in c and 'todo mês' not in c)
        # recarregar (abre de novo e completa recorrências): não volta
        await pg.reload(); await preparar(pg, U); await pg.wait_for_timeout(500)
        await ir(pg, 'extrato'); await mes(pg, 6)
        ok('sempre: depois de parar, abrir de novo não relança', 'Streaming casa' not in await conteudo(pg))

        # 3. todo ano, sempre
        t = await novo_caixa(pg, '120000', 'IPVA caminhonete', 'anual')
        ok('anual: avisa', 'todo ano' in t, t)
        await ir(pg, 'extrato'); await mes(pg, 12)
        c = await conteudo(pg)
        ok('anual: próximo ano lançado', 'IPVA caminhonete' in c and 'todo ano' in c)
        await mes(pg, 1)
        ok('anual: não lança no mês seguinte', 'IPVA caminhonete' not in await conteudo(pg))
        t = await novo_caixa(pg, '50000', 'Seguro trator', 'anos', 3)
        ok('anual por 3 anos', 'próximas 3 vezes (todo ano)' in t, t)
        await ir(pg, 'extrato'); await mes(pg, 24)
        ok('anual: 3º ano lançado', 'Seguro trator' in await conteudo(pg))

        # 4. cartão: assinatura com pessoa
        await ir(pg, 'novo')
        await pg.check('[name=modo][value=cartao]', force=True); await pg.wait_for_timeout(150)
        ok('cartão: escolha compra/reembolso/adiantamento', await pg.locator('[name=no_cartao]').count() == 3)
        ok('cartão: campo pessoa', await pg.locator('#f-pessoa-cartao').is_visible())
        await pg.screenshot(path=os.path.join(SAIDA, 'novo-cartao.png'), full_page=True)
        t = await novo_cartao(pg, 'compra', '3990', 'Netflix família', parcelas='sempre', pessoa='Maria')
        ok('assinatura lançada', 'Assinatura “Netflix família”' in t and 'todo mês' in t, t)
        await ir(pg, 'cartoes'); await mes(pg, 3)
        c = await conteudo(pg)
        ok('assinatura aparece com selo Mensal', 'Netflix família' in c and 'Mensal' in c)
        ok('compra mostra a pessoa', 'Maria' in c)
        # cancelar a partir deste mês
        await pg.locator('#conteudo li', has_text='Netflix família').locator('[data-excluir-parcela]').click(); await pg.wait_for_timeout(400)
        ok('pergunta só esta / próximas / inteira', await pg.locator('dialog[open] [data-r]').count() == 4)
        await limpar_toasts(pg)
        await pg.click('dialog[open] [data-r="proximas"]'); await pg.wait_for_timeout(700)
        t = await ultimo_toast(pg)
        ok('assinatura cancelada', 'cancelada a partir' in t, t)
        ok('some do mês cancelado', 'Netflix família' not in await conteudo(pg))
        await mes(pg, 2)
        c = await conteudo(pg)
        ok('mês anterior fica, marcado como cancelada', 'Netflix família' in c and 'cancelada' in c)

        # 5. parcelada: excluir só uma parcela
        t = await novo_cartao(pg, 'compra', '30000', 'Furadeira', parcelas='3')
        ok('compra 3x', '3 parcelas' in t, t)
        await ir(pg, 'cartoes'); await mes(pg, 2)
        await pg.locator('#conteudo li', has_text='Furadeira').locator('[data-excluir-parcela]').first.click(); await pg.wait_for_timeout(400)
        await pg.click('dialog[open] [data-r="uma"]'); await pg.wait_for_timeout(700)
        ok('só esta parcela: some do mês', 'Furadeira' not in await conteudo(pg))
        await mes(pg, 3)
        ok('só esta parcela: a seguinte fica', 'Furadeira' in await conteudo(pg) and '3/3' in await conteudo(pg))

        # 6. reembolso
        await ir(pg, 'cartoes'); await mes(pg, 1)
        antes = await pg.locator('#conteudo section').first.locator('p.text-2xl').inner_text()
        t = await novo_cartao(pg, 'estorno', '5000', 'Estorno loja')
        ok('reembolso lançado', 'Reembolso de R$' in t.replace('\xa0', ' '), t)
        await ir(pg, 'cartoes'); await mes(pg, 1)
        c = await conteudo(pg)
        depois = await pg.locator('#conteudo section').first.locator('p.text-2xl').inner_text()
        ok('reembolso aparece com +', 'Estorno loja' in c and '+ R$ 50,00' in c)
        val = lambda s: float(s.replace('R$', '').replace('\xa0', '').replace('.', '').replace(',', '.').strip())
        ok('reembolso abate a fatura', abs(val(antes) - val(depois) - 50) < 0.01, f'{antes} → {depois}')

        # 7. adiantamento pela tela Cartões
        await limpar_toasts(pg)
        await pg.locator('#conteudo [data-recebimento]').first.click(); await pg.wait_for_timeout(800)
        ok('botão abre o Novo no adiantamento', await pg.locator('[name=no_cartao][value=adiantamento]').is_checked())
        await pg.fill('#f-valor', '10000'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(800)
        t = await ultimo_toast(pg)
        ok('adiantamento lançado', 'Adiantamento de R$' in t.replace('\xa0', ' '), t)
        await ir(pg, 'cartoes'); await mes(pg, 1)
        sec = pg.locator('#conteudo section').first
        c = (await sec.inner_text()).replace('\xa0', ' ')
        ok('fatura adiantada em parte', 'Adiantada em parte' in c and 'Adiantado R$ 100,00' in c and 'Falta pagar' in c, c[-400:])
        await sec.locator('[data-pagar-fatura]').click(); await pg.wait_for_timeout(400)
        await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(800)
        c = (await pg.locator('#conteudo section').first.inner_text()).replace('\xa0', ' ')
        ok('pagar o restante deixa paga', 'Paga' in c and 'Adiantado R$ 100,00' in c)
        await ir(pg, 'inicio'); await mes(pg, 1)
        ok('Início mostra a fatura paga', 'Paga' in await conteudo(pg))
        await pg.screenshot(path=os.path.join(SAIDA, 'cartoes.png'), full_page=True)

        # 8. celular
        await pg.set_viewport_size({'width': 390, 'height': 844})
        await ir(pg, 'novo'); await pg.check('[name=modo][value=cartao]', force=True); await pg.wait_for_timeout(200)
        larg = await pg.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth]')
        ok('celular: sem rolagem lateral no Novo (cartão)', larg[0] <= larg[1], larg)
        await pg.screenshot(path=os.path.join(SAIDA, 'novo-cartao-celular.png'), full_page=True)
        await ir(pg, 'cartoes'); await mes(pg, 1)
        larg = await pg.evaluate('[document.documentElement.scrollWidth, document.documentElement.clientWidth]')
        ok('celular: sem rolagem lateral em Cartões', larg[0] <= larg[1], larg)

        ok('sem erros no console', not erros, erros[:3])
        await b.close()

if __name__ == "__main__":
    asyncio.run(main())
    for r in R: print(r[0], '|', r[1], '|', r[2] if r[0] != 'PASS' else '')
    print(f"\n{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")
