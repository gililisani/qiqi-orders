"use client";
import React from "react";

// @material-tailwind/react
import {
  Avatar,
  Card,
  CardBody,
  CardHeader,
  Typography,
} from "@material-tailwind/react";

// data
import { productsTableData } from "@/data";

type Props = {};

const TABLE_HEAD = ["PRODUCT", "VALUE", "ADS SPENT", "REFUNDS"];

export default function ProductTable({}: Props) {
  return (
    <div className="tw-mt-6">
      <Card className="tw-h-full tw-w-full tw-border tw-border-blue-gray-100 tw-shadow-sm">
        <CardHeader floated={false} shadow={false} className="tw-rounded-none">
          <Typography variant="h6" color="blue-gray">
            Top Selling Products
          </Typography>
        </CardHeader>
        <CardBody className="tw-overflow-scroll !tw-p-0">
          <table className="tw-w-full tw-min-w-max tw-table-auto tw-text-left">
            <thead>
              <tr>
                {TABLE_HEAD.map((head) => (
                  <th
                    key={head}
                    className="tw-border-b tw-border-blue-gray-100/50 !tw-p-4"
                  >
                    <Typography
                      color="blue-gray"
                      className="!tw-font-bold tw-opacity-40 tw-text-xs"
                    >
                      {head}
                    </Typography>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productsTableData.map(
                (
                  { img, name, detail, value, price, refunds, icon, color },
                  index
                ) => {
                  const isLast = index === productsTableData.length - 1;
                  const classes = isLast
                    ? "!tw-p-3"
                    : "!tw-p-3 tw-border-b tw-border-blue-gray-50";

                  return (
                    <tr key={name}>
                      <td className={classes}>
                        <div className="tw-flex tw-items-center tw-gap-3">
                          <Avatar
                            src={img}
                            alt={name}
                            variant="rounded"
                            size="md"
                          />
                          <div className="tw-flex tw-flex-col">
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="!tw-font-bold"
                            >
                              {name}
                            </Typography>
                            <div className="tw-flex tw-gap-1">
                              <Typography
                                variant="small"
                                color="green"
                                className="!tw-font-normal"
                              >
                                {detail}
                              </Typography>
                              <Typography
                                variant="small"
                                color="blue-gray"
                                className="!tw-font-normal tw-opacity-70"
                              >
                                orders
                              </Typography>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={classes}>
                        <div>
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="!tw-font-normal tw-opacity-70"
                          >
                            {value}
                          </Typography>
                        </div>
                      </td>
                      <td className={classes}>
                        <div className="tw-w-max">
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="!tw-font-normal tw-opacity-70"
                          >
                            {price}
                          </Typography>
                        </div>
                      </td>
                      <td className={classes}>
                        <div className="tw-flex tw-items-center tw-gap-2">
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="!tw-font-normal"
                          >
                            {refunds}
                          </Typography>
                          {React.createElement(icon, {
                            className: `tw-w-4 tw-h-4 tw-stroke-2 ${color}`,
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
