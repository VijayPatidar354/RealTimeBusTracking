import { Navigate, useLocation } from 'react-router-dom';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import { useAuth } from '../hooks/useAuth.js';

function ProtectedRoute({ children, redirectTo = '/passenger/login' }) {
  const location = useLocation();
  const { isAuthenticated, restoring } = useAuth();

  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 dark:bg-ink-950">
        <LoadingSpinner label="Restoring session" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  return children;
}

export default ProtectedRoute;
