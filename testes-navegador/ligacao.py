"""QA da ligação Resina → Caixa: recebimento da conta corrente vira entrada no Caixa (mudar e excluir acompanham),
compra de insumos vira compra no cartão ou saída de uma conta, e o Início mostra o arrendamento a receber.
Uso: python ligacao.py [pasta-de-saida]   (servidor do build em http://localhost:8765/)"""
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
    await pg.evaluate(f"location.hash='#{r}'"); await pg.wait_for_timeout(800)
async def mes(pg, n):
    await pg.evaluate("document.querySelector('[data-mes=\"0\"]')?.click()"); await pg.wait_for_timeout(400)
    for _ in range(n):
        await pg.locator('[data-mes="1"]').first.click(); await pg.wait_for_timeout(350)
async def ultimo_toast(pg):
    t = await pg.locator('#toasts > *').all_inner_texts()
    return t[-1] if t else ''
async def limpar_toasts(pg):
    await pg.evaluate("document.getElementById('toasts').innerHTML=''")
async def conteudo(pg): return (await pg.inner_text('#conteudo')).replace('\xa0', ' ')
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

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        await preparar(pg, U, exemplo=True); await pular_tour(pg)
        await ir(pg, 'ajustes')
        await pg.click('[data-secao=modulos] summary'); await pg.check('[data-modulo-resina]'); await pg.wait_for_timeout(800)
        await ir(pg, 'resina-cadastros')
        await adicionar(pg, 'resina_produtores', {'nome': 'Carlos', 'arrendamento': '55'})
        await adicionar(pg, 'resina_titulares', {'nome': 'Empresa', 'documento': '12.345.678/0001-90'})
        await adicionar(pg, 'resina_produtos', {'nome': 'Pasta', 'unidade': 'kg', 'valor_unitario': '1200'})

        # 1. recebimento → entrada no Caixa
        await ir(pg, 'conta-corrente'); await limpar_toasts(pg)
        await pg.click('[data-lancar]'); await pg.wait_for_selector('dialog[open] #mv-valor')
        ok('recebimento: opção de lançar no Caixa já marcada', await pg.is_checked('dialog[open] [name=no_caixa]'))
        ok('recebimento: sugere a categoria Venda', (await pg.locator('#cx-cat option:checked').inner_text()) == 'Venda')
        await pg.click('dialog[open] [name=tipo][value=debito]'); await pg.wait_for_timeout(150)
        ok('débito esconde o Caixa', await pg.locator('dialog[open] [data-caixa-recebimento]').is_hidden())
        await pg.click('dialog[open] [name=tipo][value=credito]'); await pg.wait_for_timeout(150)
        await pg.fill('#mv-valor', '100000'); await pg.fill('#mv-desc', 'PIX IN Resinas')
        await pg.screenshot(path=os.path.join(SAIDA, 'ligacao-recebimento.png'))
        await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(800)
        t = await ultimo_toast(pg)
        ok('recebimento lançado também no Caixa', 'também no Caixa' in t, t)
        ok('conta corrente mostra "no Caixa"', 'no Caixa' in await conteudo(pg))
        await ir(pg, 'extrato'); await mes(pg, 0)
        c = await conteudo(pg)
        ok('extrato do Caixa tem a entrada', 'Resina · PIX IN Resinas' in c and '+ R$ 1.000,00' in c and 'veio da Resina' in c, c[:500])

        # 2. mudar o valor na Resina muda no Caixa
        await ir(pg, 'conta-corrente')
        await pg.click('#conteudo [data-movimento]'); await pg.wait_for_selector('dialog[open] #mv-valor')
        ok('editar: continua marcado (já está no Caixa)', await pg.is_checked('dialog[open] [name=no_caixa]'))
        await pg.fill('#mv-valor', '150000'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(800)
        await ir(pg, 'extrato')
        c = await conteudo(pg)
        ok('Caixa acompanha o valor novo', '+ R$ 1.500,00' in c and c.count('Resina · PIX IN Resinas') == 1)
        await pg.locator('#conteudo [data-editar]', has_text='Resina · PIX').click(); await pg.wait_for_timeout(400)
        ok('edição no Caixa avisa que veio da Resina', 'veio da Resina' in await pg.inner_text('dialog[open]'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        # 3. excluir na Resina exclui no Caixa; desfazer volta os dois
        await ir(pg, 'conta-corrente'); await limpar_toasts(pg)
        await pg.click('#conteudo [data-movimento]'); await pg.wait_for_selector('dialog[open] [data-excluir-mov]')
        await pg.click('dialog[open] [data-excluir-mov]'); await pg.wait_for_timeout(300)
        ok('confirmação avisa do Caixa', 'no Caixa também' in await pg.inner_text('dialog[open]'))
        await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(800)
        await ir(pg, 'extrato')
        ok('excluído no Caixa também', 'Resina · PIX' not in await conteudo(pg))

        # 4. insumos → compra no cartão
        await ir(pg, 'insumos'); await limpar_toasts(pg)
        await pg.click('[data-lancar]'); await pg.wait_for_selector('dialog[open] #in-data')
        await pg.locator('dialog[open] [data-linha] [data-c=produtor_id]').first.select_option(label='Carlos')
        sel = pg.locator('dialog[open] [data-linha] [data-c=produto_id]').first
        v = await sel.evaluate("s => [...s.options].find(o => o.text.startsWith('Pasta'))?.value")
        await sel.select_option(v); await pg.wait_for_timeout(150)
        await pg.locator('dialog[open] [data-linha] [data-c=quantidade]').first.fill('50')
        ok('insumos: escolha de como foi paga', await pg.locator('dialog[open] [name=cx_modo]').count() == 3)
        await pg.click('dialog[open] [name=cx_modo][value=cartao]'); await pg.wait_for_timeout(150)
        await pg.fill('#cx-parcelas', '2')
        await pg.screenshot(path=os.path.join(SAIDA, 'ligacao-insumos.png'), full_page=True)
        await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(800)
        t = await ultimo_toast(pg)
        ok('insumos lançados no cartão', 'no cartão' in t, t)
        await ir(pg, 'cartoes'); await mes(pg, 1)
        c = await conteudo(pg)
        ok('cartão tem a compra de insumos com selo Resina', 'Insumos resina · Pasta · Carlos' in c and 'Resina' in c and '1/2' in c, c[:800])

        # 5. trocar para saída de conta (a pagar): sai do cartão e entra no extrato
        await ir(pg, 'insumos'); await mes(pg, 0)
        await pg.click('#conteudo [data-entrega]'); await pg.wait_for_selector('dialog[open] #in-data')
        ok('editar: já vem no cartão', await pg.is_checked('dialog[open] [name=cx_modo][value=cartao]'))
        await pg.click('dialog[open] [name=cx_modo][value=saida]'); await pg.wait_for_timeout(150)
        await pg.uncheck('dialog[open] [name=cx_pago]')
        await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(800)
        await ir(pg, 'cartoes'); await mes(pg, 1)
        ok('saiu do cartão', 'Insumos resina' not in await conteudo(pg))
        await ir(pg, 'extrato'); await mes(pg, 0)
        c = await conteudo(pg)
        ok('virou saída a pagar no Caixa', 'Insumos resina · Pasta · Carlos' in c and '− R$ 600,00' in c and 'A pagar' in c, c[:800])

        # 6. conta corrente mostra o insumo "no Caixa"; Início mostra o a receber
        await ir(pg, 'conta-corrente'); await mes(pg, 0)
        ok('insumo marcado "no Caixa" na conta corrente', 'no Caixa' in await conteudo(pg))
        await ir(pg, 'inicio'); await mes(pg, 0)
        c = await conteudo(pg)
        ok('Início: quadro do arrendamento a receber', 'Resina: arrendamento a receber' in c and 'Empresa' in c and 'R$ 600,00' in c, c[:300])
        await pg.screenshot(path=os.path.join(SAIDA, 'ligacao-inicio.png'), full_page=True)

        # 7. excluir a entrega exclui o gasto no Caixa
        await ir(pg, 'insumos'); await mes(pg, 0); await limpar_toasts(pg)
        await pg.click('#conteudo [data-entrega]'); await pg.wait_for_selector('dialog[open] [data-excluir-entrega]')
        await pg.click('dialog[open] [data-excluir-entrega]'); await pg.wait_for_timeout(300)
        ok('confirmação da entrega avisa do Caixa', 'no Caixa também' in await pg.inner_text('dialog[open]'))
        await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(800)
        t = await ultimo_toast(pg)
        await ir(pg, 'extrato'); await mes(pg, 0)
        ok('entrega excluída some do Caixa', 'Insumos resina' not in await conteudo(pg))
        ok('desfazer disponível', 'Desfazer' in t, t)
        await pg.locator('#toasts button', has_text='Desfazer').last.click(); await pg.wait_for_timeout(900)
        await ir(pg, 'extrato'); await mes(pg, 0)
        ok('desfazer traz o gasto de volta ao Caixa', 'Insumos resina · Pasta · Carlos' in await conteudo(pg))
        await ir(pg, 'insumos'); await mes(pg, 0)
        ok('desfazer traz a entrega de volta', 'Carlos' in await conteudo(pg))

        # 8. celular
        await pg.set_viewport_size({'width': 390, 'height': 844})
        await ir(pg, 'insumos'); await pg.click('[data-lancar]'); await pg.wait_for_timeout(500)
        larg = await pg.evaluate("(() => { const d = document.querySelector('dialog[open]'); return [d.scrollWidth, d.clientWidth]; })()")
        ok('celular: diálogo de insumos sem rolagem lateral', larg[0] <= larg[1] + 1, larg)
        await pg.keyboard.press('Escape')

        ok('sem erros no console', not erros, erros[:3])
        await b.close()

asyncio.run(main())
for r in R: print(r[0], '|', r[1], '|', r[2] if r[0] != 'PASS' else '')
print(f"\n{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")
