# Caixa da Família

Sistema para controlar os gastos da família: entradas e saídas do caixa, contas a pagar, cartões de crédito com parcelas, relatórios e pagamentos de funcionários e prestadores. Ele substitui a planilha `NOVO_CAIXA.xlsx`.

- **Funciona 100% sem internet.** Os dados ficam só no aparelho (celular ou computador) e não existe servidor nem banco de dados na nuvem.
- **Protegido por senha.** Ela é pedida sempre que o sistema é aberto, e também criptografa os dados guardados no aparelho (AES-256).
- **Backup por arquivo.** Gera um arquivo com todos os dados, para guardar no Drive, no e-mail ou no WhatsApp e restaurar quando precisar.
- **Instala no celular** como um aplicativo (PWA) e funciona no computador também.

**Tecnologias:** JavaScript (ES Modules, sem framework), [Tailwind CSS 4](https://tailwindcss.com), [Vite](https://vite.dev), IndexedDB e Web Crypto (já vêm no navegador).

---

## 1. Rodar no seu computador

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente http://localhost:5173).

No primeiro acesso, o sistema pede **seu nome** e uma **senha**. Marque *Começar com dados de exemplo* para conhecer o sistema; depois, em *Ajustes > Usuário e senha > Apagar tudo*, dá para começar do zero.

## 2. Publicar e instalar no celular

Para instalar no celular, o sistema precisa estar num endereço **https**. Isso é só para entregar os arquivos do sistema: os dados nunca saem do aparelho. Duas opções gratuitas:

**GitHub Pages (já configurado):**

1. Envie o projeto para o GitHub (`git push`).
2. No repositório, vá em **Settings > Pages > Source** e escolha **GitHub Actions**.
3. Quando a aba **Actions** ficar verde, o site estará em `https://devthiagoferreira96-hue.github.io/caixa/`.

**Vercel:** em vercel.com, escolha **Add New > Project**, selecione o repositório e clique em **Deploy** (ela detecta o Vite sozinha). Se usar a Vercel, pode apagar `.github/workflows/deploy.yml`.

**Instalar:**

- **Android (Chrome):** abra o endereço, toque nos três pontinhos ⋮ e depois em **Instalar app**.
- **iPhone (Safari):** abra o endereço, toque em compartilhar e depois em **Adicionar à Tela de Início**.

Depois de instalado, o sistema abre e funciona sem internet. Quando você publicar uma versão nova, o celular atualiza sozinho na próxima vez que tiver internet; **os dados não são afetados**.

## Senha e segurança

- A senha e o código **nunca são guardados**. A partir deles são geradas chaves (PBKDF2, 310 mil repetições), e os dados ficam cifrados com AES-GCM 256 bits. Sem a senha ou o código, os dados guardados no aparelho são ilegíveis.
- A senha é pedida toda vez que o sistema é aberto, e de novo se o app ficar mais de 1 minuto em segundo plano. O cadeado no menu bloqueia na hora.
- Depois de 5 senhas erradas seguidas, o sistema espera 30 segundos entre tentativas.
- **Código de recuperação:** ao criar o acesso, o sistema mostra um código (ex.: `K7QM-2XPA-9TRW-HF4D`) com botões para enviar ao seu WhatsApp, compartilhar ou copiar. Ele aparece só uma vez.
- **Esqueceu a senha?** Na tela de senha, toque em *Esqueci minha senha*, digite o código e crie uma senha nova. Nenhum dado se perde. Depois de usado, o código é trocado por um novo, que é mostrado na hora.
- **Perdeu o código?** Em *Ajustes > Usuário e senha > Novo código de recuperação* (pede a senha), o antigo deixa de valer.
- **Sem a senha e sem o código** não há como abrir os dados: só um backup os traz de volta.
- **Como funciona por dentro:** os dados são cifrados com uma chave aleatória. Essa chave fica guardada em duas "fechaduras", uma aberta pela senha e outra pelo código. Tudo acontece no aparelho, sem servidor (veja `src/lib/cofre.js`).

## Casa, Fazenda e tipos de categoria

- Cada categoria tem um **tipo** (saída, entrada ou os dois). O formulário de lançamento só mostra as categorias do tipo escolhido. Dados de versões anteriores recebem o tipo automaticamente (pelo nome e pelo uso).
- As categorias dos grupos **Fazenda** e **Empresa** (`GRUPOS_SEPARADOS` em `src/lib/store.js`) ficam fora do *Resumo da casa* e ganham um quadro próprio no Início com vendas, despesas e lucro.

## Importar a planilha do Excel

*Ajustes > Backup, importar e exportar > Importar planilha do Excel*. Lê o `.xlsx` no modelo do `NOVO_CAIXA.xlsx` (uma aba por mês; caixa nas colunas A–J e um bloco por cartão), no próprio aparelho (`src/lib/ler-xlsx.js` + `DecompressionStream`). As colunas são achadas pelo título. Mostra uma prévia (mês/ano de cada aba, cadastros novos, avisos), pula o que já existe e pode ser desfeita. Regras em `src/lib/importar-planilha.js`.

## Backup

Como os dados ficam só no aparelho, **perder o aparelho é perder os dados**, a não ser que exista um backup.

- **Fazer backup:** *Ajustes > Backup e exportar > Backup, Excel ou PDF > Backup completo*. No celular, abre o *Compartilhar* (Drive, e-mail ou WhatsApp); no computador, baixa um arquivo `.json`.
- **Exportar:** na mesma janela dá para gerar uma **planilha do Excel (.xlsx)** (abas Resumo, Lançamentos, Cartões e Por categoria, com filtros e totais) ou um **relatório em PDF**, do mês aberto, do ano ou de tudo. Os dois arquivos são montados no próprio aparelho, sem internet e sem bibliotecas externas (`src/lib/exportar-*.js`, `zip.js`). Servem para consultar: só o `.json` restaura os dados.
- **Restaurar:** em *Ajustes > Restaurar um backup* ou, num aparelho novo, em *Já tenho um arquivo de backup* na primeira tela. A restauração tem *Desfazer*.
- O Início mostra um lembrete quando você ainda não fez backup ou quando o último tem mais de 30 dias.
- O arquivo de backup **não tem senha**: guarde-o num lugar só seu.

## Testes

```bash
npm test
```

Roda os testes das regras de negócio (em qual fatura cai cada compra, divisão de parcelas, datas e somas).

---

## Como o código está organizado

```
index.html                 página única (o JavaScript monta as telas)
public/                    ícones, manifest (instalar no celular) e sw.js (abrir sem internet)
src/
  main.js                  início: primeiro acesso ou tela de senha, bloqueio automático
  router.js                troca de tela pelo endereço (#inicio, #extrato…)
  style.css                Tailwind + componentes (botões, campos, cartões)
  lib/
    local-db.js            dados no aparelho: usuário, senha e tabelas cifradas
    cofre.js               criptografia (PBKDF2 + AES-GCM, Web Crypto)
    armazenamento.js       IndexedDB (guardar no aparelho)
    consulta-local.js      consultas nos dados: from().select().eq().order()...
    api.js                 TODAS as leituras e gravações passam por aqui
    exemplo.js             contas/cartões/categorias iniciais e dados de exemplo
    store.js               dados em memória (contas, cartões, categorias…)
    faturas.js             regra de fechamento/vencimento e parcelas
    calculos.js            somas (substituem os SUMIF da planilha)
    format.js              dinheiro e datas no padrão brasileiro
    ui.js                  ícones, avisos, janelas, máscara de valor
    preferencias.js        tema escuro e letras maiores
  components/              peças usadas em várias telas (layout, gráficos, backup…)
  pages/                   uma tela por arquivo (acesso, início, extrato, novo…)
tests/                     testes das regras (npm test)
```

### Tabelas (guardadas no aparelho)

| Tabela | O que guarda | Na planilha |
|---|---|---|
| `lancamentos` | entradas e saídas do caixa, contas a pagar, pagamentos de fatura | colunas A:K |
| `compras_cartao` + `parcelas` | compras no crédito e cada parcela na fatura certa | colunas Q:AP |
| `contas` | Espécie, MMP, Nubank… com saldo inicial | bloco de saldos (M:N) |
| `categorias` | categorias, grupo e se aparecem no gráfico do Início | lista de categorias |
| `pessoas` | funcionários, prestadores, família | coluna PESSOA |

> As consultas em `consulta-local.js` usam o mesmo formato de bibliotecas de banco como o Supabase (`from('lancamentos').select('*').eq(...)`). Se um dia quiser guardar os dados na nuvem e usar em vários aparelhos, dá para trocar só a camada de dados, sem reescrever as telas.

## Acessibilidade

- Todos os campos têm rótulo, dica e mensagem de erro lidas por leitores de tela.
- Dá para usar tudo pelo teclado. As janelas fecham com `Esc` e há o link "Pular para o conteúdo".
- Os botões têm pelo menos 44px de altura, bons para tocar no celular.
- O status nunca é indicado só pela cor: sempre vem com texto ("Pago", "Atrasado").
- Opções de **letras maiores** e **modo escuro** em Ajustes, e o sistema respeita a configuração de "reduzir movimento" do aparelho.
- O botão **?** explica cada tela, há uma apresentação no primeiro acesso e o botão **Desfazer** nas ações.
