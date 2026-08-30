# Auditoria de drops vendidos ao mercador

O auditor mede a geracao bruta de Gold quando todos os drops de mobs do
autocombate sao vendidos ao Mercado Negro. Ele nao altera banco, chances,
quantidades ou precos.

## Execucao

Dentro de `backend/`:

```bash
npm run economy:audit:vendor-drops
npm run economy:audit:vendor-drops:report
```

O segundo comando tambem compara os seeds com o banco local em modo somente
leitura e grava os artefatos em `_reports/economy/vendor-drops/`:

- `01_resumo_por_tier.csv`
- `02_gold_por_monstro.csv`
- `03_valor_e_frequencia_por_item.csv`
- `04_achados.csv`
- `vendor-drop-audit.json`
- `README.md`

## Fontes da verdade

- Mobs, ranks e pesos: `prisma/seed-data/mobs.seed-data.ts`.
- Chances e quantidades: `prisma/seed-data/mob-drops.seed-data.ts`.
- Preco de venda: `calculateBlackMarketSellValue`.
- Abates por hora: TTK real das quatro classes, com o personagem no nivel do
  mob, set atual, reforco zero, gathering recomendado e sem pet.

O calculo cobre os seis mobs ativos por tier. O tempo medio do mix usa os pesos
`42/24/15/9/6/4`; portanto, mobs lentos e frequentes reduzem corretamente o
total de abates por hora.

## Metricas

Para cada entrada de drop:

```text
unidades esperadas/abate = chance * media(minimo, maximo)
Gold esperado/abate = unidades esperadas * valor unitario no NPC
```

Para cada monstro:

- `Gold/h exclusivo`: rendimento caso todos os encontros fossem daquele mob.
- `Gold/h ponderado`: contribuicao no mix real de encontros do tier.
- `Gold do tier %`: concentracao economica causada pelo mob.

Para cada item:

- valor unitario de venda;
- quantidade, valor medio e valor maximo quando o drop acontece;
- frequencia ponderada no tier;
- unidades e Gold esperados por hora;
- participacao no Gold total do tier.

## Limites de atencao

- Item frequente: aparece em pelo menos `30%` dos abates e concentra pelo menos
  `35%` do Gold do tier.
- Mob frequente: ocupa pelo menos `30%` dos encontros e concentra pelo menos
  `35%` do Gold do tier.
- Mob de rendimento alto: Gold por abate igual ou superior a `1,75x` a media
  ponderada do tier.
- Regressao: um tier gera menos Gold/h bruto que o tier anterior.

Esses limites identificam pontos para revisao; nao modificam automaticamente a
economia.

## Linha de base atual

| Tier | Gold/abate | Abates/h | Gold bruto/h | Maior valor por drop |
|---|---:|---:|---:|---:|
| T1 | 4,0155 | 195,47 | 784,91 | 4 |
| T2 | 9,8859 | 91,89 | 908,44 | 16 |
| T3 | 18,4990 | 62,02 | 1.147,27 | 18 |
| T4 | 42,4941 | 42,44 | 1.803,57 | 54 |
| T5 | 91,3438 | 38,78 | 3.542,12 | 64 |

Principais achados atuais:

- O T2 gera `15,74%` mais Gold/h bruto que o T1 no modelo dos seis mobs.
- Residuos respondem por `31%–34,05%` do Gold de drops nos tiers de lancamento.
- `Capataz Ferrugento` gera `1,91x` o Gold por abate ponderado do T2, mas possui
  apenas `4%` dos encontros.
- `Regente da Cabine Lacrada` gera `2,15x` a media ponderada do T4 e tambem
  possui apenas `4%` dos encontros.
- Nao ha regressao de Gold/h entre tiers nem item frequente acima de `35%`.
- O banco local conferido possui 30 mobs e 95 drops iguais aos seeds.
