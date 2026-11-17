SENHA = '1234abcd'

async def preparar(pg, U, exemplo=True, nome='Thiago', senha=SENHA):
    """Primeiro acesso (cria usuário) ou tela de senha (entra)."""
    await pg.goto(U)
    await pg.wait_for_selector('#usuario, #senha', timeout=10000)
    if await pg.locator('#usuario').count():
        await pg.fill('#usuario', nome); await pg.fill('#senha', senha); await pg.fill('#confirmar', senha)
        if exemplo: await pg.check('[name=exemplo]')
    else:
        await pg.fill('#senha', senha)
    await pg.click('button[type=submit]')
    await guardar_codigo(pg)
    await pg.wait_for_selector('#titulo-pagina', timeout=10000)
    await pg.wait_for_timeout(700)

async def guardar_codigo(pg, timeout=6000):
    """Se aparecer a janela do código de recuperação, marca 'já guardei' e continua. Retorna o código."""
    try:
        await pg.wait_for_selector('dialog[open] [data-guardei]', timeout=timeout)
    except Exception:
        return None
    codigo = (await pg.inner_text('dialog[open] output')).strip()
    await pg.check('dialog[open] [data-guardei]'); await pg.click('dialog[open] [data-continuar]')
    await pg.wait_for_timeout(300)
    return codigo

async def pular_tour(pg):
    if await pg.locator('dialog[open] >> text=Pular').count():
        await pg.click('dialog[open] >> text=Pular'); await pg.wait_for_timeout(300)

async def recarregar(pg, senha=SENHA):
    await pg.reload()
    await pg.wait_for_selector('#senha', timeout=10000)
    await pg.fill('#senha', senha); await pg.click('button[type=submit]')
    await pg.wait_for_selector('#titulo-pagina', timeout=10000)
    await pg.wait_for_timeout(600)
