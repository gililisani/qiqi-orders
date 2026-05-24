'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Image as ImageIcon,
  StickyNote,
  Building2,
  MessageSquare,
} from 'lucide-react';

import { supabase } from '../../lib/supabaseClient';
import { fetchWithAuth } from '../../lib/fetchWithAuth';

import { AppShell } from '../components/qq/app-shell';
import { Sidebar } from '../components/qq/sidebar';
import { Topbar } from '../components/qq/topbar';
import { Brand } from '../components/qq/brand';
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
import FeedbackPopup from '../components/ui/FeedbackPopup';

// ----------------------------------------------------------------------------
// Nav structure
// ----------------------------------------------------------------------------
interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  /** Optional key used to look up dynamic state (e.g. unread badge). */
  key?: string;
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
      { label: 'Notes',     href: '/client/notes',   icon: <StickyNote />, key: 'notes' },
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
  if (href === '/client') return false;
  return pathname.startsWith(`${href}/`);
}

// Red dot indicator for the Notes sidebar item
const UnreadDot = () => (
  <span
    aria-label="Unread notes"
    className="inline-block h-1.5 w-1.5 rounded-full bg-brand-magenta"
  />
);

// ----------------------------------------------------------------------------
// Layout
// ----------------------------------------------------------------------------
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Unread notes indicator
  const [hasUnreadNotes, setHasUnreadNotes] = useState(false);

  // Feedback popup
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
        if (!res.ok || !data?.success || role?.toLowerCase() !== 'client') {
          router.push('/');
          return;
        }
        setUserEmail(user.email || '');
        setUserId(user.id);
      } catch {
        router.push('/');
        return;
      }
      setIsAuthenticated(true);
      setLoading(false);
    })();
  }, [router]);

  // ---- Unread notes check ----
  const checkUnreadNotes = async (clientId: string) => {
    try {
      const { data: clientData } = await supabase
        .from('clients')
        .select('company_id')
        .eq('id', clientId)
        .single();
      if (!clientData?.company_id) return;

      const { data: notes } = await supabase
        .from('company_notes')
        .select('id')
        .eq('company_id', clientData.company_id)
        .eq('visible_to_client', true);
      if (!notes || notes.length === 0) {
        setHasUnreadNotes(false);
        return;
      }

      const { data: viewed } = await supabase
        .from('client_note_views')
        .select('note_id')
        .eq('client_id', clientId)
        .in('note_id', notes.map((n) => n.id));

      const viewedIds = new Set((viewed || []).map((v) => v.note_id));
      setHasUnreadNotes(notes.some((n) => !viewedIds.has(n.id)));
    } catch (err) {
      console.error('Error checking unread notes:', err);
    }
  };

  useEffect(() => {
    if (!userId) return;
    checkUnreadNotes(userId);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkUnreadNotes(userId);
    };
    const handleNotesViewed = () => {
      // Tiny delay so the DB write lands before we re-check
      setTimeout(() => checkUnreadNotes(userId), 500);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('notesViewed', handleNotesViewed);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('notesViewed', handleNotesViewed);
    };
  }, [userId]);

  // Re-check unread badge whenever the user navigates away from /client/notes
  useEffect(() => {
    if (userId && pathname !== '/client/notes') {
      checkUnreadNotes(userId);
    }
  }, [pathname, userId]);

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
    <NavContent pathname={pathname} hasUnreadNotes={hasUnreadNotes} />
  );
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

      {/* Feedback popup — positioned relative to its button */}
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
  hasUnreadNotes,
}: {
  pathname: string;
  hasUnreadNotes: boolean;
}) {
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
              badge={it.key === 'notes' && hasUnreadNotes ? <UnreadDot /> : undefined}
            >
              {it.label}
            </Sidebar.Item>
          ))}
        </Sidebar.Group>
      ))}
    </Sidebar.Nav>
  );
}
