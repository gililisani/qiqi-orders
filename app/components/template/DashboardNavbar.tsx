"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

// @material-tailwind/react
import {
  Navbar,
  Typography,
  IconButton,
  Breadcrumbs,
  Input,
  Menu,
  MenuHandler,
  MenuList,
  MenuItem,
  Badge,
} from "@material-tailwind/react";

// @heroicons/react
import {
  UserCircleIcon,
  Cog6ToothIcon,
  BellIcon,
  Bars3Icon,
  HomeIcon,
  Bars3CenterLeftIcon,
  EnvelopeIcon,
  MicrophoneIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/solid";

// @context
import {
  useMaterialTailwindController,
  setOpenConfigurator,
  setOpenSidenav,
} from "@/app/context";

// Components
import FeedbackPopup from "../ui/FeedbackPopup";

export function DashboardNavbar() {
  const [controller, dispatch] = useMaterialTailwindController();
  const { fixedNavbar, openSidenav } = controller;
  const pathname = usePathname();
  const [layout, page] = pathname.split("/").filter((el) => el !== "");
  const [userName, setUserName] = useState<string>('User');
  const [userEmail, setUserEmail] = useState<string>('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const feedbackButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const response = await fetch(`/api/user-profile?userId=${user.id}`);
          const data = await response.json();
          if (data.success && data.user?.name) {
            setUserName(data.user.name);
          }
          setUserEmail(user.email || data.user?.email || '');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };
  
  return (
    <Navbar
      color={fixedNavbar ? "white" : "transparent"}
      className={`rounded-xl !transition-all !max-w-full ${
        fixedNavbar
          ? "!sticky top-4 z-40 !py-3 shadow-md shadow-blue-gray-500/5"
          : "!px-0 !py-1"
      }`}
      fullWidth
      blurred={fixedNavbar}
      placeholder={undefined}
      onPointerEnterCapture={undefined}
      onPointerLeaveCapture={undefined}
    >
      <div className="!flex flex-col !justify-between gap-2 md:!flex-row md:items-center">
        <div className="capitalize">
          <Breadcrumbs
            className={`bg-transparent !p-0 transition-all ${
              fixedNavbar ? "mt-1" : ""
            }`}
            placeholder={undefined}
            onPointerEnterCapture={undefined}
            onPointerLeaveCapture={undefined}
          >
            <Link href={pathname.startsWith("/client") ? "/client" : "/admin"}>
              <IconButton size="sm" variant="text" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <HomeIcon className="h-4 w-4 text-gray-900" />
              </IconButton>
            </Link>
            <Typography
              variant="small"
              color="blue-gray"
              className="!font-normal opacity-50 transition-all hover:!text-blue-gray-700 hover:opacity-100"
              placeholder={undefined}
              onPointerEnterCapture={undefined}
              onPointerLeaveCapture={undefined}
            >
              {layout}
            </Typography>
            <Typography
              variant="small"
              color="blue-gray"
              className="!font-normal"
              placeholder={undefined}
              onPointerEnterCapture={undefined}
              onPointerLeaveCapture={undefined}
            >
              {page?.split("-").join(" ")}
            </Typography>
          </Breadcrumbs>
          <Typography variant="h6" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            {page?.split("-").join(" ")}
          </Typography>
        </div>
        <div className="!flex items-center gap-2">
          <div className="mr-auto md:mr-4 md:w-56">
            <Input 
              label="Search" 
              placeholder="Search orders, companies, users..."
              onPointerEnterCapture={undefined} 
              onPointerLeaveCapture={undefined} 
              crossOrigin={undefined}
              disabled
            />
          </div>
          <button 
            ref={feedbackButtonRef}
            onClick={() => setFeedbackOpen(!feedbackOpen)}
            className="hidden lg:inline-flex h-8 items-center rounded-full border border-[#e5e5e5] px-3 text-xs text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            Feedback
          </button>
          <FeedbackPopup 
            isOpen={feedbackOpen} 
            onClose={() => setFeedbackOpen(false)}
            buttonRef={feedbackButtonRef}
          />
          <Menu>
            <MenuHandler>
              <IconButton variant="text" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <UserCircleIcon className="h-5 w-5 text-blue-gray-900" />
              </IconButton>
            </MenuHandler>
            <MenuList className="!w-64 border border-blue-gray-100" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <MenuItem className="flex flex-col items-start gap-1 py-3" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <Typography variant="small" className="!font-semibold text-gray-900" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  {userName}
                </Typography>
                <Typography variant="small" className="!font-normal text-gray-600" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  {userEmail}
                </Typography>
              </MenuItem>
              <div className="border-t border-blue-gray-100 my-2"></div>
              <MenuItem 
                className="flex items-center gap-2 text-red-600 hover:text-red-700" 
                onClick={handleLogout}
                placeholder={undefined} 
                onPointerEnterCapture={undefined} 
                onPointerLeaveCapture={undefined}
              >
                <Typography variant="small" className="!font-normal" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  Log Out
                </Typography>
              </MenuItem>
            </MenuList>
          </Menu>
          <IconButton
            variant="text"
            color="blue-gray"
            className="grid xl:hidden"
            onClick={() => setOpenSidenav(dispatch, !openSidenav)}
            placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}
          >
            {openSidenav ? (
              <Bars3Icon
                strokeWidth={3}
                className="h-6 w-6 text-gray-900"
              />
            ) : (
              <Bars3CenterLeftIcon
                strokeWidth={3}
                className="h-6 w-6 text-gray-900"
              />
            )}
          </IconButton>
          <IconButton
            variant="text"
            color="gray"
            onClick={() => setOpenConfigurator(dispatch, true)}
            placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}
          >
            <Cog6ToothIcon className="h-5 w-5 text-gray-900" />
          </IconButton>
          <Menu>
            <MenuHandler>
              <span>
                <Badge>
                  <IconButton variant="text" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                    <BellIcon className="h-5 w-5 text-gray-900" />
                  </IconButton>
                </Badge>
              </span>
            </MenuHandler>
            <MenuList className="!w-max border border-blue-gray-100" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <MenuItem className="flex items-center gap-2" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <EnvelopeIcon className="h-5 w-5 text-gray-900" />
                <Typography variant="small" className="!font-normal" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  Check new messages
                </Typography>
              </MenuItem>
              <MenuItem className="flex items-center gap-2" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <MicrophoneIcon className="h-5 w-5 text-gray-900" />
                <Typography variant="small" className="!font-normal" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  Manage Podcast sessions
                </Typography>
              </MenuItem>
              <MenuItem className="flex items-center gap-2" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <ShoppingCartIcon className="h-5 w-5 text-gray-900" />
                <Typography variant="small" className="!font-normal" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  Payment successfully completed
                </Typography>
              </MenuItem>
            </MenuList>
          </Menu>
        </div>
      </div>
    </Navbar>
  );
}

export default DashboardNavbar;

