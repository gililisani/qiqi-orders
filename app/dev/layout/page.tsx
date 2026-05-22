'use client';

/**
 * Qiqi UI — layout preview.
 *
 * Realistic admin page wrapped in the new AppShell. Test responsive at:
 *  - <768  → mobile drawer
 *  - 768-1023 → collapsed sidebar by default (toggleable)
 *  - 1024+ → full sidebar (toggleable via top-right button)
 */

import { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Building2,
  Users,
  Box,
  Image as ImageIcon,
  BarChart3,
  Settings,
  Search,
  Plus,
  Bell,
} from 'lucide-react';

import { AppShell } from '../../components/qq/app-shell';
import { Sidebar } from '../../components/qq/sidebar';
import { Topbar, Breadcrumbs } from '../../components/qq/topbar';
import { Brand } from '../../components/qq/brand';
import { Button } from '../../components/qq/button';
import { Badge } from '../../components/qq/badge';
import { Card } from '../../components/qq/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../../components/qq/table';
import { StatusBadge } from '../../components/qq/status-badge';
import { SupportFundBadge } from '../../components/qq/support-fund-badge';
import { PageHeader } from '../../components/qq/page-header';
import { Pagination } from '../../components/qq/pagination';
import { Avatar, AvatarFallback } from '../../components/qq/avatar';
import { Input } from '../../components/qq/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/qq/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../components/qq/sheet';

export default function LayoutPreviewPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const sidebarContent = <SidebarContent />;

  return (
    <>
      <AppShell
        // Inline sidebar for lg+ — Sidebar carries collapse state AND toggle.
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
            left={
              <Breadcrumbs
                items={[
                  { label: 'Admin', href: '#' },
                  { label: 'Orders' },
                ]}
              />
            }
            right={
              <>
                <Button variant="ghost" size="icon" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 rounded-md p-1 hover:bg-secondary transition-colors">
                      <Avatar>
                        <AvatarFallback>GL</AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="normal-case tracking-normal text-xs">
                      gili@qiqiglobal.com
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Profile</DropdownMenuItem>
                    <DropdownMenuItem>Settings</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
        }
      >
        <FakeOrdersPage page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} />
      </AppShell>

      {/* Mobile sidebar drawer (only mounts when opened) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 max-w-[80vw]">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle>Qiqi Partners Hub</SheetTitle>
          </SheetHeader>
          <Sidebar collapsed={false} className="border-0">
            {sidebarContent}
          </Sidebar>
        </SheetContent>
      </Sheet>
    </>
  );
}

// -----------------------------------------------------------------------------
// Sidebar contents — separated so we can reuse in both inline and drawer modes.
// -----------------------------------------------------------------------------
function SidebarContent() {
  return (
    <>
      <Sidebar.Nav>
        <Sidebar.Group>
          <Sidebar.Item icon={<LayoutDashboard />} href="#">
            Dashboard
          </Sidebar.Item>
          <Sidebar.Item icon={<ShoppingCart />} href="#" active badge={<Badge variant="accent">12</Badge>}>
            Orders
          </Sidebar.Item>
          <Sidebar.Item icon={<Building2 />} href="#">
            Companies
          </Sidebar.Item>
          <Sidebar.Item icon={<Users />} href="#">
            Users
          </Sidebar.Item>
          <Sidebar.Item icon={<Box />} href="#">
            Products
          </Sidebar.Item>
          <Sidebar.Item icon={<ImageIcon />} href="#">
            DAM
          </Sidebar.Item>
        </Sidebar.Group>

        <Sidebar.Group label="Insights">
          <Sidebar.Item icon={<BarChart3 />} href="#">
            Reports
          </Sidebar.Item>
        </Sidebar.Group>

        <Sidebar.Group label="Settings">
          <Sidebar.Item icon={<Settings />} href="#">
            Configuration
          </Sidebar.Item>
        </Sidebar.Group>
      </Sidebar.Nav>

      <Sidebar.Footer>
        <p className="text-[10px] text-muted-foreground text-center">
          v0.2 · Phase 2b
        </p>
      </Sidebar.Footer>
    </>
  );
}

// -----------------------------------------------------------------------------
// Fake admin Orders page content
// -----------------------------------------------------------------------------
function FakeOrdersPage({
  page,
  setPage,
  pageSize,
  setPageSize,
}: {
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
}) {
  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Orders"
        description="Manage incoming orders from your distributors."
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search PO, company…" className="pl-9 w-full sm:w-64" />
            </div>
            <Button>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New order</span>
            </Button>
          </>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="Total" value="287" delta="+18 this week" />
        <Stat label="Open" value="23" delta="3 awaiting push" />
        <Stat label="In Process" value="41" />
        <Stat label="Revenue · QTD" value="$284,512" mono delta="+8% vs last Q" />
      </div>

      {/* Orders table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Support fund</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="hidden lg:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              { po: 'UBO5X0', co: 'For testing DISTRIBUTOR', status: 'In Process', sf: { p: 10, a: '$945' }, total: '$9,705.00', date: 'May 16' },
              { po: 'XK3M91', co: 'ADI SRL', status: 'Done', sf: { p: 5, a: '$240' }, total: '$24,100.00', date: 'May 14' },
              { po: 'A7BX2P', co: 'Salon Group LLC', status: 'Ready', sf: { p: 10, a: null }, total: '$3,420.00', date: 'May 11' },
              { po: 'P3Q8KL', co: 'Hair Lab México', status: 'Open', sf: { p: 8, a: '$480' }, total: '$6,000.00', date: 'May 10' },
              { po: 'DRAFT', co: 'Studio K', status: 'Draft', sf: null, total: '$1,275.00', date: 'May 8' },
              { po: 'QP9KX2', co: 'Curl Co.', status: 'Cancelled', sf: null, total: '$2,100.00', date: 'May 7' },
            ].map((r) => (
              <TableRow key={r.po}>
                <TableCell className="font-mono text-sm">{r.po}</TableCell>
                <TableCell>{r.co}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="hidden md:table-cell">
                  {r.sf ? <SupportFundBadge percent={r.sf.p} amount={r.sf.a ?? undefined} /> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className={`text-right font-mono text-sm ${r.status === 'Cancelled' ? 'text-muted-foreground line-through' : ''}`}>
                  {r.total}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">{r.date}, 2026</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t border-border px-4">
          <Pagination
            page={page}
            totalPages={12}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            totalItems={287}
          />
        </div>
      </Card>

      <p className="mt-8 text-xs text-muted-foreground text-center">
        Layout preview · Resize your browser to test mobile/tablet/desktop behavior.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  delta,
  mono,
}: {
  label: string;
  value: string;
  delta?: string;
  mono?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${mono ? 'font-mono' : ''}`}>{value}</p>
      {delta && <p className="mt-1 text-xs text-muted-foreground">{delta}</p>}
    </Card>
  );
}
