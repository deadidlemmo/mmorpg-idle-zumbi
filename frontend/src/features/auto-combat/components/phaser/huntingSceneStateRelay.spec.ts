import assert from "node:assert/strict";
import test from "node:test";

import {
  createHuntingSceneStateRelay,
  type HuntingSceneStateMessage,
} from "./huntingSceneStateRelay";

test("aplica o snapshot de inicio depois que os listeners da cena estiverem prontos", () => {
  const messages: HuntingSceneStateMessage<string>[] = [];
  const relay = createHuntingSceneStateRelay<string>(true, (message) => {
    messages.push(message);
  });

  relay.begin();
  relay.apply("cacando");
  assert.deepEqual(messages, []);

  relay.markReady();
  assert.deepEqual(messages, [{ type: "snapshot", state: "cacando" }]);

  relay.update("proximo-encontro");
  assert.deepEqual(messages.at(-1), {
    type: "update",
    state: "proximo-encontro",
  });
});

test("reconcilia o estado mais recente mesmo sem apply explicito antes do create", () => {
  const messages: HuntingSceneStateMessage<string>[] = [];
  const relay = createHuntingSceneStateRelay<string>(true, (message) => {
    messages.push(message);
  });

  relay.update("cacando");
  relay.markReady();

  assert.deepEqual(messages, [{ type: "snapshot", state: "cacando" }]);
});

test("mantem apenas o estado mais recente antes da cena iniciar", () => {
  const messages: HuntingSceneStateMessage<number>[] = [];
  const relay = createHuntingSceneStateRelay<number>(false, (message) => {
    messages.push(message);
  });

  relay.update(1);
  relay.update(2);
  relay.markReady();

  assert.deepEqual(messages, [{ type: "update", state: 2 }]);
});
