import React from 'react';
import { Outlet } from 'react-router-dom';
import PortalNavbar from '../components/portal/PortalNavbar';

/**
 * Shell for every signed-in portal page: a top navbar and a centred content
 * column on a warm-white background. No sidebar — the portal is deliberately
 * a flat, top-nav SaaS layout.
 */
export default function PortalLayout() {
  return (
    <div className="min-h-screen bg-ink-50 text-ink-800">
      <PortalNavbar />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
