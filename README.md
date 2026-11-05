# Caixa da Família

Sistema web para controlar os gastos da família: entradas e saídas do caixa, contas a pagar, cartões de crédito com parcelas, relatórios e pagamentos de funcionários e prestadores. Ele substitui a planilha `NOVO_CAIXA.xlsx`.

Funciona no computador e no celular. No celular, dá para instalar na tela inicial como se fosse um app.

**Tecnologias:** JavaScript (ES Modules, sem framework), [Tailwind CSS 4](https://tailwindcss.com), [Supabase](https://supabase.com) (banco PostgreSQL + login) e [Vite](https://vite.dev).

---

## 1. Rodar no seu computador (modo demonstração)

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente http://localhost:5173).

Sem o arquivo `.env`, o sistema abre em **modo demonstração**: ele usa dados de exemplo guardados só neste navegador. Assim dá para testar tudo antes de configurar o banco, inclusive o modo offline: no Chrome, abra as Ferramentas do desenvolvedor (F12), vá em *Network* e escolha *Offline*.

## 2. Criar o banco no Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo (o plano gratuito basta).
2. Abra **SQL Editor > New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Em **Project Settings > API**, copie a **Project URL** e a chave **anon public**.
4. Na pasta do projeto, copie `.env.example` para `.env` e cole os dois valores:

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

5. Rode `npm run dev` de novo. Agora o sistema pede login.

> **Confirmação de e-mail:** por padrão, o Supabase manda um e-mail de confirmação no cadastro. Para uso só da família, você pode desligar em **Authentication > Sign In / Providers > Email > Confirm email**.

### Primeiro acesso

1. **Você:** clica em *Criar conta*, entra e escolhe **Sou o primeiro a usar**. A família é criada já com as contas (Espécie, MMP, Nubank, TMP, M.C.), os cartões e as categorias da planilha.
2. Vá em **Ajustes** e preencha o **saldo inicial** de cada conta e os **dias de fechamento e vencimento** de cada cartão.
3. **Sua esposa:** cria a conta dela, escolhe **Recebi um convite** e digita o código que aparece em *Ajustes > Família e convite*.

## Funciona sem internet

Depois do primeiro acesso em cada aparelho, o sistema funciona mesmo sem conexão:

- **Os dados ficam numa cópia guardada no aparelho** (IndexedDB) e todas as telas leem dessa cópia.
- **O que for lançado, editado ou excluído sem internet entra numa fila**, que também fica guardada, mesmo se a pessoa fechar o navegador ou sair da conta.
- **Quando a internet volta, ou quando a pessoa entra na conta**, aparece a mensagem *"Dados registrados offline sendo armazenados"* e a fila é enviada ao Supabase na ordem em que tudo foi feito. No fim aparece a confirmação.
- **Depois de enviar, o sistema baixa os dados atualizados**, incluindo o que a outra pessoa lançou. Isso também acontece a cada minuto e sempre que o app volta para a tela.
- **O app abre sem internet** porque o `public/sw.js` (service worker) guarda os arquivos do sistema. Isso só vale na versão publicada (`npm run build`), não no `npm run dev`.

Precisam de internet: o primeiro acesso em cada aparelho, o login, criar a família e entrar com o código de convite.

Se as duas pessoas alterarem **o mesmo lançamento** sem internet, vale a alteração que chegar por último ao servidor. Se o servidor recusar alguma alteração (por exemplo, excluir uma categoria que a outra pessoa acabou de usar), o sistema avisa qual foi e atualiza os dados com o que está no servidor.

Os arquivos dessa parte são `src/lib/local-db.js` (cópia local), `src/lib/sync.js` (fila e envio) e `src/components/conexao.js` (avisos na tela).

## 3. Publicar na internet (GitHub Pages, gratuito)

1. No GitHub, abra o repositório e vá em **Settings > Pages > Build and deployment > Source** e escolha **GitHub Actions**.
2. Vá em **Settings > Secrets and variables > Actions > New repository secret** e crie os secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Envie o código para a branch `main`. O workflow `.github/workflows/deploy.yml` gera e publica o site sozinho, e o endereço aparece na aba **Actions**. Será algo como `https://devthiagoferreira96-hue.github.io/caixa/`.
4. No Supabase, em **Authentication > URL Configuration**, coloque esse endereço em **Site URL** (assim os links de e-mail apontam para o lugar certo).

> A chave *anon* pode ficar pública: quem protege os dados são as regras de segurança (RLS) do `schema.sql`. Cada família só enxerga os próprios dados. **Nunca** coloque a chave `service_role` no projeto.

---

## Testes

```bash
npm test
```

Roda os testes das regras de negócio (em qual fatura cai cada compra, divisão de parcelas, datas e somas).

> **Já tinha rodado uma versão anterior do `schema.sql`?** Esta versão usa IDs no formato UUID (necessários para o modo offline). Rode `supabase/reset.sql` (**apaga todos os dados**) e depois o `schema.sql` de novo.

## Como o código está organizado

```
index.html                 página única (o JavaScript monta as telas)
src/
  main.js                  início: verifica login e família
  router.js                troca de tela pelo endereço (#inicio, #extrato…)
  style.css                Tailwind + componentes (botões, campos, cartões)
  lib/
    supabase.js            conexão (ou modo demonstração)
    api.js                 TODAS as leituras e gravações passam por aqui
    local-db.js            cópia dos dados no aparelho (modo offline)
    sync.js                fila de alterações e envio ao Supabase
    consulta-local.js      consultas na cópia local (mesmos comandos do Supabase)
    armazenamento.js       IndexedDB (guardar no aparelho)
    demo-db.js             banco de mentira para o modo demonstração
    store.js               dados em memória (contas, cartões, categorias…)
    faturas.js             regra de fechamento/vencimento e parcelas
    calculos.js            somas (substituem os SUMIF da planilha)
    format.js              dinheiro e datas no padrão brasileiro
    ui.js                  ícones, avisos, janelas, máscara de valor
    preferencias.js        tema escuro e letras maiores
  components/              peças usadas em várias telas
  pages/                   uma tela por arquivo
supabase/schema.sql        tabelas, segurança e funções do banco
supabase/reset.sql         apaga tudo para recomeçar (use com cuidado)
tests/                     testes das regras (npm test)
```

### Tabelas

| Tabela | O que guarda | Na planilha |
|---|---|---|
| `lancamentos` | entradas e saídas do caixa, contas a pagar, pagamentos de fatura | colunas A:K |
| `compras_cartao` + `parcelas` | compras no crédito e cada parcela na fatura certa | colunas Q:AP |
| `contas` | Espécie, MMP, Nubank… com saldo inicial | bloco de saldos (M:N) |
| `categorias` | categorias, grupo e se aparecem no gráfico do Início | lista de categorias |
| `pessoas` | funcionários, prestadores, família | coluna PESSOA |
| `familias` / `membros` | quem pode ver os dados | — |

## Acessibilidade

- Todos os campos têm rótulo, dica e mensagem de erro, lidas por leitores de tela.
- Dá para usar tudo pelo teclado. As janelas fecham com `Esc` e há o link "Pular para o conteúdo".
- Os botões têm pelo menos 44px de altura, bons para tocar no celular.
- O status nunca é indicado só pela cor: sempre vem com texto ("Pago", "Atrasado").
- Opções de **letras maiores** e **modo escuro** em Ajustes, e o sistema respeita a configuração de "reduzir movimento" do aparelho.
- O botão **?** em cada tela explica aquela tela. Também há uma apresentação no primeiro acesso, a página *Como usar* e o botão **Desfazer** nas ações principais.

## Próximos passos sugeridos

- Importar o histórico da planilha (exportar como CSV e criar uma tela de importação).
- Uma área própria para as despesas da Fazenda, da Empresa e de Serviços.
- Lembretes de contas vencendo (Supabase Edge Functions + e-mail).
