# Caixa da Família

Sistema web para controlar os gastos da família: entradas e saídas do caixa, contas a pagar, cartões de crédito com parcelas, relatórios e pagamentos de funcionários e prestadores. Ele substitui a planilha `NOVO_CAIXA.xlsx`.

Funciona no computador e no celular. No celular, dá para instalar na tela inicial como se fosse um app.

**Tecnologias:** JavaScript puro (ES Modules), [Tailwind CSS 4](https://tailwindcss.com) e [Supabase](https://supabase.com) (banco PostgreSQL + login). **Não precisa de Node, npm nem build**: Tailwind e Supabase são carregados direto de um CDN.

---

## 1. Rodar no seu computador (modo demonstração)

Como o sistema usa módulos JavaScript (`import`), o navegador não abre o `index.html` com dois cliques: ele precisa ser servido por um servidor local. Qualquer um destes serve:

- **VS Code:** instale a extensão **Live Server**, clique com o botão direito no `index.html` e escolha **Open with Live Server**.
- **Python:** na pasta do projeto, rode `python -m http.server 5500` e abra http://localhost:5500

Enquanto `src/config.js` estiver vazio, o sistema abre em **modo demonstração**: ele usa dados de exemplo guardados na memória, e nada fica salvo.

## 2. Criar o banco no Supabase

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo (o plano gratuito basta).
2. Abra **SQL Editor > New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Em **Project Settings > API**, copie a **Project URL** e a chave **anon public**.
4. Cole os dois valores em [`src/config.js`](src/config.js):

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

5. Recarregue a página. Agora o sistema pede login.

> **Confirmação de e-mail:** por padrão, o Supabase manda um e-mail de confirmação no cadastro. Para uso só da família, você pode desligar em **Authentication > Sign In / Providers > Email > Confirm email**.

### Primeiro acesso

1. **Você:** clica em *Criar conta*, entra e escolhe **Sou o primeiro a usar**. A família é criada já com as contas (Espécie, MMP, Nubank, TMP, M.C.), os cartões e as categorias da planilha.
2. Vá em **Ajustes** e preencha o **saldo inicial** de cada conta e os **dias de fechamento e vencimento** de cada cartão.
3. **Sua esposa:** cria a conta dela, escolhe **Recebi um convite** e digita o código que aparece em *Ajustes > Família e convite*.

## 3. Publicar na internet (GitHub Pages, gratuito)

1. Envie o projeto para o GitHub, com o `src/config.js` já preenchido.
2. No repositório, vá em **Settings > Pages > Build and deployment**, escolha **Source: Deploy from a branch**, depois **Branch: main** e pasta **/ (root)**, e salve.
3. Em 1 ou 2 minutos o site fica disponível em `https://devthiagoferreira96-hue.github.io/caixa/`.
4. No Supabase, em **Authentication > URL Configuration**, coloque esse endereço em **Site URL** (assim os links de e-mail apontam para o lugar certo).

> A chave *anon* pode ficar no código e no GitHub: quem protege os dados são as regras de segurança (RLS) do `schema.sql`. Cada família só enxerga os próprios dados. **Nunca** coloque a chave `service_role` no projeto.

---

## Como o código está organizado

```
index.html                 página única + tema do Tailwind (cores, botões, campos)
manifest.webmanifest       permite instalar na tela do celular
src/
  config.js                URL e chave do Supabase  <- preencha aqui
  main.js                  início: verifica login e família
  router.js                troca de tela pelo endereço (#inicio, #extrato…)
  lib/
    supabase.js            conexão (ou modo demonstração)
    api.js                 TODAS as consultas ao banco ficam aqui
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

## Sobre o Tailwind pelo CDN

O script `@tailwindcss/browser` lê as classes usadas na página e gera o CSS no próprio navegador. Isso deixa o projeto simples, sem instalar nada, e é ótimo para um sistema de uso da família. Se um dia o sistema crescer, dá para voltar a usar um build (Vite ou o CLI do Tailwind) para gerar um CSS menor e mais rápido, sem mudar nada no código das telas.
