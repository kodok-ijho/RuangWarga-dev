import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { TenantProvider } from './context/TenantContext';
import { ToastProvider } from './context/ToastContext';
import { TourProvider } from './context/TourContext';
import WalkthroughTour from './components/WalkthroughTour';
import ProtectedLayout from './components/Layout';
import PWAUpdatePrompt from './components/PWAUpdatePrompt';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

// Lazy-load halaman berat untuk code-splitting (recharts, papaparse)
import { lazy, Suspense } from 'react';
import { useAuth } from './hooks/useAuth';
import { useTenant } from './hooks/useTenant';
import {
  canViewFinancialReports,
  canViewPaymentMatrix,
  canViewResidents,
  canViewHouses,
  canViewSettings,
  canViewUsers,
  canViewLogs,
  canViewPaymentVerification,
  canViewUserApproval,
  canViewExpenses,
  canViewEvents,
  canViewIncomes,
} from './services/dataHelpers';
const Residents = lazy(() => import('./pages/Residents'));
const Houses = lazy(() => import('./pages/Houses'));
const PaymentMatrix = lazy(() => import('./pages/PaymentMatrix'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Events = lazy(() => import('./pages/Events'));
const EventFinance = lazy(() => import('./pages/EventFinance'));
const Announcements = lazy(() => import('./pages/Announcements'));
const NonIplIncomes = lazy(() => import('./pages/NonIplIncomes'));
const Users = lazy(() => import('./pages/Users'));
const Logs = lazy(() => import('./pages/Logs'));
const UserApproval = lazy(() => import('./pages/UserApproval'));
const PaymentVerification = lazy(() => import('./pages/PaymentVerification'));
const ChooseTenantType = lazy(() => import('./pages/onboarding/ChooseTenantType'));
const SetupWizard = lazy(() => import('./pages/onboarding/SetupWizard'));
const JoinTenant = lazy(() => import('./pages/public/JoinTenant'));
const TenantMemberApproval = lazy(() => import('./pages/tenant/TenantMemberApproval'));
const MyTenants = lazy(() => import('./pages/account/MyTenants'));
const AddNewTenant = lazy(() => import('./pages/account/AddNewTenant'));
const ChoosePlan = lazy(() => import('./pages/account/ChoosePlan'));
const SubscriptionStatus = lazy(() => import('./pages/account/SubscriptionStatus'));
const SubscriptionCheckout = lazy(() => import('./pages/account/SubscriptionCheckout'));
const TenantDashboard = lazy(() => import('./pages/tenant/TenantDashboard'));
const PlatformLayout = lazy(() => import('./pages/platform/PlatformLayout'));
const PlatformTenantList = lazy(() => import('./pages/platform/PlatformTenantList'));
const PlatformPricingConfig = lazy(() => import('./pages/platform/PlatformPricingConfig'));
const PlatformRevenue = lazy(() => import('./pages/platform/PlatformRevenue'));
const ArisanRounds = lazy(() => import('./pages/arisan/ArisanRounds'));
const ArisanDraw = lazy(() => import('./pages/arisan/ArisanDraw'));
const PostListing = lazy(() => import('./pages/tenant/PostListing'));
const MyListings = lazy(() => import('./pages/tenant/MyListings'));
const RoomListingDirectory = lazy(() => import('./pages/public/RoomListingDirectory'));
const RoomListingDetail = lazy(() => import('./pages/public/RoomListingDetail'));
const UmkmListingDirectory = lazy(() => import('./pages/public/UmkmListingDirectory'));
const UmkmListingDetail = lazy(() => import('./pages/public/UmkmListingDetail'));
const ManageRoles = lazy(() => import('./pages/roles/ManageRoles'));
const AssignMemberRole = lazy(() => import('./pages/roles/AssignMemberRole'));
const AccountLayout = lazy(() => import('./components/account/AccountLayout'));
const TenantShell = lazy(() => import('./components/tenant/TenantShell'));

const PageLoader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-slate-800 animate-spin" />
  </div>
);

/**
 * RoleGuard — renders children only if user has one of the allowed roles.
 * Otherwise redirects to home page.
 */
function RoleGuard({ allowed, canAccess, children }) {
  const { role } = useAuth();
  if (!role || (canAccess ? !canAccess(role) : !allowed.includes(role))) {
    return <Navigate to="/" replace />;
  }
  return children;
}

/**
 * TenantPermissionGuard — memastikan user memiliki permission tertentu atau merupakan Owner / Platform Admin.
 */
function TenantPermissionGuard({ permission, children }) {
  const { isOwner, isPlatformAdmin, hasPermission, loading } = useTenant();

  if (loading) {
    return <PageLoader />;
  }

  const allowed = isPlatformAdmin || isOwner || (hasPermission && hasPermission(permission));
  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return children;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <PWAUpdatePrompt />
        <AuthProvider>
          <TenantProvider>
            <BrowserRouter>
              <TourProvider>
              <WalkthroughTour />
              <Routes>
                {/* Beranda SaaS Platform — Terbuka Publik ala SumoPod */}
                <Route path="/" element={<Home />} />

                {/* Login & Onboarding terbuka */}
                <Route path="/login" element={<Login />} />
                <Route
                  path="/onboarding/choose-type"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ChooseTenantType />
                    </Suspense>
                  }
                />
                <Route
                  path="/join/:inviteCode?"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <JoinTenant />
                    </Suspense>
                  }
                />

                {/* Modul Listing Publik — Akses Bebas Tanpa Login & Tanpa Tenant Context (§7.3, T10.8, T10.9) */}
                <Route
                  path="/listing"
                  element={<Navigate to="/listing/kos" replace />}
                />
                <Route
                  path="/listing/kos"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <RoomListingDirectory />
                    </Suspense>
                  }
                />
                <Route
                  path="/listing/kos/:id"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <RoomListingDetail />
                    </Suspense>
                  }
                />
                <Route
                  path="/listing/umkm"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <UmkmListingDirectory />
                    </Suspense>
                  }
                />
                <Route
                  path="/listing/umkm/:id"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <UmkmListingDetail />
                    </Suspense>
                  }
                />

                {/* Tenant Owner Dashboard Layer (§7.2, TASK-030) */}
                <Route
                  path="/account"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <AccountLayout />
                    </Suspense>
                  }
                >
                  <Route
                    index
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <MyTenants />
                      </Suspense>
                    }
                  />
                  <Route
                    path="tenants"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <MyTenants />
                      </Suspense>
                    }
                  />
                  <Route
                    path="add-tenant"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <AddNewTenant />
                      </Suspense>
                    }
                  />
                  <Route
                    path="choose-plan"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <ChoosePlan />
                      </Suspense>
                    }
                  />
                  <Route
                    path="subscription"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <SubscriptionStatus />
                      </Suspense>
                    }
                  />
                  <Route
                    path="subscription/checkout"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <SubscriptionCheckout />
                      </Suspense>
                    }
                  />
                </Route>

                {/* Tenant Operational Workspace Layer (§7, TASK-040) */}
                <Route
                  path="/t/:tenantId"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <TenantShell />
                    </Suspense>
                  }
                >
                  <Route
                    index
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <TenantDashboard />
                      </Suspense>
                    }
                  />
                  <Route
                    path="dashboard"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <TenantDashboard />
                      </Suspense>
                    }
                  />
                  <Route
                    path="setup"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <SetupWizard />
                      </Suspense>
                    }
                  />
                  <Route
                    path="approval"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <TenantMemberApproval />
                      </Suspense>
                    }
                  />
                  <Route
                    path="members/pending"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <TenantMemberApproval />
                      </Suspense>
                    }
                  />
                  <Route
                    path="payment-verification"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewPaymentVerification}>
                          <PaymentVerification />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="expenses"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewExpenses}>
                          <Expenses />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="reports"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewFinancialReports}>
                          <Reports />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="payment-matrix"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewPaymentMatrix}>
                          <PaymentMatrix />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="announcements"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <Announcements />
                      </Suspense>
                    }
                  />
                  <Route
                    path="events"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewEvents}>
                          <Events />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="events/:eventId"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewEvents}>
                          <EventFinance />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="roles"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <TenantPermissionGuard permission="manage_tenant_users">
                          <ManageRoles />
                        </TenantPermissionGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="members/:id/role"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <TenantPermissionGuard permission="manage_tenant_users">
                          <AssignMemberRole />
                        </TenantPermissionGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="arisan/rounds"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <ArisanRounds />
                      </Suspense>
                    }
                  />
                  <Route
                    path="arisan/draw"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <ArisanDraw />
                      </Suspense>
                    }
                  />
                  <Route
                    path="listings/post"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <PostListing />
                      </Suspense>
                    }
                  />
                  <Route
                    path="post-listing"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <PostListing />
                      </Suspense>
                    }
                  />
                  <Route
                    path="listings"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <MyListings />
                      </Suspense>
                    }
                  />
                  <Route
                    path="my-listings"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <MyListings />
                      </Suspense>
                    }
                  />
                </Route>

                {/* Legacy Fallback Shortcuts */}
                <Route
                  path="/post-listing"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <PostListing />
                    </Suspense>
                  }
                />
                <Route
                  path="/my-listings"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <MyListings />
                    </Suspense>
                  }
                />
                <Route
                  path="/arisan/rounds"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ArisanRounds />
                    </Suspense>
                  }
                />
                <Route
                  path="/arisan/draw"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ArisanDraw />
                    </Suspense>
                  }
                />

                {/* Platform Owner Dashboard Layer (§7.1, T3.4) */}
                <Route
                  path="/platform"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <PlatformLayout />
                    </Suspense>
                  }
                >
                  <Route
                    index
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <PlatformTenantList />
                      </Suspense>
                    }
                  />
                  <Route
                    path="tenants"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <PlatformTenantList />
                      </Suspense>
                    }
                  />
                  <Route
                    path="pricing"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <PlatformPricingConfig />
                      </Suspense>
                    }
                  />
                  <Route
                    path="revenue"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <PlatformRevenue />
                      </Suspense>
                    }
                  />
                </Route>

                {/* Halaman butuh login */}
                <Route element={<ProtectedLayout />}>
                  <Route
                    path="/residents"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewResidents}>
                          <Residents />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="/houses"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewHouses}>
                          <Houses />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="/payment-matrix"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <PaymentMatrix />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/reports"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewFinancialReports}>
                          <Reports />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewSettings}>
                          <Settings />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="/expenses"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewExpenses}>
                          <Expenses />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="/announcements"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <Announcements />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/events"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewEvents}>
                          <Events />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="/events/:eventId"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewEvents}>
                          <EventFinance />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="/incomes"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewIncomes}>
                          <NonIplIncomes />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="/users"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewUsers}>
                          <Users />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="/logs"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewLogs}>
                          <Logs />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="/user-approval"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewUserApproval}>
                          <UserApproval />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                  <Route
                    path="/payment-verification"
                    element={
                      <Suspense fallback={<PageLoader />}>
                        <RoleGuard canAccess={canViewPaymentVerification}>
                          <PaymentVerification />
                        </RoleGuard>
                      </Suspense>
                    }
                  />
                </Route>

                <Route path="/404" element={<NotFound />} />
                <Route path="*" element={<Navigate to="/404" replace />} />
              </Routes>
            </TourProvider>
          </BrowserRouter>
          </TenantProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
