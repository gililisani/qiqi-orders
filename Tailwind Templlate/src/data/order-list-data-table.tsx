import React from "react";
// @material-tailwind/react
import { Avatar, Checkbox } from "@material-tailwind/react";

// @heroicons/react
import {
  CheckCircleIcon,
  ArrowLeftCircleIcon,
} from "@heroicons/react/24/outline";
import { XMarkIcon } from "@heroicons/react/24/solid";

export const orderListDataTable = [
  {
    id: <Checkbox label="#10421" />,
    date: "1 Nov, 10:20 AM",
    status: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <CheckCircleIcon className="tw-h-8 tw-w-8 tw-stroke-1 tw-text-green-500" />{" "}
        Paid
      </span>
    ),
    customer: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <Avatar
          src="/img/team-2.jpeg"
          alt="orlando"
          className="tw-h-6 tw-w-6"
        />{" "}
        Orlando Imieto
      </span>
    ),
    product: "Nike Sport 2",
    revenue: "$140,20",
  },
  {
    id: <Checkbox label="#10422" />,
    date: "1 Nov, 10:53 AM",
    status: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <CheckCircleIcon className="tw-h-8 tw-w-8 tw-stroke-1 tw-text-green-500" />{" "}
        Paid
      </span>
    ),
    customer: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <Avatar src="/img/team-1.jpeg" alt="alice" className="tw-h-6 tw-w-6" />{" "}
        Alice Murinho
      </span>
    ),
    product: "Valvet T-shirt",
    revenue: "$42,00",
  },
  {
    id: <Checkbox label="#10423" />,
    date: "1 Nov, 11:13 AM",
    status: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <ArrowLeftCircleIcon className="tw-h-8 tw-w-8 tw-stroke-1 tw-text-gray-900" />{" "}
        Refunded
      </span>
    ),
    customer: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <Avatar
          src="/img/team-2.jpeg"
          alt="Mitchel"
          className="tw-h-6 tw-w-6"
        />{" "}
        Michael Mirra
      </span>
    ),
    product: "Leather Wallet  +1 more",
    revenue: "$25,50",
  },
  {
    id: <Checkbox label="#10424" />,
    date: "1 Nov, 12:20 PM",
    status: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <CheckCircleIcon className="tw-h-8 tw-w-8 tw-stroke-1 tw-text-green-500" />{" "}
        Paid
      </span>
    ),
    customer: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <Avatar
          src="/img/team-3.jpeg"
          alt="Andrew Nichel"
          className="tw-h-6 tw-w-6"
        />{" "}
        Andrew Nichel
      </span>
    ),
    product: "Bracelet Onu-Lino",
    revenue: "$19,40",
  },
  {
    id: <Checkbox label="#10425" />,
    date: "1 Nov, 1:40 PM",
    status: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <XMarkIcon className="tw-h-6 tw-w-6 tw-stroke-1 tw-text-red-500 tw-border tw-border-red-500 tw-rounded-full tw-p-1" />{" "}
        Cancel
      </span>
    ),
    customer: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <Avatar
          src="/img/team-4.jpeg"
          alt="Sebastian Koga"
          className="tw-h-6 tw-w-6"
        />{" "}
        Sebastian Koga
      </span>
    ),
    product: "Phone Case Pink  x 2",
    revenue: "$44,90",
  },
  {
    id: <Checkbox label="#10426" />,
    date: "1 Nov, 2:19 PM",
    status: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <CheckCircleIcon className="tw-h-8 tw-w-8 tw-stroke-1 tw-text-green-500" />{" "}
        Paid
      </span>
    ),
    customer: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <Avatar
          src="/img/team-2.jpeg"
          alt="Laur Gilbert"
          className="tw-h-6 tw-w-6"
        />{" "}
        Laur Gilbert
      </span>
    ),
    product: "Backpack Niver",
    revenue: "$112,50",
  },
  {
    id: <Checkbox label="#10427" />,
    date: "1 Nov, 3:42 AM",
    status: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <CheckCircleIcon className="tw-h-8 tw-w-8 tw-stroke-1 tw-text-green-500" />{" "}
        Paid
      </span>
    ),
    customer: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <Avatar
          src="/img/bruce-mars.jpeg"
          alt="Iryna Innda"
          className="tw-h-6 tw-w-6"
        />{" "}
        Iryna Innda
      </span>
    ),
    product: "Adidas Vio",
    revenue: "$200,00",
  },
  {
    id: <Checkbox label="#10428" />,
    date: "2 Nov, 9:32 AM",
    status: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <CheckCircleIcon className="tw-h-8 tw-w-8 tw-stroke-1 tw-text-green-500" />{" "}
        Paid
      </span>
    ),
    customer: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <Avatar
          src="/img/team-2.jpeg"
          alt="Arrias Liunda"
          className="tw-h-6 tw-w-6"
        />{" "}
        Arrias Liunda
      </span>
    ),
    product: "Airpods 2 Gen",
    revenue: "$350,00",
  },
  {
    id: <Checkbox label="#10429" />,
    date: "2 Nov, 10:14 AM",
    status: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <CheckCircleIcon className="tw-h-8 tw-w-8 tw-stroke-1 tw-text-green-500" />{" "}
        Paid
      </span>
    ),
    customer: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <Avatar
          src="/img/team-3.jpeg"
          alt="Rugna Ilpio"
          className="tw-h-6 tw-w-6"
        />{" "}
        Rugna Ilpio
      </span>
    ),
    product: "Bracelet Warret",
    revenue: "$15,00",
  },
  {
    id: <Checkbox label="#10430" />,
    date: "2 Nov, 10:14 AM",
    status: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <ArrowLeftCircleIcon className="tw-h-8 tw-w-8 tw-stroke-1 tw-text-gray-900" />{" "}
        Refunded
      </span>
    ),
    customer: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <Avatar src="/img/team-4.jpeg" alt="team-4" className="tw-h-6 tw-w-6" />{" "}
        Orlando Imieto
      </span>
    ),
    product: "Watter Bottle India  x 3",
    revenue: "$25,00",
  },
  {
    id: <Checkbox label="#10431" />,
    date: "2 Nov, 3:12 PM",
    status: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <CheckCircleIcon className="tw-h-8 tw-w-8 tw-stroke-1 tw-text-green-500" />{" "}
        Paid
      </span>
    ),
    customer: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <Avatar
          src="/img/bruce-mars.jpeg"
          alt="bruce-mars"
          className="tw-h-6 tw-w-6"
        />{" "}
        Karl Innas
      </span>
    ),
    product: "Kitchen Gadgets",
    revenue: "$164,90",
  },
  {
    id: <Checkbox label="#10432" />,
    date: "2 Nov, 5:12 PM",
    status: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <CheckCircleIcon className="tw-h-8 tw-w-8 tw-stroke-1 tw-text-green-500" />{" "}
        Paid
      </span>
    ),
    customer: (
      <span className="tw-flex tw-gap-3 tw-items-center tw-text-xs">
        <Avatar
          src="/img/team-1.jpeg"
          alt="bruce-mars"
          className="tw-h-6 tw-w-6"
        />{" "}
        Oana Kilas
      </span>
    ),
    product: "Office Papers",
    revenue: "$23,90",
  },
];

export default orderListDataTable;
