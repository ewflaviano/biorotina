import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import "../docs/tokens.css";
import "./styles.css";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { WeightPage } from "./pages/WeightPage";
import { ActivityPage } from "./pages/ActivityPage";
import { FoodPage } from "./pages/FoodPage";
import { MedicationPage } from "./pages/MedicationPage";
import { HydrationPage } from "./pages/HydrationPage";
import { MorePage } from "./pages/MorePage";
import { SettingsPage } from "./pages/SettingsPage";
import { AppDataProvider, useAppData } from "./state/AppDataContext";
import { PushProvider } from "./state/PushContext";

function AppRoutes() {
  const { loading, error } = useAppData();
  if (loading) return <div className="app-loading">Abrindo Biorotina…</div>;
  if (error)
    return (
      <div className="app-loading error" role="alert">
        {error}
      </div>
    );
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="peso" element={<WeightPage />} />
        <Route path="atividades" element={<ActivityPage />} />
        <Route path="alimentacao" element={<FoodPage />} />
        <Route path="medicamentos" element={<MedicationPage />} />
        <Route path="hidratacao" element={<HydrationPage />} />
        <Route path="mais" element={<MorePage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppDataProvider>
      <PushProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </PushProvider>
    </AppDataProvider>
  </React.StrictMode>,
);
