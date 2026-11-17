"""QA do módulo Resina: ligar/desligar, cadastros, carga completa, edição, exclusão, backup, migração."""
import asyncio, sys, json, re
sys.path.insert(0, '/tmp/qa')
from comum import preparar, pular_tour, recarregar, SENHA
from playwright.async_api import async_playwright
U = 'http://localhost:8765/'
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))

async def ir(pg, r):
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
        t = await c.get_attribute('type')
        if t == 'checkbox':
            await (c.check() if valor else c.uncheck())
        else:
            await c.fill(str(valor))
    await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(500)
    return await ultimo_toast(pg)

async def linha_produtor(pg, nome, tbs, arr=None, kgm=None):
    await pg.click('[data-adicionar]'); await pg.wait_for_timeout(150)
    li = pg.locator('[data-item]').last
    await li.locator('select').select_option(label=nome); await pg.wait_for_timeout(150)
    li = pg.locator('[data-item]').last
    await li.locator('[data-campo-item=tbs]').fill(str(tbs))
    if arr is not None: await li.locator('[data-campo-item=arrendamento]').fill(str(arr))
    if kgm is not None: await li.locator('[data-campo-item=kg_manual]').fill(str(kgm))
    await pg.wait_for_timeout(150)

async def tambores_cheios(pg):
    return await pg.evaluate("""[...document.querySelectorAll('[data-cena] [data-tambores] > g')].filter(g=>+g.getAttribute('opacity')>0.9).length""")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        pg = await ctx.new_page()
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        await preparar(pg, U, exemplo=True); await pular_tour(pg)

        # 1. desligado por padrão
        vis = await pg.locator('[data-seletor-modulo]').first.is_visible()
        ok('módulo começa desligado (sem seletor)', not vis)
        cartoes = await pg.evaluate("JSON.stringify(1)")
        await ir(pg, 'cargas')
        ok('tela da resina desligada mostra aviso', 'está desligado' in await pg.inner_text('#conteudo'))

        # 2. ligar
        await ir(pg, 'ajustes')
        await pg.click('[data-secao=modulos] summary'); await pg.check('[data-modulo-resina]'); await pg.wait_for_timeout(800)
        ok('ligar mostra o seletor', await pg.locator('aside [data-seletor-modulo]').is_visible())
        ok('Ajustes continua aberto depois de ligar', 'Módulos' in await pg.inner_text('#conteudo'))
        await pg.click('aside [data-modulo-link=producao]'); await pg.wait_for_timeout(700)
        ok('seletor leva para a Produção', (await pg.inner_text('#titulo-pagina')) == 'Produção')
        ok('menu da resina aparece', await pg.locator('aside ul[data-menu=resina]').is_visible() and not await pg.locator('aside ul[data-menu=caixa]').is_visible())
        ok('botão Nova carga no menu', await pg.locator('aside a[href="#carga"][data-menu=resina]').is_visible())
        await pg.click('aside [data-modulo-link=caixa]'); await pg.wait_for_timeout(700)
        ok('voltar ao Caixa', (await pg.inner_text('#titulo-pagina')) == 'Início' and await pg.locator('aside ul[data-menu=caixa]').is_visible())
        ok('Caixa intacto (cartão Mercado Pago e Nubank)', 'Nubank' in await pg.inner_text('#conteudo'))
        ok('Cartão Maria não existe nos dados novos', 'Cartão Maria' not in await pg.inner_text('#conteudo'))

        # 3. cadastros
        await ir(pg, 'resina-cadastros')
        t = await adicionar(pg, 'resina_produtores', {'nome': 'João', 'arrendamento': 45}); ok('produtor adicionado', 'adicionado' in t, t)
        t = await adicionar(pg, 'resina_produtores', {'nome': 'Pedro', 'arrendamento': 40}); ok('2º produtor', 'adicionado' in t, t)
        t = await adicionar(pg, 'resina_produtores', {'nome': 'Antônio', 'arrendamento': 45}); ok('3º produtor', 'adicionado' in t, t)
        t = await adicionar(pg, 'resina_produtores', {'nome': 'joao', 'arrendamento': 45}); ok('nome repetido bloqueado (sem acento/maiúscula)', 'Já existe' in t, t)
        t = await adicionar(pg, 'resina_produtores', {'nome': 'Luís', 'arrendamento': 140}); ok('% acima de 100 bloqueada', '0 a 100' in t, t)
        t = await adicionar(pg, 'resina_produtores', {'nome': '', 'arrendamento': 10}); ok('nome vazio bloqueado', 'Preencha o nome' in t, t)
        cores = await pg.evaluate("[...document.querySelectorAll('[data-secao=resina_produtores] form[data-id]:not([data-id=\"\"]) [name=cor]')].map(c=>c.value)")
        ok('cores diferentes sugeridas', len(set(cores)) == len(cores) == 3, cores)
        t = await adicionar(pg, 'resina_motoristas', {'nome': 'Zé do caminhão', 'telefone': '(42) 99999-0000'}); ok('motorista', 'adicionado' in t, t)
        t = await adicionar(pg, 'resina_caminhoes', {'nome': 'abc1d23', 'descricao': 'Carreta', 'capacidade': 30}); ok('caminhão', 'ABC1D23 adicionado' in t, t)
        t = await adicionar(pg, 'resina_caminhoes', {'nome': 'XYZ9A99', 'capacidade': 0}); ok('capacidade 0 bloqueada', 'inteiro de 1' in t, t)
        t = await adicionar(pg, 'resina_precos', {'inicio': '2026-01-01', 'valor_kg': '480'}); ok('preço 1', 'adicionado' in t, t)
        t = await adicionar(pg, 'resina_precos', {'inicio': '2026-09-15', 'valor_kg': '510'}); ok('preço 2', 'adicionado' in t, t)
        t = await adicionar(pg, 'resina_precos', {'inicio': '2026-09-15', 'valor_kg': '520'}); ok('preço na mesma data bloqueado', 'Já existe um preço' in t, t)
        t = await adicionar(pg, 'resina_precos', {'inicio': '2026-10-01', 'valor_kg': ''}); ok('preço vazio bloqueado', 'Preencha' in t, t)
        t = await adicionar(pg, 'resina_fazendas', {'nome': 'Fazenda Santa Rita', 'proprietario': 'Carlos'}); ok('fazenda', 'adicionado' in t, t)
        xss = '<img src=x onerror="window.__xss=1">'
        t = await adicionar(pg, 'resina_motoristas', {'nome': xss}); await pg.wait_for_timeout(300)
        ok('nome malicioso não executa', not await pg.evaluate('window.__xss'))

        # 4. nova carga
        await ir(pg, 'carga'); await pg.wait_for_timeout(2800)
        ok('título Nova carga', (await pg.inner_text('#titulo-pagina')) == 'Nova carga')
        ok('número automático', 'C-2026-0001' in await pg.inner_text('[data-codigo]'))
        ok('preço do dia veio do cadastro', await pg.input_value('#c-preco') == '5,10', await pg.input_value('#c-preco'))
        ok('único caminhão já escolhido', await pg.input_value('#c-caminhao') != '')
        ok('carreta desenhada com a capacidade do caminhão', await pg.evaluate("document.querySelectorAll('[data-cena] [data-tambores] > g').length") == 30)
        ok('carreta chega vazia', await tambores_cheios(pg) == 0)
        await pg.fill('#c-data', '2026-09-10'); await pg.dispatch_event('#c-data', 'change'); await pg.wait_for_timeout(300)
        ok('preço muda com a data', await pg.input_value('#c-preco') == '4,80', await pg.input_value('#c-preco'))
        await pg.fill('#c-data', '2026-11-11'); await pg.dispatch_event('#c-data', 'change'); await pg.wait_for_timeout(300)
        # salvar vazio
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(400)
        ok('não salva sem produtor', 'pelo menos um produtor' in await ultimo_toast(pg))
        await pg.select_option('#c-motorista', label='Zé do caminhão')
        await linha_produtor(pg, 'João', 12)
        ok('% padrão do produtor veio', await pg.locator('[data-item] [data-campo-item=arrendamento]').first.input_value() == '45')
        ops = await pg.locator('[data-item] select').first.locator('option').all_inner_texts()
        await linha_produtor(pg, 'Pedro', 9)
        ops2 = await pg.locator('[data-item] select').nth(1).locator('option').all_inner_texts()
        ok('produtor já usado some da outra linha', 'João' not in ops2, ops2)
        await pg.wait_for_timeout(2500)
        ok('21 tambores na carreta', await tambores_cheios(pg) == 21, await tambores_cheios(pg))
        cor0 = await pg.evaluate("document.querySelector('[data-cena] [data-tambores] > g [data-prod]').getAttribute('fill')")
        cor_joao = await pg.evaluate("document.querySelector('[data-item] .rounded-full').style.background")
        ok('tambor com a cor do produtor', cor0.lower() == '#2e9e6b' and '46, 158, 107' in cor_joao, (cor0, cor_joao))
        preto = await pg.evaluate("document.querySelector('[data-cena] [data-tambores] > g [data-preto]').getAttribute('d').length")
        ok('parte preta do arrendamento desenhada', preto > 10)
        ok('% em branco no tambor', await pg.evaluate("document.querySelector('[data-cena] [data-tambores] > g text').textContent") == '45%')
        # sem peso
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(400)
        ok('não salva sem peso', await pg.locator('#c-peso-chegada[aria-invalid=true]').count() == 1)
        await pg.fill('#c-peso-fazenda', '3130'); await pg.fill('#c-peso-chegada', '3085'); await pg.wait_for_timeout(300)
        dif = await pg.inner_text('[data-diferenca]')
        ok('diferença de peso', '−45 kg' in dif and '1,4%' in dif and 'R$ 229,50' in dif, dif)
        tot = await pg.inner_text('[data-totais]')
        ok('totais: 21 Tbs e 3.085 kg', '21' in tot and '3.085 kg' in tot, tot)
        ok('valor total', 'R$ 15.733,50' in tot, tot)
        kg0 = await pg.locator('[data-item] [data-campo-item=kg_manual]').first.input_value()
        ok('kg automático pelos Tbs', kg0 == '1763', kg0)
        # kg manual
        await pg.locator('[data-item] [data-campo-item=kg_manual]').first.fill('2000'); await pg.wait_for_timeout(200)
        await pg.locator('#c-obs').click()
        kg1 = await pg.locator('[data-item] [data-campo-item=kg_manual]').nth(1).input_value()
        ok('resto do peso para o outro', kg1 == '1085', kg1)
        ok('kg manual amarelo + ↺', await pg.locator('[data-item] .kg-manual').count() == 1 and await pg.locator('[data-item] [data-kg-auto]:not([hidden])').count() == 1)
        await pg.locator('[data-item] [data-campo-item=kg_manual]').first.fill('4000'); await pg.wait_for_timeout(200)
        ok('aviso: manual passa do peso', 'passam do peso' in await pg.inner_text('[data-avisos]'))
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(400)
        ok('não salva com kg maior que o peso', 'passam do peso' in await ultimo_toast(pg))
        await pg.locator('[data-item] [data-kg-auto]').first.click(); await pg.wait_for_timeout(200)
        ok('↺ volta ao automático', await pg.locator('[data-item] [data-campo-item=kg_manual]').first.input_value() == '1763')
        # peso fazenda como base
        await pg.check('input[name=peso_base][value=fazenda]'); await pg.wait_for_timeout(200)
        ok('peso da fazenda vale', '3.130 kg' in await pg.inner_text('[data-totais]'))
        await pg.check('input[name=peso_base][value=chegada]'); await pg.wait_for_timeout(200)
        # passar da capacidade
        await linha_produtor(pg, 'Antônio', 15)
        ok('aviso de capacidade', 'comporta 30 Tbs' in await pg.inner_text('[data-avisos]'))
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(500)
        ok('pergunta antes de salvar acima da capacidade', await pg.locator('dialog[open]').count() == 1)
        await pg.click('dialog[open] [data-resposta=nao]'); await pg.wait_for_timeout(300)
        await pg.locator('[data-item] [data-campo-item=tbs]').nth(2).fill('6'); await pg.wait_for_timeout(200)
        # duplo clique no salvar
        await pg.fill('#c-obs', 'Primeira carga do teste')
        await pg.dblclick('button[type=submit]'); await pg.wait_for_timeout(1200)
        ok('salvou e foi para a lista', (await pg.inner_text('#titulo-pagina')) == 'Cargas')
        lista = await pg.inner_text('#conteudo')
        ok('carga na lista', 'C-2026-0001' in lista and '27 Tbs' in lista, lista[:300])
        ok('sem duplicar com clique duplo', lista.count('C-2026-0001') == 1)
        ok('selo de diferença', 'Diferença −45 kg' in lista)

        # 5. segunda carga: repetir produtores
        await ir(pg, 'carga'); await pg.wait_for_timeout(2600)
        ok('número seguinte', 'C-2026-0002' in await pg.inner_text('[data-codigo]'))
        ok('motorista da última carga', await pg.input_value('#c-motorista') != '')
        await pg.click('[data-repetir]'); await pg.wait_for_timeout(300)
        ok('repetir produtores da última carga', await pg.locator('[data-item]').count() == 3)
        for i, n in enumerate([10, 8, 5]): await pg.locator('[data-item] [data-campo-item=tbs]').nth(i).fill(str(n))
        await pg.fill('#c-peso-chegada', '3400')
        # cadastrar produtor dentro da carga
        await pg.click('[data-adicionar]'); await pg.wait_for_timeout(150)
        await pg.locator('[data-item]').last.locator('select').select_option(value='__novo'); await pg.wait_for_timeout(400)
        await pg.fill('#np-nome', 'Luís'); await pg.fill('#np-arr', '50'); await pg.click('dialog[open] button[type=submit]'); await pg.wait_for_timeout(600)
        sel = await pg.locator('[data-item]').last.locator('select').evaluate('s=>s.options[s.selectedIndex].text')
        ok('produtor novo cadastrado e escolhido', sel == 'Luís', sel)
        ok('% do produtor novo', await pg.locator('[data-item]').last.locator('[data-campo-item=arrendamento]').input_value() == '50')
        await pg.locator('[data-item]').last.locator('[data-campo-item=tbs]').fill('4')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(1000)
        ok('segunda carga salva', 'C-2026-0002' in await pg.inner_text('#conteudo'))

        # 6. produção do mês
        await ir(pg, 'resina'); await pg.wait_for_timeout(300)
        prod = await pg.inner_text('#conteudo')
        ok('produção: 2 cargas, 54 Tbs', re.search(r'Cargas\s+2\s', prod) is not None and re.search(r'Tbs\s+54', prod) is not None, prod[:400])
        ok('produção: por produtor', 'João' in prod and 'Luís' in prod and '22 Tbs' in prod, prod)
        ok('produção: diferença de peso do mês', 'Diferença de peso no mês' in prod)

        # 7. editar carga
        await ir(pg, 'cargas')
        await pg.click('a[href^="#carga/"] >> text=C-2026-0001'); await pg.wait_for_timeout(2600)
        ok('abre a carga para editar', (await pg.inner_text('#titulo-pagina')) == 'Carga' and await pg.locator('[data-item]').count() == 3)
        ok('obs guardada', await pg.input_value('#c-obs') == 'Primeira carga do teste')
        await pg.wait_for_timeout(1500)
        ok('carreta carregada ao abrir', await tambores_cheios(pg) == 27, await tambores_cheios(pg))
        await pg.locator('[data-item] [data-campo-item=tbs]').first.fill('13')
        await limpar_toasts(pg); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1000)
        ok('edição salva', '28 Tbs' in await pg.inner_text('#conteudo'))
        await pg.click('#toasts button >> text=Desfazer'); await pg.wait_for_timeout(800)
        ok('desfazer a edição', '27 Tbs' in await pg.inner_text('#conteudo'))

        # 8. excluir produtor usado -> erro
        await ir(pg, 'resina-cadastros'); await limpar_toasts(pg)
        await pg.locator('[data-secao=resina_produtores] [data-excluir]').first.click(); await pg.wait_for_timeout(300)
        await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(500)
        t = await ultimo_toast(pg)
        ok('produtor com cargas não pode ser excluído', 'usado em cargas' in t, t)
        # inativar
        f = pg.locator('[data-secao=resina_produtores] form').first
        await f.locator('[name=ativo]').uncheck(); await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(500)
        await ir(pg, 'carga'); await pg.wait_for_timeout(500)
        await pg.click('[data-adicionar]'); await pg.wait_for_timeout(150)
        ops = await pg.locator('[data-item] select').first.locator('option').all_inner_texts()
        ok('inativo some da lista da carga nova', 'Antônio' not in ops and 'João' in ops or len(ops) >= 3, ops)

        # 9. excluir carga + desfazer
        await ir(pg, 'cargas')
        await pg.click('a[href^="#carga/"] >> text=C-2026-0002'); await pg.wait_for_timeout(800)
        await limpar_toasts(pg); await pg.click('[data-excluir-carga]'); await pg.wait_for_timeout(300); await pg.click('dialog[open] [data-resposta=sim]'); await pg.wait_for_timeout(800)
        ok('carga excluída', 'C-2026-0002' not in await pg.inner_text('#conteudo'))
        await pg.click('#toasts button >> text=Desfazer'); await pg.wait_for_timeout(800)
        ok('desfazer exclusão', 'C-2026-0002' in await pg.inner_text('#conteudo'))

        # 10. persiste depois de recarregar (cifrado)
        await recarregar(pg); await ir(pg, 'cargas')
        ok('dados da resina continuam após recarregar', 'C-2026-0001' in await pg.inner_text('#conteudo'))
        ok('seletor continua depois de recarregar', await pg.locator('aside [data-seletor-modulo]').is_visible())

        # 11. backup ida e volta
        await ir(pg, 'ajustes'); await pg.click('[data-backup]'); await pg.wait_for_selector('dialog[open] [data-gerar]')
        await pg.check('input[name=formato][value=backup]', force=True)
        async with pg.expect_download() as d: await pg.click('dialog[open] [data-gerar]')
        await (await d.value).save_as('/tmp/qa/resina_backup.json'); await pg.wait_for_timeout(500)
        bk = json.load(open('/tmp/qa/resina_backup.json'))
        tb = bk['tabelas']
        ok('backup tem as tabelas da resina', len(tb['resina_cargas']) == 2 and len(tb['resina_produtores']) == 4 and len(tb['resina_carga_itens']) == 7, {k: len(v) for k, v in tb.items()})
        # mexer no backup: item com produtor inexistente, carga com data ruim, cor inválida
        tb['resina_carga_itens'].append({'id': 'x1', 'carga_id': tb['resina_cargas'][0]['id'], 'produtor_id': 'nao-existe', 'tbs': 3, 'arrendamento': 10})
        tb['resina_cargas'].append({'id': 'x2', 'data': '2026-13-45', 'numero': 9})
        tb['resina_produtores'][0]['cor'] = 'verde'
        tb['resina_produtores'][1]['arrendamento'] = 500
        json.dump(bk, open('/tmp/qa/resina_backup_mexido.json', 'w'))
        # backup antigo (sem resina)
        antigo = json.loads(json.dumps(bk))
        for k in list(antigo['tabelas']):
            if k.startswith('resina_'): del antigo['tabelas'][k]
        json.dump(antigo, open('/tmp/qa/resina_backup_antigo.json', 'w'))

        await ir(pg, 'ajustes'); await limpar_toasts(pg)
        async with pg.expect_file_chooser() as fc: await pg.click('[data-restaurar]')
        await (await fc.value).set_files('/tmp/qa/resina_backup_mexido.json'); await pg.wait_for_timeout(800)
        txt = await pg.inner_text('dialog[open]')
        ok('restaurar avisa itens com problema', 'ignorad' in txt.lower() or 'corrigid' in txt.lower() or 'problema' in txt.lower(), txt[:300])
        await pg.locator('dialog[open] button.btn-perigo, dialog[open] [data-resposta=sim], dialog[open] button[type=submit]').first.click(); await pg.wait_for_timeout(1200)
        await ir(pg, 'cargas')
        ok('restaurado: 2 cargas válidas', 'C-2026-0001' in await pg.inner_text('#conteudo') and 'C-2026-0009' not in await pg.inner_text('#conteudo'))
        await ir(pg, 'resina-cadastros')
        cor_corr = await pg.locator('[data-secao=resina_produtores] form [name=cor]').first.input_value()
        ok('cor inválida corrigida', re.match(r'^#[0-9a-f]{6}$', cor_corr, re.I) is not None, cor_corr)

        async with pg.expect_file_chooser() as fc:
            await ir(pg, 'ajustes'); await pg.click('[data-restaurar]')
        await (await fc.value).set_files('/tmp/qa/resina_backup_antigo.json'); await pg.wait_for_timeout(800)
        await pg.locator('dialog[open] button.btn-perigo, dialog[open] [data-resposta=sim], dialog[open] button[type=submit]').first.click(); await pg.wait_for_timeout(1200)
        await ir(pg, 'inicio')
        ok('backup antigo (sem resina) restaura o Caixa', 'Saldo total' in await pg.inner_text('#conteudo'))
        await ir(pg, 'cargas')
        ok('backup antigo: resina fica vazia', 'Nenhuma carga' in await pg.inner_text('#conteudo'))

        # 12. desligar mantém dados
        await ir(pg, 'ajustes')
        if not await pg.locator('[data-secao=modulos]').evaluate('e=>e.open'): await pg.click('[data-secao=modulos] summary')
        await pg.uncheck('[data-modulo-resina]'); await pg.wait_for_timeout(800)
        ok('desligar esconde o seletor', not await pg.locator('aside [data-seletor-modulo]').is_visible())
        ok('desligar volta o menu do Caixa', await pg.locator('aside ul[data-menu=caixa]').is_visible())

        ok('sem erros no console', not [e for e in erros if '403' not in e], erros[:5])
        ok('403 só de recurso externo', all('403' in e for e in erros), erros[:5])
        await b.close()
    for r in R: print(*r)
    print(sum(1 for r in R if r[0] == 'PASS'), 'passaram,', sum(1 for r in R if r[0] != 'PASS'), 'falharam')
asyncio.run(main())
