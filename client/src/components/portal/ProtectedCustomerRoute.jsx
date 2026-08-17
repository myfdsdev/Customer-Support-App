import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePortalAuth } from '../../context/PortalAuthContext';
import { Spinner } from '../ui';

/**
 * Gates the whole portal behind a signed-in customer. While auth is resolving
 * it shows a spinner rather than flashing the login page for authenticated
 * users on refresh.
 */
export default function ProtectedCustomerRoute({ children }) {
  const { isAuthenticated, loading } = usePortalAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <Spinner label="Loading your account…" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
