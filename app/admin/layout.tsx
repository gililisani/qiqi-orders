'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Building2,
  Users,
  Shield,
  Box,
  Star,
  FolderOpen,
  Image as ImageIcon,
  Megaphone,
  BarChart3,
  TrendingUp,
  PieChart,
  DollarSign,
  LineChart,
  Plug,
  Package,
  Building,
  Settings,
  MessageSquare,
  ShoppingBag,
  Store,
  Newspaper,
  ShieldCheck,
} from 'lucide-react';

import { supabase } from '../../lib/supabaseClient';
import { fetchWithAuth } from '../../lib/fetchWithAuth';
import { firstAllowedAdminArea } from '../../lib/permissions';
import { getMfaStatus } from '../../lib/mfa';
import { MfaVerifyGate } from '../components/admin/MfaVerifyGate';

import { AppShell } from '../components/qq/app-shell';
import { Sidebar } from '../components/qq/sidebar';
import { Topbar } from '../components/qq/topbar';
import { Brand } from '../components/qq/brand';
import { Avatar, AvatarFallback } from '../components/qq/avatar';
import FeedbackPopup from '../components/ui/FeedbackPopup';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../components/qq/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/qq/dropdown-menu';

// ----------------------------------------------------------------------------
// Nav structure — flat list with group labels (no nested sub-menus)
// ----------------------------------------------------------------------------
interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  // null = always shown; otherwise hidden when the admin lacks this permission.
  // Most admins today have ALL permissions so the filter is invisible — it
  // only matters when someone is intentionally restricted.
  permission?: string | null;
}
interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard',    href: '/admin',           icon: <LayoutDashboard />, permission: 'orders' },
      { label: 'Distributors', href: '/admin/companies', icon: <Building2 />,       permission: 'companies:manage' },
    ],
  },
  {
    label: 'Orders',
    items: [
      { label: 'Orders',        href: '/admin/orders',        icon: <ShoppingCart />, permission: 'orders' },
      { label: 'SLI Documents', href: '/admin/sli/documents', icon: <FileText />,     permission: 'orders' },
    ],
  },
  {
    label: 'Users',
    items: [
      { label: 'Users',  href: '/admin/users',  icon: <Users />,  permission: 'users:manage' },
      { label: 'Admins', href: '/admin/admins', icon: <Shield />, permission: 'admins:manage' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { label: 'Products',             href: '/admin/products',             icon: <Box />,        permission: 'settings' },
      { label: 'Highlighted Products', href: '/admin/highlighted-products', icon: <Star />,       permission: 'settings' },
      { label: 'Product Categories',   href: '/admin/categories',           icon: <FolderOpen />, permission: 'settings' },
      { label: 'Compliance Docs',      href: '/admin/compliance',           icon: <ShieldCheck />, permission: 'settings' },
    ],
  },
  {
    label: 'Assets',
    items: [
      { label: 'Media Assets',    href: '/admin/dam',           icon: <ImageIcon />, permission: 'dam' },
      { label: 'Asset Campaigns', href: '/admin/dam/campaigns', icon: <Megaphone />, permission: 'dam' },
      { label: 'Asset Settings',  href: '/admin/dam/settings',  icon: <Settings />,  permission: 'dam' },
      { label: 'Announcements',   href: '/admin/announcements', icon: <Newspaper />, permission: 'dam' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Executive Dashboard',  href: '/admin/reports',                     icon: <BarChart3 />,  permission: 'reports' },
      { label: 'Company Performance',  href: '/admin/reports/company-performance', icon: <TrendingUp />, permission: 'reports' },
      { label: 'Product Insights',     href: '/admin/reports/product-insights',    icon: <PieChart />,   permission: 'reports' },
      { label: 'Support Funds',        href: '/admin/reports/support-funds',       icon: <DollarSign />, permission: 'reports' },
      { label: 'Sales Explorer',       href: '/admin/reports/sales-explorer',      icon: <LineChart />,  permission: 'reports' },
    ],
  },
  {
    label: 'Amazon',
    items: [
      { label: 'FBA Financials',  href: '/admin/netsuite/amazon-fba', icon: <ShoppingBag />, permission: 'netsuite' },
      { label: 'Amazon Insights', href: '/admin/amazon',              icon: <Store />,       permission: 'netsuite' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'NetSuite Data',        href: '/admin/netsuite-data', icon: <Building />, permission: 'settings' },
      { label: 'NetSuite Integration', href: '/admin/netsuite',      icon: <Plug />,     permission: 'netsuite' },
      { label: 'NS Inventory Sync',    href: '/admin/inventory',     icon: <Package />,  permission: 'netsuite' },
      { label: 'SLI Settings',         href: '/admin/sli/settings',  icon: <Settings />, permission: 'settings' },
    ],
  },
];

// ----------------------------------------------------------------------------
// Route-level permission guard. EXPLICIT table (not derived from NAV_GROUPS)
// because ~a dozen admin routes aren't in the nav. Deepest prefix wins;
// unmatched paths DENY by default — add new areas here when adding pages.
// ----------------------------------------------------------------------------
const ROUTE_PERMISSIONS: Array<{ prefix: string; permission: string }> = [
  { prefix: '/admin/orders', permission: 'orders' },
  { prefix: '/admin/sli/settings', permission: 'settings' },
  { prefix: '/admin/sli', permission: 'orders' },
  { prefix: '/admin/companies', permission: 'companies:manage' },
  { prefix: '/admin/users', permission: 'users:manage' },
  { prefix: '/admin/admins', permission: 'admins:manage' },
  { prefix: '/admin/products', permission: 'settings' },
  { prefix: '/admin/highlighted-products', permission: 'settings' },
  { prefix: '/admin/categories', permission: 'settings' },
  { prefix: '/admin/compliance', permission: 'settings' },
  { prefix: '/admin/announcements', permission: 'dam' },
  { prefix: '/admin/classes', permission: 'settings' },
  { prefix: '/admin/locations', permission: 'settings' },
  { prefix: '/admin/subsidiaries', permission: 'settings' },
  { prefix: '/admin/incoterms', permission: 'settings' },
  { prefix: '/admin/payment-terms', permission: 'settings' },
  { prefix: '/admin/support-funds', permission: 'settings' },
  { prefix: '/admin/netsuite-data', permission: 'settings' },
  { prefix: '/admin/design', permission: 'settings' },
  { prefix: '/admin/dam', permission: 'dam' },
  { prefix: '/admin/reports', permission: 'reports' },
  { prefix: '/admin/netsuite', permission: 'netsuite' },
  { prefix: '/admin/inventory', permission: 'netsuite' },
  { prefix: '/admin/amazon', permission: 'netsuite' },
];

function isAdminPathAllowed(pathname: string, permissions: string[]): boolean {
  // Self-service security (MFA enrollment) — every admin may reach it,
  // whatever their permission set.
  if (pathname === '/admin/security' || pathname.startsWith('/admin/security/')) {
    return true;
  }
  if (pathname === '/admin') return permissions.includes('orders');
  let best: { prefix: string; permission: string } | null = null;
  for (const entry of ROUTE_PERMISSIONS) {
    const matches = pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`);
    if (matches && (!best || entry.prefix.length > best.prefix.length)) {
      best = entry;
    }
  }
  if (!best) return false; // unknown admin path → deny by default
  return permissions.includes(best.permission);
}

// Active-route helper: exact match OR pathname starts with href+'/'
function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === '/admin') return false; // dashboard only matches exactly
  // Executive Dashboard is the parent path of the other Insights reports,
  // which have their own menu items — highlight it only on exact match.
  if (href === '/admin/reports') return false;
  return pathname.startsWith(`${href}/`);
}

// ----------------------------------------------------------------------------
// Layout
// ----------------------------------------------------------------------------
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const feedbackButtonRef = useRef<HTMLButtonElement>(null);
  // MFA gate: enrolled admins must have a verified, non-stale session.
  // null = no gate; otherwise the factor to challenge + why.
  const [mfaGate, setMfaGate] = useState<{ factorId: string; stale: boolean } | null>(null);
  // mfa_required admins without a factor are held on /admin/security until
  // they enroll ("pushed" 2FA — set on the admin edit page).
  const [mfaEnrollRequired, setMfaEnrollRequired] = useState(false);
  // Bumped after the verify gate passes, to re-run the init effect (the
  // profile fetch is only valid AFTER verification — server enforcement
  // rejects unverified sessions of enrolled admins).
  const [authEpoch, setAuthEpoch] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }

      // MFA FIRST: these calls go to the auth server and work on an
      // unverified session; our own APIs would reject it (Phase 2).
      let mfaFactorId: string | null = null;
      try {
        const mfa = await getMfaStatus(supabase);
        mfaFactorId = mfa.factorId;
        if (mfa.factorId && (mfa.needsChallenge || mfa.isStale)) {
          setMfaGate({ factorId: mfa.factorId, stale: mfa.isStale });
          setLoading(false);
          return; // profile + permissions load after the code passes
        }
      } catch {
        // An MFA status hiccup must not lock the portal; the server-side
        // guard still protects every API.
      }

      try {
        const res = await fetchWithAuth(`/api/user-profile?userId=${user.id}`);
        const data = await res.json().catch(() => ({}));
        const role = typeof data?.user?.role === 'string' ? data.user.role : null;
        if (!res.ok || !data?.success || role?.toLowerCase() !== 'admin') {
          router.push('/');
          return;
        }
        setUserEmail(user.email || '');
        // Load admin's permission list so the sidebar can filter nav items.
        // Defaults to all-on if the column is missing/null (pre-migration).
        const { data: adminRow } = await supabase
          .from('admins')
          .select('permissions, mfa_required')
          .eq('id', user.id)
          .maybeSingle();
        setPermissions(
          Array.isArray(adminRow?.permissions) ? adminRow!.permissions : [],
        );
        // mfa_required admins without a factor: hold on /admin/security.
        if (!mfaFactorId && adminRow?.mfa_required) {
          setMfaEnrollRequired(true);
        }
      } catch {
        router.push('/');
        return;
      }
      setIsAuthenticated(true);
      setLoading(false);
    })();
  }, [router, authEpoch]);

  // Route-level guard: bounce admins off pages their permissions don't
  // cover, to their first allowed area (or /forbidden if none).
  useEffect(() => {
    if (loading || !isAuthenticated) return;
    if (isAdminPathAllowed(pathname, permissions)) return;
    const target = firstAllowedAdminArea(permissions);
    if (target && target !== pathname) {
      router.replace(target);
    } else if (!target) {
      router.replace('/forbidden');
    }
  }, [loading, isAuthenticated, pathname, permissions, router]);

  // Close the mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // "Pushed" 2FA: keep an mfa_required admin on the Security page until a
  // factor exists. Re-checks before each bounce so the hold releases on the
  // first navigation after they enroll.
  useEffect(() => {
    if (!mfaEnrollRequired) return;
    if (pathname === '/admin/security' || pathname.startsWith('/admin/security/')) return;
    let cancelled = false;
    (async () => {
      try {
        const mfa = await getMfaStatus(supabase);
        if (cancelled) return;
        if (mfa.factorId) {
          setMfaEnrollRequired(false);
          return;
        }
      } catch {
        /* fall through to the bounce */
      }
      if (!cancelled) router.replace('/admin/security');
    })();
    return () => {
      cancelled = true;
    };
  }, [mfaEnrollRequired, pathname, router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // The gate renders BEFORE the auth checks: when it's up, loading is done
  // but isAuthenticated is still false (profile loads after the code passes).
  if (mfaGate) {
    return (
      <MfaVerifyGate
        factorId={mfaGate.factorId}
        stale={mfaGate.stale}
        onVerified={() => {
          setMfaGate(null);
          setLoading(true);
          setAuthEpoch((e) => e + 1);
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const sidebarContent = (
    <NavContent pathname={pathname} permissions={permissions} />
  );

  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'A';

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)}>
            {sidebarContent}
          </Sidebar>
        }
        topbar={
          <Topbar
            brand={
              <Brand
                title="Partners Hub"
                logoSrc="/QIQI-Logo.svg"
                sidebarCollapsed={collapsed}
                onToggleSidebar={() => setCollapsed((c) => !c)}
              />
            }
            onToggleSidebar={() => setMobileOpen(true)}
            left={null}
            right={
              <>
                <button
                  ref={feedbackButtonRef}
                  type="button"
                  onClick={() => setFeedbackOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label="Send feedback"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">Feedback</span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-md p-1 hover:bg-secondary transition-colors"
                      aria-label="User menu"
                    >
                      <Avatar>
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="normal-case tracking-normal text-xs">
                      {userEmail}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/admin/security')}>
                      <Shield className="h-4 w-4 mr-2" /> Security
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      className="text-destructive focus:text-destructive"
                    >
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
        }
      >
        {children}
      </AppShell>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 max-w-[80vw]">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle>Partners Hub</SheetTitle>
          </SheetHeader>
          <Sidebar collapsed={false} className="border-0 h-full">
            {sidebarContent}
          </Sidebar>
        </SheetContent>
      </Sheet>

      <FeedbackPopup
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        buttonRef={feedbackButtonRef}
      />
    </>
  );
}

function NavContent({
  pathname,
  permissions,
}: {
  pathname: string;
  permissions: string[];
}) {
  // Filter each group to items the admin is allowed to see, then drop any
  // group that ends up empty. An admin with all permissions sees everything,
  // matching today's behavior.
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (it) => !it.permission || permissions.includes(it.permission),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <Sidebar.Nav>
      {visibleGroups.map((group, idx) => (
        <Sidebar.Group key={idx} label={group.label}>
          {group.items.map((it) => (
            <Sidebar.Item
              key={it.href}
              href={it.href}
              icon={it.icon}
              active={isActive(pathname, it.href)}
            >
              {it.label}
            </Sidebar.Item>
          ))}
        </Sidebar.Group>
      ))}
    </Sidebar.Nav>
  );
}
