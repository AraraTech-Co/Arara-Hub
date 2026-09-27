import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { PrivateRoute, ManagerRoute, AdminRoute, ScreenRoute } from './components/PrivateRoute.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Calendar from './pages/Calendar.jsx';
import Settings from './pages/Settings.jsx';
import Approvals from './pages/Approvals.jsx';
import CsvExports from './pages/CsvExports.jsx';
import Users from './pages/Users.jsx';
import Finance from './pages/Finance.jsx';
import Escala from './pages/Escala.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Home />} />
        <Route
          path="calendar"
          element={
            <ScreenRoute screenKey="calendar">
              <Calendar />
            </ScreenRoute>
          }
        />
        <Route
          path="finance"
          element={
            <ScreenRoute screenKey="finance">
              <Finance />
            </ScreenRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ScreenRoute screenKey="settings">
              <Settings />
            </ScreenRoute>
          }
        />
        <Route
          path="approvals"
          element={
            <ManagerRoute>
              <ScreenRoute screenKey="approvals">
                <Approvals />
              </ScreenRoute>
            </ManagerRoute>
          }
        />
        <Route
          path="csv-exports"
          element={
            <ManagerRoute>
              <ScreenRoute screenKey="csvExports">
                <CsvExports />
              </ScreenRoute>
            </ManagerRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminRoute>
              <ScreenRoute screenKey="users">
                <Users />
              </ScreenRoute>
            </AdminRoute>
          }
        />
        <Route
          path="escala"
          element={
            <AdminRoute>
              <ScreenRoute screenKey="escala">
                <Escala />
              </ScreenRoute>
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
