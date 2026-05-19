import type { ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import { AuthPage } from "../features/auth/pages/AuthPage";
import { AutoCombatPage } from "../features/auto-combat/pages/AutoCombatPage";
import { AutoCombatRealtimeProvider } from "../features/auto-combat/realtime/AutoCombatRealtimeProvider";
import { CharacterSelectPage } from "../features/characters/pages/CharacterSelectPage";
import { CraftingPage } from "../features/crafting/pages/CraftingPage";
import { DashboardOverviewPage } from "../features/dashboard/pages/DashboardOverviewPage";
import { DashboardPlaceholderPage } from "../features/dashboard/pages/DashboardPlaceholderPage";
import { GatheringHubPage } from "../features/gathering/pages/GatheringHubPage";
import { GatheringOriginPage } from "../features/gathering/pages/GatheringOriginPage";
import { GatheringRealtimeProvider } from "../features/gathering/realtime/GatheringRealtimeProvider";
import { IncursionsPage } from "../features/incursions/pages/IncursionsPage";
import { IncursionsRealtimeProvider } from "../features/incursions/realtime/IncursionsRealtimeProvider";
import { InventoryPage } from "../features/inventory/pages/InventoryPage";
import { MapsSelectionPage } from "../features/maps/pages/MapsSelectionPage";
import { WorldBossesPage } from "../features/world-bosses/pages/WorldBossesPage";
import { LootNotificationProvider } from "../features/loot-notifications/LootNotificationProvider";
import { useAuthStore } from "../store/auth.store";

interface RouteGuardProps {
  children: ReactNode;
}

function ProtectedRoute({ children }: RouteGuardProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function PublicOnlyRoute({ children }: RouteGuardProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/characters" replace />;
  }

  return children;
}

function DashboardRealtimeRoute() {
  const { characterId } = useParams();

  if (!characterId) {
    return <Navigate to="/characters" replace />;
  }

  return (
    <LootNotificationProvider>
      <AutoCombatRealtimeProvider
        key={`auto-combat-${characterId}`}
        characterId={characterId}
        autoLoad
        refreshMs={3000}
      >
        <GatheringRealtimeProvider
          key={`gathering-${characterId}`}
          characterId={characterId}
          autoLoad
          refreshMs={5000}
          tickMs={1000}
        >
          <IncursionsRealtimeProvider
            key={`incursions-${characterId}`}
            characterId={characterId}
            autoLoad
            refreshMs={5000}
            tickMs={1000}
          >
            <Outlet />
          </IncursionsRealtimeProvider>
        </GatheringRealtimeProvider>
      </AutoCombatRealtimeProvider>
    </LootNotificationProvider>
  );
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <PublicOnlyRoute>
              <AuthPage />
            </PublicOnlyRoute>
          }
        />

        <Route
          path="/characters"
          element={
            <ProtectedRoute>
              <CharacterSelectPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/:characterId"
          element={
            <ProtectedRoute>
              <DashboardRealtimeRoute />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardOverviewPage />} />

          <Route path="auto-combat" element={<AutoCombatPage />} />

          <Route path="gathering" element={<GatheringHubPage />} />

          <Route path="gathering/:origin" element={<GatheringOriginPage />} />

          <Route
            path="crafting"
            element={<CraftingPage />}
          />

          <Route path="inventory" element={<InventoryPage />} />

          <Route
            path="equipment"
            element={
              <DashboardPlaceholderPage
                title="Equipamentos"
                description="Tela futura para gerenciar slots, trocar itens e comparar atributos."
              />
            }
          />

          <Route
            path="consumables"
            element={
              <DashboardPlaceholderPage
                title="Consumíveis e Enfermaria"
                description="Tela futura para poções, cura automática e recuperação de HP pela enfermaria."
              />
            }
          />

          <Route path="maps" element={<MapsSelectionPage />} />

          <Route path="incursions" element={<IncursionsPage />} />

          <Route path="world-bosses" element={<WorldBossesPage />} />

          <Route path="*" element={<Navigate to="" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
