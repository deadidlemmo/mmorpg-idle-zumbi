import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  TutorialProgress,
  TutorialUpdateResponse,
} from "../types/progression.types";
import { mergeTutorialUpdate } from "./tutorialProgress";

describe("mergeTutorialUpdate", () => {
  it("updates the persisted state and preserves the tutorial steps", () => {
    const current: TutorialProgress = {
      id: "tutorial-1",
      characterId: "character-1",
      step: 0,
      completed: false,
      completedAt: null,
      dismissedAt: null,
      steps: [
        {
          key: "shelter",
          title: "Conheça o abrigo",
          description: "Conheça o centro da sobrevivência.",
          href: "",
          actionLabel: "Entendi",
        },
        {
          key: "map",
          title: "Vá para Mapas",
          description: "Abra a lista de regiões.",
          href: "maps",
          actionLabel: "Abrir mapas",
        },
      ],
      objective: {
        key: "gather-first-resource",
        title: "Colete materiais para seu primeiro T1",
        description: "Inicie uma expedição T1.",
        href: "gathering",
        actionLabel: "Abrir expedições",
        completed: false,
        equippedT1Slots: 0,
        targetT1Slots: 6,
        progressPercent: 0,
        checklist: [],
      },
    };
    const update: TutorialUpdateResponse = {
      id: "tutorial-1",
      characterId: "character-1",
      step: 1,
      completed: false,
      completedAt: null,
      dismissedAt: null,
      steps: current.steps,
      objective: current.objective,
    };

    const merged = mergeTutorialUpdate(current, update);

    assert.equal(merged.step, 1);
    assert.equal(merged.completed, false);
    assert.deepEqual(merged.steps, current.steps);
  });
});
