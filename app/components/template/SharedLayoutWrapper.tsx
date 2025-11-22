"use client";

import React from "react";
import Sidenav from "./Sidenav";
import DashboardNavbar from "./DashboardNavbar";
import Configurator from "./Configurator";
import { usePathname } from "next/navigation";
import { useMaterialTailwindController, setOpenSidenav } from "@/app/context";

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
  const [controller, dispatch] = useMaterialTailwindController();
  const { sidenavType, sidenavCollapsed, openSidenav } = controller;
  const pathname = usePathname();
  const [isHovering, setIsHovering] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(false);

  // Reset hover state when window resizes below desktop breakpoint or near breakpoint
  React.useEffect(() => {
    const checkDesktop = () => {
      const width = window.innerWidth;
      const desktop = width >= 1280;
      setIsDesktop(desktop);
      // Reset hover state if we're not on desktop OR if we're too close to breakpoint
      // Add buffer to prevent expansion near breakpoint (1320px minimum for hover)
      if (!desktop || width < 1320) {
        setIsHovering(false);
      }
    };
    
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  // Reset hover state when sidenavCollapsed changes (toggle button clicked)
  React.useEffect(() => {
    setIsHovering(false);
  }, [sidenavCollapsed]);

  // Determine if this should show the full layout or not
  const isAuthPages = pathname.startsWith("/login") || pathname.startsWith("/reset-password");
  const isSimpleLayout = isAuthPages;

  return (
    <div className="min-h-screen bg-blue-gray-50/50 grid grid-rows-[auto_1fr] w-full overflow-x-hidden">
      {/* Row 1: Navbar */}
      {!isSimpleLayout && (
        <>
          <DashboardNavbar />
          <Configurator />
        </>
      )}
      
      {/* Row 2: 2 Columns - Sidebar + Content */}
      {!isSimpleLayout ? (
        <div className="relative h-full w-full overflow-x-hidden">
          {/* Desktop: Grid layout with 2 columns */}
          <div className={`hidden xl:grid h-full transition-all duration-300 ${
            (sidenavCollapsed && !isHovering) ? "grid-cols-[5rem_1fr]" : "grid-cols-[19rem_1fr]"
          }`}>
            {/* Left Column: Sidebar */}
            <div className="h-full relative">
              <Sidenav
                routes={routes}
                brandName={brandName}
                brandImg={brandImg}
                onHoverChange={setIsHovering}
              />
            </div>
            
            {/* Right Column: Content */}
            <div className="p-4 overflow-y-auto">
              {children}
            </div>
          </div>
          
          {/* Mobile: Overlay sidebar */}
          <div className="xl:hidden h-full w-full overflow-x-hidden">
            {/* Sidebar overlay */}
            <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ${
              openSidenav ? "translate-x-0" : "-translate-x-full"
            }`}>
              <div className="h-full w-full">
                <Sidenav
                  routes={routes}
                  brandName={brandName}
                  brandImg={brandImg}
                  isMobile={true}
                />
              </div>
            </div>
            
            {/* Mobile overlay backdrop */}
            {openSidenav && (
              <div 
                className="fixed inset-0 bg-black bg-opacity-50 z-30"
                onClick={() => setOpenSidenav(dispatch, false)}
              />
            )}
            
            {/* Content */}
            <div className="p-4 w-full max-w-full overflow-x-hidden">
              {children}
            </div>
          </div>
        </div>
      ) : (
        <div className="m-0">
          {children}
        </div>
      )}
    </div>
  );
}

