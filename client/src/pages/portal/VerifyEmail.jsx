import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert } from '../../components/ui';
import { portalAuthService, setPortalToken, toMessage } from '../../services/portalApi';
import { usePortalAuth } from '../../context/PortalAuthContext';
import AuthShell from './AuthShell';

/** Landing page for the emailed verification link: /verify-email/:token */
export default function VerifyEmail() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { refresh } = usePortalAuth();
  const [error, setError] = useState('');
  // The token is single-use, so never send it twice (StrictMode mounts twice).
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    (async () => {
      try {
        const data = await portalAuthService.verifyEmail(token);
        if (data.token) setPortalToken(data.token);
        await refresh();
        navigate('/portal/dashboard', { replace: true });
      } catch (err) {
        setError(toMessage(err));
      }
    })();
  }, [token, navigate, refresh]);

  return (
    <AuthShell
      title={error ? 'Link not valid' : 'Verifying your email…'}
      footer={
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {error ? (
        <Alert tone="error">
          {error.replace(/\.?$/, '.')} If you already verified, just sign in. Otherwise use{' '}
          <Link to="/forgot-password" className="font-medium underline">
            Forgot password
          </Link>{' '}
          to get a fresh link. It verifies your email too.
        </Alert>
      ) : (
        <p className="text-sm text-ink-500">One moment while we confirm your address.</p>
      )}
    </AuthShell>
  );
}
