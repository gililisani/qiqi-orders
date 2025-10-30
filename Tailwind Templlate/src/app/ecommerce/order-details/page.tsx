/* eslint-disable @next/next/no-img-element */
// @material-tailwind/react
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Typography,
  Avatar,
  Chip,
  CardFooter,
  Tooltip,
  IconButton,
} from "@/components/MaterialTailwind";

// @heroicons/react
import {
  BellIcon,
  PlusCircleIcon,
  ShoppingCartIcon,
  CheckIcon,
} from "@heroicons/react/24/solid";

// @heroicons/react
import { ExclamationCircleIcon } from "@heroicons/react/24/outline";

// components
import BillingInformation from "./components/billing-information";
import TrackOrder from "./components/track-order";

export default function OrderDetails() {
  return (
    <div className="tw-grid tw-my-20 tw-place-content-center">
      <div className="tw-w-full">
        <Card className="tw-w-full tw-max-w-4xl tw-px-4 tw-py-4 tw-border tw-border-blue-gray-100 tw-shadow-sm">
          <CardHeader
            floated={false}
            shadow={false}
            color="transparent"
            className="!tw-m-0"
          >
            <Typography variant="h6" color="blue-gray">
              Order Details
            </Typography>
            <div className="tw-flex tw-items-baseline tw-justify-between tw-border-b !tw-border-b-blue-gray-100/50 tw-pb-6">
              <div className="tw-flex tw-flex-col !tw-text-blue-gray-500">
                <Typography variant="small" className="!tw-font-normal">
                  Order no. <strong>241342</strong> from{" "}
                  <strong>23.02.2021</strong>
                </Typography>
                <Typography variant="small" className="!tw-font-normal">
                  Code: <strong>KF332</strong>
                </Typography>
              </div>
              <Button variant="gradient">invoice</Button>
            </div>
          </CardHeader>

          <CardBody className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-6 tw-border-b !tw-border-b-blue-gray-100/50 !tw-px-0 !tw-pb-8">
            <div className="tw-flex tw-items-center tw-gap-6">
              <Avatar
                src="https://demos.creative-tim.com/material-dashboard-pro-react/static/media/product-12.56173a00bfad324214a2.jpg"
                alt="product"
                className="tw-h-28 tw-w-28 tw-shadow-lg"
                variant="rounded"
              />
              <div>
                <Typography variant="h6" color="blue-gray" className="tw-mb-1">
                  Gold Glasses
                </Typography>
                <Typography
                  variant="small"
                  className="tw-mb-3 !tw-font-normal !tw-text-blue-gray-500"
                >
                  Order was delivered 2 days ago.
                </Typography>
                <Chip
                  size="sm"
                  value="delivered"
                  className="tw-w-20"
                  color="green"
                />
              </div>
            </div>
            <div className="tw-flex tw-flex-col tw-items-end tw-gap-4 tw-text-right tw-ml-auto">
              <Button
                size="sm"
                variant="gradient"
                className="tw-w-32 tw-bg-blue-500"
              >
                contact us
              </Button>
              <Typography
                className="!tw-text-blue-gray-500 !tw-font-normal"
                variant="small"
              >
                Do you like the product? Leave us a review here.
              </Typography>
            </div>
          </CardBody>

          <CardFooter className="tw-mt-6 tw-grid tw-justify-between tw-gap-x-16 tw-gap-y-6 !tw-pt-0 !tw-px-0 tw-py-6 md:tw-grid-cols-1 lg:tw-grid-cols-4">
            <TrackOrder />

            <div className="tw-col-span-2 tw-mt-4 lg:tw-mt-0">
              <div>
                <Typography variant="h6" color="blue-gray">
                  Payment details
                </Typography>
                <div className="tw-mt-4 tw-flex tw-w-full tw-items-center tw-gap-4 tw-rounded-md tw-p-6 tw-outline tw-outline-blue-gray-300/20">
                  <img
                    src="https://demos.creative-tim.com/material-dashboard-pro-react/static/media/mastercard.27fca3e7637a9458fb64.png"
                    alt="image"
                    className="tw-h-5"
                  />
                  <Typography color="blue-gray" className="!tw-font-bold">
                    ****
                  </Typography>
                  <Typography color="blue-gray" className="!tw-font-bold">
                    ****
                  </Typography>
                  <Typography color="blue-gray" className="!tw-font-bold">
                    ****
                  </Typography>
                  <Typography color="blue-gray" className="!tw-font-bold">
                    7852
                  </Typography>
                  <Tooltip
                    placement="bottom"
                    content="We do not store card details"
                  >
                    <IconButton
                      size="sm"
                      variant="text"
                      color="blue-gray"
                      className="tw-ml-auto tw-rounded-full"
                    >
                      <ExclamationCircleIcon
                        strokeWidth={1}
                        className="tw-h-8 tw-w-8"
                      />
                    </IconButton>
                  </Tooltip>
                </div>

                <BillingInformation />
              </div>
            </div>

            <div className="tw-col-span-1">
              <Typography variant="h6" color="blue-gray">
                Order Summary
              </Typography>

              <div className="tw-w-full tw-mt-3">
                <div className="tw-flex tw-justify-between">
                  <Typography
                    variant="small"
                    className="tw-mb-2 !tw-font-normal !tw-text-blue-gray-500"
                  >
                    Product Price:
                  </Typography>
                  <Typography className="!tw-font-bold" color="blue-gray">
                    $90
                  </Typography>
                </div>
                <div className="tw-flex tw-justify-between">
                  <Typography
                    variant="small"
                    className="tw-font-normal !tw-text-blue-gray-500"
                  >
                    Delivery:
                  </Typography>
                  <Typography
                    className="tw-mb-2 !tw-font-bold"
                    color="blue-gray"
                  >
                    $14
                  </Typography>
                </div>
                <div className="tw-flex tw-justify-between">
                  <Typography
                    variant="small"
                    className="!tw-font-normal !tw-text-blue-gray-500"
                  >
                    Taxes:
                  </Typography>
                  <Typography className="!tw-font-bold" color="blue-gray">
                    $1.95
                  </Typography>
                </div>
                <div className="tw-mt-4 tw-flex tw-justify-between">
                  <Typography
                    className="!tw-font-normal !tw-text-blue-gray-500"
                    variant="h5"
                  >
                    Total:
                  </Typography>
                  <Typography color="blue-gray" variant="h5">
                    $1.95
                  </Typography>
                </div>
              </div>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
