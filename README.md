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

A importação reconhece sozinha cada aba e manda para o lugar certo (`importarQualquerPlanilha` em `src/components/importar.js`). O mesmo botão aparece em Ajustes, na Produção e na Conta corrente.
- **Caixa** (modelo NOVO_CAIXA): a REFERENCIA vira a observação, e a PARCELA vai para o campo da parcela. "FATURA <cartão>" vira pagamento de fatura, mesmo quando o cartão só aparece no bloco da própria planilha. Valor com sinal contrário no bloco do cartão vira reembolso.
- **Produção da resina** (CONTROLE ANUAL FAZENDA, abas SAFRAS): os blocos `DATA | TBS | PESO - KG` de cada produtor e safra (agosto a julho) viram cargas, uma por dia, com o kg de cada produtor. Regras em `src/modulos/resina/importar-safras.js`. Linhas repetidas entre as abas entram uma vez só. Nos blocos de duas pessoas ("PEDRO E PAULO"), a linha com o nome ao lado vai para quem está escrito, e a linha sem nome é dividida meio a meio. A aba de resumo (Tbs por mês × ano) não é importada. Aceita meio tambor (28,5).
- **Conta corrente**: quando a carga já veio das SAFRAS (mesmo dia, produtor e Tbs), a conta corrente completa essa carga (conta, preço, nota e %) em vez de criar outra.
- Quando o arquivo tem mais de um tipo de aba (o backup em Excel), a importação pergunta o que trazer e abre as conferências na ordem Caixa → Produção → Conta corrente.

## Temas de cores

*Ajustes > Aparência*: temas prontos (Verde Cofre, Azul Navy Contábil, Neutros com toque de cobre) ou 5 cores próprias (principal, gráficos, fundo, quadros, texto). `src/lib/temas.js` gera os tons da cor principal e os cinzas a partir dessas cores (OKLCH) e ajusta o que for preciso para manter contraste WCAG AA. As cores entram como variáveis CSS (`--color-brand-*`, `--color-stone-*`, `--color-fundo`, `--color-cartao`, `--color-texto`, `--color-destaque`).

## Proteções contra erro

- **Clique duplo** em Salvar não grava duas vezes (`semRepetir` em `lib/ui.js`).
- **Mais de uma aba/janela aberta** (ou o app instalado + o navegador): quem grava avisa as outras (`BroadcastChannel`), que recarregam os dados antes de continuar; nada se perde.
- **Backup editado ou danificado**: cada linha é conferida ao restaurar (`conferirTabelas` em `lib/api.js`); o que dá é corrigido, o resto fica de fora, e a pessoa é avisada antes de confirmar.
- **Nomes repetidos** em contas, cartões, categorias e pessoas são recusados (sem diferenciar maiúscula ou acento).
- **Aparelho sem espaço**: se não der para gravar, aparece um aviso pedindo backup.
- **Arquivos de fora**: PDF, CSV, Word, planilha com senha, .xls antigo, arquivo cortado ou vazio são recusados com uma mensagem que diz o que fazer.

## Módulo Resina (produção e cargas)

Módulo opcional, ligado em Ajustes > Módulos. Fica em `src/modulos/resina/` e não mexe no Caixa: usa tabelas próprias (`resina_*`) no mesmo arquivo cifrado e no mesmo backup.

