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
}
interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard',  href: '/admin',                 icon: <LayoutDashboard /> },
      { label: 'Orders',     href: '/admin/orders',          icon: <ShoppingCart /> },
      { label: 'SLI Documents', href: '/admin/sli/documents', icon: <FileText /> },
      { label: 'Companies',  href: '/admin/companies',       icon: <Building2 /> },
    ],
  },
  {
    label: 'Users',
    items: [
      { label: 'Users',  href: '/admin/users',  icon: <Users /> },
      { label: 'Admins', href: '/admin/admins', icon: <Shield /> },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { label: 'Products',             href: '/admin/products',              icon: <Box /> },
      { label: 'Highlighted Products', href: '/admin/highlighted-products',  icon: <Star /> },
      { label: 'Categories',           href: '/admin/categories',            icon: <FolderOpen /> },
      { label: 'DAM',                  href: '/admin/dam',                   icon: <ImageIcon /> },
      { label: 'DAM Campaigns',        href: '/admin/dam/campaigns',         icon: <Megaphone /> },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports', href: '/admin/reports', icon: <BarChart3 /> },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { label: 'NetSuite',       href: '/admin/netsuite',  icon: <Plug /> },
      { label: 'Inventory Sync', href: '/admin/inventory', icon: <Package /> },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Subsidiaries',   href: '/admin/subsidiaries',  icon: <Building /> },
      { label: 'Locations',      href: '/admin/locations',     icon: <MapPin /> },
      { label: 'Classes',        href: '/admin/classes',       icon: <Tag /> },
      { label: 'Incoterms',      href: '/admin/incoterms',     icon: <FileBadge /> },
      { label: 'Payment Terms',  href: '/admin/payment-terms', icon: <CreditCard /> },
      { label: 'Support Funds',  href: '/admin/support-funds', icon: <DollarSign /> },
      { label: 'DAM Settings',   href: '/admin/dam/settings',  icon: <Settings /> },
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

  const sidebarContent = <NavContent pathname={pathname} />;

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
                logoSrc="/QIQI-Logo-cropped.svg"
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

function NavContent({ pathname }: { pathname: string }) {
  return (
    <Sidebar.Nav>
      {NAV_GROUPS.map((group, idx) => (
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
