// @material-tailwind/react
import { Tabs, TabsHeader, Tab } from "@/components/MaterialTailwind";

// components
import BillingInformation from "./components/billing-information";
import Invoices from "./components/invoices";
import InfoCards from "./components/info-cards";
import MasterCardComponent from "./components/master-card";
import PaymentMethods from "./components/payment-methods";
import TransactionsCard from "./components/transaction-card";

export default function Billing() {
  return (
    <div className="tw-mb-6 tw-w-full">
      <div className="tw-mt-8">
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-6">
          <div className="tw-w-full lg:tw-w-4/12">
            {/* Tabs */}
            <Tabs id="billing-tab" value="message">
              <TabsHeader>
                <Tab value="message">Message</Tab>
                <Tab value="social">Social</Tab>
                <Tab value="notifications">Notifications</Tab>
                <Tab value="backup">Backup</Tab>
              </TabsHeader>
            </Tabs>
          </div>
        </div>
      </div>

      <div className="tw-mt-8 tw-grid tw-grid-cols-1 tw-gap-y-6 lg:tw-grid-cols-3 lg:tw-gap-x-6">
        <div className="tw-col-span-2 tw-grid tw-gap-6">
          <div className="tw-col-span-2 tw-grid tw-w-full tw-grid-cols-1 tw-gap-6 xl:tw-grid-cols-2">
            {/* Master Card */}
            <div className="tw-relative tw-col-span-1">
              <MasterCardComponent />
            </div>
            {/* Info Card */}
            <InfoCards />
          </div>
          {/* Payment Card */}
          <PaymentMethods />
        </div>

        {/* Invoice Card */}
        <Invoices />
      </div>

      <div className="tw-mt-6 tw-grid tw-grid-cols-1 md:tw-grid-cols-2 lg:tw-grid-cols-5 lg:tw-gap-x-6 tw-gap-y-6">
        <BillingInformation />
        {/* Transaction Card */}
        <TransactionsCard />
      </div>
    </div>
  );
}
