import React from "react";
import dynamic from "next/dynamic";

// @material-tailwind/react
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
} from "@/components/MaterialTailwind";

// @heroicons/react
import { GlobeAltIcon } from "@heroicons/react/24/outline";

// components
import StatisticChart from "./components/statistics-chart";
import BookingCards from "./components/booking-cards";
import Table from "./components/table";
import StatisticsCards from "./components/statistics-cards";

// map
const WorldMap = dynamic(() => import("./components/world-map"), {
  ssr: false,
});

export default function AnalyticsPage() {
  return (
    <div className="tw-mt-8 tw-mb-4">
      {/* Sale by Country */}
      <Card className="tw-mb-6 tw-border tw-border-blue-gray-100 tw-shadow-sm">
        <div className="tw-flex tw-items-center">
          <CardHeader
            floated={false}
            variant="gradient"
            color="gray"
            className="tw-grid tw-h-16 tw-w-16 tw-place-items-center"
          >
            <GlobeAltIcon className="tw-h-7 tw-w-7 tw-text-white" />
          </CardHeader>
          <Typography variant="h6" color="blue-gray" className="tw-mt-3">
            Sales by Country
          </Typography>
        </div>
        <CardBody className="tw-grid tw-grid-cols-1 tw-items-center tw-justify-between tw-p-4 lg:tw-grid-cols-2">
          <div className="tw-col-span-1 tw-overflow-scroll">
            <Table />
          </div>
          <WorldMap />
        </CardBody>
      </Card>

      {/* Statistics Charts */}
      <StatisticChart />

      {/* Statistics Cards */}
      <StatisticsCards />

      {/* Booking Cards */}
      <BookingCards />
    </div>
  );
}
