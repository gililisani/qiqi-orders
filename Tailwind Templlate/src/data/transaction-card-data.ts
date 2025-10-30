// @heroicons/react
import {
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";

export const transactionCardData = [
  {
    icon: ChevronDownIcon,
    title: "Newest",
    name: "Netflix",
    date: "27 March 2020, at 12:30 PM",
    value: "- $ 2,500",
    color: "red",
  },
  {
    icon: ChevronUpIcon,
    name: "Netflix",
    date: "27 March 2020, at 04:30 AM",
    value: "+ $ 2,000",
    color: "green",
  },
  {
    icon: ChevronUpIcon,
    title: "Yesterday",
    name: "Stripe",
    date: "26 March 2020, at 13:45 PM",
    value: "+ $ 750",
    color: "green",
  },
  {
    icon: ChevronUpIcon,
    name: "HubSpot",
    date: "26 March 2020, at 12:30 PM",
    value: "+ $ 1,000",
    color: "green",
  },
  {
    icon: ChevronUpIcon,
    name: "Creative Tim",
    date: "26 March 2020, at 08:30 AM",
    value: "+ $ 2,500",
    color: "green",
  },
  {
    icon: XMarkIcon,
    name: "Webflow",
    date: "26 March 2020, at 05:00 AM",
    value: "Pending",
    color: "blue-gray",
  },
];

export default transactionCardData;
