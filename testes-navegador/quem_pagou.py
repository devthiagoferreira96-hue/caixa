"""QA: nota de insumos com dois produtores, em que um paga a parte dele antes do outro.
Em "Quem já pagou" cada produtor tem a sua linha: marcar, a data em que pagou e a conta em que entrou.
Uso: python quem_pagou.py [pasta-de-saida]   (servidor do build em http://localhost:8765/)"""
import asyncio, sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from insumos import ir, ultimo_toast, limpar_toasts, adicionar
from conta_por_produtor import linha, escolher, conta_corrente
from playwright.async_api import async_playwright
U = 'http://localhost:8765/'
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))
limpo = lambda s: s.replace('\xa0', ' ')
D = 'dialog[open]'

def pago(pg, nome):
    return pg.locator(f'{D} [data-pago]', has_text=nome)

async def abrir_nota(pg):
    await ir(pg, 'insumos'); await pg.wait_for_timeout(300)
    await pg.click('[data-entrega] >> text=Zeca'); await pg.wait_for_selector(f'{D} [data-pago]')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        await preparar(pg, U, exemplo=False); await pular_tour(pg)
        await ir(pg, 'ajustes')
        await pg.click('[data-secao=modulos] summary'); await pg.check('[data-modulo-resina]'); await pg.wait_for_timeout(800)
        await ir(pg, 'resina-cadastros')
        await adicionar(pg, 'resina_titulares', {'nome': 'Conta Itacury', 'documento': '111.111.111-11'})
        await adicionar(pg, 'resina_titulares', {'nome': 'Conta Zeca', 'documento': '222.222.222-22'})
        await adicionar(pg, 'resina_produtores', {'nome': 'Itacury', 'arrendamento': 40})
        await adicionar(pg, 'resina_produtores', {'nome': 'Zeca', 'arrendamento': 40})
        await adicionar(pg, 'resina_produtos', {'nome': 'Pasta 16%', 'unidade': 'kg', 'valor_unitario': '550'})
        await adicionar(pg, 'resina_produtos', {'nome': 'Arame', 'unidade': 'm', 'valor_unitario': '1000'})

        # ---------- nota com dois produtores: o Zeca já pagou
        await ir(pg, 'insumos'); await limpar_toasts(pg)
        await pg.click('[data-lancar]'); await pg.wait_for_selector(f'{D} [data-c=titular_id]')
        ok('sem produtor escolhido, "Quem já pagou" fica escondido', await pg.locator(f'{D} [data-receber-pagos]').is_hidden())
        await pg.fill(f'{D} #in-data', '2026-11-13'); await pg.fill(f'{D} #in-nota', 'NF 300')
        await escolher(pg, 0, 'produto_id', 'Pasta 16%'); await escolher(pg, 0, 'produtor_id', 'Itacury'); await escolher(pg, 0, 'titular_id', 'Conta Itacury')
        li = await linha(pg, 0)
        await li.locator('[data-c=quantidade]').fill('150'); await li.locator('[data-c=pct]').fill('50')
        await pg.click(f'{D} [data-mais-linha]'); await pg.wait_for_timeout(150)
        await escolher(pg, 1, 'produto_id', 'Arame'); await escolher(pg, 1, 'produtor_id', 'Zeca'); await escolher(pg, 1, 'titular_id', 'Conta Zeca')
        li = await linha(pg, 1)
        await li.locator('[data-c=quantidade]').fill('20'); await li.locator('[data-c=pct]').fill('30')
        await pg.wait_for_timeout(150)
        ok('uma linha para cada produtor', await pg.locator(f'{D} [data-pago]').count() == 2)
        ok('linha mostra a parte do produtor', 'R$ 60,00' in limpo(await pago(pg, 'Zeca').inner_text()), await pago(pg, 'Zeca').inner_text())
        ok('data e conta escondidas até marcar', await pago(pg, 'Zeca').locator('[data-pg-campos]').is_hidden())
        await pago(pg, 'Zeca').locator('[data-pg=pago]').check(); await pg.wait_for_timeout(100)
        ok('marcar mostra data e conta', await pago(pg, 'Zeca').locator('[data-pg-campos]').is_visible())
        ok('data vem preenchida', len(await pago(pg, 'Zeca').locator('[data-pg=data]').input_value()) == 10)
        await pago(pg, 'Zeca').locator('[data-pg=data]').fill('')
        await pg.click(f'{D} button[type=submit]'); await pg.wait_for_timeout(300)
        ok('sem data: não salva', await pg.locator(D).count() == 1 and await pg.locator(f'{D} [aria-invalid=true][data-pg=data]').count() == 1)
        await pago(pg, 'Zeca').locator('[data-pg=data]').fill('2026-11-10')
        # mexer na nota depois de marcar não perde o que foi marcado
        li = await linha(pg, 0)
        await li.locator('[data-c=quantidade]').fill('160'); await pg.wait_for_timeout(150)
        ok('mudar a nota mantém o Zeca marcado', await pago(pg, 'Zeca').locator('[data-pg=pago]').is_checked()
           and await pago(pg, 'Zeca').locator('[data-pg=data]').input_value() == '2026-11-10')
        await li.locator('[data-c=quantidade]').fill('150'); await pg.wait_for_timeout(150)
        await pg.screenshot(path=os.path.join(SAIDA, 'quem-pagou.png'), full_page=True)
        await pg.click(f'{D} button[type=submit]'); await pg.wait_for_timeout(800)
        ok('lançada', await pg.locator(D).count() == 0, await ultimo_toast(pg))

        # ---------- Extrato e conta corrente
        await ir(pg, 'extrato'); await pg.wait_for_timeout(400)
        z = pg.locator('#conteudo li', has_text='Zeca')
        i = pg.locator('#conteudo li', has_text='Itacury')
        ok('Extrato: Zeca já recebido em 10/11', await z.count() == 1 and await z.locator('[data-pagar][aria-pressed=true]').count() == 1 and 'recebido em 10/11' in await z.inner_text())
        ok('Extrato: Itacury ainda a receber', await i.count() == 1 and await i.locator('[data-pagar][aria-pressed=false]').count() == 1)
        c = await conta_corrente(pg, 'Conta Zeca')
        ok('Conta Zeca: recebido em 10/11', 'Recebido no Caixa' in c and '10/11' in c, c[:900])
        c = await conta_corrente(pg, 'Conta Itacury')
        ok('Conta Itacury: nada recebido', 'Recebido no Caixa' not in c, c[:900])

        # ---------- abrir de novo: o Zeca vem marcado; marcar o Itacury
        await abrir_nota(pg)
        ok('reabrir: Zeca marcado com a data', await pago(pg, 'Zeca').locator('[data-pg=pago]').is_checked()
           and await pago(pg, 'Zeca').locator('[data-pg=data]').input_value() == '2026-11-10')
        ok('reabrir: Itacury desmarcado', not await pago(pg, 'Itacury').locator('[data-pg=pago]').is_checked())
        await pago(pg, 'Itacury').locator('[data-pg=pago]').check()
        await pago(pg, 'Itacury').locator('[data-pg=data]').fill('2026-11-12')
        await pg.click(f'{D} button[type=submit]'); await pg.wait_for_timeout(800)
        c = await conta_corrente(pg, 'Conta Itacury')
        ok('Itacury marcado: crédito na Conta Itacury em 12/11', 'Recebido no Caixa' in c and '12/11' in c, c[:900])

        # ---------- desmarcar o Zeca volta para "a receber"
        await abrir_nota(pg)
        await pago(pg, 'Zeca').locator('[data-pg=pago]').uncheck()
        await pg.click(f'{D} button[type=submit]'); await pg.wait_for_timeout(800)
        await ir(pg, 'extrato'); await pg.wait_for_timeout(400)
        z = pg.locator('#conteudo li', has_text='Zeca')
        ok('desmarcar: Zeca volta a receber', await z.count() == 1 and await z.locator('[data-pagar][aria-pressed=false]').count() == 1)
        c = await conta_corrente(pg, 'Conta Zeca')
        ok('desmarcar: some o crédito da Conta Zeca', 'Recebido no Caixa' not in c, c[:900])

        # ---------- busca do Extrato acha pelo produtor, mesmo sem o nome na descrição
        await ir(pg, 'extrato'); await pg.wait_for_timeout(400)
        await pg.locator('#conteudo li', has_text='Zeca').locator('[data-editar]').click(); await pg.wait_for_selector(f'{D} #f-descricao')
        await pg.fill(f'{D} #f-descricao', 'Parte dos insumos da nota')
        cat = await pg.locator(f'{D} #f-categoria option[value]:not([value=""])').first.get_attribute('value')
        await pg.select_option(f'{D} #f-categoria', cat)
        await pg.click(f'{D} button[type=submit]'); await pg.wait_for_timeout(800)
        await ir(pg, 'extrato'); await pg.wait_for_timeout(400)
        await pg.fill('#f-busca', 'zeca'); await pg.wait_for_timeout(300)
        achados = await pg.locator('#resultado [data-editar]').all_inner_texts()
        ok('busca pelo produtor acha a parte dele', len(achados) == 1 and 'Parte dos insumos' in achados[0], achados)
        await pg.fill('#f-busca', ''); await pg.wait_for_timeout(200)

        # ---------- receber pelo Extrato também aparece marcado na nota
        await ir(pg, 'extrato'); await pg.wait_for_timeout(400)
        await pg.locator('#conteudo li', has_text='Parte dos insumos').locator('[data-pagar]').click(); await pg.wait_for_timeout(800)
        await abrir_nota(pg)
        ok('recebido no Extrato aparece marcado', await pago(pg, 'Zeca').locator('[data-pg=pago]').is_checked())

        # ---------- celular
        await pg.set_viewport_size({'width': 360, 'height': 780}); await pg.wait_for_timeout(300)
        ok('celular: sem rolagem para o lado', await pg.locator(D).evaluate('d => d.scrollWidth <= d.clientWidth'))
        await pago(pg, 'Zeca').scroll_into_view_if_needed()
        await pg.screenshot(path=os.path.join(SAIDA, 'quem-pagou-celular.png'))
        ok('sem erros no console', not erros, erros)
        await b.close()
    for r in R: print(r[0], r[1], '' if r[0] == 'PASS' else r[2])
    print(f"{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")

if __name__ == '__main__':
    asyncio.run(main())
