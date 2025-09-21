'use client';

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const COLORS = {
  dark: "tw-bg-gray-900 hover:tw-bg-gray-700 focus:tw-bg-gray-900 active:tw-bg-gray-700 hover:tw-bg-opacity-100 focus:tw-bg-opacity-100 active:tw-bg-opacity-100",
  blue: "tw-bg-blue-500 hover:tw-bg-blue-700 focus:tw-bg-blue-700 active:tw-bg-blue-700 hover:tw-bg-opacity-100 focus:tw-bg-opacity-100 active:tw-bg-opacity-100",
  "blue-gray":
    "tw-bg-blue-gray-900 hover:tw-bg-blue-gray-900 focus:tw-bg-blue-gray-900 active:tw-bg-blue-gray-900 hover:tw-bg-opacity-80 focus:tw-bg-opacity-80 active:tw-bg-opacity-80",
  green:
    "tw-bg-green-500 hover:tw-bg-green-700 focus:tw-bg-green-700 active:tw-bg-green-700 hover:tw-bg-opacity-100 focus:tw-bg-opacity-100 active:tw-bg-opacity-100",
  orange:
    "tw-bg-orange-500 hover:tw-bg-orange-700 focus:tw-bg-orange-700 active:tw-bg-orange-700 hover:tw-bg-opacity-100 focus:tw-bg-opacity-100 active:tw-bg-opacity-100",
  red: "tw-bg-red-500 hover:tw-bg-red-700 focus:tw-bg-red-700 active:tw-bg-red-700 hover:tw-bg-opacity-100 focus:tw-bg-opacity-100 active:tw-bg-opacity-100",
  pink: "tw-bg-pink-500 hover:tw-bg-pink-700 focus:tw-bg-pink-700 active:tw-bg-pink-700 hover:tw-bg-opacity-100 focus:tw-bg-opacity-100 active:tw-bg-opacity-100",
} as any;

// Heroicons
const HomeIcon = () => (
  <svg className="tw-h-5 tw-w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
);

const ShoppingBagIcon = () => (
  <svg className="tw-h-5 tw-w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>
);

const UsersIcon = () => (
  <svg className="tw-h-5 tw-w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
  </svg>
);

const BuildingOfficeIcon = () => (
  <svg className="tw-h-5 tw-w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.75m-.75 3h.75m-1.5-6h.75m-.75 3h.75m-1.5-6h.75m-.75 3h.75m-1.5-6h.75m-.75 3h.75m-1.5-6h.75m-.75 3h.75" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="tw-h-3 tw-w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
);

const XMarkIcon = () => (
  <svg className="tw-w-5 tw-h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

type PropTypes = {
  brandImg?: string;
  brandName?: string;
  openSidenav?: boolean;
  setOpenSidenav?: (open: boolean) => void;
};

const routes = [
  {
    name: "Dashboard",
    icon: <HomeIcon />,
    path: "/admin/dashboard-new",
  },
  {
    name: "Orders",
    icon: <ShoppingBagIcon />,
    path: "/admin/orders",
  },
  {
    name: "Companies",
    icon: <BuildingOfficeIcon />,
    path: "/admin/companies",
  },
  {
    name: "Users",
    icon: <UsersIcon />,
    path: "/admin/users",
  },
];

export default function TemplateSidenav({
  brandImg = "/QIQI-Logo.svg",
  brandName = "Qiqi Orders",
  openSidenav = false,
  setOpenSidenav = () => {},
}: PropTypes) {
  const pathname = usePathname();
  const sidenavType: "white" | "dark" | "transparent" = "white";
  const sidenavColor = "blue-gray";

  const sidenavRef = React.useRef(null);

  const handleClickOutside = () => {
    setOpenSidenav(false);
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sidenavRef.current && !(sidenavRef.current as any).contains(event.target)) {
        setOpenSidenav(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [setOpenSidenav]);

  const collapseItemClasses = "";
  const collapseHeaderClasses =
    "tw-border-b-0 !tw-p-3 tw-text-inherit hover:tw-text-inherit focus:tw-text-inherit active:tw-text-inherit";
  const activeRouteClasses = `${collapseItemClasses} ${COLORS[sidenavColor]} tw-text-white active:tw-text-white hover:tw-text-white focus:tw-text-white`;

  return (
    <div
      ref={sidenavRef}
      className={`tw-fixed tw-top-4 tw-z-50 tw-h-[calc(100vh-2rem)] tw-w-full tw-max-w-[18rem] tw-p-4 tw-shadow-xl tw-shadow-blue-gray-900/5 tw-transition-all tw-duration-300 tw-ease-in-out tw-overflow-y-scroll ${
        openSidenav ? "tw-left-4" : "-tw-left-72"
      } xl:tw-left-4 tw-bg-white tw-text-gray-900`}
    >
      <div className="tw-rounded-xl tw-bg-white tw-p-4">
        <Link
          href="/admin/dashboard-new"
          className="tw-mb-2 tw-flex tw-items-center tw-gap-1 !tw-p-4"
        >
          <img src={brandImg} className="tw-h-7 tw-w-7" alt="logo" />
          <span className="tw-text-xl tw-font-bold tw-text-blue-gray-900">
            {brandName}
          </span>
        </Link>
        
        <button
          className="!tw-absolute tw-top-1 tw-right-1 tw-block xl:tw-hidden tw-p-2 tw-text-gray-600 hover:tw-text-gray-900"
          onClick={() => setOpenSidenav(false)}
        >
          <XMarkIcon />
        </button>
        
        <nav className="tw-text-inherit">
          {routes.map(({ name, icon, path }, key) => (
            <Link href={path} key={key}>
              <div
                className={`tw-flex tw-items-center tw-gap-3 tw-p-3 tw-rounded-lg tw-transition-all tw-duration-200 ${
                  pathname === path
                    ? activeRouteClasses
                    : `tw-text-gray-700 hover:tw-bg-gray-100 focus:tw-bg-gray-100 active:tw-bg-gray-100 ${collapseItemClasses}`
                }`}
              >
                {icon}
                <span className="tw-capitalize tw-font-medium">
                  {name}
                </span>
              </div>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
