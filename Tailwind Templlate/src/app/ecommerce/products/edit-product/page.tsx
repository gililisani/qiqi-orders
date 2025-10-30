/* eslint-disable @next/next/no-img-element */
import React from "react";

// @material-tailwind/react
import {
  Typography,
  Button,
  Card,
  CardHeader,
  CardBody,
  Input,
  Textarea,
  Select,
  Option,
} from "@/components/MaterialTailwind";

export default function EditProduct() {
  return (
    <div className="tw-mb-6">
      <div className="tw-mt-8">
        <Typography variant="h4" color="blue-gray">
          Make the changes below
        </Typography>
        <div className="tw-mt-1 tw-flex tw-items-center tw-justify-between">
          <Typography
            variant="paragraph"
            className="!tw-font-normal !tw-text-blue-gray-500"
          >
            We&apos;re constantly trying to express ourselves and actualize our
            dreams. If you have the <br /> opportunity to play.{" "}
          </Typography>
          <Button className="tw-flex tw-gap-2" variant="gradient">
            save
          </Button>
        </div>
      </div>

      <div className="md:tw-grid-cols-full tw-mt-16 tw-grid tw-items-start tw-gap-6 lg:tw-grid-cols-3">
        <Card className="tw-col-span-1 tw-border tw-border-blue-gray-100 tw-shadow-sm">
          <CardHeader
            floated={false}
            color="transparent"
            className="tw-relative tw-shadow-xl tw-shadow-blue-gray-900/10"
          >
            <img
              src="/img/products/sofa.jpg"
              alt="sofa"
              className="tw-h-full tw-w-full"
            />
          </CardHeader>
          <CardBody className="tw-text-center">
            <Typography
              variant="h5"
              color="blue-gray"
              className="tw-mb-3 !tw-font-medium"
            >
              Product Image
            </Typography>
            <Typography className="!tw-font-normal !tw-text-blue-gray-500">
              The place is close to Barceloneta Beach and bus stop just 2 min by
              walk and near to “Naviglio” where you can enjoy the main night
              life in Barcelona
            </Typography>
          </CardBody>
        </Card>

        <Card className="md:tw-col-span-full lg:tw-col-span-2 tw-border tw-border-blue-gray-100 tw-shadow-sm">
          <CardHeader
            floated={false}
            shadow={false}
            color="transparent"
            className="!tw-m-0 tw-p-6 !tw-pb-0"
          >
            <Typography variant="h5" color="blue-gray">
              Product Information
            </Typography>
          </CardHeader>
          <CardBody className="tw-flex tw-flex-col">
            <div className="tw-mb-8 tw-flex tw-flex-col tw-gap-6 md:tw-flex-row">
              <Input label="Name" />
              <Input label="Weight" type="number" />
            </div>
            <div className="tw-mb-8 tw-flex tw-flex-col tw-gap-6 md:tw-flex-row">
              <Input
                label="Collection"
                containerProps={{ className: "!tw-min-w-[50px]" }}
              />
              <Input
                label="Price"
                containerProps={{ className: "!tw-min-w-[50px]" }}
              />
              <Input
                type="number"
                label="Quantity"
                containerProps={{ className: "!tw-min-w-[50px]" }}
              />
            </div>
            <div className="tw-flex tw-flex-col tw-items-start tw-gap-6 md:tw-flex-row">
              <Textarea label="Message" rows={5} />
              <div className="tw-grid tw-w-full tw-gap-8">
                <Select label="Category">
                  <Option>Clothing</Option>
                  <Option>Electronics</Option>
                  <Option>Furniture</Option>
                  <Option>Others</Option>
                  <Option>Real Estate</Option>
                </Select>

                <Select label="Color">
                  <Option>Black</Option>
                  <Option>Blue</Option>
                  <Option>Green</Option>
                  <Option>Orange</Option>
                  <Option>White</Option>
                </Select>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="md:tw-grid-cols-full tw-mt-6 tw-grid tw-grid-cols-1 tw-items-start lg:tw-grid-cols-3 lg:tw-gap-6">
        <Card className="tw-col-span-1 tw-border tw-border-blue-gray-100 tw-shadow-sm">
          <CardHeader
            floated={false}
            shadow={false}
            color="transparent"
            className="!tw-m-0 tw-p-6 !tw-pb-0"
          >
            <Typography variant="h5" color="blue-gray">
              Socials
            </Typography>
          </CardHeader>
          <CardBody className="tw-flex tw-flex-col">
            <div className="tw-grid tw-gap-8">
              <Input label="Shoppify Handle" />
              <Input label="Facebook Account" />
              <Input label="Instagram Account" />
            </div>
          </CardBody>
        </Card>

        <Card className="tw-col-span-2 tw-border tw-border-blue-gray-100 tw-shadow-sm">
          <CardHeader
            floated={false}
            shadow={false}
            color="transparent"
            className="!tw-m-0 tw-p-6 !tw-pb-0"
          >
            <Typography variant="h5" color="blue-gray">
              Pricing
            </Typography>
          </CardHeader>
          <CardBody className="tw-flex tw-flex-col">
            <div className="tw-mb-6 tw-flex tw-flex-col tw-gap-6 md:tw-flex-row">
              <Input
                type="number"
                label="Price"
                containerProps={{ className: "!tw-min-w-[50px]" }}
              />

              <Select
                label="USD"
                containerProps={{ className: "!tw-min-w-[50px]" }}
              >
                <Option>BTC</Option>
                <Option>CNY</Option>
                <Option>EUR</Option>
                <Option>GBP</Option>
                <Option>INR</Option>
                <Option>USD</Option>
              </Select>

              <Input
                label="SKU"
                containerProps={{ className: "!tw-min-w-[50px]" }}
              />
            </div>
            <div>
              <Input label="Tags" />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
