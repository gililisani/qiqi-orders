"use client";
import React from "react";

// @material-tailwind/react
import {
  Card,
  CardBody,
  Input,
  Typography,
  Select,
  Option,
  CardHeader,
  Popover,
  PopoverHandler,
  PopoverContent,
} from "@/components/MaterialTailwind";

// day picker
import { format } from "date-fns";
import { DayPicker } from "react-day-picker";

// @heroicons/react
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";

type Props = {};

export default function BasicInfo({}: Props) {
  const [date, setDate] = React.useState();

  return (
    <Card
      className="tw-mb-6 tw-scroll-mt-4 tw-border tw-border-blue-gray-100 tw-shadow-sm"
      id="Basic Info"
    >
      <CardHeader shadow={false} floated={false}>
        <Typography variant="h5" color="blue-gray">
          Basic Info
        </Typography>
      </CardHeader>
      <CardBody className="tw-flex tw-flex-col">
        <div className="tw-mb-6 tw-flex tw-flex-col tw-items-end tw-gap-6 md:tw-flex-row">
          <Input label="First Name" />
          <Input label="Last Name" />
        </div>
        <div className="tw-mb-6 tw-flex tw-flex-col tw-gap-6 md:tw-flex-row">
          <Select
            label="I'm"
            containerProps={{
              className: "tw-min-w-max",
            }}
          >
            <Option>Male</Option>
            <Option>Female</Option>
          </Select>
          <div>
            <Popover placement="bottom">
              <PopoverHandler>
                <Input
                  label="Select a Date"
                  onChange={() => null}
                  value={date ? format(date, "PPP") : ""}
                />
              </PopoverHandler>
              <PopoverContent>
                <DayPicker
                  mode="single"
                  selected={date}
                  onSelect={(value) => setDate(value as any)}
                  showOutsideDays
                  className="tw-border-0"
                  classNames={{
                    caption:
                      "tw-flex tw-justify-center tw-py-2 tw-mb-4 tw-relative tw-items-center",
                    caption_label: "tw-text-sm !font-medium tw-text-gray-900",
                    nav: "tw-flex tw-items-center",
                    nav_button:
                      "tw-h-6 tw-w-6 tw-bg-transparent hover:tw-bg-blue-gray-50 tw-p-1 tw-rounded-md tw-transition-colors tw-duration-300",
                    nav_button_previous: "tw-absolute tw-left-1.5",
                    nav_button_next: "tw-absolute tw-right-1.5",
                    table: "tw-w-full tw-border-collapse",
                    head_row: "tw-flex !font-medium tw-text-gray-900",
                    head_cell: "tw-m-0.5 tw-w-9 !font-normal tw-text-sm",
                    row: "tw-flex tw-w-full tw-mt-2",
                    cell: "tw-text-gray-600 tw-rounded-md tw-h-9 tw-w-9 tw-text-center tw-text-sm tw-p-0 tw-m-0.5 tw-relative [&:has([aria-selected].day-range-end)]:tw-rounded-r-md [&:has([aria-selected].day-outside)]:tw-bg-gray-900/20 [&:has([aria-selected].day-outside)]:tw-text-white [&:has([aria-selected])]:tw-bg-gray-900/50 first:[&:has([aria-selected])]:tw-rounded-l-md last:[&:has([aria-selected])]:tw-rounded-r-md focus-within:tw-relative focus-within:tw-z-20",
                    day: "tw-h-9 tw-w-9 tw-p-0 !font-normal",
                    day_range_end: "day-range-end",
                    day_selected:
                      "tw-rounded-md tw-bg-gray-900 tw-text-white hover:tw-bg-gray-900 hover:tw-text-white focus:tw-bg-gray-900 focus:tw-text-white",
                    day_today: "tw-rounded-md tw-bg-gray-200 tw-text-gray-900",
                    day_outside:
                      "tw-day-outside tw-text-gray-500 tw-opacity-50 aria-selected:tw-bg-gray-500 aria-selected:tw-text-gray-900 aria-selected:tw-bg-opacity-10",
                    day_disabled: "tw-text-gray-500 tw-opacity-50",
                    day_hidden: "tw-invisible",
                  }}
                  components={{
                    IconLeft: ({ ...props }) => (
                      <ChevronLeftIcon
                        {...props}
                        className="tw-h-4 tw-w-4 tw-stroke-2"
                      />
                    ),
                    IconRight: ({ ...props }) => (
                      <ChevronRightIcon
                        {...props}
                        className="tw-h-4 tw-w-4 tw-stroke-2"
                      />
                    ),
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
          <Select
            label="1"
            containerProps={{
              className: "tw-min-w-max",
            }}
          >
            <Option>1</Option>
            <Option>2</Option>
            <Option>3</Option>
            <Option>4</Option>
            <Option>5</Option>
            <Option>6</Option>
            <Option>7</Option>
            <Option>8</Option>
            <Option>9</Option>
            <Option>10</Option>
          </Select>
          <Select
            label="2023"
            containerProps={{
              className: "tw-min-w-max",
            }}
          >
            <Option>2022</Option>
            <Option>2021</Option>
            <Option>2020</Option>
          </Select>
        </div>
        <div className="tw-mb-6 tw-flex tw-flex-col tw-items-end tw-gap-6 md:tw-flex-row">
          <Input label="Email" />
          <Input label="Confirm Email" />
        </div>
        <div className="tw-mb-6 tw-flex tw-flex-col tw-items-end tw-gap-6 md:tw-flex-row">
          <Input label="Location" />
          <Input label="Phone No" />
        </div>
        <div className="tw-flex tw-flex-col tw-items-end tw-gap-6 md:tw-flex-row">
          <Input label="Language" />
          <Input label="Skills" />
        </div>
      </CardBody>
    </Card>
  );
}
