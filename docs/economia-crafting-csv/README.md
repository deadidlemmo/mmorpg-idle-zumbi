# Exportação de economia e crafting

Arquivos gerados automaticamente a partir dos seeds do projeto.

## Arquivos

- 00_mapas_submapas.csv: mapas, tiers, níveis e submapas.
- 01_itens_equipamentos.csv: equipamentos craftáveis, classe, slot, stats e mapa.
- 02_materiais_gathering.csv: materiais de gathering, origem, afinidade e uso em receitas.
- 03_itens_drop_mobs.csv: itens obtidos de mobs e demanda em receitas.
- 04_receitas_resumo.csv: uma linha por receita, com quantidades principais.
- 05_receitas_ingredientes.csv: formato longo, uma linha por ingrediente.
- 06_mobs_mapas_stats.csv: mobs, mapa/submapa, tier, level e stats.
- 07_mobs_drops.csv: tabela de drops por mob.
- 08_balanco_demanda_por_origem.csv: demanda total agregada por origem.
- 09_balanco_demanda_por_classe_origem.csv: demanda agregada por classe e origem.
- 10_resumo.csv: contadores gerais da exportação.
- 11_balanceamento_tempo_receitas.csv: tempo esperado por receita, separando gathering, drops de AutoCombat e crafting.
- 12_balanceamento_tempo_por_tier.csv: media por tier com niveis realistas de gathering/caca e sessoes free/premium.
- 13_balanceamento_drops_receitas.csv: auditoria dos drops usados em receitas, com chance ponderada por aparicao dos mobs ativos, kills esperadas e horas esperadas.

Para regenerar:

```bash
cd backend
npm run prisma:export:economy-csv
npm run balance:crafting-economy:report
```
