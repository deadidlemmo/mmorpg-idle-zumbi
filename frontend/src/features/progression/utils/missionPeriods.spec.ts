import assert from "node:assert/strict";
import test from "node:test";
import type { CharacterMission } from "../types/progression.types.ts";
import {
  filterRecurringMissions,
  formatMissionRemaining,
} from "./missionPeriods.ts";

function mission(type: CharacterMission["mission"]["type"], id: string) {
  return {
    id,
    mission: { type },
  } as CharacterMission;
}

test("separa missões diárias, semanais e mensais", () => {
  const missions = [
    mission("DAILY", "daily"),
    mission("WEEKLY", "weekly"),
    mission("MONTHLY", "monthly"),
    mission("STORY", "story"),
  ];

  assert.deepEqual(
    filterRecurringMissions(missions, "MONTHLY").map((entry) => entry.id),
    ["monthly"],
  );
});

test("formata o prazo usando o relógio canônico do servidor", () => {
  assert.equal(
    formatMissionRemaining(
      "2026-09-03T02:30:00.000Z",
      "2026-09-01T00:00:00.000Z",
    ),
    "Renova em 2d 2h",
  );
  assert.equal(
    formatMissionRemaining(
      "2026-09-01T01:25:00.000Z",
      "2026-09-01T00:00:00.000Z",
    ),
    "Renova em 1h 25min",
  );
});
