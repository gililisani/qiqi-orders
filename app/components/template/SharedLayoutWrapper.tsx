"use client";

import React from "react";
import Sidenav from "./Sidenav";
import DashboardNavbar from "./DashboardNavbar";
import Configurator from "./Configurator";
import { usePathname } from "next/navigation";
import { useMaterialTailwindController } from "@/app/context";

interface Route {
  name: string;
  icon?: React.ReactNode;
  pages?: Route[];
  title?: string;
  divider?: boolean;
  external?: boolean;
  path?: string;
}

interface SharedLayoutWrapperProps {
  children: React.ReactNode;
  routes?: Route[];
  brandName?: string;
  brandImg?: string;
}

export default function SharedLayoutWrapper({
  children,
  routes = [],
  brandName,
  brandImg = "/QIQI-Logo.svg",
}: SharedLayoutWrapperProps) {
  const [controller] = useMaterialTailwindController();
  const { sidenavType, sidenavCollapsed } = controller;
  const pathname = usePathname();

  // Determine if this should show the full layout or not
  const isAuthPages = pathname.startsWith("/login") || pathname.startsWith("/reset-password");
  const isSimpleLayout = isAuthPages;

  return (
    <div className="min-h-screen bg-blue-gray-50/50">
      {!isSimpleLayout && (
        <Sidenav
          routes={routes}
          brandName={brandName}
          brandImg={brandImg}
        />
      )}
      <div className={`${isSimpleLayout ? "m-0" : "p-4"} ${!isSimpleLayout && (sidenavCollapsed ? "xl:ml-24" : "xl:ml-80")} ${!isSimpleLayout ? "transition-all duration-300" : ""}`}>
        {!isSimpleLayout && (
          <>
            <DashboardNavbar />
            <Configurator />
          </>
        )}
        {children}
      </div>
    </div>
  );
}

