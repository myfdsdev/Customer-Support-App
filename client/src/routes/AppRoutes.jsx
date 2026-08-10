import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner, EmptyState } from '../components/ui';

import SupportLayout from '../layouts/SupportLayout';
import AdminLayout from '../layouts/AdminLayout';

import ProductSupport from '../pages/customer/ProductSupport';
import ChatPage from '../pages/customer/ChatPage';
import Training from '../pages/customer/Training';
import Help from '../pages/customer/Help';
import HelpArticle from '../pages/customer/HelpArticle';

import Login from '../pages/admin/Login';
import Dashboard from '../pages/admin/Dashboard';
import Inbox from '../pages/admin/Inbox';
import Products from '../pages/admin/Products';
import ProductDetails from '../pages/admin/ProductDetails';
import KnowledgeBase from '../pages/admin/KnowledgeBase';
import TrainingVideos from '../pages/admin/TrainingVideos';
import Customers from '../pages/admin/Customers';
import CustomerDetails from '../pages/admin/CustomerDetails';
import Tickets, { TicketDetails } from '../pages/admin/Tickets';
import Announcements from '../pages/admin/Announcements';
import Marketing from '../pages/admin/Marketing';
import Team from '../pages/admin/Team';
import Analytics from '../pages/admin/Analytics';
import Settings from '../pages/admin/Settings';

/** Blocks admin routes until auth resolves, then redirects to login if needed. */
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/admin/login" state={{ from: location }} replace />;
  return children;
}

/** Route-level permission gate mirroring the server's role rules. */
function RequirePermission({ section, children }) {
  const { can, user } = useAuth();
  if (!can(section)) {
    return (
      <EmptyState
        className="py-24"
        title="You do not have access to this section"
        description={`Your role (${user?.role?.replace(/_/g, ' ')}) does not include ${section}. Ask a super admin if you need it.`}
      />
    );
  }
  return children;
}

/**
 * Lands each role on the first page it can actually open. A support agent has
 * no dashboard, so sending everyone to /admin/dashboard would 403 half the team.
 */
const HOME_ORDER = [
  ['dashboard', '/admin/dashboard'],
  ['inbox', '/admin/inbox'],
  ['tickets', '/admin/tickets'],
  ['marketing', '/admin/marketing'],
  ['announcements', '/admin/announcements'],
  ['settings', '/admin/settings'],
];

function AdminHome() {
  const { can } = useAuth();
  const target = HOME_ORDER.find(([section]) => can(section))?.[1] || '/admin/settings';
  return <Navigate to={target} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* ---------- Customer support (public) ---------- */}
      <Route path="/support/:productSlug" element={<SupportLayout />}>
        <Route index element={<ProductSupport />} />
        <Route path="chat" element={<ChatPage initialMode="ai" />} />
        <Route path="live-support" element={<ChatPage initialMode="human" />} />
        <Route path="training" element={<Training />} />
        <Route path="help" element={<Help />} />
        <Route path="help/:articleId" element={<HelpArticle />} />
      </Route>

      {/* ---------- Admin ---------- */}
      <Route path="/admin/login" element={<Login />} />

      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<AdminHome />} />
        <Route path="dashboard" element={<RequirePermission section="dashboard"><Dashboard /></RequirePermission>} />
        <Route path="inbox" element={<RequirePermission section="inbox"><Inbox /></RequirePermission>} />
        <Route path="inbox/:conversationId" element={<RequirePermission section="inbox"><Inbox /></RequirePermission>} />
        <Route path="customers" element={<RequirePermission section="customers"><Customers /></RequirePermission>} />
        <Route path="customers/:customerId" element={<RequirePermission section="customers"><CustomerDetails /></RequirePermission>} />
        <Route path="products" element={<RequirePermission section="products"><Products /></RequirePermission>} />
        <Route path="products/:productId" element={<RequirePermission section="products"><ProductDetails /></RequirePermission>} />
        <Route path="products/:productId/knowledge" element={<RequirePermission section="knowledge"><KnowledgeBase /></RequirePermission>} />
        <Route path="products/:productId/training" element={<RequirePermission section="training"><TrainingVideos /></RequirePermission>} />
        <Route path="knowledge" element={<RequirePermission section="knowledge"><KnowledgeBase /></RequirePermission>} />
        <Route path="training" element={<RequirePermission section="training"><TrainingVideos /></RequirePermission>} />
        <Route path="tickets" element={<RequirePermission section="tickets"><Tickets /></RequirePermission>} />
        <Route path="tickets/:ticketId" element={<RequirePermission section="tickets"><TicketDetails /></RequirePermission>} />
        <Route path="marketing" element={<RequirePermission section="marketing"><Marketing /></RequirePermission>} />
        <Route path="announcements" element={<RequirePermission section="announcements"><Announcements /></RequirePermission>} />
        <Route path="team" element={<RequirePermission section="team"><Team /></RequirePermission>} />
        <Route path="analytics" element={<RequirePermission section="analytics"><Analytics /></RequirePermission>} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* ---------- Fallbacks ---------- */}
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route
        path="*"
        element={
          <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
            <EmptyState
              title="Page not found"
              description="Check the link, or head to the admin dashboard."
              action={
                <a href="/admin/dashboard" className="btn-primary">
                  Go to dashboard
                </a>
              }
            />
          </div>
        }
      />
    </Routes>
  );
}
