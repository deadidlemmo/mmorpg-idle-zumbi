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
import { CraftingRealtimeProvider } from "../features/crafting/realtime/CraftingRealtimeProvider";
import { DashboardOverviewPage } from "../features/dashboard/pages/DashboardOverviewPage";
import { DashboardPlaceholderPage } from "../features/dashboard/pages/DashboardPlaceholderPage";
import { GatheringHubPage } from "../features/gathering/pages/GatheringHubPage";
import { GatheringOriginPage } from "../features/gathering/pages/GatheringOriginPage";
import { GatheringRealtimeProvider } from "../features/gathering/realtime/GatheringRealtimeProvider";
import { InfirmaryPage } from "../features/infirmary/pages/InfirmaryPage";
import { IncursionsPage } from "../features/incursions/pages/IncursionsPage";
import { IncursionsRealtimeProvider } from "../features/incursions/realtime/IncursionsRealtimeProvider";
import { InventoryPage } from "../features/inventory/pages/InventoryPage";
import { MapsSelectionPage } from "../features/maps/pages/MapsSelectionPage";
import { MembershipPage } from "../features/membership/pages/MembershipPage";
import { MerchantHubPage } from "../features/vendor/pages/MerchantHubPage";
import { VendorPage } from "../features/vendor/pages/VendorPage";
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
          <CraftingRealtimeProvider
            key={`crafting-${characterId}`}
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
          </CraftingRealtimeProvider>
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

          <Route path="crafting" element={<CraftingPage />} />

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

          <Route path="consumables" element={<MerchantHubPage />} />

          <Route path="consumables/:merchantId" element={<VendorPage />} />

          <Route path="infirmary" element={<InfirmaryPage />} />

          <Route path="membership" element={<MembershipPage />} />

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
