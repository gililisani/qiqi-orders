"use client";

import React from "react";

// @material-tailwind/react
import {
  Card,
  Typography,
  List,
  ListItem,
  ListItemPrefix,
} from "@/components/MaterialTailwind";

// @data
import { sidenavCardData } from "@/data";

type Props = {};

export default function Sidebar({}: Props) {
  return (
    <div className="!tw-col-span-2">
      <Card className="!tw-sticky tw-top-4 !tw-w-full tw-border tw-border-blue-gray-100 tw-shadow-sm">
        <List className="tw-min-w-full">
          {sidenavCardData.map(({ icon, name }, key) => (
            <a key={key} href={`#${name}`}>
              <ListItem>
                <ListItemPrefix>
                  {React.createElement(icon, {
                    className: "tw-w-5 tw-h-5 tw-text-gray-900",
                  })}
                </ListItemPrefix>
                <Typography
                  variant="small"
                  className="!tw-font-normal !tw-text-blue-gray-500"
                >
                  {name}
                </Typography>
              </ListItem>
            </a>
          ))}
        </List>
      </Card>
    </div>
  );
}
