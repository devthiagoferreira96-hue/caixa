"""QA do botão "Exportar PDF" da conta corrente da Resina.
Lança uma nota de insumos com dois produtores (cada um na sua conta), exporta o PDF de cada conta e confere o texto.
Uso: python conta_corrente_pdf.py [pasta-de-saida]   (servidor do build em http://localhost:8765/)"""
import asyncio, sys, os, re, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import preparar, pular_tour
from insumos import ir, ultimo_toast, limpar_toasts, adicionar
from conta_por_produtor import escolher, linha
from playwright.async_api import async_playwright
U = 'http://localhost:8765/'
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
CHROME = next((c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe', '/usr/bin/google-chrome'] if os.path.exists(c)), None)
R = []
def ok(n, c, x=''): R.append(('PASS' if c else 'FALHA', n, x))
D = 'dialog[open]'

def textos_do_pdf(dados):
    """Os textos desenhados no PDF (o conteúdo não é comprimido: cada texto é "(...) Tj", com acentos em \\ooo)"""
    s = dados.decode('latin-1')
    out = []
    for m in re.finditer(r'\(((?:\\.|[^\\)])*)\) Tj', s):
        t = re.sub(r'\\([0-7]{3})', lambda x: chr(int(x.group(1), 8)), m.group(1))
        out.append(re.sub(r'\\(.)', r'\1', t).encode('latin-1').decode('cp1252'))
    return out

async def baixar_pdf(pg, nome):
    async with pg.expect_download() as d:
        await pg.click('[data-exportar-pdf]')
    dl = await d.value
    caminho = os.path.join(SAIDA, nome)
    await dl.save_as(caminho)
    return dl.suggested_filename, open(caminho, 'rb').read()

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
        await ir(pg, 'resina-cadastros')
        await adicionar(pg, 'resina_titulares', {'nome': 'Conta Itacury', 'documento': '111.111.111-11'})
        await adicionar(pg, 'resina_titulares', {'nome': 'Conta Zeca', 'documento': '222.222.222-22'})
        await adicionar(pg, 'resina_produtores', {'nome': 'Itacury', 'arrendamento': 40})
        await adicionar(pg, 'resina_produtores', {'nome': 'Zeca', 'arrendamento': 40})
        await adicionar(pg, 'resina_produtos', {'nome': 'Pasta 16%', 'unidade': 'kg', 'valor_unitario': '550'})
        await adicionar(pg, 'resina_produtos', {'nome': 'Arame', 'unidade': 'm', 'valor_unitario': '1000'})

        # nota com dois produtores, no mês atual
        hoje = await pg.evaluate("new Date().toISOString().slice(0, 10)")
        await ir(pg, 'insumos'); await limpar_toasts(pg)
        await pg.click('[data-lancar]'); await pg.wait_for_selector(f'{D} [data-c=titular_id]')
        await pg.fill(f'{D} #in-data', hoje); await pg.fill(f'{D} #in-nota', 'NF 267')
        await escolher(pg, 0, 'produto_id', 'Pasta 16%'); await escolher(pg, 0, 'produtor_id', 'Itacury'); await escolher(pg, 0, 'titular_id', 'Conta Itacury')
        li = await linha(pg, 0)
        await li.locator('[data-c=quantidade]').fill('150'); await li.locator('[data-c=pct]').fill('50')
        await pg.click(f'{D} [data-mais-linha]'); await pg.wait_for_timeout(150)
        await escolher(pg, 1, 'produto_id', 'Arame'); await escolher(pg, 1, 'produtor_id', 'Zeca'); await escolher(pg, 1, 'titular_id', 'Conta Zeca')
        li = await linha(pg, 1)
        await li.locator('[data-c=quantidade]').fill('20'); await li.locator('[data-c=pct]').fill('30')
        await pg.click(f'{D} button[type=submit]'); await pg.wait_for_timeout(800)
        ok('nota lançada', await pg.locator(D).count() == 0, await ultimo_toast(pg))

        # conta corrente: os dois botões de exportar
        await ir(pg, 'conta-corrente'); await pg.wait_for_timeout(400)
        await pg.locator('[data-conta]', has_text='Conta Itacury').first.click(); await pg.wait_for_timeout(400)
        ok('tem "Exportar Excel" e "Exportar PDF"', await pg.locator('[data-exportar]').count() == 1 and await pg.locator('[data-exportar-pdf]').is_enabled())
        nome, pdf = await baixar_pdf(pg, 'conta-itacury.pdf')
        ok('baixa um .pdf com o nome da conta', nome.startswith('conta-corrente-Conta-Itacury-') and nome.endswith('.pdf'), nome)
        ok('arquivo é um PDF', pdf.startswith(b'%PDF-') and pdf.rstrip().endswith(b'%%EOF'))
        ok('folha deitada (A4)', b'/MediaBox [0 0 841.89 595.28]' in pdf)
        t = textos_do_pdf(pdf); tudo = ' | '.join(t)
        ok('título e conta com o documento', 'Conta corrente do arrendamento' in t and 'Conta Itacury · 111.111.111-11' in t, t[:6])
        ok('cabeçalho da tabela com as colunas da planilha', all(c in t for c in ['Data', 'Descrição', 'Nota', 'Destino', 'Tbs', '% arr.', 'Quant.', 'Média', 'R$ unit.', 'Crédito', 'Débito', 'Saldo']))
        ok('linha do insumo do Itacury com a parte cobrada, sem cortar', '150 kg Pasta 16% · Itacury (50% de R$ 825,00)' in ' '.join(t) and '…' not in tudo, [x for x in t if 'Pasta' in x or '825' in x])
        ok('nota e valores da linha', 'NF 267' in t and '412,50' in t and '-412,50' in t, tudo[:600])
        ok('não mostra o Zeca na conta do Itacury', 'Zeca' not in tudo)
        ok('total do mês e "Falta receber"', 'Total do mês' in t and 'Falta receber: R$ 412,50' in t, [x for x in t if 'receber' in x.lower()])
        ok('rodapé com a página', 'Página 1 de 1' in t)
        ok('avisa que gerou', 'PDF gerado' in await ultimo_toast(pg))

        # outra conta e filtro de produtor
        await pg.locator('[data-conta]', has_text='Conta Zeca').first.click(); await pg.wait_for_timeout(400)
        await pg.select_option('[data-produtor]', label='Zeca'); await pg.wait_for_timeout(400)
        nome, pdf = await baixar_pdf(pg, 'conta-zeca.pdf')
        t = textos_do_pdf(pdf); tudo = ' | '.join(t)
        ok('Conta Zeca: só a parte do Zeca (R$ 60,00)', '60,00' in tudo and 'Itacury' not in tudo, tudo[:600])
        ok('produtor escolhido no cabeçalho e no nome do arquivo', 'Produtor: Zeca' in tudo and '-Zeca-' in nome, nome)

        await pg.screenshot(path=os.path.join(SAIDA, 'conta-corrente-botoes.png'))

        # celular: os botões cabem
        await pg.set_viewport_size({'width': 360, 'height': 780}); await pg.wait_for_timeout(300)
        larg = await pg.evaluate('document.documentElement.scrollWidth')
        caixa = await pg.locator('[data-exportar-pdf]').bounding_box()
        ok('celular: sem rolagem para o lado e botão na tela', larg <= 360 and caixa['x'] + caixa['width'] <= 360 and caixa['height'] >= 44, (larg, caixa))
        await pg.screenshot(path=os.path.join(SAIDA, 'conta-corrente-botoes-celular.png'))
        ok('sem erros no console', not erros, erros)
        await b.close()
    for r in R: print(r[0], r[1], '' if r[0] == 'PASS' else r[2])
    print(f"{sum(r[0] == 'PASS' for r in R)} passaram, {sum(r[0] != 'PASS' for r in R)} falharam")

asyncio.run(main())
