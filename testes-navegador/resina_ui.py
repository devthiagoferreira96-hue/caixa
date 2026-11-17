"""Resina: acessibilidade (rótulos, nomes, contraste, ids, h1) em claro/escuro e celulares (nada sai da tela)."""
import asyncio, json, sys, re
sys.path.insert(0, '/tmp/qa')
from comum import preparar, pular_tour
from playwright.async_api import async_playwright
U = 'http://localhost:8765/'
A11Y = re.search(r'JS=r"""(.*?)"""', open('/tmp/qa/a11y.py').read(), re.S).group(1)
CHECK = re.search(r'CHECK=r"""(.*?)"""', open('/tmp/qa/mobile.py').read(), re.S).group(1)
N60 = ('Manutençãodoequipamentodeirrigaçãodafazendasantaluziaregiãonorte' * 2)[:60]

async def preparar_resina(pg):
    await preparar(pg, U, exemplo=True); await pular_tour(pg)
    await pg.evaluate("localStorage.setItem('caixa-preferencias', JSON.stringify({...JSON.parse(localStorage.getItem('caixa-preferencias')||'{}'), resina:true, tourVisto:true}))")
    await pg.evaluate("location.hash='#ajustes'"); await pg.wait_for_timeout(600)
    async with pg.expect_file_chooser() as fc: await pg.click('[data-restaurar]')
    await (await fc.value).set_files('/tmp/qa/resina_backup.json'); await pg.wait_for_timeout(700)
    await pg.locator('dialog[open] button.btn-perigo, dialog[open] [data-resposta=sim], dialog[open] button[type=submit]').first.click(); await pg.wait_for_timeout(1200)
    await pg.evaluate("location.hash='#resina-cadastros'"); await pg.wait_for_timeout(600)
    f = pg.locator('[data-secao=resina_produtores] form[data-id=""]')
    await f.locator('[name=nome]').fill(N60); await f.locator('[name=arrendamento]').fill('33.5'); await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(500)
    await pg.evaluate("location.hash='#cargas'"); await pg.wait_for_timeout(600)
    href = await pg.locator('a[href^="#carga/"]').first.get_attribute('href')
    await pg.evaluate(f"location.hash='{href}'"); await pg.wait_for_timeout(700)
    await pg.click('[data-adicionar]'); await pg.wait_for_timeout(150)
    await pg.locator('[data-item]').last.locator('select').select_option(label=N60)
    await pg.locator('[data-item]').last.locator('[data-campo-item=tbs]').fill('3')
    await pg.fill('#c-obs', 'X' * 300)
    await pg.click('button[type=submit]'); await pg.wait_for_timeout(1000)
    await pg.evaluate("document.getElementById('toasts').innerHTML=''")
    return href

async def paginas(pg, href):
    for r in ['resina', 'cargas', href[1:], 'carga', 'resina-cadastros', 'ajustes']:
        await pg.evaluate(f"location.hash='#{r}'"); await pg.wait_for_timeout(900)
        if r in ('resina-cadastros', 'ajustes'):
            await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)")
        yield r

async def main():
    res = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        for tema in ['light', 'dark']:
            ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, color_scheme=tema); pg = await ctx.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            href = await preparar_resina(pg)
            async for r in paginas(pg, href):
                o = await pg.evaluate(A11Y)
                for k, v in o.items():
                    if k == 'h1':
                        if v != 1: res.setdefault('h1', {})[f'{tema}:{r}'] = v
                    elif v: res.setdefault(k, {})[f'{tema}:{r}'] = v
            # diálogo de novo produtor e foco preso
            await pg.evaluate("location.hash='#carga'"); await pg.wait_for_timeout(700)
            await pg.click('[data-adicionar]'); await pg.wait_for_timeout(150)
            await pg.locator('[data-item]').last.locator('select').select_option(value='__novo'); await pg.wait_for_timeout(400)
            o = await pg.evaluate(A11Y)
            for k, v in o.items():
                if k != 'h1' and v: res.setdefault(k, {})[f'{tema}:dialogo-produtor'] = v
            fora = 0
            for _ in range(15):
                await pg.keyboard.press('Tab')
                if not await pg.evaluate("!!document.activeElement.closest('dialog[open]')"): fora += 1
            if fora: res.setdefault('foco', {})[tema] = fora
            await pg.keyboard.press('Escape')
            if errs: res.setdefault('erros', {})[tema] = errs
            await pg.screenshot(path=f'/tmp/ru_{tema}_carga.png', full_page=False)
            await ctx.close()
        for dev in ['iPhone SE', 'Galaxy S8', 'iPhone 15 Pro Max', 'Pixel 7']:
            d = dict(p.devices[dev]); d.pop('default_browser_type', None)
            ctx = await b.new_context(**d); pg = await ctx.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            href = await preparar_resina(pg)
            async for r in paginas(pg, href):
                probs = await pg.evaluate(CHECK, r)
                if probs: res.setdefault('celular', {})[f'{dev}:{r}'] = probs
                if dev == 'iPhone SE': await pg.screenshot(path=f'/tmp/rm_{r.split("/")[0]}.png', full_page=True)
            if errs: res.setdefault('erros', {})[dev] = errs
            await ctx.close()
        # 320 px
        ctx = await b.new_context(viewport={'width': 320, 'height': 640}, is_mobile=True, has_touch=True); pg = await ctx.new_page()
        href = await preparar_resina(pg)
        async for r in paginas(pg, href):
            probs = await pg.evaluate(CHECK, r)
            if probs: res.setdefault('celular', {})[f'320:{r}'] = probs
        await b.close()
    print(json.dumps(res, ensure_ascii=False, indent=1) if res else 'TUDO LIMPO')
asyncio.run(main())
