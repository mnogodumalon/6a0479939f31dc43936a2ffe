import '@/lib/sentry';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import { WorkflowPlaceholders } from '@/components/WorkflowPlaceholders';
import AdminPage from '@/pages/AdminPage';
import StammdatenPage from '@/pages/StammdatenPage';
import AktivitaetenPage from '@/pages/AktivitaetenPage';
import ZuordnungenPage from '@/pages/ZuordnungenPage';
import PublicFormStammdaten from '@/pages/public/PublicForm_Stammdaten';
import PublicFormAktivitaeten from '@/pages/public/PublicForm_Aktivitaeten';
import PublicFormZuordnungen from '@/pages/public/PublicForm_Zuordnungen';
// <public:imports>
// </public:imports>
// <custom:imports>
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <Routes>
              <Route path="public/6a0479785996561e7eb888d3" element={<PublicFormStammdaten />} />
              <Route path="public/6a04797b355dad88d5f128f8" element={<PublicFormAktivitaeten />} />
              <Route path="public/6a04797cb57abfb8285398e8" element={<PublicFormZuordnungen />} />
              {/* <public:routes> */}
              {/* </public:routes> */}
              <Route element={<Layout />}>
                <Route index element={<><div className="mb-8"><WorkflowPlaceholders /></div><DashboardOverview /></>} />
                <Route path="stammdaten" element={<StammdatenPage />} />
                <Route path="aktivitaeten" element={<AktivitaetenPage />} />
                <Route path="zuordnungen" element={<ZuordnungenPage />} />
                <Route path="admin" element={<AdminPage />} />
                {/* <custom:routes> */}
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
