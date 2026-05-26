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
  Plug,
  Package,
  Building,
  MapPin,
  Tag,
  FileBadge,
  CreditCard,
  DollarSign,
  Settings,
  MessageSquare,
} from 'lucide-react';

import { supabase } from '../../lib/supabaseClient';
import { fetchWithAuth } from '../../lib/fetchWithAuth';

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
      { label: 'Dashboard',  href: '/admin',                 icon: <LayoutDashboard />, permission: 'orders' },
      { label: 'Orders',     href: '/admin/orders',          icon: <ShoppingCart />,    permission: 'orders' },
      { label: 'SLI Documents', href: '/admin/sli/documents', icon: <FileText />,       permission: 'orders' },
      { label: 'Companies',  href: '/admin/companies',       icon: <Building2 />,       permission: 'companies:manage' },
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
      { label: 'Products',             href: '/admin/products',              icon: <Box />,        permission: 'settings' },
      { label: 'Highlighted Products', href: '/admin/highlighted-products',  icon: <Star />,       permission: 'settings' },
      { label: 'Categories',           href: '/admin/categories',            icon: <FolderOpen />, permission: 'settings' },
      { label: 'DAM',                  href: '/admin/dam',                   icon: <ImageIcon />,  permission: 'dam' },
      { label: 'DAM Campaigns',        href: '/admin/dam/campaigns',         icon: <Megaphone />,  permission: 'dam' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports', href: '/admin/reports', icon: <BarChart3 />, permission: 'reports' },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { label: 'NetSuite',       href: '/admin/netsuite',  icon: <Plug />,    permission: 'netsuite' },
      { label: 'Inventory Sync', href: '/admin/inventory', icon: <Package />, permission: 'netsuite' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Subsidiaries',   href: '/admin/subsidiaries',  icon: <Building />,   permission: 'settings' },
      { label: 'Locations',      href: '/admin/locations',     icon: <MapPin />,     permission: 'settings' },
      { label: 'Classes',        href: '/admin/classes',       icon: <Tag />,        permission: 'settings' },
      { label: 'Incoterms',      href: '/admin/incoterms',     icon: <FileBadge />,  permission: 'settings' },
      { label: 'Payment Terms',  href: '/admin/payment-terms', icon: <CreditCard />, permission: 'settings' },
      { label: 'Support Funds',  href: '/admin/support-funds', icon: <DollarSign />, permission: 'settings' },
      { label: 'DAM Settings',   href: '/admin/dam/settings',  icon: <Settings />,   permission: 'dam' },
    ],
  },
];

// Active-route helper: exact match OR pathname starts with href+'/'
function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === '/admin') return false; // dashboard only matches exactly
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

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
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
          .select('permissions')
          .eq('id', user.id)
          .maybeSingle();
        setPermissions(
          Array.isArray(adminRow?.permissions) ? adminRow!.permissions : [],
        );
      } catch {
        router.push('/');
        return;
      }
      setIsAuthenticated(true);
      setLoading(false);
    })();
  }, [router]);

  // Close the mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

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
