# Contrato de sprites dos personagens

O combate no mapa usa uma pasta e um manifesto `*.animations.json` por classe:
`lutador`, `atirador`, `medico` e `assassino`. O `actorKey` identifica a classe;
os retratos continuam representando a identidade de cada personagem. Nao ha
folhas diferentes por tier ou por item equipado.

## Grade obrigatoria

- quadro: `112x96` pixels;
- origem: centro inferior (`0.5`, `1`);
- hitbox: apenas os pes, `18x12` pixels;
- linhas: sul, oeste, leste e norte, nessa ordem;
- fundo: alpha real, sem matte, sombra ou cenario incorporado;
- escala e linha dos pes iguais em todas as folhas.

A caminhada das classes usa 12 quadros por segundo. O Phaser combina uma sombra
de contato nos pes com a silhueta achatada do quadro atual, projetada no chao.
As sombras acompanham a escala do personagem e nao devem ser incorporadas aos
quadros da folha.

## Folhas obrigatorias

| Folha | Quadros por direcao | Uso |
| --- | ---: | --- |
| `walk` | 8 nas classes, 4 no fallback Leon | caminhada e retomada do rastreio |
| `investigate` | 4 | notar, abaixar, inspecionar e entrar em alerta |
| `attack` | 8 nas classes, 4 no fallback Leon | ataque e quadro de impacto |
| `hurt` | 2 | reacao ao dano |
| `death` | 6 | queda e quadro final persistente |

As folhas de caminhada, ataque, dano e morte mantem os equipamentos visuais
da classe. Lutador usa maca e escudo; Atirador, rifle; Medico, desfibrilador e
injetores; Assassino, adagas e bombas. `investigate` permanece no manifesto
como fallback compartilhado; no mapa a busca usa a pose da propria classe e
um indicador visual. Classes desconhecidas usam as folhas legadas de Leon.

Execute `npm run sprites:audit:characters` depois de adicionar ou alterar uma
folha. Saidas geradas com personagens isolados em uma grade 4x4 podem ser
normalizadas com `scripts/prepare-generated-character-sprite.mjs`. Para as
folhas 8x4 de caminhada e ataque, use
`scripts/prepare-generated-character-sprite-8.mjs`.
