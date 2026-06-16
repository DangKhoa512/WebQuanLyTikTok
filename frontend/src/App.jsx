import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout          from './components/Layout';
import ProtectedRoute  from './components/ProtectedRoute';
import ToastContainer  from './components/Toast';
import Login           from './pages/Login';
import Dashboard       from './pages/Dashboard';
import AccountList     from './pages/AccountList';
import AccountDetail   from './pages/AccountDetail';
import Stats           from './pages/Stats';
import Export          from './pages/Export';
import ProxySettings      from './pages/ProxySettings';
import ChromeAccountList from './pages/ChromeAccountList';
import Users             from './pages/Users';
import UsedAccounts      from './pages/UsedAccounts';
import JobAccounts       from './pages/JobAccounts';

export default function App() {
  return (
    <>
      <ToastContainer />
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Protected — all dashboard routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"    element={<Dashboard />} />
            <Route path="accounts"     element={<AccountList />} />
            <Route path="accounts/:id" element={<AccountDetail />} />
            <Route path="stats"          element={<Stats />} />
            <Route path="export"         element={<Export />} />
            <Route path="proxy-settings"   element={<ProxySettings />} />
            <Route path="chrome-accounts"  element={<ChromeAccountList />} />
            <Route path="jobs"             element={<JobAccounts />} />
            <Route path="used-accounts"    element={<UsedAccounts />} />
            <Route path="users"            element={<Users />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
