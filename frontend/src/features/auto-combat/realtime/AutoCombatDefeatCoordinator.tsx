import { Navigate, useLocation } from "react-router-dom";
import { useAutoCombatRealtimeState } from "./useAutoCombatRealtime";

type AutoCombatDefeatCoordinatorProps = {
  characterId: string;
};

export function AutoCombatDefeatCoordinator({
  characterId,
}: AutoCombatDefeatCoordinatorProps) {
  const { pathname } = useLocation();
  const { terminalDefeat } = useAutoCombatRealtimeState();
  const infirmaryPath = `/dashboard/${characterId}/infirmary`;
  const normalizedPathname = pathname.replace(/\/+$/, "");

  if (
    !terminalDefeat?.shouldRedirectToInfirmary ||
    normalizedPathname === infirmaryPath
  ) {
    return null;
  }

  return (
    <Navigate
      to={infirmaryPath}
      replace
      state={{ reason: "auto-combat-player-defeated" }}
    />
  );
}
