'use client';

/**
 * Qiqi UI — design preview.
 * Visit /dev/components on the deployed site.
 */

import { useState } from 'react';
import { Inbox, MoreVertical, Edit, Trash, Plus, Settings, Search } from 'lucide-react';
import { Button } from '../../components/qq/button';
import { Input } from '../../components/qq/input';
import { Label } from '../../components/qq/label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../../components/qq/card';
import { Badge } from '../../components/qq/badge';
import { Alert, AlertTitle, AlertDescription } from '../../components/qq/alert';
import { Separator } from '../../components/qq/separator';
import { Skeleton } from '../../components/qq/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../../components/qq/table';
import { StatusBadge, type OrderStatus } from '../../components/qq/status-badge';
import { SupportFundBadge } from '../../components/qq/support-fund-badge';
import { EmptyState } from '../../components/qq/empty-state';
import { PageHeader } from '../../components/qq/page-header';
import { Pagination } from '../../components/qq/pagination';
import { FormField } from '../../components/qq/form-field';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/qq/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/qq/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/qq/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/qq/select';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/qq/avatar';
import { useToast } from '../../components/ui/ToastProvider';
import { useConfirm } from '../../components/ui/ConfirmProvider';

const ORDER_STATUSES: OrderStatus[] = ['Draft', 'Open', 'In Process', 'Ready', 'Done', 'Cancelled'];

