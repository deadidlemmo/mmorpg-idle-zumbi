# Diagnostico de performance no mapa

Adicione `?perf=1` a URL da tela de rastreio (ou de outra tela do dashboard para comparar). O painel aparece dentro do mapa, ou no canto inferior esquerdo fora dele. Sem esse parametro, nao ha painel, amostragem de frames nem observadores de diagnostico ativos.

As medicoes de FPS e duracao de frame usam `requestAnimationFrame` da pagina: quedas podem envolver renderizacao, trabalho na main thread ou limitacao do navegador/dispositivo. A contagem de objetos e de tweens vem da cena Phaser; nao representa draw calls. Animacoes CSS de notificacao exibem duracao prevista e tempo real entre `animationstart` e `animationend`. O tempo total do aviso inclui a espera da fila e o timer de exibicao. A aba em segundo plano nao conta a pausa como travamento.

Para medir sem o custo visual do proprio painel, use `?perf=1&perfSilent=1` ou o botao `Coleta limpa de 60s`. Durante um minuto nao existe painel no DOM nem publicacao periodica de metricas em React. Ao fim, aparece um unico snapshot. Repita a coleta por esse botao para obter uma nova sessao limpa.

Para investigar no iPhone, compare a tela de rastreio e outra tela no mesmo aparelho com `?perf=1`. Registre FPS atual/minimo, frames acima de 33,3/50/100 ms, avisos ativos/fila, animacoes lentas, pior atraso e a relacao entre resolucao interna/CSS e DPR durante uma sequencia de notificacoes. O painel e somente visual: nao muda resultados da caca, combate ou notificacoes.

O bloco `Evento visual` correlaciona cada `HUNT_TARGET_FOUND` ou `MOB_DEFEATED` com o pior frame observado no segundo seguinte, tempo ate o toast e tempo ate o commit React. Em `Etapa`, os valores sao `ultima / pior da sessao / pior perto de evento`, cobrindo socket, status, fila do aviso, React, Phaser, carregamento da imagem/textura e audio de XP. Uma etapa curta acompanhada de frame longo indica que o bloqueio ocorreu fora daquele trecho sincrono; uma etapa com tempo alto aponta diretamente para o trabalho concentrado nela.

## Comparacao A/B no iPhone

Com `?perf=1`, o topo do painel oferece quatro modos. Cada troca recarrega a pagina e reinicia as metricas:

- `Completo`: preserva todos os efeitos visuais.
- `Sem avisos`: remove somente as animacoes CSS do aviso de loot e do ganho de XP; os avisos, valores e tempos de exibicao continuam existindo.
- `Sem pulso`: remove somente o pulso grafico de rastreio desenhado pelo Phaser.
- `Sem ambos`: combina as duas desativacoes visuais.

Execute os quatro modos pelo mesmo periodo e, de preferencia, com pelo menos dez rastreios em cada um. Compare FPS medio, `Frames >50 ms apos evento`, pior frame apos evento e as etapas `React pagina`, `React cena`, `React aviso`, `Loop Phaser` e `Render Phaser`. Os modos existem apenas durante o diagnostico e nao alteram o backend, a progressao, a fila de eventos nem o resultado da caca.

A segunda linha do painel isola o custo do mapa:

- `Mapa ativo`: Phaser atualiza e renderiza normalmente.
- `Congelado`: o primeiro frame permanece visivel, mas o loop do Phaser dorme depois de renderiza-lo.
- `Canvas oculto`: tambem pausa o Phaser e remove o canvas da composicao visual; painel, React, eventos e avisos continuam ativos.

Se `Congelado` melhorar, o custo esta no loop ou nas renderizacoes continuas. Se somente `Canvas oculto` melhorar, o principal suspeito passa a ser a composicao da superficie WebGL pelo navegador. Se nenhum dos dois melhorar, o bloqueio esta fora do canvas ou na carga geral da pagina/dispositivo.

O campo `Pre-render. / GPU / CPU` informa quantas camadas densas foram compostas uma vez em uma textura estatica e quantas continuam em cada caminho do Phaser. Portas, colisao e elementos com sobreposicao continuam separados e mutaveis para preservar o mapa.