- **Cadastros**: produtores (cor e % de arrendamento), motoristas, caminhões (placa e quantos Tbs cabem), preço do kg por data e fazenda.
- **Carga**: número automático (C-2026-0001), pesagem na fazenda e/ou na chegada (com a diferença em kg, % e R$), Tbs e % de arrendamento por produtor, kg calculado pelos Tbs ou digitado, e a carreta animada.
- **Produção**: totais do mês e quanto cada produtor produziu.
- **Insumos**: em *Cadastros > Produtos (insumos)* ficam os produtos usados na coleta, com unidade e valor unitário. Na tela **Insumos**, cada entrega a um produtor tem data, conta (CNPJ/CPF), nota e vários produtos (quantidade, valor unitário e valor total; quem só sabe o total digita o total e o unitário é calculado).
- **Insumos × produção** (na tela Produção, por mês ou pelo ano inteiro): compara o gasto com insumos e a resina entregue por cada produtor. O número principal é o **insumo por kg de resina**, comparado com a média de todos. Gera alerta quem fica 25% ou mais acima da média (pode ser desperdício ou resina que não chegou nas cargas) e quem recebeu insumo sem entregar resina. Os insumos são descontados do produtor, então a tabela mostra a parte do produtor menos os insumos, e o consumo de cada produto por tonelada.
- **Conta corrente do arrendamento**: segue a planilha *Conta corrente arrendo* da empresa. Há uma conta para cada cadastro em *Cadastros > Contas* (o CNPJ da empresa e o CPF da proprietária), e cada carga escolhe a sua, junto com a **nota** e o **destino**.
  - Cada produtor de cada carga vira uma linha. O **débito** é o arrendamento, ou seja, o que a proprietária tem para receber. **UNI.** é o valor de um tambor (média de kg por tambor × preço do kg), então débito = tambores × UNI. × % arrendo.
  - Os **insumos** também entram como débito, porque são descontados do produtor.
  - **Crédito** é o que já foi recebido, lançado na própria tela (*Lançar recebimento*). Dá para filtrar por produtor.
  - O **saldo** vem desde a primeira carga. Negativo quer dizer que ainda falta receber.
  - **Exportar Excel** gera o mês com as mesmas 13 colunas da planilha da empresa: débito negativo e saldo em fórmula (`saldo anterior + crédito + débito`).
  - **Ligado ao Caixa:** o recebimento (crédito) pode entrar também como **entrada** numa conta do Caixa, e a compra de insumos como **saída** de uma conta ou **compra no cartão**. O que vai para o Caixa guarda de onde veio (`resina_movimento_id` / `resina_entrega_id`): mudar ou excluir na Resina refaz ou exclui no Caixa (`src/modulos/resina/ligacao-caixa.js`). O Início do Caixa mostra o **arrendamento a receber** de cada conta (CNPJ/CPF).
  - **Importar planilha** lê a planilha da empresa (as colunas são achadas pelo título). Quando as colunas de número estão vazias, lê o texto da descrição: `CARGA 57 TBS = 11.480 KG X R$ 4,60 X 55%` vira carga, `125 KG PASTA` vira insumo e o resto (PIX etc.) vira lançamento. Antes de gravar, mostra cada linha como foi entendida: dá para escolher o produtor, crédito ou débito, digitar o valor que falta, juntar produtos ao cadastro ou desmarcar a linha. Linhas seguidas da mesma carga viram uma carga com vários produtores. O que já está no sistema não é importado de novo, e dá para desfazer a importação inteira.
- Quem já usava o sistema recebe as tabelas novas vazias; nenhum cadastro do Caixa é criado de novo ou apagado. Backups antigos (sem a resina) continuam restaurando normalmente.

## Backup

Como os dados ficam só no aparelho, **perder o aparelho é perder os dados**, a não ser que exista um backup.

- **Fazer backup:** *Ajustes > Backup e exportar > Backup, Excel ou PDF > Backup completo*. No celular, abre o *Compartilhar* (Drive, e-mail ou WhatsApp); no computador, baixa um arquivo `.json`.
- **Exportar:** na mesma janela dá para gerar o **backup em Excel (.xlsx)** ou um **relatório em PDF**, do mês aberto, do ano ou de tudo. O backup em Excel é **um arquivo só**, com as abas no formato das planilhas da família e da empresa, e pode ser importado de volta:
  - o Caixa, com uma aba por mês como no NOVO_CAIXA (`src/lib/planilha-caixa.js`), com saldo anterior, resumo por conta e categoria em fórmulas e um bloco por cartão;
  - CONTROLE ANUAL e SAFRAS, como no CONTROLE ANUAL FAZENDA;
  - uma CONTA CORRENTE por conta, como na Conta corrente arrendo (`src/modulos/resina/planilhas-resina.js`).

  Dá para escolher só algumas partes. O que esses formatos não têm (recorrência, desconto/juros, competência, pessoa da compra no cartão, cadastros como motoristas e caminhões) só volta pelo `.json`, que continua sendo o backup completo.
- **Restaurar:** em *Ajustes > Restaurar um backup* ou, num aparelho novo, em *Já tenho um arquivo de backup* na primeira tela. A restauração tem *Desfazer*.
- O Início mostra um lembrete quando você ainda não fez backup ou quando o último tem mais de 30 dias.
- O arquivo de backup **não tem senha**: guarde-o num lugar só seu.

## Testes

```bash
npm test
```

Roda os testes das regras de negócio (em qual fatura cai cada compra, divisão de parcelas, datas, somas, repetições "sempre", fatura com adiantamento e reembolso, cargas e conta corrente).

Os testes de navegador ficam em `testes-navegador/` (veja o `LEIA-ME.md` de lá).

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
  modulos/resina/          módulo Resina: tabelas, contas, carreta animada e telas
tests/                     testes das regras (npm test)
```

### Tabelas (guardadas no aparelho)

| Tabela | O que guarda | Na planilha |
|---|---|---|
| `lancamentos` | entradas e saídas do caixa, contas a pagar, pagamentos de fatura | colunas A:K |
| `compras_cartao` + `parcelas` | compras no crédito e cada parcela na fatura certa. `tipo: 'estorno'` = reembolso (parcela negativa, abate a fatura); `recorrente` = assinatura (todo mês ou, com `recorrente_intervalo: 12`, todo ano); `pessoa_id` opcional | colunas Q:AP |
| `contas` | Espécie, Conta corrente, Nubank… com saldo inicial | bloco de saldos (M:N) |
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
