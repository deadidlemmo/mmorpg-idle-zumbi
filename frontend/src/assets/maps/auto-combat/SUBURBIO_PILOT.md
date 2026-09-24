# Suburbio Silencioso - piloto

Primeira area visual montada em grade ortogonal de 32 x 32 pixels. O mapa nao
substitui a cena ativa enquanto a direcao de arte estiver em aprovacao.

## Reconstrucao

```bash
npm run maps:build:suburbio-pilot
```

O gerador le as imagens em
`src/assets/images/auto-combat/pilot/source/`, normaliza os modulos, escreve os
PNG/TSX/TMJ e valida 3.000 rotas cardinais aleatorias contra a camada
`collision`.

## Atlas

- `suburbio-pilot-terrain.png`: 16 x 13 tiles; quatro metatiles continuos de
  4 x 4 para cada material (grama, asfalto e calcada), mais detalhes de borda.
- `suburbio-pilot-environment.png`: arvore frondosa, cercas coerentes com os
  lotes, lixo, vegetacao, pedras, bueiro, folhas e trilha de sangue. Objetos
  verticais usam raizes, solo, grama frontal e sombras de contato nas bases.
- `suburbio-pilot-props.png`: carro, postes, placa, caixa de correio, cercas,
  arvore, caixas, arbustos e os marcadores consecutivos de porta fechada/aberta.
- `suburbio-pilot-house-one.png`: casa terrea nas primeiras 12 colunas, telhado
  destacavel nas 12 seguintes e sombra nas 12 finais.
- `suburbio-pilot-house-two.png`: casa de dois pisos nas primeiras 14 colunas,
  telhado destacavel nas 14 seguintes e sombra nas 14 finais.

`suburbio-pilot-preview.png` mostra a composicao limpa. O arquivo
`suburbio-pilot-collision-debug.png` sobrepoe colisao em vermelho, spawn em verde
e destinos em azul.

## Camadas

O TMJ mantem `ground`, `ground-details`, `objects-below`, `collision`,
`walls-fences`, `doors`, `objects-above`, `roofs-occlusion`, `entrances-exits`
e `navigation-points`, seguindo o contrato do carregador Phaser atual.