export default function DesignPreviewPage() {
  const [email, setEmail] = useState('');
  const [page, setPage] = useState(3);
  const [pageSize, setPageSize] = useState(25);
  const toast = useToast();
  const confirm = useConfirm();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">Qiqi UI</h1>
            <p className="text-xs text-muted-foreground">Design system preview · Phase 2a</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="accent">v0.2</Badge>
            <Avatar>
              <AvatarFallback>GL</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-16">
        {/* ===================================================================== */}
        {/* PAGE HEADER                                                            */}
        {/* ===================================================================== */}
        <Section title="Page header" subtitle="Standard top-of-page block">
          <Card>
            <CardContent className="pt-6">
              <PageHeader
                breadcrumbs={
                  <>
                    <span>Admin</span> <span className="mx-1.5">/</span> <span>Orders</span>
                  </>
                }
                title="Orders"
                description="Manage incoming orders from your distributors."
                actions={
                  <>
                    <Button variant="outline" size="sm">
                      <Search className="h-4 w-4" />
                      Filter
                    </Button>
                    <Button size="sm">
                      <Plus className="h-4 w-4" />
                      New order
                    </Button>
                  </>
                }
              />
            </CardContent>
          </Card>
        </Section>

        {/* ===================================================================== */}
        {/* COLORS                                                                 */}
        {/* ===================================================================== */}
        <Section title="Colors" subtitle="Brand palette + semantic tokens">
          <div>
            <h3 className="text-sm font-medium mb-3 text-muted-foreground">Brand</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Swatch name="Black" hex="#000000" className="bg-brand-black text-white" />
              <Swatch name="White" hex="#FFFFFF" className="bg-brand-white text-foreground border border-border" />
              <Swatch name="Gunmetal" hex="#464B4F" className="bg-brand-gunmetal text-white" />
              <Swatch name="Periwinkle" hex="#605CE1" className="bg-brand-periwinkle text-white" />
              <Swatch name="Periwinkle 50%" hex="#AFAEEA" className="bg-brand-periwinkle-100 text-foreground" />
              <Swatch name="Periwinkle 25%" hex="#D7D6F5" className="bg-brand-periwinkle-50 text-foreground" />
              <Swatch name="Magenta" hex="#FF2C9E" className="bg-brand-magenta text-white" />
              <Swatch name="Magenta 25%" hex="#F6CCE4" className="bg-brand-magenta-50 text-foreground" />
            </div>
          </div>
        </Section>

        {/* ===================================================================== */}
        {/* TYPOGRAPHY                                                             */}
        {/* ===================================================================== */}
        <Section title="Typography" subtitle="ABC P3rman3nt (display) + Newsreader (serif accent)">
          <div className="space-y-4">
            <TypographyRow label="Display 4xl bold">
              <p className="text-4xl font-bold tracking-tight">Qiqi Partners Hub</p>
            </TypographyRow>
            <TypographyRow label="Display 2xl semibold">
              <p className="text-2xl font-semibold tracking-tight">Section heading</p>
            </TypographyRow>
            <TypographyRow label="Body base">
              <p className="text-base">The quick brown fox jumps over the lazy dog.</p>
            </TypographyRow>
            <TypographyRow label="Body small muted">
              <p className="text-sm text-muted-foreground">Auxiliary text — captions, helper messages.</p>
            </TypographyRow>
            <TypographyRow label="Serif accent (Newsreader)">
              <p className="font-serif text-2xl">A quiet, editorial moment.</p>
            </TypographyRow>
            <TypographyRow label="Mono">
              <p className="font-mono text-sm">FPS0025-CASE · INV-273949</p>
            </TypographyRow>
          </div>
        </Section>

        {/* ===================================================================== */}
        {/* BUTTONS                                                                */}
        {/* ===================================================================== */}
        <Section title="Buttons" subtitle="Variants × sizes × with icon">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Default</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="accent">Accent</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="settings"><Settings className="h-4 w-4" /></Button>
              <Button disabled>Disabled</Button>
              <Button><Plus className="h-4 w-4" /> With icon</Button>
            </div>
          </div>
        </Section>

        {/* ===================================================================== */}
        {/* FORM FIELDS                                                            */}
        {/* ===================================================================== */}
        <Section title="Form fields" subtitle="Label + input + helper + error pattern">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
            <FormField label="Email" required helper="We'll never spam you.">
              <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <FormField label="Password">
              <Input type="password" placeholder="••••••••" />
            </FormField>
            <FormField label="Locked" helper="This field is read-only.">
              <Input disabled defaultValue="locked-value" />
            </FormField>
            <FormField label="With error" error="This field is required." required>
              <Input className="border-destructive focus-visible:ring-destructive" />
            </FormField>
          </div>
        </Section>

        {/* ===================================================================== */}
        {/* SELECT                                                                 */}
        {/* ===================================================================== */}
        <Section title="Select & Dropdown" subtitle="Native Radix-powered, fully accessible">
          <div className="flex flex-wrap items-end gap-6">
            <div className="w-64">
              <Label>Subsidiary</Label>
              <div className="mt-1.5">
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a subsidiary…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inc">Qiqi INC.</SelectItem>
                    <SelectItem value="global">Qiqi Global Ltd.</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="row actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem><Edit className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                <DropdownMenuItem><Plus className="h-4 w-4 mr-2" />Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive">
                  <Trash className="h-4 w-4 mr-2" />Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Section>

        {/* ===================================================================== */}
        {/* TABS                                                                   */}
        {/* ===================================================================== */}
        <Section title="Tabs" subtitle="In-page navigation">
          <Tabs defaultValue="details" className="max-w-2xl">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>
            <TabsContent value="details">
              <p className="text-sm text-muted-foreground">Order details panel content.</p>
            </TabsContent>
            <TabsContent value="items">
              <p className="text-sm text-muted-foreground">Order line items.</p>
            </TabsContent>
            <TabsContent value="history">
              <p className="text-sm text-muted-foreground">Status change log.</p>
            </TabsContent>
            <TabsContent value="documents">
              <p className="text-sm text-muted-foreground">Attached files.</p>
            </TabsContent>
          </Tabs>
        </Section>

        {/* ===================================================================== */}
        {/* STATUS + SUPPORT FUND BADGES                                           */}
        {/* ===================================================================== */}
        <Section title="Status badges" subtitle="One per order status, plus support funds">
          <div className="flex flex-wrap gap-2 mb-6">
            {ORDER_STATUSES.map((s) => <StatusBadge key={s} status={s} />)}
          </div>

          <div className="flex flex-wrap gap-2">
            <SupportFundBadge percent={10} amount="$960" />
            <SupportFundBadge percent={5} amount="$120" />
            <SupportFundBadge percent={15} />
          </div>
        </Section>

        {/* ===================================================================== */}
        {/* CARDS + DASHBOARD STATS                                                */}
        {/* ===================================================================== */}
        <Section title="Cards" subtitle="Dashboard stat tiles">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardDescription>Total orders</CardDescription>
                <CardTitle className="text-3xl">147</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-emerald-600">+12 from last month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Open orders</CardDescription>
                <CardTitle className="text-3xl">23</CardTitle>
              </CardHeader>
              <CardFooter>
                <Button variant="link" size="sm" className="px-0">View all →</Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Revenue · QTD</CardDescription>
                <CardTitle className="text-3xl font-mono">$284,512</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </Section>

        {/* ===================================================================== */}
        {/* ALERTS                                                                 */}
        {/* ===================================================================== */}
        <Section title="Alerts" subtitle="Inline messages">
          <div className="space-y-4 max-w-2xl">
            <Alert>
              <AlertTitle>Default</AlertTitle>
              <AlertDescription>Neutral message with no urgency.</AlertDescription>
            </Alert>
            <Alert variant="info">
              <AlertTitle>Info</AlertTitle>
              <AlertDescription>A 6-digit code is on its way. Check your inbox.</AlertDescription>
            </Alert>
            <Alert variant="success">
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>Order pushed to NetSuite as SO-273949.</AlertDescription>
            </Alert>
            <Alert variant="warning">
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>This client has no NetSuite Internal ID set.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTitle>Cannot delete</AlertTitle>
              <AlertDescription>This invoice has a payment applied. Reverse it in NetSuite first.</AlertDescription>
            </Alert>
          </div>
        </Section>

        {/* ===================================================================== */}
        {/* TABLE + PAGINATION                                                     */}
        {/* ===================================================================== */}
        <Section title="Table + pagination" subtitle="Realistic order list">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Support fund</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono">UBO5X0</TableCell>
                  <TableCell>For testing DISTRIBUTOR</TableCell>
                  <TableCell><StatusBadge status="In Process" /></TableCell>
                  <TableCell><SupportFundBadge percent={10} amount="$945" /></TableCell>
                  <TableCell className="text-right font-mono">$9,705.00</TableCell>
                  <TableCell className="text-muted-foreground text-sm">May 16, 2026</TableCell>
                  <TableCell><RowActions /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono">XK3M91</TableCell>
                  <TableCell>ADI SRL</TableCell>
                  <TableCell><StatusBadge status="Done" /></TableCell>
                  <TableCell><SupportFundBadge percent={5} amount="$240" /></TableCell>
                  <TableCell className="text-right font-mono">$24,100.00</TableCell>
                  <TableCell className="text-muted-foreground text-sm">May 14, 2026</TableCell>
                  <TableCell><RowActions /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono">A7BX2P</TableCell>
                  <TableCell>Salon Group LLC</TableCell>
                  <TableCell><StatusBadge status="Ready" /></TableCell>
                  <TableCell><SupportFundBadge percent={10} /></TableCell>
                  <TableCell className="text-right font-mono">$3,420.00</TableCell>
                  <TableCell className="text-muted-foreground text-sm">May 11, 2026</TableCell>
                  <TableCell><RowActions /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-muted-foreground">DRAFT</TableCell>
                  <TableCell>Studio K</TableCell>
                  <TableCell><StatusBadge status="Draft" /></TableCell>
                  <TableCell>—</TableCell>
                  <TableCell className="text-right font-mono">$1,275.00</TableCell>
                  <TableCell className="text-muted-foreground text-sm">May 8, 2026</TableCell>
                  <TableCell><RowActions /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono">QP9KX2</TableCell>
                  <TableCell>Curl Co.</TableCell>
                  <TableCell><StatusBadge status="Cancelled" /></TableCell>
                  <TableCell>—</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground line-through">$2,100.00</TableCell>
                  <TableCell className="text-muted-foreground text-sm">May 7, 2026</TableCell>
                  <TableCell><RowActions /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <Separator />
            <div className="px-4">
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
        </Section>

        {/* ===================================================================== */}
        {/* EMPTY STATE                                                            */}
        {/* ===================================================================== */}
        <Section title="Empty state" subtitle="When a list has no data">
          <EmptyState
            icon={<Inbox />}
            title="No orders yet"
            description="When distributors place orders, they'll show up here."
            action={<Button>Create order</Button>}
          />
        </Section>

        {/* ===================================================================== */}
        {/* DIALOG                                                                 */}
        {/* ===================================================================== */}
        <Section title="Dialog" subtitle="Full modal — for multi-input forms (use Confirm for yes/no)">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit company</DialogTitle>
                <DialogDescription>Make changes to the company profile.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <FormField label="Company name" required>
                  <Input defaultValue="Qiqi INC." />
                </FormField>
                <FormField label="NetSuite Internal ID">
                  <Input defaultValue="2023" />
                </FormField>
              </div>
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Section>

        {/* ===================================================================== */}
        {/* TOAST + CONFIRM (restyled)                                             */}
        {/* ===================================================================== */}
        <Section title="Toasts + Confirm" subtitle="Restyled with new tokens">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => toast.success('Order pushed to NetSuite as SO-273949.')}>
              Show success toast
            </Button>
            <Button variant="outline" onClick={() => toast.error('Could not delete order.')}>
              Show error toast
            </Button>
            <Button variant="outline" onClick={() => toast.info('A 6-digit code is on its way.')}>
              Show info toast
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Delete order and NetSuite records?',
                  description: 'This will also delete:',
                  bullets: [
                    { label: 'NetSuite Invoice INV-12345', href: 'https://example.com' },
                    { label: 'NetSuite Sales Order SO-67890', href: 'https://example.com' },
                  ],
                  warning: 'If the invoice has a payment applied, deletion will be blocked.',
                  variant: 'danger',
                  requireExplicitConfirm: true,
                  confirmLabel: 'Delete from Hub + NetSuite',
                });
                if (ok) toast.success('(would delete now)');
              }}
            >
              Show confirm dialog
            </Button>
          </div>
        </Section>

        {/* ===================================================================== */}
        {/* SKELETON                                                               */}
        {/* ===================================================================== */}
        <Section title="Skeleton" subtitle="Loading placeholders">
          <Card>
            <CardContent className="pt-6 space-y-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </CardContent>
          </Card>
        </Section>

        <div className="text-center pt-8 pb-16">
          <Separator className="mb-8" />
          <p className="text-xs text-muted-foreground">
            Phase 2a — composed components. Next: Phase 2b (layout shell + responsive) and 2c (wireframes).
          </p>
        </div>
      </main>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Local helpers (only used by this preview page)
// -----------------------------------------------------------------------------
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Swatch({ name, hex, className }: { name: string; hex: string; className: string }) {
  return (
    <div className={`rounded-md p-4 h-24 flex flex-col justify-between ${className}`}>
      <span className="text-xs font-medium">{name}</span>
      <span className="text-xs font-mono opacity-70">{hex}</span>
    </div>
  );
}

function TypographyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      {children}
    </div>
  );
}

function RowActions() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="row actions">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem><Edit className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
        <DropdownMenuItem><Plus className="h-4 w-4 mr-2" />Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive">
          <Trash className="h-4 w-4 mr-2" />Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
