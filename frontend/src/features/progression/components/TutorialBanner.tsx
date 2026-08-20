import { ArrowRight, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getProgressionDashboard,
  updateTutorial,
} from "../api/progression.api";
import type { TutorialProgress } from "../types/progression.types";
import "../styles/progression.css";

export function TutorialBanner({ characterId }: { characterId: string }) {
  const navigate = useNavigate();
  const [tutorial, setTutorial] = useState<TutorialProgress | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getProgressionDashboard(characterId)
      .then((response) => {
        if (isMounted) setTutorial(response.tutorial);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [characterId]);

  if (!tutorial || tutorial.completed || tutorial.dismissedAt) return null;

  const stepIndex = Math.min(tutorial.step, tutorial.steps.length - 1);
  const currentStep = tutorial.steps[stepIndex];
  const tutorialStep = tutorial.step;
  const stepsLength = tutorial.steps.length;
  const progress = Math.round((stepIndex / stepsLength) * 100);

  async function advance() {
    setIsBusy(true);
    try {
      const nextStep = stepIndex + 1;
      await updateTutorial(characterId, {
        step: nextStep,
        completed: nextStep >= stepsLength,
      });
      navigate(
        currentStep.href
          ? `/dashboard/${characterId}/${currentStep.href}`
          : `/dashboard/${characterId}`,
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function dismiss() {
    setIsBusy(true);
    try {
      await updateTutorial(characterId, {
        step: tutorialStep,
        dismissed: true,
      });
      setTutorial((current) =>
        current ? { ...current, dismissedAt: new Date().toISOString() } : null,
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <aside className="tutorial-banner" aria-label="Tutorial do sobrevivente">
      <div className="tutorial-banner__mark">
        <Check size={18} />
      </div>
      <div className="tutorial-banner__content">
        <span>
          Passo {stepIndex + 1} de {stepsLength}
        </span>
        <strong>{currentStep.title}</strong>
        <i aria-hidden="true">
          <em style={{ width: `${progress}%` }} />
        </i>
      </div>
      <button type="button" disabled={isBusy} onClick={() => void advance()}>
        {stepIndex === 0 ? "Confirmar" : "Abrir"}
        <ArrowRight size={15} />
      </button>
      <button
        className="tutorial-banner__dismiss"
        type="button"
        title="Dispensar tutorial"
        aria-label="Dispensar tutorial"
        disabled={isBusy}
        onClick={() => void dismiss()}
      >
        <X size={16} />
      </button>
    </aside>
  );
}
