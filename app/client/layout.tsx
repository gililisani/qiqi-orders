'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Image as ImageIcon,
  StickyNote,
  Building2,
  Bell,
} from 'lucide-react';

import { supabase } from '../../lib/supabaseClient';
import { fetchWithAuth } from '../../lib/fetchWithAuth';

import { AppShell } from '../components/qq/app-shell';
import { Sidebar } from '../components/qq/sidebar';
import { Topbar } from '../components/qq/topbar';
import { Brand } from '../components/qq/brand';
import { Button } from '../components/qq/button';
import { Avatar, AvatarFallback } from '../components/qq/avatar';
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
// Nav structure — flat, no nested sub-menus (mirrors admin layout pattern)
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
      { label: 'Dashboard', href: '/client',         icon: <LayoutDashboard /> },
      { label: 'Orders',    href: '/client/orders',  icon: <ShoppingCart /> },
      { label: 'Assets',    href: '/client/assets',  icon: <ImageIcon /> },
      { label: 'Notes',     href: '/client/notes',   icon: <StickyNote /> },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Your company', href: '/client/company', icon: <Building2 /> },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === '/client') return false; // dashboard only matches exactly
  return pathname.startsWith(`${href}/`);
}

// ----------------------------------------------------------------------------
// Layout
// ----------------------------------------------------------------------------
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
        if (!res.ok || !data?.success || role?.toLowerCase() !== 'client') {
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
  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'C';

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
                sidebarCollapsed={collapsed}
                onToggleSidebar={() => setCollapsed((c) => !c)}
              />
            }
            onToggleSidebar={() => setMobileOpen(true)}
            left={null}
            right={
              <>
                <Button variant="ghost" size="icon" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                </Button>
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
