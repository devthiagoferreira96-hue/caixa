"""QA dos insumos: cadastro de produtos, lançar entregas (unitário e só total), mudar/excluir,
comparativo insumos × produção na tela Produção (alertas, período, tabela), backup e celular.
Uso: python insumos.py [pasta-de-saida]   (servidor do build em http://localhost:8765/)"""
import asyncio, sys, os, json, tempfile
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
        c = f.locator(f'[name={nome}]')
        if await c.evaluate('e=>e.tagName') == 'SELECT': await c.select_option(valor)
        else: await c.fill(str(valor))
    await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(500)
    return await ultimo_toast(pg)

async def nova_carga(pg, data, peso, linhas):
    await ir(pg, 'carga'); await pg.wait_for_timeout(1200)
    await pg.fill('#c-data', data); await pg.locator('#c-data').dispatch_event('change'); await pg.wait_for_timeout(300)
    await pg.fill('#c-peso-chegada', str(peso))
    for nome, tbs in linhas:
        await pg.click('[data-adicionar]'); await pg.wait_for_timeout(150)
        await pg.locator('[data-item] select').last.select_option(label=nome); await pg.wait_for_timeout(150)
        await pg.locator('[data-item] [data-campo-item=tbs]').last.fill(str(tbs))
    await limpar_toasts(pg); await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)
    return await ultimo_toast(pg)

