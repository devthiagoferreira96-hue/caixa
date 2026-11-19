"""QA da parte do produtor nos insumos (50% dele, 50% da proprietária) e da escolha
"só esta / esta e as próximas" ao mudar o valor de uma parcela ou assinatura no cartão.
Uso: python parte_produtor_cartao.py [pasta-de-saida]   (servidor do build em http://localhost:8765/)"""
import asyncio, sys, os, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from insumos import ir, ultimo_toast, limpar_toasts, adicionar, lancar
from recorrencia_cartao import mes, conteudo, novo_cartao
from playwright.async_api import async_playwright
U = 'http://localhost:8765/'
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

async def abrir_compra(pg, desc):
    await pg.locator('#conteudo li', has_text=desc).locator('[data-editar-compra]').first.click()
    await pg.wait_for_selector('dialog[open] form')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        await preparar(pg, U, exemplo=True); await pular_tour(pg)

        # ---------- insumos: parte do produtor
        await ir(pg, 'ajustes')
        await pg.click('[data-secao=modulos] summary'); await pg.check('[data-modulo-resina]'); await pg.wait_for_timeout(800)
        await ir(pg, 'resina-cadastros')
        await adicionar(pg, 'resina_titulares', {'nome': 'Empresa', 'documento': '12.345.678/0001-90'})
        await adicionar(pg, 'resina_produtores', {'nome': 'João', 'arrendamento': 40})
        await adicionar(pg, 'resina_produtos', {'nome': 'Pasta estimulante', 'unidade': 'kg', 'valor_unitario': '5000'})
        await ir(pg, 'insumos'); await pg.click('[data-lancar]'); await pg.wait_for_selector('dialog[open] #in-pct')
        ok('campo parte do produtor vem com 50', await pg.input_value('#in-pct') == '50')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        total, t = await lancar(pg, 'João', '2026-11-04', [('Pasta estimulante', 20, None)])
        ok('entrega de R$ 1.000 lançada', total == 'R$ 1.000,00', (total, t))
        c = await conteudo(pg)
        ok('lista mostra a divisão', 'Produtor paga 50%: R$ 500,00' in c and 'proprietária R$ 500,00' in c, c[:600])
        await ir(pg, 'inicio'); await pg.wait_for_timeout(500)
        c = await conteudo(pg)
        ok('Início: falta receber só a parte do produtor (R$ 500)', 'R$ 500,00' in c and 'Falta receber' in c and 'R$ 1.000,00 Falta' not in c)
        await ir(pg, 'conta-corrente'); await pg.wait_for_timeout(500)
        c = await conteudo(pg)
        ok('conta corrente: débito de R$ 500', '500,00' in c and '1.000,00' in c and '50% de R$ 1.000,00' in c, c[:1200])
        # mudar para 100%: volta a cobrar tudo
        await ir(pg, 'insumos'); await pg.click('[data-entrega] >> text=João'); await pg.wait_for_selector('dialog[open] #in-pct')
        ok('editar abre com 50', await pg.input_value('#in-pct') == '50')
        await pg.fill('#in-pct', '150'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(300)
        ok('% acima de 100 bloqueado', 'de 0 a 100' in await pg.inner_text('dialog[open]'))
        await pg.fill('#in-pct', '100')
        ok('divisão ao vivo', 'Cobrado do produtor: R$ 1.000,00' in (await pg.inner_text('dialog[open] [data-divisao]')).replace('\xa0', ' '))
        await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(800)
        await ir(pg, 'inicio'); await pg.wait_for_timeout(500)
        ok('Início: com 100% falta receber R$ 1.000', 'R$ 1.000,00' in await conteudo(pg))

        # ---------- cartão: parcela com valor diferente
        t = await novo_cartao(pg, 'compra', '30000', 'Furadeira', parcelas='3')
        ok('compra 3x de R$ 100', '3 parcelas' in t, t)
        await ir(pg, 'cartoes'); await mes(pg, 1)
        await abrir_compra(pg, 'Furadeira')
        ok('campo valor desta parcela', await pg.locator('#e-vparcela').count() == 1 and await pg.input_value('#e-vparcela') == '100,00')
        await pg.fill('#e-vparcela', '12000'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(400)
        ok('pergunta só esta / próximas', await pg.locator('dialog[open] [data-r=um]').count() == 1 and await pg.locator('dialog[open] [data-r=todos]').count() == 1)
        await limpar_toasts(pg); await pg.click('dialog[open] [data-r=um]'); await pg.wait_for_timeout(800)
        c = await conteudo(pg)
        ok('só esta: parcela 1 agora R$ 120', 'R$ 120,00' in c, c[:800])
        await mes(pg, 2)
        await abrir_compra(pg, 'Furadeira')
        ok('só esta: parcela 2 continua R$ 100', await pg.input_value('#e-vparcela') == '100,00')
        ok('total vira a soma (R$ 320)', await pg.input_value('dialog[open] [name=valor]') == '320,00', await pg.input_value('dialog[open] [name=valor]'))
        await pg.fill('#e-vparcela', '9000'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(400)
        await pg.click('dialog[open] [data-r=todos]'); await pg.wait_for_timeout(800)
        await mes(pg, 3)
        await abrir_compra(pg, 'Furadeira')
        ok('esta e as próximas: parcela 3 R$ 90', await pg.input_value('#e-vparcela') == '90,00')
        ok('total R$ 300 (120 + 90 + 90)', await pg.input_value('dialog[open] [name=valor]') == '300,00', await pg.input_value('dialog[open] [name=valor]'))
        # cancelar não salva
        await pg.fill('#e-vparcela', '5000'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(400)
        await pg.click('dialog[open] [data-r=""]'); await pg.wait_for_timeout(400)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await abrir_compra(pg, 'Furadeira')
        ok('cancelar não muda nada', await pg.input_value('#e-vparcela') == '90,00')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

        # ---------- cartão: assinatura, só este mês
        t = await novo_cartao(pg, 'compra', '3990', 'Streaming', parcelas='sempre')
        await ir(pg, 'cartoes'); await mes(pg, 2)
        await abrir_compra(pg, 'Streaming')
        await pg.fill('dialog[open] [name=valor]', '5990'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(400)
        await pg.click('dialog[open] [data-r=um]'); await pg.wait_for_timeout(800)
        ok('assinatura: este mês R$ 59,90', 'R$ 59,90' in await conteudo(pg))
        await mes(pg, 3)
        await abrir_compra(pg, 'Streaming')
        ok('assinatura: mês seguinte segue R$ 39,90', await pg.input_value('dialog[open] [name=valor]') == '39,90')
        await pg.fill('dialog[open] [name=valor]', '4590'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(400)
        await pg.click('dialog[open] [data-r=todos]'); await pg.wait_for_timeout(800)
        await mes(pg, 6)
        await abrir_compra(pg, 'Streaming')
        ok('assinatura: este e os próximos R$ 45,90', await pg.input_value('dialog[open] [name=valor]') == '45,90')
        await pg.keyboard.press('Escape')
        ok('sem erros no console', not erros, erros)
        await b.close()
    for r in R: print(r[0], r[1], '' if r[0] == 'PASS' else r[2])
    print(f"{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")

if __name__ == '__main__':
    asyncio.run(main())
