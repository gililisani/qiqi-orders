import React from "react";
import dynamic from "next/dynamic";

// @material-tailwind/react
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
  Chip,
} from "@/components/MaterialTailwind";

// @heroicons/react
import { ArrowUturnRightIcon } from "@heroicons/react/24/solid";

// components
const TaskChart = dynamic(() => import("./components/task-chart"), {
  ssr: false,
});
const CaloriesChart = dynamic(() => import("./components/calories-chart"), {
  ssr: false,
});
const Calendar = dynamic(() => import("./components/calendar"), {
  ssr: false,
});
import LightCard from "./components/light-card";
import MusicPlayer from "./components/music-player";
import Categories from "./components/categories";
import OrdersOverview from "./components/orders-overview";
import EventsCard from "./components/events-card";
import MasterCardComponent from "../account/billing/components/master-card";
import InfoCards from "../account/billing/components/info-cards";
import MiniCards from "./components/mini-cards";

export default function Widgets() {
  return (
    <React.Fragment>
      <div className="tw-mt-8 tw-grid tw-gap-6 md:tw-grid-cols-1 lg:tw-grid-cols-3">
        <div className="lg:tw-col-span-1 ">
          {/* Events Card */}
          <EventsCard />
        </div>

        <TaskChart />
      </div>

      <div className="tw-grid tw-gap-6 lg:tw-grid-cols-6">
        {/* Mini Card */}
        <MiniCards />

        {/* Info Card */}
        <div className="tw-col-span-2 tw-h-fit tw-w-full">
          <div className="tw-flex tw-gap-6">
            <InfoCards />
          </div>
        </div>

        {/* Master Card */}
        <div className="tw-relative tw-col-span-2 tw-w-full">
          <MasterCardComponent />
        </div>
      </div>

      <div className="tw-mt-6 tw-grid tw-gap-6 sm:tw-grid-cols-3 md:tw-grid-cols-2 lg:tw-grid-cols-5">
        {/* FullBody Card **/}
        <Card className="tw-max-w-md lg:tw-w-full tw-border tw-border-blue-gray-100 tw-shadow-sm">
          <CardHeader
            floated={false}
            shadow={false}
            color="transparent"
            className="tw-rounded-none"
          >
            <div className="tw-flex tw-items-center tw-justify-between">
              <Typography variant="h6" color="blue-gray">
                Full Body
              </Typography>
              <Chip value="moderate" size="sm" variant="ghost" />
            </div>
          </CardHeader>
          <CardBody className="tw-pt-6 tw-px-4">
            <Typography className="!tw-font-normal !tw-text-blue-gray-500">
              What matters is the people who are sparked by it. And the people
              who are liked.
            </Typography>
          </CardBody>
        </Card>

        <LightCard />
        <CaloriesChart />

        {/* Location Card **/}
        <Card className="tw-flex tw-max-w-md tw-flex-col tw-justify-between lg:tw-w-full tw-border tw-border-blue-gray-100 tw-shadow-sm">
          <CardHeader
            floated={false}
            shadow={false}
            className="tw-grid tw-h-14 tw-w-14 tw-place-items-center tw-overflow-visible"
            variant="gradient"
            color="gray"
          >
            <ArrowUturnRightIcon className="tw-h-6 tw-w-6 tw-text-white" />
          </CardHeader>
          <CardBody className="tw-p-4">
            <div className="tw-flex tw-flex-col tw-gap-1">
              <div className="tw-flex tw-items-end tw-gap-1">
                <Typography variant="h5" color="blue-gray">
                  754
                </Typography>
                <Typography
                  variant="small"
                  className="!tw-font-semibold !tw-text-blue-gray-500"
                >
                  m
                </Typography>
              </div>
              <Typography className="!tw-text-blue-gray-500 !tw-font-normal">
                New York City
              </Typography>
            </div>
          </CardBody>
        </Card>

        {/* Steps Card **/}
        <Card className="tw-flex tw-max-w-full tw-flex-col tw-justify-between lg:tw-w-full tw-border tw-border-blue-gray-100 tw-shadow-sm">
          <CardHeader floated={false} shadow={false} color="transparent">
            <Typography variant="h6" color="blue-gray">
              Steps
            </Typography>
          </CardHeader>
          <CardBody className="tw-p-4">
            <Typography variant="h3" color="blue-gray">
              11.4K
            </Typography>
            <Chip
              value="+4.3%"
              className="tw-mt-3 tw-w-max"
              color="green"
              variant="ghost"
              size="sm"
            />
          </CardBody>
        </Card>
      </div>

      <div className="tw-mt-6 tw-mb-4 tw-grid tw-gap-6 md:tw-grid-cols-1 lg:tw-grid-cols-3">
        <Calendar />
        <div className="tw-justify-items-between tw-grid tw-max-w-full lg:tw-gap-x-6 tw-gap-y-6 tw-w-full">
          <Categories />
          <MusicPlayer />
        </div>

        {/* Orders Overvew Card **/}
        <OrdersOverview />
      </div>
    </React.Fragment>
  );
}
