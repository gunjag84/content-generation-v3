import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthGuard } from './auth/AuthGuard';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import Dashboard from './routes/Dashboard';
import Create from './routes/Create';
import Editor from './routes/Editor';
import Posts from './routes/Posts';
import Calendar from './routes/Calendar';
import { SettingsLayout } from './routes/settings/SettingsLayout';
import { IdentityPage } from './routes/settings/IdentityPage';
import { DesignPage } from './routes/settings/DesignPage';
import { FocusAreasPage } from './routes/settings/FocusAreasPage';
import { LibraryPage } from './routes/settings/LibraryPage';
import { PhotosPage } from './routes/settings/PhotosPage';
import { MethodsPage } from './routes/settings/MethodsPage';
import { ApiKeysPage } from './routes/settings/ApiKeysPage';

export default function App() {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 bg-gray-50">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/create" element={<Create />} />
              <Route path="/editor/:postId" element={<Editor />} />
              <Route path="/posts" element={<Posts />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="identity" replace />} />
                <Route path="identity" element={<IdentityPage />} />
                <Route path="design" element={<DesignPage />} />
                <Route path="focus-areas" element={<FocusAreasPage />} />
                <Route path="library" element={<LibraryPage />} />
                <Route path="photos" element={<PhotosPage />} />
                <Route path="methods" element={<MethodsPage />} />
                <Route path="api-keys" element={<ApiKeysPage />} />
              </Route>
            </Routes>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
