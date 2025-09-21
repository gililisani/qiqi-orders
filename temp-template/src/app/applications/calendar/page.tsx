import React from "react";
import dynamic from "next/dynamic";

// @material-tailwind/react
import {
  Card,
  CardHeader,
  CardBody,
  Avatar,
  Typography,
  List,
  ListItem,
  ListItemPrefix,
  IconButton,
} from "@/components/MaterialTailwind";

// @heroicons/react
import {
  PlusIcon,
  PencilIcon,
  BellAlertIcon,
  BookOpenIcon,
  TruckIcon,
  PaintBrushIcon,
} from "@heroicons/react/24/solid";

// Chart
const ProductivityChart = dynamic(
  () => import("./components/productivity-chart"),
  {
    ssr: false,
  }
);

// Calenndar
const Calendar = dynamic(() => import("./components/calendar"), {
  ssr: false,
});

// EventsCard Data
const EVENTS_CARD_DATA = [
  {
    icon: PencilIcon,
    title: "Cyber Week",
    date: "27 March 2023, at 12:30 PM",
  },
  {
    icon: BellAlertIcon,
    title: "Meeting with Marry",
    date: "24 March 2023, at 10:00 PM",
  },
  {
    icon: BookOpenIcon,
    title: "Book Deposit Hall",
    date: "25 March 2023, at 9:30 AM",
  },
  {
    icon: TruckIcon,
    title: "Shipment Deal UK",
    date: "25 March 2023, at 2:00 PM",
  },
  {
    icon: PaintBrushIcon,
    title: "Verify Dashboard Color Palette",
    date: "26 March 2023, at 9:00 AM",
  },
];

export default function CalendarPage() {
  return (
    <>
      <div className="tw-mt-14 tw-mb-6 tw-flex tw-items-center tw-ml-auto tw-mr-4 tw-gap-6 tw-w-full tw-max-w-max">
        <div className="tw-grid tw-gap-2">
          <Typography variant="small" className="!tw-text-blue-gray-500">
            Team members:
          </Typography>
          <div className="tw-flex tw-items-center -tw-space-x-4">
            <Avatar
              variant="circular"
              alt="user 1"
              size="sm"
              className="tw-border-2 tw-border-white hover:tw-z-10 focus:tw-z-10"
              src="https://images.unsplash.com/photo-1633332755192-727a05c4013d?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1480&q=80"
            />
            <Avatar
              variant="circular"
              size="sm"
              alt="user 2"
              className="tw-border-2 tw-border-white hover:tw-z-10 focus:tw-z-10"
              src="https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1061&q=80"
            />
            <Avatar
              variant="circular"
              size="sm"
              alt="user 3"
              className="tw-border-2 tw-border-white hover:tw-z-10 focus:tw-z-10"
              src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1288&q=80"
            />
            <Avatar
              variant="circular"
              size="sm"
              alt="user 4"
              className="tw-border-2 tw-border-white hover:tw-z-10 focus:tw-z-10"
              src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1287&q=80"
            />
            <Avatar
              variant="circular"
              size="sm"
              alt="user 5"
              className="tw-border-2 tw-border-white hover:tw-z-10 focus:tw-z-10"
              src="https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1760&q=80"
            />
          </div>
        </div>
        <span className="tw-h-8 tw-w-[1px] tw-bg-gray-300"></span>
        <IconButton color="gray" variant="outlined">
          <PlusIcon className="tw-h-4 tw-w-4" />
        </IconButton>
      </div>
      <div className="tw-grid md:tw-grid-cols-1 lg:tw-gap-6 lg:tw-grid-cols-3">
        <div className="lg:tw-col-span-2 tw-col-span-full tw-mb-6 tw-overflow-hidden">
          <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
            <CardBody>
              <Calendar />
            </CardBody>
          </Card>
        </div>

        <div className="tw-col-span-1 tw-grid tw-gap-6">
          <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
            <CardHeader floated={false} shadow={false} color="transparent">
              <Typography className="!tw-font-bold" color="blue-gray">
                Next events
              </Typography>
            </CardHeader>
            <CardBody className="!tw-p-0">
              <List>
                {EVENTS_CARD_DATA.map(({ icon, title, date }) => (
                  <ListItem className="tw-p-[9px]" key={title}>
                    <ListItemPrefix>
                      <div className="tw-rounded-lg tw-bg-gradient-to-tr tw-from-gray-900 tw-to-gray-800 tw-p-4 tw-shadow">
                        {React.createElement(icon, {
                          className: "tw-h-5 tw-w-5 tw-text-white",
                        })}
                      </div>
                    </ListItemPrefix>
                    <div>
                      <Typography
                        variant="small"
                        className="!tw-font-semibold"
                        color="blue-gray"
                      >
                        {title}
                      </Typography>
                      <Typography
                        variant="small"
                        className="!tw-font-normal tw-text-blue-gray-600"
                      >
                        {date}
                      </Typography>
                    </div>
                  </ListItem>
                ))}
              </List>
            </CardBody>
          </Card>

          {/* Productivity Chart **/}
          <ProductivityChart />
        </div>
      </div>
    </>
  );
}
