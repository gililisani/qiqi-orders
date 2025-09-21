'use client';

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Heroicons
const HomeIcon = () => (
  <svg className="tw-h-4 tw-w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
);

const UserCircleIcon = () => (
  <svg className="tw-h-5 tw-w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

const Cog6ToothIcon = () => (
  <svg className="tw-h-5 tw-w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

const BellIcon = () => (
  <svg className="tw-h-5 tw-w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
  </svg>
);

const Bars3Icon = () => (
  <svg className="tw-h-6 tw-w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
  </svg>
);

const Bars3CenterLeftIcon = () => (
  <svg className="tw-h-6 tw-w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12H12m-8.25 5.25h16.5" />
  </svg>
);

const MagnifyingGlassIcon = () => (
  <svg className="tw-h-5 tw-w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
  </svg>
);

type PropTypes = {
  fixedNavbar?: boolean;
  openSidenav?: boolean;
  setOpenSidenav?: (open: boolean) => void;
};

export default function TemplateNavbar({
  fixedNavbar = true,
  openSidenav = false,
  setOpenSidenav = () => {},
}: PropTypes) {
  const pathname = usePathname();
  const [layout, page] = pathname.split("/").filter((el) => el !== "");

  return (
    <nav
      className={`tw-rounded-xl tw-transition-all tw-max-w-full ${
        fixedNavbar
          ? "tw-sticky tw-top-4 tw-z-40 tw-py-3 tw-shadow-md tw-shadow-blue-gray-500/5 tw-bg-white"
          : "tw-px-0 tw-py-1 tw-bg-transparent"
      }`}
    >
      <div className="tw-flex tw-flex-col tw-justify-between tw-gap-2 md:tw-flex-row md:tw-items-center">
        <div className="tw-capitalize">
          <div className={`tw-bg-transparent tw-transition-all ${fixedNavbar ? "tw-mt-1" : ""}`}>
            <Link href="/admin/dashboard-new">
              <button className="tw-p-2 tw-rounded-lg hover:tw-bg-gray-100 tw-transition-colors">
                <HomeIcon />
              </button>
            </Link>
            <span className="tw-text-sm tw-text-blue-gray-500 tw-opacity-50 tw-transition-all hover:tw-text-blue-gray-700 hover:tw-opacity-100 tw-mx-2">
              {layout}
            </span>
            <span className="tw-text-sm tw-text-blue-gray-500 tw-font-normal">
              {page?.split("-").join(" ")}
            </span>
          </div>
          <h6 className="tw-text-xl tw-font-semibold tw-text-blue-gray-900 tw-mt-1">
            {page?.split("-").join(" ") || "Dashboard"}
          </h6>
        </div>
        
        <div className="tw-flex tw-items-center">
          <div className="tw-mr-auto md:tw-mr-4 md:tw-w-56">
            <div className="tw-relative">
              <div className="tw-absolute tw-inset-y-0 tw-left-0 tw-pl-3 tw-flex tw-items-center tw-pointer-events-none">
                <MagnifyingGlassIcon />
              </div>
              <input
                type="text"
                placeholder="Search"
                className="tw-block tw-w-full tw-pl-10 tw-pr-3 tw-py-2 tw-border tw-border-blue-gray-300 tw-rounded-lg tw-bg-white tw-text-sm tw-placeholder-blue-gray-500 focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-blue-500 focus:tw-border-transparent"
              />
            </div>
          </div>
          
          <Link href="/">
            <button className="tw-p-2 tw-rounded-lg hover:tw-bg-gray-100 tw-transition-colors tw-mr-2">
              <UserCircleIcon />
            </button>
          </Link>
          
          <button
            className="tw-p-2 tw-rounded-lg hover:tw-bg-gray-100 tw-transition-colors tw-text-blue-gray-900 tw-grid xl:tw-hidden tw-mr-2"
            onClick={() => setOpenSidenav(!openSidenav)}
          >
            {openSidenav ? (
              <Bars3Icon />
            ) : (
              <Bars3CenterLeftIcon />
            )}
          </button>
          
          <button className="tw-p-2 tw-rounded-lg hover:tw-bg-gray-100 tw-transition-colors tw-text-gray-900 tw-mr-2">
            <Cog6ToothIcon />
          </button>
          
          <button className="tw-p-2 tw-rounded-lg hover:tw-bg-gray-100 tw-transition-colors tw-relative">
            <BellIcon />
            <span className="tw-absolute tw-top-1 tw-right-1 tw-block tw-h-2 tw-w-2 tw-rounded-full tw-bg-red-500 tw-ring-2 tw-ring-white"></span>
          </button>
        </div>
      </div>
    </nav>
  );
}
