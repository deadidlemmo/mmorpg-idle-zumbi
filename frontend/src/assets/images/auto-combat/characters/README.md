# Contrato de sprites dos personagens

Cada avatar jogavel que aparecer no mapa deve possuir uma pasta propria e um
manifesto `*.animations.json`. O `actorKey` liga essa pasta ao `avatarKey` ou ao
asset cosmético canônico do personagem.

## Grade obrigatoria

- quadro: `112x96` pixels;
- origem: centro inferior (`0.5`, `1`);
- hitbox: apenas os pes, `18x12` pixels;
- linhas: sul, oeste, leste e norte, nessa ordem;
- fundo: alpha real, sem matte, sombra ou cenario incorporado;
- escala e linha dos pes iguais em todas as folhas.

## Folhas obrigatorias

| Folha | Quadros por direcao | Uso |
| --- | ---: | --- |
| `walk` | 4 | caminhada e retomada do rastreio |
| `investigate` | 4 | notar, abaixar, inspecionar e entrar em alerta |
| `attack` | 4 | ataque e quadro de impacto |
| `hurt` | 2 | reacao ao dano |
| `death` | 6 | queda e quadro final persistente |

O retrato continua sendo a fonte de identidade visual: cabelo, rosto, roupa,
apresentacao e representacao. Armas e equipamentos nao fazem parte dessas
folhas por enquanto.

Execute `npm run sprites:audit:characters` depois de adicionar ou alterar uma
folha. Saidas geradas com personagens isolados em uma grade 4x4 podem ser
normalizadas com `scripts/prepare-generated-character-sprite.mjs`.
