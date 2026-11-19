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
parte_produtor_cartao.py (42 checagens: parte do produtor nos insumos (cada produto com o seu produtor e a sua %, nota com vários produtores), no Início e na conta corrente; "a receber" no Caixa que baixa a conta corrente ao ser recebido; busca na tela Cartões;
  no cartão, mudar o valor de uma parcela ou assinatura "só esta" ou "esta e as próximas"). Roda igual ao conta_corrente.py.
soma_cartao.py (17 checagens: selecionar compras na tela Cartões e ver a soma, reembolso descontado, caixinha do cartão inteiro, com busca, manter ao voltar, celular). Roda igual ao conta_corrente.py.
