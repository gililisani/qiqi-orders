import dynamic from "next/dynamic";

// @material-tailwind/react
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
} from "@/components/MaterialTailwind";

// @components
import ProductTable from "./components/product-table";
import CountryTable from "./components/country-table";

const SalesByAge = dynamic(() => import("./components/sales-by-age"), {
  ssr: false,
});
const RevenueChart = dynamic(() => import("./components/revenue-chart"), {
  ssr: false,
});
const Channels = dynamic(() => import("./components/channels"), {
  ssr: false,
});

import SalesCard from "./components/sales-card";

export default function SalesPage() {
  return (
    <div className="tw-mt-8 tw-mb-4">
      <SalesCard />
      <div className="tw-mt-6 tw-grid tw-grid-cols-1 tw-gap-y-6 md:tw-grid-cols-2 lg:tw-grid-cols-3 lg:tw-gap-x-6">
        {/** Pie Chart */}
        <Channels />
        {/** Revenue Chart */}
        <RevenueChart />
      </div>

      {/** Horizontal Bar Chart */}
      <div className="tw-mt-6 tw-grid tw-grid-cols-1 tw-gap-y-6 md:tw-grid-cols-2 lg:tw-grid-cols-3 lg:tw-gap-6">
        <div className="tw-col-span-2">
          <SalesByAge />
        </div>
        <div className="tw-col-span-1">
          <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
            <CardHeader floated={false} shadow={false}>
              <Typography variant="h6" color="blue-gray">
                Sales by Country
              </Typography>
            </CardHeader>
            <CardBody className="tw-grid tw-grid-cols-1 tw-items-center tw-justify-between !tw-p-0">
              <CountryTable />
            </CardBody>
          </Card>
        </div>
      </div>
      <ProductTable />
    </div>
  );
}
