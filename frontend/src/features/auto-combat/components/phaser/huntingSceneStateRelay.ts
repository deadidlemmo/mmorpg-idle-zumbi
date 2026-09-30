export type HuntingSceneStateMessage<State> =
  | { type: "update" | "snapshot"; state: State }
  | { type: "begin" };

export function createHuntingSceneStateRelay<State>(
  initiallySynchronizing: boolean,
  deliver: (message: HuntingSceneStateMessage<State>) => void,
) {
  let ready = false;
  let synchronizing = initiallySynchronizing;
  let pending: HuntingSceneStateMessage<State> | null = null;

  return {
    update(state: State) {
      const message: HuntingSceneStateMessage<State> = {
        type: !ready && (synchronizing || pending?.type === "snapshot")
          ? "snapshot"
          : "update",
        state,
      };
      if (ready) deliver(message);
      else pending = message;
    },
    begin() {
      synchronizing = true;
      const message = { type: "begin" } as const;
      if (ready) deliver(message);
      else pending = message;
    },
    apply(state: State) {
      synchronizing = false;
      const message = { type: "snapshot", state } as const;
      if (ready) deliver(message);
      else pending = message;
    },
    markReady() {
      ready = true;
      if (pending) deliver(pending);
      pending = null;
    },
  };
}
