'use client';

/**
 * Accounts Payable (docs/AP-AUTOMATION.md): vendor invoices from the ap@
 * mailbox or uploaded here are read, matched to the vendor's learned profile,
 * approved and posted to NetSuite as vendor bills.
 */

import { useState } from 'react';
import { PageHeader } from '../../components/qq/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/qq/tabs';
import { InboxTab } from './inbox-tab';
import { VendorsTab } from './vendors-tab';
import { SettingsTab } from './settings-tab';

export default function AccountsPayablePage() {
  const [tab, setTab] = useState('inbox');
  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Accounts Payable"
        description="Vendor invoices → NetSuite bills. Forward invoices to the AP mailbox or upload them here."
      />
      <Tabs value={tab} onValueChange={setTab} className="mt-2">
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox">
          <InboxTab />
        </TabsContent>
        <TabsContent value="vendors">
          <VendorsTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
