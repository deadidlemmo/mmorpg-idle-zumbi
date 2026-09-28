# Contrato de sprites dos monstros

Cada monstro animado no mapa possui uma pasta versionada e um manifesto
`*.animations.json`. O `mobKey` usa o nome normalizado já adotado por
`mobAssets.ts`.

Conjuntos implementados no mapa piloto T1:

- `errante-suburbio-v1`;
- `gato-telhado-v1`;
- `rastejante-garagem-v1`;
- `morcego-caixa-dagua-v1`;
- `porteiro-infectado-v1`;
- `sindico-devorado-v1`.

Todos preservam o mesmo contrato:

- quadro de `112x96` pixels;
- linhas em ordem sul, oeste, leste e norte;
- origem no centro inferior (`0.5`, `1`);
- folhas separadas para caminhada, ataque, dano e morte;
- fundo com alpha real e sem sombra incorporada.

Os conjuntos `v2` sao derivados deterministicamente dos respectivos `v1` por
`npm run sprites:build:mobs-v2`. Eles preservam a silhueta, o enquadramento e a
sequencia de cada animacao, acrescentando microcontraste, nitidez, saturacao
controlada, contorno externo e uma luz de recorte discreta. A sombra de contato
continua sendo renderizada pelo Phaser para permanecer alinhada ao piso durante
movimento, ataque e morte.

Novos monstros devem preservar o mesmo enquadramento para que a cena Phaser
possa trocar os assets sem alterar posição, profundidade ou hitbox visual.

Os conjuntos usam uma base direcional criada a partir da arte canonica de cada
mob. A caminhada parte dessa base; ataque, dano e morte usam poses
proprias geradas para cada direcao e normalizadas por
`scripts/prepare-generated-combat-sprite.mjs`. A morte possui seis quadros ate
o corpo no chao, sem rotacionar a imagem estatica como substituto de animacao.
