# Auditoria visual de receitas de equipamentos

Gerado a partir dos CSVs em `docs/economia-crafting-csv`.

## Resumo

- Equipamentos com receita: 280
- Materiais de gathering ativos: 440
- Receitas atuais com 3 materiais de gathering: 9
- Receitas atuais com menos de 3 materiais de gathering: 271 (96.8%)
- Combinacoes atuais unicas de materiais gathering: 279
- Combinacoes atuais repetidas: 1
- Combinacoes unicas na proposta: 276
- Combinacoes repetidas na proposta: 4

## Arquivos

- `01_auditoria_receitas_atuais.csv`: estado atual por item, caracteristicas, problemas e proposta resumida.
- `02_proposta_3_materiais_gathering.csv`: proposta completa com 3 materiais de gathering por equipamento.
- `03_combos_repetidos_atuais.csv`: combinacoes repetidas atuais.
- `04_combos_repetidos_proposta.csv`: combinacoes repetidas que ainda restariam na proposta.
- `05_materiais_mais_usados_atual.csv`: materiais mais repetidos hoje.
- `06_materiais_mais_usados_proposta.csv`: materiais mais repetidos na proposta.
- `07_resumo_por_classe_tier.csv`: cobertura por classe/tier.

## Regra usada na proposta

- Mantem biomaterial e residuo de cada receita.
- Troca apenas a parte de gathering para 3 materiais fisicos.
- Mantem materiais atuais quando ja existem e sao materiais de gathering.
- Completa receitas com menos de 3 materiais usando afinidade por tier, mapa, slot, familia, classe e nome do item.
- Distribuicao por tier: T1/T2 = 60/30/30; T3/T4 = 68/34/33; T5/T6 = 75/38/37; T7/T8 = 83/41/41; T9/T10 = 90/45/45.
- Penaliza excesso de repeticao para distribuir melhor a demanda.

## Cuidado

Esta e uma proposta de auditoria. Nao foi aplicada automaticamente ao seed porque altera todas as receitas finais e precisa de revisao de direcao de arte/economia antes.
