import React from 'react';
import { Outlet } from 'react-router-dom';
import PortalNavbar from '../components/portal/PortalNavbar';

/**
 * Shell for every signed-in portal page: a top navbar and a centred content
 * column on a warm-white background. No sidebar — the portal is deliberately
 * a flat, top-nav SaaS layout.
 *
 * `font-unbounded` is declared HERE, once, for the whole portal. It used to sit
 * on the navbar and the dashboard separately, which is why Products, Support
 * and Tickets silently fell back to Alata — a new page had to remember a class
 * nobody knew about. Inheriting it from the shell means it cannot be forgotten.
 * The rest of the app (staff admin, public support widget) keeps Alata.
 */
export default function PortalLayout() {
  return (
    <div className="min-h-screen bg-white font-unbounded text-ink-800">
      <PortalNavbar />
      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
