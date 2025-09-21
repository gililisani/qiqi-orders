import React, { ReactNode } from "react";
import dynamic from "next/dynamic";

// @material-tailwind/react
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
} from "@/components/MaterialTailwind";

// @heroicons/react
import {
  ChartPieIcon,
  PresentationChartBarIcon,
  PresentationChartLineIcon,
} from "@heroicons/react/24/solid";

// components
import { color } from "@material-tailwind/react/types/components/card";
const LineChartComponent = dynamic(() => import("./components/line-chart"), {
  ssr: false,
});
const AreaChartComponent = dynamic(() => import("./components/area-chart"), {
  ssr: false,
});
const VerticalBarChartComponent = dynamic(
  () => import("./components/vertical-bar-chart"),
  {
    ssr: false,
  }
);
const HorizontalBarChartComponent = dynamic(
  () => import("./components/horizontal-bar-chart"),
  {
    ssr: false,
  }
);
const MixedChartComponent = dynamic(() => import("./components/mixed-chart"), {
  ssr: false,
});
const BubbleChartComponent = dynamic(
  () => import("./components/bubble-chart"),
  {
    ssr: false,
  }
);
const DoughnutChartComponent = dynamic(
  () => import("./components/doughnut-chart"),
  {
    ssr: false,
  }
);
const PieChartComponent = dynamic(() => import("./components/pie-chart"), {
  ssr: false,
});
const RadarChartComponent = dynamic(() => import("./components/radar-chart"), {
  ssr: false,
});
const PolarChartComponent = dynamic(() => import("./components/polar-chart"), {
  ssr: false,
});

function ChartCard({
  color,
  icon,
  title,
  description,
  children,
}: {
  color: color;
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <div className="tw-flex tw-items-center">
        <CardHeader
          floated={false}
          shadow={false}
          variant="gradient"
          color={color}
          className="tw-grid tw-h-16 tw-w-16 tw-place-items-center"
        >
          {icon}
        </CardHeader>
        <div className="tw-mt-2 tw-grid">
          <Typography variant="h6" color="blue-gray">
            {title}
          </Typography>
          <Typography variant="small" className="!tw-text-blue-gray-500">
            {description}
          </Typography>
        </div>
      </div>
      <CardBody className="tw-p-0">{children}</CardBody>
    </Card>
  );
}

export default function Charts() {
  return (
    <React.Fragment>
      <div className="tw-mt-6 tw-grid tw-grid-cols-1 tw-gap-6 md:tw-grid-cols-2 lg:tw-grid-cols-2">
        {/** Line Chart */}
        <ChartCard
          color="gray"
          title="Line Chart"
          description="Product insights"
          icon={
            <PresentationChartLineIcon className="tw-h-6 tw-w-6 tw-text-white" />
          }
        >
          <LineChartComponent />
        </ChartCard>

        {/** Area Chart */}
        <ChartCard
          color="gray"
          title="Area Chart"
          description="Visits from devices"
          icon={
            <PresentationChartLineIcon className="tw-h-6 tw-w-6 tw-text-white" />
          }
        >
          <AreaChartComponent />
        </ChartCard>
      </div>

      <div className="tw-mt-12 tw-grid tw-grid-cols-1 tw-gap-6 md:tw-grid-cols-2 lg:tw-grid-cols-2">
        {/** Bar Chart */}
        <ChartCard
          color="gray"
          title="Bar Chart"
          description="Sales related to age average"
          icon={
            <PresentationChartBarIcon className="tw-h-6 tw-w-6 tw-text-white" />
          }
        >
          <VerticalBarChartComponent />
        </ChartCard>

        {/** Horizontal Bar Chart */}
        <ChartCard
          color="gray"
          title="Bar Chart Horizontal"
          description="Sales related to age average"
          icon={
            <PresentationChartBarIcon className="tw-h-6 tw-w-6 tw-text-white" />
          }
        >
          <HorizontalBarChartComponent />
        </ChartCard>
      </div>

      <div className="tw-mt-12 tw-grid tw-grid-cols-1 tw-gap-6 md:tw-grid-cols-2 lg:tw-grid-cols-2">
        {/** Mixed Chart */}
        <ChartCard
          color="gray"
          title="Mixed Chart"
          description="Analytics Insights"
          icon={
            <PresentationChartBarIcon className="tw-h-6 tw-w-6 tw-text-white" />
          }
        >
          <MixedChartComponent />
        </ChartCard>

        {/** Bubble Chart */}
        <ChartCard
          color="gray"
          title="Bubble Chart"
          description="Users divided by regions"
          icon={
            <PresentationChartLineIcon className="tw-h-6 tw-w-6 tw-text-white" />
          }
        >
          <BubbleChartComponent />
        </ChartCard>
      </div>

      <div className="tw-mt-12 tw-grid tw-grid-cols-1 tw-gap-6 md:tw-grid-cols-2 lg:tw-grid-cols-2">
        {/** Doughnut Chart */}
        <ChartCard
          color="gray"
          title="Doughnut Chart"
          description="Affiliates program"
          icon={<ChartPieIcon className="tw-h-6 tw-w-6 tw-text-white" />}
        >
          <div className="tw-mb-4">
            <DoughnutChartComponent />
          </div>
        </ChartCard>

        {/** Pie Chart */}
        <ChartCard
          color="gray"
          title="Pie Chart"
          description="Analytics Insights"
          icon={<ChartPieIcon className="tw-h-6 tw-w-6 tw-text-white" />}
        >
          <div className="mb-4">
            <PieChartComponent />
          </div>
        </ChartCard>
      </div>

      <div className="tw-mt-12 tw-mb-4 tw-grid tw-grid-cols-1 tw-gap-6 md:tw-grid-cols-2 lg:tw-grid-cols-2">
        {/** Radar Chart */}
        <ChartCard
          color="gray"
          title="Radar Chart"
          description="Apps score"
          icon={<ChartPieIcon className="tw-h-6 tw-w-6 tw-text-white" />}
        >
          <RadarChartComponent />
        </ChartCard>

        {/** Polar Chart */}
        <ChartCard
          color="gray"
          title="Polar Chart"
          description="Analytics insights"
          icon={<ChartPieIcon className="tw-h-6 tw-w-6 tw-text-white" />}
        >
          <PolarChartComponent />
        </ChartCard>
      </div>
    </React.Fragment>
  );
}
