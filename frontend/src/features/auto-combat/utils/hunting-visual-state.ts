export type HuntingVisualPhase =
  | "walking"
  | "approaching"
  | "investigating"
  | "alert"
  | "found"
  | "continuing";

export type HuntingVisualMachineState = Readonly<{
  phase: HuntingVisualPhase;
  enteredAtMs: number;
  lastProgressPercent: number;
}>;

type HuntingVisualMachineInput = Readonly<{
  isThreatReady: boolean;
  nowMs: number;
  progressPercent: number;
}>;

const APPROACHING_PROGRESS = 62;
const INVESTIGATING_PROGRESS = 82;
const ALERT_PROGRESS = 97;
const RESET_PROGRESS = 30;
const MIN_ALERT_DURATION_MS = 500;
const CONTINUING_DURATION_MS = 700;

const clampProgress = (value: number) =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

export function getHuntingCycleProgressPercent(params: {
  cycleStartedAtMs: number | null;
  cycleEndsAtMs: number | null;
  nowMs: number;
}) {
  const { cycleStartedAtMs, cycleEndsAtMs, nowMs } = params;
  if (
    cycleStartedAtMs === null ||
    cycleEndsAtMs === null ||
    !Number.isFinite(cycleStartedAtMs) ||
    !Number.isFinite(cycleEndsAtMs) ||
    !Number.isFinite(nowMs) ||
    cycleEndsAtMs <= cycleStartedAtMs
  ) {
    return null;
  }
  if (nowMs <= cycleStartedAtMs) return 0;
  const durationMs = cycleEndsAtMs - cycleStartedAtMs;
  const elapsedInCycleMs = (nowMs - cycleStartedAtMs) % durationMs;
  return (elapsedInCycleMs / durationMs) * 100;
}

function phaseForProgress(progressPercent: number): HuntingVisualPhase {
  if (progressPercent >= ALERT_PROGRESS) return "alert";
  if (progressPercent >= INVESTIGATING_PROGRESS) return "investigating";
  if (progressPercent >= APPROACHING_PROGRESS) return "approaching";
  return "walking";
}

export function createHuntingVisualMachineState(
  input: HuntingVisualMachineInput,
): HuntingVisualMachineState {
  const progressPercent = clampProgress(input.progressPercent);
  return {
    phase: input.isThreatReady ? "found" : phaseForProgress(progressPercent),
    enteredAtMs: input.nowMs,
    lastProgressPercent: progressPercent,
  };
}

export function advanceHuntingVisualMachine(
  current: HuntingVisualMachineState,
  input: HuntingVisualMachineInput,
): HuntingVisualMachineState {
  const progressPercent = clampProgress(input.progressPercent);
  const elapsedMs = Math.max(0, input.nowMs - current.enteredAtMs);
  const wrappedToNextCycle =
    current.lastProgressPercent >= INVESTIGATING_PROGRESS &&
    progressPercent <= RESET_PROGRESS;
  let phase: HuntingVisualPhase;

  if (input.isThreatReady) {
    phase = "found";
  } else if (current.phase === "found") {
    phase = "continuing";
  } else if (wrappedToNextCycle) {
    phase = "continuing";
  } else if (
    current.phase === "alert" &&
    elapsedMs < MIN_ALERT_DURATION_MS
  ) {
    phase = "alert";
  } else if (
    current.phase === "continuing" &&
    elapsedMs < CONTINUING_DURATION_MS
  ) {
    phase = "continuing";
  } else if (current.phase === "alert" && progressPercent < ALERT_PROGRESS) {
    phase = "continuing";
  } else {
    phase = phaseForProgress(progressPercent);
  }

  if (
    phase === current.phase &&
    progressPercent === current.lastProgressPercent
  ) {
    return current;
  }

  return {
    phase,
    enteredAtMs: phase === current.phase ? current.enteredAtMs : input.nowMs,
    lastProgressPercent: progressPercent,
  };
}

export function getHuntingVisualPhaseLabel(phase: HuntingVisualPhase) {
  const labels: Readonly<Record<HuntingVisualPhase, string>> = {
    walking: "Percorrendo o bairro",
    approaching: "Aproximando-se de sinais",
    investigating: "Investigando pistas",
    alert: "Algo chamou atenção",
    found: "Ameaça localizada",
    continuing: "Retomando o rastreio",
  };
  return labels[phase];
}
