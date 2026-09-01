import { useEffect, useLayoutEffect, useRef, useState } from "react";

type MobVisual = {
  alt: string;
  imageUrl: string;
  instanceKey: string;
};

type AutoCombatMobTransitionProps = MobVisual & {
  bodyClassName: string;
  impactKey: string;
  isTtkEngaged?: boolean;
};

const MOB_HANDOFF_DURATION_MS = 420;

export function AutoCombatMobTransition({
  alt,
  bodyClassName,
  imageUrl,
  impactKey,
  isTtkEngaged = false,
  instanceKey,
}: AutoCombatMobTransitionProps) {
  const previousVisualRef = useRef<MobVisual | null>(null);
  const clearOutgoingTimeoutRef = useRef<number | null>(null);
  const [outgoingVisual, setOutgoingVisual] = useState<MobVisual | null>(null);

  useLayoutEffect(() => {
    const nextVisual = { alt, imageUrl, instanceKey };
    const previousVisual = previousVisualRef.current;

    previousVisualRef.current = nextVisual;

    if (!previousVisual || previousVisual.instanceKey === instanceKey) {
      return;
    }

    if (clearOutgoingTimeoutRef.current !== null) {
      window.clearTimeout(clearOutgoingTimeoutRef.current);
    }

    setOutgoingVisual(previousVisual);
    clearOutgoingTimeoutRef.current = window.setTimeout(() => {
      setOutgoingVisual(null);
      clearOutgoingTimeoutRef.current = null;
    }, MOB_HANDOFF_DURATION_MS);
  }, [alt, imageUrl, instanceKey]);

  useEffect(
    () => () => {
      if (clearOutgoingTimeoutRef.current !== null) {
        window.clearTimeout(clearOutgoingTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <span className="auto-combat-mob-transition">
      {outgoingVisual ? (
        <span
          key={`outgoing-${outgoingVisual.instanceKey}`}
          className="auto-combat-mob-transition__layer auto-combat-mob-transition__layer--outgoing"
          data-mob-instance-key={outgoingVisual.instanceKey}
          aria-hidden="true"
        >
          <span className="auto-combat-mob-damage-shake">
            <img src={outgoingVisual.imageUrl} alt="" decoding="async" />
          </span>
        </span>
      ) : null}

      <span
        key={`current-${instanceKey}`}
        className="auto-combat-mob-transition__layer auto-combat-mob-transition__layer--current"
        data-mob-instance-key={instanceKey}
      >
        <span
          key={impactKey}
          className={[
            bodyClassName,
            isTtkEngaged ? "is-ttk-engaged" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <img
            src={imageUrl}
            alt={alt}
            loading="eager"
            decoding="async"
          />
        </span>

        {isTtkEngaged ? (
          <span className="auto-combat-ttk-impact" aria-hidden="true">
            <span className="auto-combat-ttk-impact__burst" />
            <span className="auto-combat-ttk-impact__slash auto-combat-ttk-impact__slash--primary" />
            <span className="auto-combat-ttk-impact__slash auto-combat-ttk-impact__slash--secondary" />
            <span className="auto-combat-ttk-impact__spark auto-combat-ttk-impact__spark--one" />
            <span className="auto-combat-ttk-impact__spark auto-combat-ttk-impact__spark--two" />
            <span className="auto-combat-ttk-impact__spark auto-combat-ttk-impact__spark--three" />
          </span>
        ) : null}
      </span>
    </span>
  );
}
