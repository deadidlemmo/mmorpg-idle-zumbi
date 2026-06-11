# Relatorios de balanceamento do auto-combate

Gerado em 2026-06-09, sem descanso automatico.

## Arquivo principal

Abra este arquivo primeiro:

```text
balance-v5-2-painel-completo-auto-combate.svg
balance-v5-2-painel-sessoes-auto-combate.svg
balance-v5-2-painel-progressao-personagem-realista.svg
```

O painel completo concentra os graficos principais de XP, tempo, dano e caca.
O painel de sessoes mostra a relacao direta entre combate, caca e pocoes em
sessoes de 6h e 12h.
O painel de progressao de personagem projeta o tempo ate os levels 50 e 100
com niveis de caca realistas por tier.

- XP efetivo por hora.
- XP/h relativo ao melhor do tier.
- Tempo para 1000 mobs.
- Pocoes usadas por 1000 mobs.
- Batalhas suportadas sem pocao.
- Batalhas suportadas com 25 e 100 pocoes.
- Dano medio por batalha.
- Dano por 1000 batalhas.
- Sequencias ruins contra mobs rank 5/6.
- Sequencia contra o mob rank 6.
- Tempo para encontrar mob por nivel de caca.
- Tempo acumulado para subir caca do nivel 1 ao 50.
- XP/h, tempo e pocoes/h no T10 por nivel de caca 1/10/25/50.
- XP por sessao real.
- Percentual de sessao concluida antes da derrota.
- Pocoes necessarias para completar sessoes de 6h e 12h.
- XP por pocao.
- Impacto do nivel de caca e do estoque de pocoes no T10.
- Dias ate level 50 e 100 em cenarios conservador, provavel e otimista.
- Curva acumulada de dias por level-chave usando caca realista por tier.
- Dias por tier, nivel de caca usado por tier e XP/h por tier.

## Cenario atual

- Modelo: Balance V5.2.
- Fonte: mapas reais do seed.
- Mobs ativos por tier: `mob1`, `mob4`, `mob5`, `mob8`, `mob9`, `mob12`.
- Caca principal simulada: nivel 50.
- Matriz de caca simulada: niveis 1, 10, 25 e 50.
- Progressao realista de personagem: caca por tier em tres cenarios:
  - conservador: T1 1, T2 10, T3 15, T4 20, T5 25, T6 30, T7 35, T8 40, T9 45, T10 45.
  - provavel: T1 5, T2 12, T3 18, T4 25, T5 30, T6 35, T7 40, T8 45, T9 48, T10 50.
  - otimista: T1 10, T2 15, T3 20, T4 25, T5 35, T6 35, T7 45, T8 45, T9 50, T10 50.
- Tempo para encontrar mob: usa a formula real de Hunting.
- Progressao de caca: usa XP real por ameaca encontrada e curva real de XP para o proximo nivel.
- Progressao de personagem: usa a curva real de XP ate `FUTURE_LEVEL_CAP = 100`, mas o fluxo jogavel atual ainda usa `LAUNCH_LEVEL_CAP = 50` por padrao em `calculateLevelProgress`.
- Resultado atual da progressao de personagem no cenario provavel:
  - 1-50: media de 75,24 dias continuos.
  - 50-100: media de 295,58 dias continuos.
  - 1-100: media de 370,82 dias continuos.
- Cura: somente por pocoes reais do tier.
- Pocoes: 5 faixas para 10 tiers. T1 cura valor fixo baixo; T9-T10 usa 200 + 25% do HP maximo para evitar que classes de HP baixo fiquem punidas demais por estoque igual.
- Descanso automatico: removido.
- Equipamentos: itens reais do seed.
- Gathering: origem recomendada por classe.
- Loot, gold e drops: nao entram nas analises de dano/sobrevivencia.

## Mudancas do modelo

- V4.5 ajustou os 6 mobs ativos por tier em curva crescente por rank: chance de encontro, vida, ataque, defesa, velocidade e XP.
- V4.6 ajustou sobrevivencia sem descanso automatico: Assassino/Atirador recebem menos dano no auto-combate e Medico teve a cura passiva por pocao reduzida.
- V4.7 adicionou reforco defensivo progressivo nos equipamentos T6-T10 de Assassino e Atirador, aumentando Vitalidade/Vontade sem remover a identidade ofensiva.
- V4.8 trocou a cura fixa das pocoes por cura percentual progressiva por faixa de tier e alinhou relatorios/fixture/API com a pocao real do tier.
- V4.9 removeu a configuracao visual de percentual de HP da tela de auto-combate e ajustou as pocoes para permitir uso livre sem trava por tier.
- V5.0 ajustou a progressao de caca: nivel 50 chega ao piso de 6s por mob e a subida 1-50 ficou em aproximadamente 187,6h continuas.
- V5.1 manteve o mesmo ganho de velocidade por nivel, mas aumentou a XP necessaria da skill de caca para que o nivel 50 fique em aproximadamente 1.439,8h continuas, perto de 60 dias sem limite diario.
- V5.2 adicionou o painel de sessoes e ajustou a Pocao de Vida Suprema de 30% para 200 + 25%, reduzindo a discrepancia de XP por sessao em T9/T10 com estoque igual de pocoes.
- V5.2 tambem recebeu o painel de progressao realista de personagem, sem assumir caca 50 nos tiers iniciais, e a curva de XP de personagem foi recalibrada para lancamento 1-50 em 2-3 meses e 1-100 perto de 1 ano.

