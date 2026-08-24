# Motor compartilhado de timeline

O backend continua sendo a fonte da verdade. O frontend usa a timeline apenas
para apresentar o intervalo confirmado pelo servidor em um relogio monotono.

## Snapshot canonico

```ts
interface ActivityTimelineSnapshot {
  activityInstanceId: string;
  cycleId: string;
  serverNow: string;
  startedAt: string;
  endsAt: string;
  durationMs: number;
  direction: 'fill' | 'drain';
  version: number;
}
```

Regras do contrato:

- Datas sao ISO 8601 em UTC.
- `durationMs` e um inteiro positivo e deve ser igual a `endsAt - startedAt`.
- `version` e monotona dentro da mesma `activityInstanceId`.
- O backend incrementa `version` sempre que troca o ciclo ou corrige suas
  ancoras.
- Snapshots repetidos ou antigos nao podem reiniciar a animacao.

## Uso no provider de dominio

O provider de gathering, caca, criacao, incursao ou boss deve aplicar cada
snapshot recebido por REST ou WebSocket uma unica vez:

```tsx
const activityTimeline = useActivityTimelineProviderState();

activityTimeline.applySnapshot(snapshot, clockSample);
```

O mesmo objeto `activityTimeline.timeline` deve ser entregue ao card local e ao
`DashboardTopBar`. Nenhum dos dois deve recalcular inicio, fim ou percentual.

## Renderizacao

O motor converte a ancora do servidor para `performance.now()` e
`ActivityTimelineFill` executa uma unica animacao CSS por `cycleId`/`version`.
A largura permanece em 100%; somente `transform: scaleX()` e animado. Ao
remontar apos navegacao, reconexao ou retorno de uma aba oculta, a animacao usa
atraso negativo para entrar na posicao monotona atual.

## Rollout atual

A caca do auto-combate e o primeiro dominio ligado ao motor compartilhado. O
snapshot `hunting.timeline` faz parte do mesmo status retornado pelo REST e
emitido pelo WebSocket. O `AutoCombatRealtimeProvider` e o unico responsavel
por aplica-lo; o card local e a barra global recebem a mesma instancia.

`VITE_AUTO_COMBAT_HUNT_TIMELINE_V1` controla o rollout:

- `admin` (padrao): somente contas `ADMIN` usam a timeline canonica.
- `all`: libera a timeline de caca para todos.
- `off`: restaura a apresentacao legada da caca.

A timeline visual de batalha do auto-combate continua independente deste
rollout e habilitada para todos por padrao. O rollback dela permanece em
`VITE_AUTO_COMBAT_PRESENTATION_TIMELINE_V2=false`.
