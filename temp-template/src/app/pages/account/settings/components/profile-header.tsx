"use client";
import React from "react";

// @material-tailwind/react
import {
  Avatar,
  Card,
  CardBody,
  Switch,
  Typography,
} from "@material-tailwind/react";

type Props = {};

export default function ProfileHeader({}: Props) {
  const [isSwitchOff, setIsSwitchOff] = React.useState(false);
  const toggleSwitch = () => setIsSwitchOff((cur) => !cur);

  return (
    <Card
      className="tw-mb-6 !tw-w-full tw-scroll-mt-4 tw-border tw-border-blue-gray-100 tw-shadow-sm"
      id="Profile"
    >
      <CardBody className="tw-flex tw-flex-col tw-justify-between tw-gap-10 md:tw-flex-row md:tw-items-center">
        <div className="tw-flex tw-items-center tw-gap-6">
          <Avatar
            src="/img/bruce-mars.jpeg"
            alt="bruce-mars"
            size="xl"
            variant="rounded"
            className="tw-shadow-lg tw-shadow-blue-gray-500/40"
          />
          <div>
            <Typography variant="h5" color="blue-gray" className="tw-mb-1">
              Alex Thompson
            </Typography>
            <Typography
              variant="small"
              className="!tw-font-semibold !tw-text-blue-gray-500"
            >
              CEO / Co-Founder
            </Typography>
          </div>
        </div>
        <div className="tw-flex tw-gap-6">
          <Typography className="tw-text-xs !tw-font-normal !tw-text-blue-gray-500">
            {isSwitchOff ? "Switch to visible" : "Switch to invisible"}
          </Typography>
          <Switch
            id="switch1"
            defaultChecked
            onChange={toggleSwitch}
            color="gray"
          />
        </div>
      </CardBody>
    </Card>
  );
}