## Organizacao da pasta

```text
_reports/auto-combat-balance/
|-- balance-v5-2-painel-completo-auto-combate.svg
|-- balance-v5-2-painel-sessoes-auto-combate.svg
|-- balance-v5-2-painel-progressao-personagem-realista.svg
|-- README.md
|-- dados-v5-2/
|   |-- *.csv
|   `-- *.json
|-- graficos-separados-v5-2/
|   `-- *.svg
|-- dados-v5-1/
|-- graficos-separados-v5-1/
|-- dados-v5-0/
|-- graficos-separados-v5-0/
|-- dados-v4-8/
|-- dados-v4-9/
|-- graficos-separados-v4-8/
|-- graficos-separados-v4-9/
`-- historico/
    |-- v5-1/
    |-- v5-0/
    |-- v4-8/
    `-- v4-9/
```

## Dados auxiliares

`dados-v5-2/` guarda os dados usados pelos paineis:

- `balance-v5-2-sem-descanso-mapas-reais-seed-caca-nivel-50-1000-mobs.json`
- `balance-v5-2-sem-descanso-mapas-reais-seed-caca-nivel-50-1000-mobs.csv`
- `balance-v5-2-sobrevivencia-dano-mapas-reais-seed-caca-nivel-50.json`
- `balance-v5-2-sobrevivencia-dano-mapas-reais-seed-caca-nivel-50-resumo.csv`
- `balance-v5-2-sobrevivencia-dano-mapas-reais-seed-caca-nivel-50-dano-por-rank.csv`
- `balance-v5-2-sobrevivencia-dano-mapas-reais-seed-caca-nivel-50-pocoes-iguais.csv`
- `balance-v5-2-caca-matriz-niveis-1-10-25-50-1000-mobs.json`
- `balance-v5-2-caca-matriz-niveis-1-10-25-50-1000-mobs.csv`
- `balance-v5-2-progressao-caca-nivel-1-50.json`
- `balance-v5-2-progressao-caca-nivel-1-50.csv`
- `balance-v5-2-sessoes-auto-combate.json`
- `balance-v5-2-sessoes-auto-combate.csv`
- `balance-v5-2-sessoes-auto-combate-auditoria.csv`
- `balance-v5-2-progressao-personagem-realista.json`
- `balance-v5-2-progressao-personagem-realista-resumo.csv`
- `balance-v5-2-progressao-personagem-realista-detalhe.csv`
- `balance-v5-2-progressao-personagem-realista-por-tier.csv`

`graficos-separados-v5-2/` guarda os SVGs individuais, caso seja necessario auditar um grafico isolado.

`historico/` guarda versoes antigas para comparacao. Use apenas se precisar comparar regressao.

## Comandos

```bash
cd backend
npm run balance:auto-combat:report -- --source=real-seed-maps --kills=1000 --hunting-level=1
npm run balance:auto-combat:report -- --source=real-seed-maps --kills=1000 --hunting-level=10
npm run balance:auto-combat:report -- --source=real-seed-maps --kills=1000 --hunting-level=25
npm run balance:auto-combat:report -- --source=real-seed-maps --kills=1000 --hunting-level=50
npm run balance:auto-combat:survival -- --kills=1000 --hunting-level=50 --potion-quantities=0,10,25,50,100
npm run balance:auto-combat:complete-report -- --kills=1000 --hunting-level=50 --hunting-levels=1,10,25,50
npm run balance:auto-combat:session-report -- --kills=1000 --hunting-levels=1,10,25,50 --session-hours=6,12 --potion-quantities=0,5,10,20,50,100,150,200,300
npm run balance:character-progression:report -- --kills=1000
```

Depois de gerar os arquivos individuais, mantenha os SVGs principais na raiz e mova CSV/JSON para `dados-v5-2/` se quiser preservar a organizacao atual.
