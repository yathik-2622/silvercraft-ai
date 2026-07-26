import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectConfigPage } from './pages/ProjectConfigPage';
import { StudioPage } from './pages/StudioPage';
import { SettingsPage } from './pages/SettingsPage';
import WorkflowBuilderPage from './pages/WorkflowBuilderPage';
import { useAuthStore } from './store/useAuthStore';
import { SettingsProvider } from './context/SettingsContext';
import SettingsModal from './components/SettingsModal';
import { Settings } from 'lucide-react';

// Guard: redirects to /login if not authenticated
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

export default function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <SettingsProvider>
      <BrowserRouter>
        <div className="relative">
          {/* Global settings button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="fixed top-4 right-4 z-40 p-2 bg-[#21262d] text-gray-300 hover:text-white rounded-md border border-[#30363d] shadow-md transition-colors"
            title="Global Settings"
          >
            <Settings size={20} />
          </button>
          
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

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          
          <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
      </BrowserRouter>
    </SettingsProvider>
  );
}
