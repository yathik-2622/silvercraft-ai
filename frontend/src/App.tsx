import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectConfigPage } from './pages/ProjectConfigPage';
import { StudioPage } from './pages/StudioPage';
import { SettingsPage } from './pages/SettingsPage';
import { MarketplacePage } from './pages/MarketplacePage';
import { SkillLibraryPage } from './pages/SkillLibraryPage';
import WorkflowBuilderPage from './pages/WorkflowBuilderPage';
import { useAuthStore } from './store/useAuthStore';
import { SettingsProvider } from './context/SettingsContext';

// Guard: redirects to /login if not authenticated
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <div className="relative">
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected */}
            <Route
              path="/dashboard"
              element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
            />
            <Route
              path="/project/:id/config"
              element={<ProtectedRoute><ProjectConfigPage /></ProtectedRoute>}
            />
            <Route
              path="/project/:id/studio"
              element={<ProtectedRoute><StudioPage /></ProtectedRoute>}
            />
            <Route
              path="/builder"
              element={<ProtectedRoute><WorkflowBuilderPage /></ProtectedRoute>}
            />
            <Route
              path="/settings"
              element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}
            />
            <Route
              path="/marketplace"
              element={<ProtectedRoute><MarketplacePage /></ProtectedRoute>}
            />
            <Route
              path="/skills"
              element={<ProtectedRoute><SkillLibraryPage /></ProtectedRoute>}
            />

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </SettingsProvider>
  );
}
