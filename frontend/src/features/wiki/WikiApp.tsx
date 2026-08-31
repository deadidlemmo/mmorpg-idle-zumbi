import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { WikiLayout } from "./components/WikiLayout";
import { WikiCatalogPage } from "./pages/WikiCatalogPage";
import { WikiDetailPage } from "./pages/WikiDetailPage";
import {
  WikiCombatPage,
  WikiGettingStartedPage,
  WikiGuidesPage,
  WikiProgressionPage,
  WikiSystemDetailPage,
  WikiSystemsPage,
} from "./pages/WikiEditorialPages";
import { WikiHomePage } from "./pages/WikiHomePage";
import { WikiSearchPage } from "./pages/WikiSearchPage";

export function WikiApp() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Dead Idle Wiki";

    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <Routes>
      <Route element={<WikiLayout />}>
        <Route index element={<WikiHomePage />} />
        <Route path="getting-started" element={<WikiGettingStartedPage />} />
        <Route path="systems" element={<WikiSystemsPage />} />
        <Route path="systems/:slug" element={<WikiSystemDetailPage />} />
        <Route path="combat" element={<WikiCombatPage />} />
        <Route path="progression" element={<WikiProgressionPage />} />
        <Route path="guides" element={<WikiGuidesPage />} />
        <Route path="search" element={<WikiSearchPage />} />

        <Route path="items" element={<WikiCatalogPage kind="items" />} />
        <Route path="items/:slug" element={<WikiDetailPage kind="items" />} />
        <Route path="resources" element={<WikiCatalogPage kind="items" initialSlot="MATERIAL" />} />
        <Route path="monsters" element={<WikiCatalogPage kind="monsters" />} />
        <Route path="monsters/:slug" element={<WikiDetailPage kind="monsters" />} />
        <Route path="bosses" element={<WikiCatalogPage kind="bosses" />} />
        <Route path="bosses/:slug" element={<WikiDetailPage kind="bosses" />} />
        <Route path="maps" element={<WikiCatalogPage kind="maps" />} />
        <Route path="maps/:slug" element={<WikiDetailPage kind="maps" />} />

        <Route path="*" element={<Navigate to="/wiki" replace />} />
      </Route>
    </Routes>
  );
}

export default WikiApp;
