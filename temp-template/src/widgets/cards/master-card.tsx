/* eslint-disable @next/next/no-img-element */
import React from "react";

// @material-tailwind/react
import { Typography } from "@material-tailwind/react";

// @heroicons/react
import { WifiIcon } from "@heroicons/react/24/solid";
import { formatCardNumber } from "@/utils";

type PropTypes = {
  name: string;
  date: React.ReactNode;
  number: number;
};
export function MasterCard({ name, date, number }: PropTypes) {
  const cardNumber = formatCardNumber(String(number)).split(" ");

  return (
    <div className="tw-h-full">
      <div className="tw-absolute tw-h-full tw-w-full tw-overflow-hidden tw-rounded-xl tw-bg-gray-900/95">
        <div className="tw-h-full tw-w-full tw-bg-[url(https://demos.creative-tim.com/material-dashboard-pro-react/static/media/pattern-tree.156bb943ac7fd244f10c115d085e085e.svg)] tw-bg-cover tw-bg-center tw-opacity-10" />
      </div>
      <div className="tw-grid tw-h-full tw-py-6">
        <div className="tw-relative">
          <WifiIcon className="tw-ml-6 tw-h-6 tw-w-6 tw-text-white" />

          <div className="tw-mt-8 tw-ml-6 tw-flex tw-gap-3 tw-text-white">
            {cardNumber.map((num) => (
              <Typography key={num} className="tw-text-xl !tw-font-bold">
                {num}
              </Typography>
            ))}
          </div>
        </div>
        <div className="tw-relative tw-mt-10 tw-flex tw-self-end tw-px-6">
          <div className="tw-grid tw-text-white">
            <Typography variant="small" className="!tw-font-normal">
              Card holder
            </Typography>
            <Typography className="!tw-font-bold">{name}</Typography>
          </div>
          <div className="tw-grid tw-text-white">
            <Typography variant="small" className="tw-ml-8 !tw-font-normal">
              Expires
            </Typography>
            <Typography className="tw-ml-8 !tw-font-bold">{date}</Typography>
          </div>
          <img
            src="/img/logo/mastercard.webp"
            alt=""
            className="tw-ml-auto tw-mt-4 tw-h-10"
          />
        </div>
      </div>
    </div>
  );
}

export default MasterCard;
