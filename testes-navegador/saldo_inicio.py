"""QA do "Escolher contas" do Saldo total no Início (contas fora do saldo aparecem à parte).
Uso: python saldo_inicio.py [pasta-de-saida] [endereço]   (padrão: build em http://localhost:8765/)"""
import asyncio, sys, os, re, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour, recarregar
from insumos import ir
from playwright.async_api import async_playwright
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
U = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8765/'
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

def reais(t):
    m = re.search(r'(-?)\s*R\$\s*(-?)([\d.]+,\d{2})', t)
    return (-1 if (m.group(1) or m.group(2)) else 1) * float(m.group(3).replace('.', '').replace(',', '.'))

async def total(pg): return reais(await pg.inner_text('[data-saldo-total]'))
async def nomes_no_saldo(pg): return [x.strip() for x in await pg.locator('[data-saldo] > ul li p:first-child').all_inner_texts()]
async def nomes_fora(pg): return [x.strip() for x in await pg.locator('[data-outras-contas] li p:first-child').all_text_contents()]

async def escolher(pg, desmarcar=(), marcar=(), salvar=True):
    await pg.click('[data-escolher-contas]'); await pg.wait_for_selector('dialog[open] [data-form-saldo]')
    for n in desmarcar: await pg.locator('dialog[open]').get_by_role('checkbox', name=re.compile('^' + re.escape(n))).uncheck()
    for n in marcar: await pg.locator('dialog[open]').get_by_role('checkbox', name=re.compile('^' + re.escape(n))).check()
    await pg.click('dialog[open] button[type=submit]' if salvar else 'dialog[open] .btn-neutro[data-fechar]')
    await pg.wait_for_timeout(700)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME) if CHROME else await p.chromium.launch()
        for largura in (1280, 390):
            ctx = await b.new_context(viewport={'width': largura, 'height': 900})
            pg = await ctx.new_page()
            erros = []
            pg.on('pageerror', lambda e: erros.append(str(e)))
            pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
            await preparar(pg, U, exemplo=True); await pular_tour(pg)
            await ir(pg, 'inicio'); await pg.wait_for_selector('[data-saldo]')
            tag = f'[{largura}px] '

            contas = await nomes_no_saldo(pg)
            t0 = await total(pg)
            ok(tag + 'começa com todas as contas em uso no saldo', len(contas) >= 2 and not await pg.locator('[data-outras-contas]').count(), contas)
            valores = dict(zip(contas, [reais(x) for x in await pg.locator('[data-saldo] > ul li p:last-child').evaluate_all('xs => xs.map(x => x.title)')]))
            a, b2 = contas[0], contas[1]

            await escolher(pg, desmarcar=[a], salvar=False)
            ok(tag + 'Cancelar não muda nada', await total(pg) == t0 and await nomes_no_saldo(pg) == contas)

            await escolher(pg, desmarcar=[a])
            ok(tag + 'conta desmarcada sai do saldo', a not in await nomes_no_saldo(pg) and abs(await total(pg) - (t0 - valores[a])) < 0.01, (await total(pg), t0, valores[a]))
            ok(tag + 'e aparece em "Fora do saldo"', await nomes_fora(pg) == [a] and abs(reais(await pg.inner_text('[data-total-outras]')) - valores[a]) < 0.01)
            ok(tag + '"Fora do saldo" começa fechado', not await pg.locator('[data-outras-contas]').evaluate('d => d.open'))
            await pg.click('[data-outras-contas] summary')
            ok(tag + 'abre e mostra a conta', await pg.locator('[data-outras-contas] li').first.is_visible())
            if largura == 1280: await pg.screenshot(path=os.path.join(SAIDA, 'inicio-fora-do-saldo.png'), full_page=False)

            await ir(pg, 'inicio'); await pg.wait_for_selector('[data-saldo]')
            ok(tag + 'continua aberto ao voltar', await pg.locator('[data-outras-contas]').evaluate('d => d.open'))
            await recarregar(pg); await ir(pg, 'inicio'); await pg.wait_for_selector('[data-saldo]')
            ok(tag + 'escolha fica guardada ao abrir de novo', a not in await nomes_no_saldo(pg) and a in await nomes_fora(pg))

            # Ajustes mostra a mesma escolha
            await ir(pg, 'ajustes'); await pg.click('[data-secao=contas] summary')
            form = pg.locator('[data-secao=contas] form[data-tabela=contas]', has=pg.locator(f'input[name=nome][value="{a}"]'))
            ok(tag + 'Ajustes: "No saldo" desmarcado na conta', not await form.locator('[name=no_saldo]').is_checked())
            form_b = pg.locator('[data-secao=contas] form[data-tabela=contas]', has=pg.locator(f'input[name=nome][value="{b2}"]'))
            ok(tag + 'Ajustes: as outras com "No saldo" marcado', await form_b.locator('[name=no_saldo]').is_checked())
            await form_b.locator('[name=ativa]').uncheck()
            ok(tag + 'Ajustes: tirar de uso desmarca "No saldo" junto', not await form_b.locator('[name=no_saldo]').is_checked())
            await form_b.locator('[name=no_saldo]').check()  # mas dá para manter no saldo
            await form_b.locator('button[type=submit]').click(); await pg.wait_for_timeout(700)

            await ir(pg, 'inicio'); await pg.wait_for_selector('[data-saldo]')
            ok(tag + 'conta fora de uso mas marcada "No saldo" continua somando', b2 in await nomes_no_saldo(pg))
            await pg.click('[data-escolher-contas]'); await pg.wait_for_selector('dialog[open] [data-form-saldo]')
            ok(tag + 'janela mostra "(fora de uso)"', '(fora de uso)' in await pg.locator('dialog[open] label', has_text=b2).inner_text())
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)

            # só as pouco usadas no saldo
            outras_nomes = [n for n in contas if n != a]
            await escolher(pg, desmarcar=outras_nomes, marcar=[a])
            ok(tag + 'dá para deixar só a pouco usada no saldo', await nomes_no_saldo(pg) == [a] and abs(await total(pg) - valores[a]) < 0.01)
            # desfazer pelo aviso
            await pg.locator('#toasts > *', has_text='Contas do saldo').last.get_by_text('Desfazer').click(); await pg.wait_for_timeout(900)
            ok(tag + 'Desfazer volta a escolha anterior', a not in await nomes_no_saldo(pg) and b2 in await nomes_no_saldo(pg))

            # nenhuma conta
            await pg.click('[data-escolher-contas]'); await pg.click('dialog[open] [data-todas=""]'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(700)
            ok(tag + 'sem conta escolhida: saldo zero e aviso', await total(pg) == 0 and 'Nenhuma conta escolhida' in await pg.inner_text('[data-saldo]'))
            await pg.click('[data-escolher-contas]'); await pg.click('dialog[open] [data-todas="1"]'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(700)
            ok(tag + '"Marcar todas" põe todas no saldo', not await pg.locator('[data-outras-contas]').count())

            if largura == 390:
                larg = await pg.evaluate('document.documentElement.scrollWidth')
                ok(tag + 'sem rolagem para o lado no celular', larg <= 390, larg)
                await pg.screenshot(path=os.path.join(SAIDA, 'inicio-saldo-celular.png'))
            ok(tag + 'sem erros no console', not erros, erros[:3])
            await ctx.close()
        await b.close()
    for r in R: print(*r)
    print(f"\n{sum(r[0] == 'PASS' for r in R)}/{len(R)} passaram")
    sys.exit(0 if all(r[0] == 'PASS' for r in R) else 1)

asyncio.run(main())
