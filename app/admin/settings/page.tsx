'use client';

/**
 * Settings — how the Hub is configured for this business. One home for
 * product configuration (as opposed to daily-work pages): each section is a
 * module's settings (Fulfillment, Sales); pricing, payments and the
 * integration connections (NetSuite, Shopify, Amazon, ShipHero) join here as
 * they're productized.
 */

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { PageHeader } from '../../components/qq/page-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/qq/tabs';
import { FulfillmentSettings } from '../../components/admin/settings/FulfillmentSettings';
import { SalesSettings } from '../../components/admin/settings/SalesSettings';

const SECTIONS = [
  { value: 'fulfillment', label: 'Fulfillment', component: <FulfillmentSettings /> },
  { value: 'sales', label: 'Sales', component: <SalesSettings /> },
];

function SettingsTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams?.get('tab') || SECTIONS[0].value;

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="Settings"
        description="How the Hub is configured for your business."
      />
      <Tabs
        value={SECTIONS.some((s) => s.value === tab) ? tab : SECTIONS[0].value}
        onValueChange={(value) => router.replace(`/admin/settings?tab=${value}`, { scroll: false })}
      >
        <TabsList>
          {SECTIONS.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SECTIONS.map((s) => (
          <TabsContent key={s.value} value={s.value} className="pt-4">
            {s.component}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsTabs />
    </Suspense>
  );
}
