"use client";

// @material-tailwind/react
import {
  Card,
  CardBody,
  CardHeader,
  Menu,
  MenuHandler,
  MenuItem,
  MenuList,
  Typography,
} from "@material-tailwind/react";

// Chart
import { AreaChart } from "@/widgets/charts";

// icon
import { ArrowUpIcon } from "@heroicons/react/24/outline";
import { EllipsisHorizontalIcon } from "@heroicons/react/24/solid";

type Props = {};

export default function ProductivityChart({}: Props) {
  return (
    <Card className="tw-w-full tw-h-max tw-overflow-hidden" color="gray">
      <CardHeader floated={false} shadow={false} color="transparent">
        <div className="tw-flex tw-justify-between tw-items-center">
          <Typography variant="h6" className="tw-text-white">
            Productivity
          </Typography>
          <Menu placement="left-end">
            <MenuHandler>
              <EllipsisHorizontalIcon className="tw-h-7 tw-w-7 tw-text-white" />
            </MenuHandler>
            <MenuList>
              <MenuItem>Action</MenuItem>
              <MenuItem>Another action</MenuItem>
              <MenuItem>Something else</MenuItem>
            </MenuList>
          </Menu>
        </div>

        <div className="tw-flex tw-gap-2 tw-items-center">
          <ArrowUpIcon
            className="tw-h-3 tw-w-3 tw-text-green-500"
            strokeWidth={5}
          />
          <Typography variant="small" className="!tw-font-bold" color="white">
            4% More in
          </Typography>
          <Typography variant="small" className="!tw-font-normal" color="white">
            2023
          </Typography>
        </div>
      </CardHeader>
      <CardBody className="!tw-p-0 tw-scale-105 tw-translate-y-1">
        <AreaChart
          height={120}
          colors={["#fff"]}
          series={[
            {
              name: "Calories",
              data: [50, 100, 200, 190, 400, 350, 500, 450, 700],
            },
          ]}
          options={{
            grid: {
              show: false,
              padding: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              },
            },
            chart: {
              parentHeightOffset: 0,
            },
            yaxis: { show: false },
            xaxis: { labels: { show: false, maxHeight: 0 } },
          }}
        />
      </CardBody>
    </Card>
  );
}
