"use client";

import React from "react";

import routes from "@/routes";

import { Cog6ToothIcon } from "@heroicons/react/24/solid";
import { IconButton } from "@material-tailwind/react";
import { DashboardNavbar, Configurator, Footer } from "@/widgets/layout";

import Sidenav from "@/widgets/layout/sidenav";
import { usePathname } from "next/navigation";

import { useMaterialTailwindController, setOpenConfigurator } from "@/context";

export default function InnerContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const [controller, dispatch] = useMaterialTailwindController();
  const { sidenavType } = controller;
  const pathname = usePathname();

  const isAuthPages = pathname.startsWith("/auth");
  const isPricingPage = pathname === "/pages/pricing-page";
  const isSimpleLayout = isAuthPages || isPricingPage;

  return (
    <div className="!tw-min-h-screen tw-bg-blue-gray-50/50">
      {!isSimpleLayout && (
        <Sidenav
          routes={routes}
          brandImg={
            sidenavType === "dark"
              ? "/img/logo-ct.png"
              : "/img/logo-ct-dark.png"
          }
        />
      )}
      <div className={`${isSimpleLayout ? "m-0" : "tw-p-4 xl:tw-ml-80"}`}>
        {!isSimpleLayout && (
          <>
            <DashboardNavbar />
            <Configurator />
            <IconButton
              size="lg"
              color="white"
              className="!tw-fixed tw-bottom-8 tw-right-8 tw-z-40 tw-rounded-full tw-shadow-blue-gray-900/10"
              ripple={false}
              onClick={() => setOpenConfigurator(dispatch, true)}
            >
              <Cog6ToothIcon className="tw-h-5 tw-w-5" />
            </IconButton>
          </>
        )}
        {children}
        {!isSimpleLayout && (
          <div className="tw-text-blue-gray-600">
            <Footer />
          </div>
        )}
      </div>
    </div>
  );
}
