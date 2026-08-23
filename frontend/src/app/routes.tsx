import { lazy, Suspense, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import { AutoCombatRealtimeProvider } from "../features/auto-combat/realtime/AutoCombatRealtimeProvider";
import { CraftingRealtimeProvider } from "../features/crafting/realtime/CraftingRealtimeProvider";
import { GatheringRealtimeProvider } from "../features/gathering/realtime/GatheringRealtimeProvider";
import { IncursionsRealtimeProvider } from "../features/incursions/realtime/IncursionsRealtimeProvider";
import { LootNotificationProvider } from "../features/loot-notifications/LootNotificationProvider";
import { useAuthStore } from "../store/auth.store";

const AuthPage = lazy(() =>
  import("../features/auth/pages/AuthPage").then((module) => ({
    default: module.AuthPage,
  })),
);
const RecoverPasswordPage = lazy(() =>
  import("../features/auth/pages/PasswordRecoveryPage").then((module) => ({
    default: module.RecoverPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("../features/auth/pages/PasswordRecoveryPage").then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const TermsPage = lazy(() =>
  import("../features/legal/pages/LegalPages").then((module) => ({
    default: module.TermsPage,
  })),
);
const PrivacyPage = lazy(() =>
  import("../features/legal/pages/LegalPages").then((module) => ({
    default: module.PrivacyPage,
  })),
);
const ProgressionPage = lazy(() =>
  import("../features/progression/pages/ProgressionPage").then((module) => ({
    default: module.ProgressionPage,
  })),
);
const SocialPage = lazy(() =>
  import("../features/social/pages/SocialPage").then((module) => ({
    default: module.SocialPage,
  })),
);
const AppearancePage = lazy(() =>
  import("../features/cosmetics/pages/AppearancePage").then((module) => ({
    default: module.AppearancePage,
  })),
);
const CharacterInspectionPage = lazy(() =>
  import("../features/social/pages/CharacterInspectionPage").then(
    (module) => ({
      default: module.CharacterInspectionPage,
    }),
  ),
);
const AdminPage = lazy(() =>
  import("../features/admin/pages/AdminPage").then((module) => ({
    default: module.AdminPage,
  })),
);
const AutoCombatPage = lazy(() =>
  import("../features/auto-combat/pages/AutoCombatPage").then((module) => ({
    default: module.AutoCombatPage,
  })),
);
const CharacterSelectPage = lazy(() =>
  import("../features/characters/pages/CharacterSelectPage").then((module) => ({
    default: module.CharacterSelectPage,
  })),
);
const CharacterCreatePage = lazy(
  () => import("../features/characters/pages/CharacterCreatePage"),
);
const CraftingPage = lazy(() =>
  import("../features/crafting/pages/CraftingPage").then((module) => ({
    default: module.CraftingPage,
  })),
);
const DashboardOverviewPage = lazy(() =>
  import("../features/dashboard/pages/DashboardOverviewPage").then(
    (module) => ({
      default: module.DashboardOverviewPage,
    }),
  ),
);
const EquipmentPage = lazy(() =>
  import("../features/equipment/pages/EquipmentPage").then((module) => ({
    default: module.EquipmentPage,
  })),
);
const GatheringHubPage = lazy(() =>
  import("../features/gathering/pages/GatheringHubPage").then((module) => ({
    default: module.GatheringHubPage,
  })),
);
const GatheringOriginPage = lazy(() =>
  import("../features/gathering/pages/GatheringOriginPage").then((module) => ({
    default: module.GatheringOriginPage,
  })),
);
const InfirmaryPage = lazy(() =>
  import("../features/infirmary/pages/InfirmaryPage").then((module) => ({
    default: module.InfirmaryPage,
  })),
);
const IncursionsPage = lazy(() =>
  import("../features/incursions/pages/IncursionsPage").then((module) => ({
    default: module.IncursionsPage,
  })),
);
const InventoryPage = lazy(() =>
  import("../features/inventory/pages/InventoryPage").then((module) => ({
    default: module.InventoryPage,
  })),
);
const MapsSelectionPage = lazy(() =>
  import("../features/maps/pages/MapsSelectionPage").then((module) => ({
    default: module.MapsSelectionPage,
  })),
);
const MembershipPage = lazy(() =>
  import("../features/membership/pages/MembershipPage").then((module) => ({
    default: module.MembershipPage,
  })),
);
const MerchantHubPage = lazy(() =>
  import("../features/vendor/pages/MerchantHubPage").then((module) => ({
    default: module.MerchantHubPage,
  })),
);
const VendorPage = lazy(() =>
  import("../features/vendor/pages/VendorPage").then((module) => ({
    default: module.VendorPage,
  })),
);
const WorldBossesPage = lazy(() =>
  import("../features/world-bosses/pages/WorldBossesPage").then((module) => ({
    default: module.WorldBossesPage,
  })),
);

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

function AdminRoute({ children }: RouteGuardProps) {
  const user = useAuthStore((state) => state.user);

  if (user?.role !== "ADMIN") {
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
        refreshMs={15000}
      >
        <GatheringRealtimeProvider
          key={`gathering-${characterId}`}
          characterId={characterId}
          autoLoad
          refreshMs={15000}
          tickMs={1000}
        >
          <CraftingRealtimeProvider
            key={`crafting-${characterId}`}
            characterId={characterId}
            autoLoad
            refreshMs={15000}
            tickMs={1000}
          >
            <IncursionsRealtimeProvider
              key={`incursions-${characterId}`}
              characterId={characterId}
              autoLoad
              refreshMs={15000}
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
      <Suspense
        fallback={
          <main className="dashboard-loading" aria-live="polite">
            <div className="loading-spinner" />
            <span>Carregando...</span>
          </main>
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <PublicOnlyRoute>
                <AuthPage />
              </PublicOnlyRoute>
            }
          />

          <Route path="/recover-password" element={<RecoverPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              </ProtectedRoute>
            }
          />

          <Route
            path="/characters/new"
            element={
              <ProtectedRoute>
                <CharacterCreatePage />
              </ProtectedRoute>
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

            <Route path="objectives" element={<ProgressionPage />} />

            <Route path="auto-combat" element={<AutoCombatPage />} />

            <Route path="gathering" element={<GatheringHubPage />} />

            <Route path="gathering/:origin" element={<GatheringOriginPage />} />

            <Route path="crafting" element={<CraftingPage />} />

            <Route path="inventory" element={<InventoryPage />} />

            <Route path="equipment" element={<EquipmentPage />} />

            <Route path="appearance" element={<AppearancePage />} />

            <Route path="consumables" element={<MerchantHubPage />} />

            <Route path="consumables/:merchantId" element={<VendorPage />} />

            <Route path="infirmary" element={<InfirmaryPage />} />

            <Route path="membership" element={<MembershipPage />} />

            <Route path="maps" element={<MapsSelectionPage />} />

            <Route path="incursions" element={<IncursionsPage />} />

            <Route path="world-bosses" element={<WorldBossesPage />} />

            <Route path="allies" element={<SocialPage />} />

            <Route
              path="inspect/:targetCharacterId"
              element={<CharacterInspectionPage />}
            />

            <Route path="*" element={<Navigate to="" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
