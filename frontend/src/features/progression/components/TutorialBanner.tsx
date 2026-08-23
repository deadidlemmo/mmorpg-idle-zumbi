import { ArrowRight, Check, RefreshCw, Target, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { canRunNetworkRefresh } from "../../../utils/networkRefresh";
import {
  getTutorialProgress,
  updateTutorial,
} from "../api/progression.api";
import type { TutorialProgress, TutorialStep } from "../types/progression.types";
import { mergeTutorialUpdate } from "../utils/tutorialProgress";
import "../styles/progression.css";

const TUTORIAL_REFRESH_MS = 4_000;

function getTutorialTargetPath(characterId: string, step: TutorialStep) {
  const basePath = `/dashboard/${characterId}`;
  return step.href ? `${basePath}/${step.href}` : basePath;
}

function isOnTutorialTarget(
  pathname: string,
  characterId: string,
  step: TutorialStep,
) {
  const targetPath = getTutorialTargetPath(characterId, step);

  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

export function TutorialBanner({ characterId }: { characterId: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tutorial, setTutorial] = useState<TutorialProgress | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);
  const autoAdvanceKeyRef = useRef<string | null>(null);

  const refreshTutorial = useCallback(
    async (showBusy = false) => {
      if (requestInFlightRef.current) return null;

      requestInFlightRef.current = true;
      if (showBusy) setIsBusy(true);

      try {
        const response = await getTutorialProgress(characterId);
        setTutorial(response);
        setErrorMessage(null);
        return response;
      } catch {
        if (showBusy) {
          setErrorMessage(
            "Não foi possível verificar o tutorial. Tente novamente.",
          );
        }
        return null;
      } finally {
        requestInFlightRef.current = false;
        if (showBusy) setIsBusy(false);
      }
    },
    [characterId],
  );

  useEffect(() => {
    let isCancelled = false;

    queueMicrotask(() => {
      if (!isCancelled) void refreshTutorial();
    });

    return () => {
      isCancelled = true;
    };
  }, [location.pathname, refreshTutorial]);

  useEffect(() => {
    if (!tutorial) return;

    const tutorialNeedsRefresh =
      !tutorial.completed && !tutorial.dismissedAt && tutorial.step >= 2;
    const objectiveNeedsRefresh = !tutorial.objective.completed;
    if (!tutorialNeedsRefresh && !objectiveNeedsRefresh) return;

    const refreshId = window.setInterval(() => {
      if (canRunNetworkRefresh()) void refreshTutorial();
    }, TUTORIAL_REFRESH_MS);

    return () => window.clearInterval(refreshId);
  }, [refreshTutorial, tutorial]);

  useEffect(() => {
    if (!tutorial || tutorial.completed || tutorial.dismissedAt) return;
    if (tutorial.step !== 1) return;

    const currentStep = tutorial.steps[tutorial.step];
    if (
      !currentStep ||
      !isOnTutorialTarget(location.pathname, characterId, currentStep)
    ) {
      return;
    }

    const autoAdvanceKey = `${characterId}:${tutorial.step}:${location.pathname}`;
    if (autoAdvanceKeyRef.current === autoAdvanceKey) return;
    autoAdvanceKeyRef.current = autoAdvanceKey;
    setIsBusy(true);
    setErrorMessage(null);

    void updateTutorial(characterId, { step: 2 })
      .then((updatedTutorial) => {
        setTutorial((current) =>
          current ? mergeTutorialUpdate(current, updatedTutorial) : null,
        );
      })
      .catch(() => {
        autoAdvanceKeyRef.current = null;
        setErrorMessage(
          "Não foi possível registrar a visita a Mapas. Tente novamente.",
        );
      })
      .finally(() => setIsBusy(false));
  }, [characterId, location.pathname, tutorial]);

  if (!tutorial) return null;

  const stepIndex = Math.min(tutorial.step, tutorial.steps.length - 1);
  const currentStep = tutorial.steps[stepIndex];
  const tutorialStep = tutorial.step;
  const stepsLength = tutorial.steps.length;
  const progress = Math.round((stepIndex / stepsLength) * 100);
  const isOnTarget = isOnTutorialTarget(
    location.pathname,
    characterId,
    currentStep,
  );
  const showTutorial = !tutorial.completed && !tutorial.dismissedAt;
  const showObjective = !tutorial.objective.completed;

  if (!showTutorial && !showObjective) return null;

  async function handlePrimaryAction() {
    setErrorMessage(null);

    if (stepIndex === 0) {
      setIsBusy(true);
      try {
        const updatedTutorial = await updateTutorial(characterId, { step: 1 });
        setTutorial((current) =>
          current ? mergeTutorialUpdate(current, updatedTutorial) : null,
        );
      } catch {
        setErrorMessage("Não foi possível avançar o tutorial. Tente novamente.");
      } finally {
        setIsBusy(false);
      }
      return;
    }

    if (isOnTarget) {
      await refreshTutorial(true);
      return;
    }

    navigate(getTutorialTargetPath(characterId, currentStep));
  }

  async function dismiss() {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const updatedTutorial = await updateTutorial(characterId, {
        step: tutorialStep,
        dismissed: true,
      });
      setTutorial((current) =>
        current ? mergeTutorialUpdate(current, updatedTutorial) : null,
      );
    } catch {
      setErrorMessage("Não foi possível dispensar o tutorial. Tente novamente.");
    } finally {
      setIsBusy(false);
    }
  }

  const primaryLabel =
    stepIndex === 0
      ? currentStep.actionLabel
      : isOnTarget
        ? isBusy
          ? "Verificando"
          : "Verificar"
        : currentStep.actionLabel;

  return (
    <div className="new-player-guidance">
      {showTutorial ? (
        <aside
          className="tutorial-banner"
          aria-label="Tutorial do sobrevivente"
        >
          <div className="tutorial-banner__mark">
            <Check size={18} />
          </div>
          <div className="tutorial-banner__content">
            <span>
              Passo {stepIndex + 1} de {stepsLength}
            </span>
            <strong>{currentStep.title}</strong>
            <p>{currentStep.description}</p>
            <i aria-hidden="true">
              <em style={{ width: `${progress}%` }} />
            </i>
            {errorMessage ? (
              <small className="tutorial-banner__error" role="alert">
                {errorMessage}
              </small>
            ) : null}
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handlePrimaryAction()}
          >
            {primaryLabel}
            {stepIndex > 0 && isOnTarget ? (
              <RefreshCw size={15} />
            ) : (
              <ArrowRight size={15} />
            )}
          </button>
          <button
            className="tutorial-banner__dismiss"
            type="button"
            title="Ocultar tutorial"
            aria-label="Ocultar tutorial"
            disabled={isBusy}
            onClick={() => void dismiss()}
          >
            <X size={16} />
          </button>
        </aside>
      ) : null}

      {showObjective ? (
        <aside
          className="onboarding-objective"
          aria-label="Objetivo inicial permanente"
        >
          <div className="onboarding-objective__mark">
            <Target size={18} />
          </div>
          <div className="onboarding-objective__content">
            <span>Meta inicial · Conjunto T1</span>
            <strong>{tutorial.objective.title}</strong>
            <p>{tutorial.objective.description}</p>
            <i aria-hidden="true">
              <em
                style={{ width: `${tutorial.objective.progressPercent}%` }}
              />
            </i>
          </div>
          <ul aria-label="Progresso da meta inicial">
            {tutorial.objective.checklist.map((item) => (
              <li className={item.completed ? "is-complete" : ""} key={item.key}>
                <Check size={13} />
                <span>{item.label}</span>
                <strong>
                  {item.current}/{item.target}
                </strong>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              navigate(
                `/dashboard/${characterId}/${tutorial.objective.href}`,
              )
            }
          >
            {tutorial.objective.actionLabel}
            <ArrowRight size={15} />
          </button>
        </aside>
      ) : null}
    </div>
  );
}
