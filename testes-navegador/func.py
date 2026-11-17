import asyncio, re
from playwright.async_api import async_playwright
import sys; sys.path.insert(0,'/tmp/qa')
from comum import preparar, pular_tour, recarregar, SENHA
U='http://localhost:8765/'
R=[]
def ok(nome, cond, extra=''):
    R.append(('PASS' if cond else 'FALHA', nome, extra))
async def toasts(pg): return await pg.locator('#toasts').inner_text()
async def ir(pg, r): await pg.goto(U+'#'+r); await pg.wait_for_timeout(600)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx=await b.new_context(viewport={'width':1280,'height':900}, permissions=['clipboard-read','clipboard-write'])
        pg=await ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and '403' not in m.text and errs.append(m.text))
        await preparar(pg, U)
        ok('Tour aparece no 1º acesso', await pg.locator('dialog[open]').count()==1)
        for _ in range(5): await pg.click('dialog [data-avancar]')
        ok('Tour chega ao último passo', 'Começar a usar' in await pg.locator('dialog [data-avancar]').inner_text())
        await pg.click('dialog [data-avancar]'); await pg.wait_for_timeout(300)
        await recarregar(pg)
        ok('Tour não reaparece depois de visto', await pg.locator('dialog[open]').count()==0)

        # ---------- números do Início batem com os dados
        ini = await pg.evaluate("""()=>{const t=[...document.querySelectorAll('[aria-labelledby=t-saldo] li p:last-child')].map(p=>p.textContent);return {total:document.querySelector('[aria-labelledby=t-saldo] p.font-bold').textContent,contas:t}}""")
        num=lambda s: float(re.sub(r'[^\d,-]','',s.replace('−','-')).replace(',','.'))
        ok('Saldo total = soma das contas', abs(num(ini['total'])-sum(num(c) for c in ini['contas']))<0.01, str(ini))

        # ---------- navegação
        await ir(pg,'xyz'); ok('Rota desconhecida abre Início', (await pg.inner_text('#titulo-pagina'))=='Início')
        await ir(pg,'extrato'); await pg.go_back(); await pg.wait_for_timeout(500)
        ok('Botão voltar do navegador funciona', (await pg.inner_text('#titulo-pagina'))=='Início')
        await ir(pg,'inicio'); m0=await pg.inner_text('#seletor-mes')
        await pg.click('[data-mes="1"]'); await pg.wait_for_timeout(500); m1=await pg.inner_text('#seletor-mes')
        ok('Avançar mês', m0!=m1 and 'Voltar para o mês atual' in m1)
        await ir(pg,'cartoes'); ok('Mês escolhido vale em outra tela', (await pg.inner_text('#seletor-mes')).split('\n')[0]==m1.split('\n')[0])
        await pg.click('text=Voltar para o mês atual'); await pg.wait_for_timeout(400)
        ok('Voltar para o mês atual', (await pg.inner_text('#seletor-mes')).strip().split('\n')[0]==m0.strip().split('\n')[0])

        # ---------- novo: validações
        await ir(pg,'novo'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(200)
        ok('Validação: 3 erros ao salvar vazio', await pg.locator('.erro-campo').count()==3, str(await pg.locator('.erro-campo').all_inner_texts()))
        ok('Foco vai para o 1º campo com erro', await pg.evaluate("document.activeElement.id")=='f-valor')
        await pg.fill('#f-valor','0'); await pg.click('button[type=submit]')
        ok('Valor zero é recusado', 'maior que zero' in await pg.inner_text('form'))
        # XSS
        xss='<img src=x onerror="window.__xss=1">'
        await pg.fill('#f-valor','5000'); await pg.fill('#f-descricao',xss); await pg.select_option('#f-categoria',label='Lazer')
        await pg.fill('#f-pessoa','<b>Zé</b>')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(600)
        await ir(pg,'extrato'); await pg.wait_for_timeout(300)
        ok('XSS na descrição não executa', not await pg.evaluate("window.__xss===1"))
        ok('XSS aparece como texto', xss in await pg.inner_text('#conteudo'))
        # entrada a receber
        await ir(pg,'novo'); await pg.click('label:has-text("Entrada")')
        ok('Texto muda para "Já foi recebido"', await pg.locator('text=Já foi recebido').count()==1)
        await pg.fill('#f-valor','100000'); await pg.fill('#f-descricao','Venda de leite'); await pg.select_option('#f-categoria',label='Venda'); await pg.uncheck('[name=pago]')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(600)
        ok('Formulário limpa após salvar', await pg.input_value('#f-valor')=='' and await pg.evaluate("document.activeElement.id")=='f-valor')
        ok('Tipo escolhido continua marcado', await pg.is_checked('input[value=entrada]'))
        # desfazer
        await pg.fill('#f-valor','777'); await pg.fill('#f-descricao','Para desfazer'); await pg.click('label:has-text("Saída")'); await pg.select_option('#f-categoria',label='Lazer')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(500)
        await pg.locator('#toasts >> text=Desfazer').last.click(); await pg.wait_for_timeout(500)
        await ir(pg,'extrato'); ok('Desfazer remove o lançamento', 'Para desfazer' not in await pg.inner_text('#conteudo'))
        ok('Entrada a receber aparece no extrato', 'Venda de leite' in await pg.inner_text('#conteudo'))
        # repetir 3 meses + excluir "este e os próximos"
        await ir(pg,'novo'); await pg.fill('#f-valor','150000'); await pg.fill('#f-descricao','Aluguel pasto'); await pg.select_option('#f-categoria',label='Despesas Fazenda'); await pg.select_option('#f-repetir','meses'); await pg.fill('#f-meses','3'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(600)
        await pg.click('[data-mes="1"]') if False else None
        await ir(pg,'extrato')
        if await pg.locator('dialog[open]').count():
            print('DIALOGO ABERTO:', await pg.inner_text('dialog[open]')); await pg.screenshot(path='/tmp/qa/dlg.png')
            await pg.keyboard.press('Escape')
        try:
            await pg.click('[data-mes="1"]', timeout=3000)
        except Exception:
            print('DIALOGO:', await pg.locator('dialog[open]').inner_text()); await pg.screenshot(path='/tmp/qa/dlg.png'); raise
        await pg.wait_for_timeout(600)
        txt=await pg.inner_text('#conteudo')
        ok('Repetição cria parcela 2/3 no mês seguinte', 'Aluguel pasto' in txt and '2/3' in txt)
        ok('Repetição: só a 1ª fica paga', 'A pagar' in txt)
        await pg.locator('[data-editar]', has_text='Aluguel pasto').click(); await pg.wait_for_timeout(300)
        await pg.click('dialog [data-excluir]'); await pg.wait_for_timeout(300)
        ok('Pergunta "só este ou próximos"', await pg.locator('dialog button:has-text("Este e os próximos")').count()==1)
        await pg.click('dialog button:has-text("Este e os próximos")'); await pg.wait_for_timeout(700)
        print('ABERTOS:', await pg.evaluate("[...document.querySelectorAll('dialog')].map(d=>d.open+' '+d.className.slice(0,40)+' | '+d.innerText.slice(0,80))"))
        ok('Exclusão em série remove deste mês', 'Aluguel pasto' not in await pg.inner_text('#conteudo'))
        await pg.click('[data-mes="1"]'); await pg.wait_for_timeout(600)
        ok('Exclusão em série remove meses seguintes', 'Aluguel pasto' not in await pg.inner_text('#conteudo'))
        await pg.click('[data-mes="-1"]'); await pg.click('[data-mes="-1"]'); await pg.wait_for_timeout(600)
        ok('Exclusão em série mantém o mês anterior', 'Aluguel pasto' in await pg.inner_text('#conteudo'))

        # ---------- extrato filtros e busca
        await pg.fill('#f-busca','gasolina'); await pg.wait_for_timeout(200)
        ok('Busca filtra', (await pg.locator('[data-editar]').count())==1)
        await pg.fill('#f-busca','zzzz'); await pg.wait_for_timeout(200)
        ok('Busca sem resultado mostra "Limpar filtros"', await pg.locator('[data-limpar]').count()==1)
        await pg.click('[data-limpar]'); await pg.wait_for_timeout(500)
        ok('Limpar filtros volta tudo', await pg.input_value('#f-busca')=='' and await pg.locator('[data-editar]').count()>5)
        await pg.select_option('[data-filtro=situacao]','aberto'); await pg.wait_for_timeout(200)
        ok('Filtro "em aberto" só mostra não pagos', await pg.locator('[data-pagar][aria-pressed=true]').count()==0)
        await pg.select_option('[data-filtro=situacao]',''); 
        # marcar pago e desfazer
        b1=pg.locator('[data-pagar][aria-pressed=false]').first; desc=await b1.get_attribute('aria-label')
        await b1.click(); await pg.wait_for_timeout(600)
        ok('Marcar como pago', 'marcado como' in await toasts(pg))
        await pg.locator('#toasts >> text=Desfazer').last.click(); await pg.wait_for_timeout(600)
        ok('Desfazer pago volta a aberto', await pg.locator(f'[data-pagar][aria-label="{desc}"]').count()==1)
        # editar
        await pg.locator('[data-editar]', has_text='Gasolina').click(); await pg.wait_for_timeout(300)
        await pg.fill('dialog #f-descricao','Gasolina posto'); await pg.click('dialog button[type=submit]'); await pg.wait_for_timeout(600)
        ok('Editar descrição salva', 'Gasolina posto' in await pg.inner_text('#conteudo'))
        await pg.locator('[data-editar]', has_text='Gasolina posto').click(); await pg.wait_for_timeout(300)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        ok('Esc fecha a janela', await pg.locator('dialog[open]').count()==0)

        # ---------- cartões
        await ir(pg,'novo'); await pg.click('label:has-text("Cartão")')
        await pg.select_option('#f-cartao',label='Mercado Pago'); await pg.fill('#f-data', __import__('datetime').date.today().replace(day=1).isoformat())
        await pg.fill('#f-valor','100000'); await pg.fill('#f-descricao','Celular'); await pg.select_option('#f-categoria',label='Compras Pessoais'); await pg.select_option('#f-parcelas','3')
        prev=(await pg.inner_text('[data-previa]')).replace('\xa0',' '); ok('Prévia da parcela', '3 parcelas de R$ 333,33' in prev, prev)
        ok('Opção mostra valor da parcela', 'de R$ 333,33' in (await pg.locator('#f-parcelas option[value="3"]').inner_text()).replace('\xa0',' '))
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(600)
        await ir(pg,'cartoes'); c=await pg.inner_text('#conteudo')
        ok('Compra aparece na fatura', 'Celular' in c)
        # pagar fatura e conferir saldo
        await ir(pg,'inicio'); s0=await pg.inner_text('[aria-labelledby=t-saldo] p.font-bold')
        await ir(pg,'cartoes'); card=pg.locator('section', has=pg.locator('[data-pagar-fatura]')).first
        valor=await card.locator('p.font-bold.tabular-nums').first.inner_text()
        await card.locator('[data-pagar-fatura]').click(); await pg.wait_for_timeout(300); await pg.click('text=Confirmar pagamento'); await pg.wait_for_timeout(700)
        ok('Fatura fica "Paga"', await pg.locator('text=Paga em').count()>=1)
        await ir(pg,'inicio'); s1=await pg.inner_text('[aria-labelledby=t-saldo] p.font-bold')
        ok('Pagar fatura desconta do saldo', abs((num(s0)-num(s1))-num(valor))<0.01, f'{s0} -> {s1}, fatura {valor}')
        g0=await pg.inner_text('[aria-labelledby=t-grafico] p.text-2xl')
        await ir(pg,'cartoes'); await pg.click('[data-desfazer]'); await pg.wait_for_timeout(300); await pg.click('dialog [data-resposta=sim]'); await pg.wait_for_timeout(700)
        await ir(pg,'inicio'); g1=await pg.inner_text('[aria-labelledby=t-grafico] p.text-2xl'); s2=await pg.inner_text('[aria-labelledby=t-saldo] p.font-bold')
        ok('Pagamento de fatura não altera gráfico (sem contar 2x)', g0==g1)
        ok('Desfazer pagamento devolve o saldo', s2==s0)
        # excluir compra
        await ir(pg,'cartoes'); await pg.click('[aria-label="Excluir a compra Celular"]'); await pg.wait_for_timeout(300)
        ok('Pergunta se é só esta parcela ou a compra inteira', 'todas as parcelas' in await pg.inner_text('dialog[open]'))
        await pg.click('dialog[open] [data-r=tudo]'); await pg.wait_for_timeout(700)
        ok('Compra excluída some', 'Celular' not in await pg.inner_text('#conteudo'))

        # ---------- gráfico e relatório
        await ir(pg,'inicio'); await pg.locator('[data-categoria]:not([disabled])').first.click(); await pg.wait_for_timeout(300)
        ok('Detalhe da categoria abre', await pg.locator('dialog[open]').count()==1); await pg.keyboard.press('Escape')
        await ir(pg,'relatorio'); cols=pg.locator('[data-mes][aria-current]')
        ok('Relatório tem 6 colunas', await pg.locator('#conteudo [data-mes]').count()==6)
        await pg.locator('#conteudo [data-mes]').nth(2).click(); await pg.wait_for_timeout(700)
        ok('Clicar na coluna troca o mês', 'Voltar para o mês atual' in await pg.inner_text('#seletor-mes'))
        ok('Coluna ativa marcada', await pg.locator('#conteudo [data-mes][aria-current=true]').count()==1)
        await pg.click('text=Voltar para o mês atual'); await pg.wait_for_timeout(500)

        # ---------- ajustes
        await ir(pg,'ajustes')
        await pg.click('summary:has-text("Categorias")'); 
        lazer=pg.locator('form[data-tabela=categorias]', has=pg.locator('input[value="Lazer"]'))
        await lazer.locator('input[name=no_grafico]').uncheck(); await lazer.locator('button[type=submit]').click(); await pg.wait_for_timeout(700)
        await ir(pg,'inicio'); ok('Desmarcar "No gráfico" tira do Início', 'Lazer' not in await pg.inner_text('[aria-labelledby=t-grafico]'))
        await ir(pg,'ajustes'); await pg.click('summary:has-text("Categorias")') if not await pg.locator('details[data-secao=categorias][open]').count() else None
        lazer=pg.locator('form[data-tabela=categorias]', has=pg.locator('input[value="Lazer"]'))
        await lazer.locator('[data-excluir]').click(); await pg.wait_for_timeout(300); await pg.click('dialog [data-resposta=sim]'); await pg.wait_for_timeout(600)
        ok('Excluir categoria usada mostra erro amigável', 'já foi usado' in await toasts(pg))
        await pg.click('summary:has-text("Cartões de crédito")')
        f=pg.locator('form[data-tabela=cartoes]').first
        await f.locator('input[name=dia_fechamento]').fill('32'); await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(500)
        ok('Dia 32 é recusado', '1 a 31' in await toasts(pg))
        await f.locator('input[name=dia_fechamento]').fill(''); await f.locator('button[type=submit]').click(); await pg.wait_for_timeout(500)
        ok('Dia vazio é recusado', '1 a 31' in await toasts(pg))
        await pg.click('summary:has-text("Contas")')
        novo=pg.locator('form[data-tabela=contas][data-id=""]')
        await novo.locator('input[name=nome]').fill('Reserva'); await novo.locator('input[name=saldo_inicial]').type('250000'); await novo.locator('input[name=saldo_inicial_negativo]').check(); await novo.locator('button[type=submit]').click(); await pg.wait_for_timeout(700)
        await ir(pg,'inicio'); ok('Conta nova com saldo negativo aparece', '-R$ 2.500,00' in (await pg.inner_text('[aria-labelledby=t-saldo]')).replace(' ',' '), await pg.inner_text('[aria-labelledby=t-saldo]'))
        await ir(pg,'ajustes'); await pg.click('summary:has-text("Contas")') if not await pg.locator('details[data-secao=contas][open]').count() else None
        pp=pg.locator('form[data-tabela=contas]', has=pg.locator('input[value="Poupança"]'))
        await pp.locator('input[name=ativa]').uncheck(); await pp.locator('button[type=submit]').click(); await pg.wait_for_timeout(600)
        await ir(pg,'novo'); ok('Conta fora de uso some do formulário', await pg.locator('#f-conta option:has-text("Poupança")').count()==0)
        await ir(pg,'ajustes'); await pg.click('summary:has-text("Contas")') if not await pg.locator('details[data-secao=contas][open]').count() else None
        await pg.locator('form[data-tabela=contas]', has=pg.locator('input[value="Conta corrente"]')).locator('[data-excluir]').click(); await pg.wait_for_timeout(300); await pg.click('dialog [data-resposta=sim]'); await pg.wait_for_timeout(600)
        ok('Excluir conta usada é bloqueado', 'já foi usado' in await toasts(pg))
        await pg.click('summary:has-text("Aparência")'); await pg.click('label:has-text("Escuro")'); await pg.wait_for_timeout(200)
        ok('Tema escuro aplica', await pg.evaluate("document.documentElement.classList.contains('dark')"))
        await pg.check('[data-texto-grande]'); ok('Letras maiores aplica', await pg.evaluate("getComputedStyle(document.documentElement).fontSize")=='18px')
        await recarregar(pg)
        ok('Preferências ficam salvas', await pg.evaluate("document.documentElement.classList.contains('dark') && document.documentElement.classList.contains('texto-grande')"))
        await pg.click('label:has-text("Automático")') if await pg.locator('details[data-secao=aparencia][open]').count() else None
        # bloquear e entrar de novo
        await ir(pg,'inicio'); await pg.locator('[data-bloquear]:visible').first.click(); await pg.wait_for_selector('#senha', timeout=8000)
        ok('Bloquear mostra a tela de senha', 'Olá, Thiago' in await pg.inner_text('body'))
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(200)
        ok('Senha vazia mostra erro', 'Digite sua senha' in await pg.inner_text('#erro-senha-geral'))
        await pg.fill('#senha','errada'); await pg.click('[data-ver="senha"]')
        ok('Mostrar senha', await pg.get_attribute('#senha','type')=='text')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(1200)
        ok('Senha errada é recusada', 'Senha incorreta' in await pg.inner_text('#erro-senha-geral') and await pg.locator('#titulo-pagina').count()==0)
        await pg.fill('#senha', SENHA); await pg.click('button[type=submit]'); await pg.wait_for_selector('#titulo-pagina', timeout=8000)
        ok('Senha certa entra no sistema', await pg.locator('#titulo-pagina').count()==1)
        await pg.evaluate("location.hash='#ajustes'"); await pg.wait_for_timeout(500)
        ok('Navega normalmente depois de bloquear/entrar', (await pg.inner_text('#titulo-pagina'))=='Ajustes')
        ok('Sem erros de JavaScript', not errs, '; '.join(errs[:5]))
        await b.close()
    for r in R: print(*r)
    print(sum(1 for r in R if r[0]=='PASS'),'passaram /',len(R))
asyncio.run(main())
