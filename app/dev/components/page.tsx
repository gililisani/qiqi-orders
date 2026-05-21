'use client';

/**
 * Qiqi UI — design preview.
 *
 * This page is the canonical reference for every primitive in the new design
 * system. Visit /dev/components to see how everything looks together.
 *
 * Phase 2 will add composed patterns (PageHeader, EmptyState, DataTable, etc.)
 * to this same page. Phase 3 will start converting real app pages to use these
 * primitives, page by page.
 */

import { useState } from 'react';
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

export default function DesignPreviewPage() {
  const [email, setEmail] = useState('');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">Qiqi UI</h1>
            <p className="text-xs text-muted-foreground">Design system preview · Phase 1</p>
          </div>
          <Badge variant="accent">v0.1</Badge>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-16">
        {/* ====================================================================== */}
        {/* COLORS                                                                  */}
        {/* ====================================================================== */}
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

          <div className="mt-8">
            <h3 className="text-sm font-medium mb-3 text-muted-foreground">Semantic</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Swatch name="background" hex="—" className="bg-background border border-border text-foreground" />
              <Swatch name="card" hex="—" className="bg-card border border-border text-card-foreground" />
              <Swatch name="primary" hex="—" className="bg-primary text-primary-foreground" />
              <Swatch name="secondary" hex="—" className="bg-secondary text-secondary-foreground" />
              <Swatch name="accent" hex="—" className="bg-accent text-accent-foreground" />
              <Swatch name="destructive" hex="—" className="bg-destructive text-destructive-foreground" />
              <Swatch name="muted" hex="—" className="bg-muted text-muted-foreground" />
              <Swatch name="border" hex="—" className="bg-background border-2 border-border text-foreground" />
            </div>
          </div>
        </Section>

        {/* ====================================================================== */}
        {/* TYPOGRAPHY                                                              */}
        {/* ====================================================================== */}
        <Section title="Typography" subtitle="ABC P3rman3nt (display) + Newsreader (serif accent)">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Display 4xl</p>
              <p className="text-4xl font-bold tracking-tight">Qiqi Partners Hub</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Display 2xl</p>
              <p className="text-2xl font-semibold tracking-tight">Section heading</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Body base</p>
              <p className="text-base">
                The quick brown fox jumps over the lazy dog. Distributors place orders, admins review,
                NetSuite syncs the data downstream.
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Body small (muted)</p>
              <p className="text-sm text-muted-foreground">
                Auxiliary text — captions, helper messages, table footnotes.
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Serif accent (Newsreader)</p>
              <p className="font-serif text-2xl">A quiet, editorial moment.</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Mono</p>
              <p className="font-mono text-sm">FPS0025-CASE · INV-273949</p>
            </div>
          </div>
        </Section>

        {/* ====================================================================== */}
        {/* BUTTONS                                                                 */}
        {/* ====================================================================== */}
        <Section title="Buttons" subtitle="Variants × sizes">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Default</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="accent">Accent (Periwinkle)</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="icon">✕</Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
        </Section>

        {/* ====================================================================== */}
        {/* INPUTS                                                                  */}
        {/* ====================================================================== */}
        <Section title="Inputs" subtitle="Default form controls">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="disabled">Disabled</Label>
              <Input id="disabled" placeholder="Read only" disabled value="locked-value" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="error">With error</Label>
              <Input
                id="error"
                className="border-destructive focus-visible:ring-destructive"
                placeholder="Required"
              />
              <p className="text-xs text-destructive">This field is required.</p>
            </div>
          </div>
        </Section>

        {/* ====================================================================== */}
        {/* CARDS                                                                   */}
        {/* ====================================================================== */}
        <Section title="Cards" subtitle="Surface containers">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Total Orders</CardTitle>
                <CardDescription>Last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">147</p>
                <p className="text-xs text-muted-foreground mt-1">+12 from last month</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Open Orders</CardTitle>
                <CardDescription>Awaiting action</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">23</p>
              </CardContent>
              <CardFooter>
                <Button variant="outline" size="sm">View all</Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Revenue</CardTitle>
                <CardDescription>Quarter to date</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold font-mono">$284,512</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ====================================================================== */}
        {/* BADGES                                                                  */}
        {/* ====================================================================== */}
        <Section title="Badges" subtitle="Status indicators">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="muted">Muted</Badge>
            <Badge variant="accent">Active</Badge>
            <Badge variant="destructive">Cancelled</Badge>
            <Badge variant="success">Done</Badge>
            <Badge variant="warning">In Process</Badge>
          </div>
        </Section>

        {/* ====================================================================== */}
        {/* ALERTS                                                                  */}
        {/* ====================================================================== */}
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

        {/* ====================================================================== */}
        {/* TABLE                                                                   */}
        {/* ====================================================================== */}
        <Section title="Table" subtitle="Data display">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono">UBO5X0</TableCell>
                  <TableCell>For testing DISTRIBUTOR</TableCell>
                  <TableCell><Badge variant="warning">In Process</Badge></TableCell>
                  <TableCell className="text-right font-mono">$9,705.00</TableCell>
                  <TableCell className="text-muted-foreground text-sm">May 16, 2026</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono">XK3M91</TableCell>
                  <TableCell>ADI SRL</TableCell>
                  <TableCell><Badge variant="success">Done</Badge></TableCell>
                  <TableCell className="text-right font-mono">$24,100.00</TableCell>
                  <TableCell className="text-muted-foreground text-sm">May 14, 2026</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono">A7BX2P</TableCell>
                  <TableCell>Salon Group LLC</TableCell>
                  <TableCell><Badge variant="accent">Ready</Badge></TableCell>
                  <TableCell className="text-right font-mono">$3,420.00</TableCell>
                  <TableCell className="text-muted-foreground text-sm">May 11, 2026</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono">DRAFT</TableCell>
                  <TableCell>Studio K</TableCell>
                  <TableCell><Badge variant="muted">Draft</Badge></TableCell>
                  <TableCell className="text-right font-mono">$1,275.00</TableCell>
                  <TableCell className="text-muted-foreground text-sm">May 8, 2026</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </Section>

        {/* ====================================================================== */}
        {/* SKELETON                                                                */}
        {/* ====================================================================== */}
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
            Phase 1 — foundation. Sign off and we move to Phase 2 (composed patterns) and Phase 3 (page conversions).
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
