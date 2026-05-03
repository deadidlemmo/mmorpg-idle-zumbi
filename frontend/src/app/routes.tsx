import type { ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useParams,
} from 'react-router-dom';
import { AuthPage } from '../features/auth/pages/AuthPage';
import { AutoCombatPage } from '../features/auto-combat/pages/AutoCombatPage';
import { AutoCombatRealtimeProvider } from '../features/auto-combat/realtime/AutoCombatRealtimeProvider';
import { CharacterSelectPage } from '../features/characters/pages/CharacterSelectPage';
import { DashboardOverviewPage } from '../features/dashboard/pages/DashboardOverviewPage';
import { DashboardPlaceholderPage } from '../features/dashboard/pages/DashboardPlaceholderPage';
import { useAuthStore } from '../store/auth.store';

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
    <AutoCombatRealtimeProvider
      key={characterId}
      characterId={characterId}
      autoLoad
      refreshMs={3000}
    >
      <Outlet />
    </AutoCombatRealtimeProvider>
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

          <Route
            path="gathering"
            element={
              <DashboardPlaceholderPage
                title="Expedições"
                description="Tela futura para iniciar expedições, acompanhar produção e escolher origem de materiais."
              />
            }
          />

          <Route
            path="crafting"
            element={
              <DashboardPlaceholderPage
                title="Criação"
                description="Tela futura para receitas, ingredientes, materiais e criação de equipamentos."
              />
            }
          />

          <Route
            path="inventory"
            element={
              <DashboardPlaceholderPage
                title="Mochila"
                description="Tela futura para materiais, consumíveis e equipamentos guardados pelo personagem."
              />
            }
          />

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

          <Route
            path="maps"
            element={
              <DashboardPlaceholderPage
                title="Mapas"
                description="Tela futura para mapas, submapas disponíveis, recomendação de progressão e entrada em zonas."
              />
            }
          />

          <Route index={false} path="*" element={<Navigate to="" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}