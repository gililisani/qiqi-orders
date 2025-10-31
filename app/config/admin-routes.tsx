import { Typography } from "@material-tailwind/react";
import {
  RectangleGroupIcon,
  ShoppingCartIcon,
  CubeTransparentIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  MapPinIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/solid";

const text = {
  className: "tw-w-5 tw-grid place-items-center !tw-font-medium",
};

const icon = {
  className: "tw-w-5 tw-h-5 tw-text-inherit",
};

export const adminRoutes = [
  {
    name: "dashboard",
    icon: <RectangleGroupIcon {...icon} />,
    path: "/admin",
  },
  {
    name: "orders",
    icon: <ShoppingCartIcon {...icon} />,
    pages: [
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>A</Typography>,
        name: "All Orders",
        path: "/admin/orders",
      },
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>N</Typography>,
        name: "New Order (Admin)",
        path: "/admin/orders/new",
      },
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>S</Typography>,
        name: "Create Standalone SLI",
        path: "/admin/sli/create",
      },
    ],
  },
  {
    name: "products",
    icon: <CubeTransparentIcon {...icon} />,
    pages: [
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>A</Typography>,
        name: "All Products",
        path: "/admin/products",
      },
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>H</Typography>,
        name: "Highlighted Products",
        path: "/admin/highlighted-products",
      },
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>C</Typography>,
        name: "Categories",
        path: "/admin/categories",
      },
    ],
  },
  {
    name: "system",
    title: "System",
    icon: <Cog6ToothIcon {...icon} />,
    pages: [
      {
        icon: <BuildingOfficeIcon {...icon} />,
        name: "Companies",
        path: "/admin/companies",
      },
      {
        icon: <UserGroupIcon {...icon} />,
        name: "Users",
        path: "/admin/users",
      },
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>A</Typography>,
        name: "Admins",
        path: "/admin/admins",
      },
      {
        icon: <BuildingOfficeIcon {...icon} />,
        name: "Subsidiaries",
        path: "/admin/subsidiaries",
      },
      {
        icon: <CurrencyDollarIcon {...icon} />,
        name: "Support Funds",
        path: "/admin/support-funds",
      },
      {
        icon: <MapPinIcon {...icon} />,
        name: "Locations",
        path: "/admin/locations",
      },
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>C</Typography>,
        name: "Classes",
        path: "/admin/classes",
      },
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>I</Typography>,
        name: "Incoterms",
        path: "/admin/incoterms",
      },
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>P</Typography>,
        name: "Payment Terms",
        path: "/admin/payment-terms",
      },
      {
        icon: <Typography className={text.className} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>N</Typography>,
        name: "NetSuite",
        path: "/admin/netsuite",
      },
    ],
  },
];

export default adminRoutes;

