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

Para regenerar:

```bash
cd backend
npm run prisma:export:economy-csv
```
