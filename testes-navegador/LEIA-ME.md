# Testes de navegador (QA) do Caixa da Família

Scripts em Python + Playwright usados para testar o sistema inteiro no navegador.
Eles não fazem parte do app; servem para quem continuar o desenvolvimento.

- comum.py: funções de apoio (criar usuário, pular tour, recarregar). Senha de teste fica aí.
- Cada script imprime "N passaram, M falharam" (ou um JSON vazio/"TUDO LIMPO" no caso de mobile/a11y).
- Servidor esperado: http://localhost:8765/ servindo o build (pasta out/ ou dist/).
- build-sem-internet.mjs: build usado no ambiente sem acesso ao npm (esbuild + Tailwind já instalados). Com internet, use `npm install` e `npm run build`.
- arq/: planilhas e backups usados nos testes (caminhos nos scripts apontavam para /tmp/qa/arq, /tmp/imp e /tmp/qa; ajuste se precisar).

Suites: acesso, func, desfazer, recuperacao, semnet, exportar, areas, importar, pendencias, temas_teste,
animacoes, qa_final, qa_final2, mobile, a11y, resina (87 checagens), resina_ui (acessibilidade/celular da resina),
conferir.test.mjs (validação de backup).
conta_corrente.py (35 checagens: contas CNPJ/CPF, nota e destino, saldo, recebimentos, Excel, backup e celular).
  Funciona no Windows: usa o Chrome instalado e recebe a pasta de saída como argumento.
  `pip install playwright`, depois `npx vite preview --port 8765` e `python conta_corrente.py C:\pasta\saida`.
  No Windows, rode com `set PYTHONIOENCODING=utf-8` para os acentos aparecerem.
Obs.: em resina.py, a checagem "carreta carregada ao abrir" pode falhar por tempo no Chrome sem janela
  (a animação dos 27 tambores leva mais que os 4 s que o teste espera). Os tambores aparecem: é só o tempo.
insumos.py (29 checagens: produtos, entregas de insumos, comparativo insumos × produção, alertas, backup, celular). Roda igual ao conta_corrente.py.
importar_conta.py (40 checagens: importar a planilha "Conta corrente arrendo", conferência linha a linha, cargas juntadas, insumos na conta corrente,
  reimportar sem duplicar, desfazer e celular). Precisa da planilha: `python importar_conta.py "C:caminhoConta corrente arrendo.xlsx" C:pastasaida`.

recorrencia_cartao.py (40 checagens: repetir por N meses, sempre, todo ano; parar a repetição; assinatura no cartão com pessoa;
  excluir só esta parcela / esta e as próximas; reembolso; adiantamento e pagar o restante; celular). Roda igual ao conta_corrente.py.
Repetição "sempre": o sistema mantém lançados os próximos 12 meses (src/lib/recorrencia.js) e completa ao abrir (manterRecorrencias em api.js).
ligacao.py (26 checagens: recebimento da Resina vira entrada no Caixa, mudar/excluir acompanha, insumos no cartão ou como saída a pagar,
  quadro do arrendamento a receber no Início, desfazer dos dois lados, celular). Roda igual ao conta_corrente.py.
parte_produtor_cartao.py (48 checagens: parte do produtor nos insumos (cada produto com o seu produtor e a sua %, nota com vários produtores), no Início e na conta corrente; "a receber" no Caixa que baixa a conta corrente ao ser recebido, com "Quando vai receber?" acompanhando o vencimento da nota; busca na tela Cartões;
  no cartão, mudar o valor de uma parcela ou assinatura "só esta" ou "esta e as próximas"). Roda igual ao conta_corrente.py.
soma_cartao.py (17 checagens: selecionar compras na tela Cartões e ver a soma, reembolso descontado, caixinha do cartão inteiro, com busca, manter ao voltar, celular). Roda igual ao conta_corrente.py.
filtro_contas.py (24 checagens: no Extrato, filtrar por mais de uma conta, inclusive as fora de uso; sem filtro só as contas "No saldo" (as outras quando marcadas), fatura do cartão a pagar só sem conta marcada; "Todas as contas", saldo das contas escolhidas, fechar ao tocar fora/Esc/foco, guardado ao voltar, "Limpar filtros", celular). Roda igual ao conta_corrente.py.
transferencia.py (30 checagens: transferência entre contas no Novo lançamento; saldos das duas contas mudam e o total não; não entra em entradas/gastos do mês nem no Relatório; Extrato com as duas pontas e com filtro de contas; editar, marcar feita/não feita, excluir e desfazer as duas juntas; celular). Roda igual ao conta_corrente.py.
conta_por_produtor.py (18 checagens: nota de insumos com dois produtores, cada um na sua conta CNPJ/CPF: conta em cada linha de produto, nunca herda a conta de outro produtor, vem sozinha com a última usada pelo produtor, conta corrente e "a receber" de cada um na conta certa, editar, celular). Roda igual ao conta_corrente.py.
quem_pagou.py (22 checagens: nota com dois produtores em que um paga antes. "Quem já pagou" tem uma linha por produtor, com a data em que pagou e a conta em que entrou; o Extrato e a conta corrente acompanham; reabrir, desmarcar, receber pelo Extrato aparece marcado, busca do Extrato pelo produtor, celular). Roda igual ao conta_corrente.py.
extrato_periodo.py (20 checagens: o Extrato abre com o mês inteiro em "De" e "Até"; Filtrar (ou Enter) mostra só aqueles dias, inclusive pegando dois meses; digitar não filtra sozinho; datas invertidas trocam; data vazia avisa; "Mês inteiro" e trocar o mês no topo voltam ao normal; busca pelo nome da pessoa; celular). Usa os dados de exemplo. Roda igual ao conta_corrente.py.
conta_corrente_pdf.py (17 checagens: botão "Exportar PDF" da conta corrente; folha deitada, conta com o documento, colunas da planilha, descrição longa quebrando linha em vez de cortar, parte cobrada do produtor, total e "Falta receber", filtro de produtor no cabeçalho e no nome do arquivo, celular). Roda igual ao conta_corrente.py.
