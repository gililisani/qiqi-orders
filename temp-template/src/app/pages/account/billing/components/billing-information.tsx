"use client";

// @material-tailwind/react
import {
  Card,
  CardBody,
  Typography,
  CardHeader,
} from "@material-tailwind/react";

// @widgets
import { BillingCard } from "@/widgets/cards";

// @data
import { billingCardData } from "@/data";

type Props = {};

export default function BillingInformation({}: Props) {
  return (
    <div className="tw-col-span-3 tw-w-full">
      <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
        <CardHeader floated={false} shadow={false} className="tw-rounded-none">
          <Typography className="!tw-font-bold" color="blue-gray">
            Billing Information
          </Typography>
        </CardHeader>
        <CardBody className="tw-flex tw-flex-col tw-gap-6 !tw-p-4">
          {billingCardData.map((props, key) => (
            <BillingCard key={key + props.title} {...props} />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
