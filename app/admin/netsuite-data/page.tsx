'use client';

/**
 * NetSuite Data — the six NS reference-data sections (formerly six separate
 * menu pages) merged into one tabbed page. Each tab renders the existing
 * page component unchanged, so all list/add/edit functionality is preserved;
 * the old routes (/admin/subsidiaries etc.) remain alive for bookmarks and
 * for the add/edit sub-pages, they're just no longer in the menu.
 *
 * Deliberately NOT pulling this data live from NetSuite: it changes a few
 * times a year and is referenced across companies/orders/RLS. If needed
 * later, add a per-tab "Refresh from NetSuite" action.
 */

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/qq/tabs';
import SubsidiariesPage from '../subsidiaries/page';
import LocationsPage from '../locations/page';
import ClassesPage from '../classes/page';
import IncotermsPage from '../incoterms/page';
import PaymentTermsPage from '../payment-terms/page';
import SupportFundsPage from '../support-funds/page';

const TABS = [
  { value: 'subsidiaries', label: 'Subsidiaries', component: <SubsidiariesPage /> },
  { value: 'locations', label: 'Locations', component: <LocationsPage /> },
  { value: 'classes', label: 'Classes', component: <ClassesPage /> },
  { value: 'incoterms', label: 'Incoterms', component: <IncotermsPage /> },
  { value: 'payment-terms', label: 'Payment Terms', component: <PaymentTermsPage /> },
  { value: 'support-funds', label: 'Support Funds', component: <SupportFundsPage /> },
];

function NetSuiteDataTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams?.get('tab') || 'subsidiaries';

  return (
    <div className="px-6 pt-8">
      <h1 className="text-xl font-semibold mb-1">NetSuite Data</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Reference data the Hub maps against NetSuite — entities, locations, classes, and terms.
      </p>
      <Tabs
        value={TABS.some((t) => t.value === tab) ? tab : 'subsidiaries'}
        onValueChange={(value) => router.replace(`/admin/netsuite-data?tab=${value}`, { scroll: false })}
      >
        <TabsList className="w-full overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {/* Each section is the original page component — it brings its own
                header, search, and actions. Negative top padding compensates
                for the page container inside it. */}
            <div className="-mx-6 -mt-4">{t.component}</div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default function NetSuiteDataPage() {
  return (
    <Suspense>
      <NetSuiteDataTabs />
    </Suspense>
  );
}
