"use client";
import React from "react";

// @material-tailwind/react
import {
  Card,
  CardBody,
  CardHeader,
  Switch,
  Typography,
} from "@material-tailwind/react";

// @heroicons/react
import { LightBulbIcon } from "@heroicons/react/24/solid";

type Props = {};

export default function LightCard({}: Props) {
  const [isLightOn, setIsLightOn] = React.useState(false);
  const toggleLight = () => setIsLightOn((cur) => !cur);

  return (
    <Card
      variant="gradient"
      className="tw-flex tw-max-w-md tw-flex-col tw-justify-between lg:tw-w-full tw-border tw-border-blue-gray-100 tw-shadow-sm"
      color={isLightOn ? "gray" : "white"}
    >
      <CardHeader
        floated={false}
        shadow={false}
        color="transparent"
        className="tw-overflow-visible tw-rounded-none"
      >
        <div className="tw-flex tw-justify-between">
          <Typography
            className={`!tw-font-normal tw-transition-colors ${
              isLightOn ? "tw-text-white" : "!tw-text-blue-gray-500"
            }`}
          >
            {isLightOn ? "On" : "Off"}
          </Typography>
          <Switch
            checked={isLightOn}
            onChange={toggleLight}
            color={isLightOn ? "blue-gray" : "blue"}
          />
        </div>
      </CardHeader>
      <CardBody className="tw-p-4">
        <LightBulbIcon className="tw-h-10 tw-w-10" color="blue-gray" />
        <Typography
          className={`!tw-font-normal tw-transition-colors ${
            isLightOn ? "tw-text-white" : "tw-text-gray-900"
          }`}
        >
          Lights
        </Typography>
      </CardBody>
    </Card>
  );
}
