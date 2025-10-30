import React from "react";
import Link from "next/link";

// @material-tailwind/react
import { color } from "@material-tailwind/react/types/components/card";

import {
  Card,
  CardHeader,
  CardBody,
  Typography,
  CardFooter,
  Button,
} from "@material-tailwind/react";

// @heroicons/react
import {
  ArrowRightIcon,
  CheckIcon,
  MinusIcon,
} from "@heroicons/react/24/outline";

type PropTypes = {
  title: string;
  price: string | number;
  priceType?: string;
  priceCurrency?: string;
  color?: "white" | color | string;
  actionColor?: color | string;
  actionRoute?: string;
  actionLabel: string;
  options: { name: string; included: boolean }[];
};

export function PricingCard({
  title,
  price,
  priceType = "mo",
  priceCurrency = "$",
  options,
  color,
  actionColor,
  actionRoute,
  actionLabel,
}: PropTypes) {
  const isLowContrast =
    color === "white" || color === "lime" || color === "yellow";

  return (
    <Card
      color={color as any}
      shadow={color === "white" ? false : true}
      variant="gradient"
      className={`tw-w-full tw-p-8`}
    >
      <div>
        <CardHeader
          floated={false}
          shadow={false}
          color="transparent"
          className="tw-m-0 tw-mb-8 tw-rounded-none tw-border-b tw-border-white/10 tw-pb-8 tw-text-center"
        >
          <Typography
            variant="small"
            className="!tw-font-normal tw-uppercase"
            color={isLowContrast ? "blue-gray" : "white"}
          >
            {title}
          </Typography>
          <Typography
            variant="h1"
            color={isLowContrast ? "blue-gray" : "white"}
            className="tw-mt-6 tw-flex tw-justify-center tw-gap-1 tw-text-5xl"
          >
            <span className="-tw-mt-1 tw-text-xl">{priceCurrency}</span>
            {price} <span className="tw-self-end tw-text-xl">/{priceType}</span>
          </Typography>
        </CardHeader>
        {options && (
          <CardBody className="tw-p-0">
            <ul className="tw-flex tw-flex-col tw-gap-4">
              {options.map(({ name, included }, key) => (
                <li
                  key={key}
                  className={`tw-flex tw-items-center tw-gap-4 ${
                    isLowContrast ? "tw-text-blue-gray-700" : "tw-text-white"
                  }`}
                >
                  <span className="tw-rounded-full">
                    {included ? (
                      <CheckIcon strokeWidth={2} className="tw-h-5 tw-w-5" />
                    ) : (
                      <MinusIcon strokeWidth={2} className="tw-h-5 tw-w-5" />
                    )}
                  </span>
                  <Typography className="!tw-container !tw-font-normal">
                    {name}
                  </Typography>
                </li>
              ))}
            </ul>
          </CardBody>
        )}
        <CardFooter className="tw-mt-6 tw-p-0">
          <Link href={actionRoute || ""}>
            <Button
              size="md"
              fullWidth={true}
              variant="gradient"
              color={actionColor as any}
              className="tw-flex tw-items-center tw-justify-center tw-gap-2 hover:tw-scale-[1.02] focus:tw-scale-[1.02] active:tw-scale-100"
            >
              {actionLabel}
              <ArrowRightIcon strokeWidth={3} className="tw-w-3.5 tw-h-3.5" />
            </Button>
          </Link>
        </CardFooter>
      </div>
    </Card>
  );
}

export default PricingCard;