async def lancar(pg, produtor, data, itens, so_total=False):
    """itens = [(produto, quantidade, valor[, produtor[, % do produtor]])] valor = unitário (ou total se so_total) em centavos digitados.
    Sem produtor no item, vale o `produtor` da entrega."""
    await ir(pg, 'insumos'); await limpar_toasts(pg)
    await pg.click('[data-lancar]'); await pg.wait_for_selector('dialog[open] #in-data')
    await pg.fill('#in-data', data)
    for n, (prod, qtd, valor, *resto) in enumerate(itens):
        if n: await pg.click('dialog[open] [data-mais-linha]'); await pg.wait_for_timeout(100)
        li = pg.locator('dialog[open] [data-linha]').nth(n)
        sel = li.locator('[data-c=produto_id]')
        valor_op = await sel.evaluate("(s, n) => [...s.options].find(o => o.text.startsWith(n))?.value", prod)
        await sel.select_option(valor_op); await pg.wait_for_timeout(150)
        li = pg.locator('dialog[open] [data-linha]').nth(n)
        await li.locator('[data-c=produtor_id]').select_option(label=resto[0] if resto else produtor)
        if len(resto) > 1: await li.locator('[data-c=pct]').fill(str(resto[1]))
        await li.locator('[data-c=quantidade]').fill(str(qtd))
        if valor is not None:
            await li.locator('[data-c=valor_total]' if so_total else '[data-c=valor_unitario]').fill(str(valor))
    total = await pg.inner_text('dialog[open] [data-total-geral]')
    await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(800)
    return total, await ultimo_toast(pg)

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

        # 1. sem produtos: tela pede cadastro
        await ir(pg, 'insumos')
        ok('sem produtos: pede o cadastro', 'cadastre os produtos' in (await pg.inner_text('#conteudo')).lower())
        ok('menu tem Insumos', await pg.locator('aside a[href="#insumos"]').is_visible())

        # 2. cadastros
        await ir(pg, 'resina-cadastros')
        for n, a in [('João', 40), ('Pedro', 40), ('Carlos', 40)]:
            await adicionar(pg, 'resina_produtores', {'nome': n, 'arrendamento': a})
        await adicionar(pg, 'resina_precos', {'inicio': '2026-01-01', 'valor_kg': '500'})
        t = await adicionar(pg, 'resina_produtos', {'nome': 'Pasta estimulante', 'unidade': 'kg', 'valor_unitario': '5000'}); ok('produto com preço', 'adicionado' in t, t)
        t = await adicionar(pg, 'resina_produtos', {'nome': 'Saco coletor', 'unidade': 'un', 'valor_unitario': ''}); ok('produto sem preço (opcional)', 'adicionado' in t, t)

        # 3. cargas de novembro: João 4.000 kg, Pedro 1.000 kg (Carlos nada)
        await nova_carga(pg, '2026-11-03', 5000, [('João', 20), ('Pedro', 5)])

        # 4. lançar insumos
        total, t = await lancar(pg, 'João', '2026-11-04', [('Pasta estimulante', 20, None)])
        ok('preço do cadastro vem sozinho (20 kg × 50 = 1.000)', total == 'R$ 1.000,00', total)
        total, t = await lancar(pg, 'Pedro', '2026-11-05', [('Pasta estimulante', 10, None), ('Saco coletor', 100, '50000')], so_total=True)
        ok('só o total: unitário calculado (500 + 500)', total == 'R$ 1.000,00' and 'Pedro' in t, (total, t))
        total, t = await lancar(pg, 'Carlos', '2026-11-06', [('Saco coletor', 10, '500')])
        ok('lançamento com unitário digitado', total == 'R$ 50,00', total)
        # validações
        await pg.click('[data-lancar]'); await pg.wait_for_selector('dialog[open] #in-data'); await limpar_toasts(pg)
        await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(300)
        ok('sem produto bloqueado', 'Escolha o produto' in await ultimo_toast(pg), await ultimo_toast(pg))
        sel = pg.locator('dialog[open] [data-linha] [data-c=produto_id]').first
        await sel.select_option(await sel.evaluate("s => s.options[1].value")); await limpar_toasts(pg)
        await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(300)
        ok('sem produtor bloqueado', 'Escolha o produtor' in await ultimo_toast(pg), await ultimo_toast(pg))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        txt = await pg.inner_text('#conteudo')
        ok('lista: 3 entregas e gasto total', '3 entregas' in txt and 'R$ 2.050,00' in txt, txt[:300])
        ok('por produto: pasta 30 kg', '30 kg' in txt)
        # mudar entrega: abre com os valores
        await pg.click('[data-entrega] >> text=Pedro'); await pg.wait_for_selector('dialog[open] [data-linha]')
        ok('editar abre com 2 produtos', await pg.locator('dialog[open] [data-linha]').count() == 2)
        ok('unitário calculado do total (R$ 5,00)', await pg.locator('dialog[open] [data-linha]').nth(1).locator('[data-c=valor_unitario]').input_value() == '5,00')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        # 5. comparativo na Produção
        await ir(pg, 'resina'); await pg.wait_for_timeout(400)
        txt = await pg.inner_text('#conteudo')
        ok('comparativo aparece', 'Insumos × produção' in txt)
        # média = 2000 / 5000 = 0,40/kg; João 0,25; Pedro 1,00 (+150%)
        ok('média de insumo por kg', 'Média R$ 0,40/kg' in txt, txt[:1500])
        ok('alerta Pedro acima da média', 'Pedro' in txt and '150% acima da média' in txt)
        ok('alerta Carlos sem resina', 'R$ 50,00 em insumos e não entregou resina' in txt)
        ok('João sem alerta', 'João gasta' not in txt)
        linhas_tab = await pg.locator('[aria-labelledby=t-insumos] details table').first.locator('tbody tr').count()
        ok('tabela com os 3 produtores', linhas_tab == 3, linhas_tab)
        alvo = await pg.locator('.barra-alvo').first.get_attribute('aria-label')
        ok('barra tem descrição acessível', alvo and 'R$' in alvo, alvo)
        await pg.screenshot(path=os.path.join(SAIDA, 'producao_computador.png'), full_page=True)

        # 6. período: ano inteiro
        await pg.click('[data-periodo=ano]'); await pg.wait_for_timeout(600)
        txt = await pg.inner_text('#conteudo')
        ok('ano inteiro', 'Cargas de 2026' in txt and 'Insumos × produção' in txt)
        await pg.click('[data-periodo=mes]'); await pg.wait_for_timeout(400)

        # 7. modo escuro
        await pg.evaluate("document.documentElement.classList.add('dark')"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SAIDA, 'producao_escuro.png'), full_page=True)
        await pg.evaluate("document.documentElement.classList.remove('dark')")

        # 8. excluir produto usado é bloqueado
        await ir(pg, 'resina-cadastros'); await limpar_toasts(pg)
        d = pg.locator('[data-secao=resina_produtos]')
        if not await d.evaluate('e=>e.open'): await d.locator('summary').click()
        await d.locator('[data-excluir]').first.click(); await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(500)
        ok('produto usado não pode ser excluído', 'não pode ser excluído' in await ultimo_toast(pg), await ultimo_toast(pg))

        # 9. backup
        await ir(pg, 'ajustes'); await pg.click('[data-backup]'); await pg.wait_for_selector('dialog[open] [data-gerar]')
        await pg.check('input[name=formato][value=backup]', force=True)
        async with pg.expect_download() as dl: await pg.click('dialog[open] [data-gerar]')
        arq = os.path.join(SAIDA, 'backup_insumos.json'); await (await dl.value).save_as(arq); await pg.wait_for_timeout(400)
        tb = json.load(open(arq, encoding='utf-8'))['tabelas']
        ok('backup: produtos e insumos', len(tb['resina_produtos']) == 2 and len(tb['resina_insumos']) == 4, (len(tb['resina_produtos']), len(tb['resina_insumos'])))
        ok('backup: insumos com entrega e total', all(i.get('entrega_id') and i.get('valor_total') for i in tb['resina_insumos']))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        # 10. excluir entrega + desfazer
        await ir(pg, 'insumos'); await limpar_toasts(pg)
        await pg.click('[data-entrega] >> text=Carlos'); await pg.wait_for_selector('dialog[open] [data-excluir-entrega]')
        await pg.click('dialog[open] [data-excluir-entrega]'); await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(700)
        ok('entrega excluída', '2 entregas' in await pg.inner_text('#conteudo'))
        await pg.locator('#toasts button:has-text("Desfazer")').last.click(); await pg.wait_for_timeout(800)
        ok('desfazer traz de volta', '3 entregas' in await pg.inner_text('#conteudo'))

        # 11. celular
        await pg.set_viewport_size({'width': 390, 'height': 844})
        await ir(pg, 'resina'); await pg.wait_for_timeout(400)
        largura = await pg.evaluate('document.documentElement.scrollWidth')
        ok('celular Produção: sem rolagem lateral', largura <= 390, largura)
        await pg.screenshot(path=os.path.join(SAIDA, 'producao_celular.png'), full_page=True)
        await ir(pg, 'insumos'); await pg.wait_for_timeout(300)
        largura = await pg.evaluate('document.documentElement.scrollWidth')
        ok('celular Insumos: sem rolagem lateral', largura <= 390, largura)
        await pg.click('[data-lancar]'); await pg.wait_for_selector('dialog[open] [data-linha]')
        await pg.screenshot(path=os.path.join(SAIDA, 'insumos_celular.png'))
        await pg.keyboard.press('Escape')

        ok('sem erros no console', not erros, erros[:5])
        await b.close()
    for r in R: print(r[0], r[1], '' if r[0] == 'PASS' else r[2])
    print(f"{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")

if __name__ == "__main__":
    asyncio.run(main())
