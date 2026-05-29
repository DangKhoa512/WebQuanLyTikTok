import { Navigate, useLocation } from 'react-router-dom';
import { authService } from '../services/authService';

/**
 * Wraps routes that require authentication.
 * Redirects to /login if no valid JWT found.
 * Preserves the intended URL so we can redirect back after login.
 */
export default function ProtectedRoute({ children }) {
  const location = useLocation();

  if (!authService.isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
