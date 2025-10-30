"use client";
import React from "react";

// @material-tailwind/react
import { Typography } from "@material-tailwind/react";

// widgets
import { StatisticsCard } from "@/widgets/cards";

// @data
import { statisticsCardsData } from "@/data";

type Props = {};

export default function StatisticsCards({}: Props) {
  return (
    <div className="tw-my-6 tw-grid tw-gap-6 md:tw-grid-cols-2 xl:tw-grid-cols-4">
      {statisticsCardsData.map(({ icon, title, footer, ...rest }) => (
        <StatisticsCard
          key={title}
          {...rest}
          title={title}
          color={rest.color as any}
          icon={React.createElement(icon, {
            className: "tw-w-6 tw-h-6 tw-text-white",
          })}
          footer={
            <Typography className="!tw-font-normal tw-text-blue-gray-600">
              <strong className={footer.color}>{footer.value}</strong>
              &nbsp;{footer.label}
            </Typography>
          }
        />
      ))}
    </div>
  );
}
