import { Typography } from "@material-tailwind/react";
import {
  RectangleGroupIcon,
  ShoppingCartIcon,
  BuildingOfficeIcon,
} from "@heroicons/react/24/solid";

const text = {
  className: "w-5 grid place-items-center !font-medium",
};

const icon = {
  className: "w-5 h-5 text-inherit",
};

export const clientRoutes = [
  {
    name: "dashboard",
    icon: <RectangleGroupIcon {...icon} />,
    path: "/client",
  },
  {
    name: "orders",
    icon: <ShoppingCartIcon {...icon} />,
    pages: [
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>N</Typography>,
        name: "New Order",
        path: "/client/orders/new",
      },
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>H</Typography>,
        name: "Order History",
        path: "/client/orders",
      },
    ],
  },
  {
    name: "Your Company",
    icon: <BuildingOfficeIcon {...icon} />,
    path: "/client/company",
  },
];

export default clientRoutes;

