"use client";
import React from "react";

// @material-tailwind/react
import { Typography, Switch } from "@material-tailwind/react";

// data
import { platformSettingsData } from "@/data";
type Props = {};

export default function PlatformSettings({}: Props) {
  return (
    <div>
      <Typography variant="h6" color="blue-gray" className="tw-mb-3">
        Platform Settings
      </Typography>
      <div className="tw-flex tw-flex-col tw-gap-12">
        {platformSettingsData.map(({ title, options }) => (
          <div key={title}>
            <Typography className="tw-mb-4 tw-block tw-text-xs !tw-font-semibold tw-uppercase !tw-text-blue-gray-500">
              {title}
            </Typography>
            <div className="tw-flex tw-flex-col tw-gap-6">
              {options.map(({ checked, label }) => (
                <Switch
                  color="gray"
                  key={label}
                  id={label}
                  label={label}
                  defaultChecked={checked}
                  labelProps={{
                    className:
                      "tw-text-sm !tw-font-normal tw-text-blue-gray-300",
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
