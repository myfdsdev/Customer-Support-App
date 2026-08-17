import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { PortalAuthProvider } from './context/PortalAuthContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        {/*
          Two independent auth contexts coexist: staff (AuthProvider) and
          customer portal (PortalAuthProvider). They use different token stores,
          so a browser can even be signed into both at once without conflict.
        */}
        <AuthProvider>
          <PortalAuthProvider>
            <AppRoutes />
          </PortalAuthProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
