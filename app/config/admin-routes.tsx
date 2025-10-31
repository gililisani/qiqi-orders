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
  color: "inherit",
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
        icon: <Typography {...text}>A</Typography>,
        name: "All Orders",
        path: "/admin/orders",
      },
      {
        icon: <Typography {...text}>N</Typography>,
        name: "New Order (Admin)",
        path: "/admin/orders/new",
      },
      {
        icon: <Typography {...text}>S</Typography>,
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
        icon: <Typography {...text}>A</Typography>,
        name: "All Products",
        path: "/admin/products",
      },
      {
        icon: <Typography {...text}>H</Typography>,
        name: "Highlighted Products",
        path: "/admin/highlighted-products",
      },
      {
        icon: <Typography {...text}>C</Typography>,
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
        icon: <Typography {...text}>A</Typography>,
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
        icon: <Typography {...text}>C</Typography>,
        name: "Classes",
        path: "/admin/classes",
      },
      {
        icon: <Typography {...text}>I</Typography>,
        name: "Incoterms",
        path: "/admin/incoterms",
      },
      {
        icon: <Typography {...text}>P</Typography>,
        name: "Payment Terms",
        path: "/admin/payment-terms",
      },
      {
        icon: <Typography {...text}>N</Typography>,
        name: "NetSuite",
        path: "/admin/netsuite",
      },
    ],
  },
];

export default adminRoutes;

