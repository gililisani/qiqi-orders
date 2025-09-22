'use client';

import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Typography,
  IconButton,
  Navbar,
  Spinner,
  Alert,
} from '../components/MaterialTailwind';
import { useMaterialTailwindController, setOpenSidenav } from '../context';
import {
  XMarkIcon,
  Bars3Icon,
  HomeIcon,
  UserGroupIcon,
  BuildingOffice2Icon,
  CubeIcon,
  ShoppingCartIcon,
  TagIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const adminRoutes = [
  {
    layout: 'admin',
    title: 'Dashboard',
    pages: [
      {
        name: 'Dashboard',
        path: '',
        icon: <HomeIcon className="h-5 w-5" />,
      },
      {
        name: 'Orders',
        path: '/orders',
        icon: <ShoppingCartIcon className="h-5 w-5" />,
      },
    ],
  },
  {
    layout: 'admin',
    title: 'Management',
    pages: [
      {
        name: 'Products',
        path: '/products',
        icon: <CubeIcon className="h-5 w-5" />,
      },
      {
        name: 'Categories',
        path: '/categories',
        icon: <TagIcon className="h-5 w-5" />,
      },
      {
        name: 'Companies',
        path: '/companies',
        icon: <BuildingOffice2Icon className="h-5 w-5" />,
      },
      {
        name: 'Users',
        path: '/users',
        icon: <UserGroupIcon className="h-5 w-5" />,
      },
      {
        name: 'Admins',
        path: '/admins',
        icon: <UserGroupIcon className="h-5 w-5" />,
      },
    ],
  },
  {
    layout: 'admin',
    title: 'Settings',
    pages: [
      {
        name: 'NetSuite',
        path: '/netsuite',
        icon: <DocumentTextIcon className="h-5 w-5" />,
      },
      {
        name: 'Configuration',
        path: '/locations',
        icon: <Cog6ToothIcon className="h-5 w-5" />,
      },
    ],
  },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading, error, isAdmin } = useAuth('Admin');
  const pathname = usePathname();
  const [controller, dispatch] = useMaterialTailwindController();
  const { sidenavColor, sidenavType, openSidenav } = controller;

  // Template2's sidebar types - exactly like the demo
  const sidenavTypes: { [key: string]: string } = {
    dark: "bg-gradient-to-br from-gray-800 to-gray-900",
    white: "bg-white shadow-sm",
    transparent: "bg-transparent",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-blue-gray-50/50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-12 w-12" />
          <Typography variant="h6" color="blue-gray">
            Loading...
          </Typography>
        </div>
      </div>
    );
  }

  if (error || !isAdmin) {
    return (
      <div className="min-h-screen bg-blue-gray-50/50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Alert color="red" className="mb-4">
            {error || 'Access denied. Admin permissions required.'}
          </Alert>
          <Link href="/login">
            <Typography variant="small" color="blue" className="text-center underline">
              Return to Login
            </Typography>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-gray-50/50">
      {/* Sidebar - Template2 Style */}
      <aside
        className={`${sidenavTypes[sidenavType]} ${
          openSidenav ? "translate-x-0" : "-translate-x-80"
        } fixed inset-0 z-50 my-4 ml-4 h-[calc(100vh-32px)] w-72 rounded-xl transition-transform duration-300 xl:translate-x-0 border border-blue-gray-100`}
      >
        <div className="relative">
          <Link href="/admin" className="py-6 px-8 text-center flex flex-col items-center gap-2">
            <img src="/QIQI-Logo.svg" className="h-8 w-auto" alt="logo" />
            <Typography
              variant="h6"
              color={sidenavType === "dark" ? "white" : "blue-gray"}
              className="font-bold"
            >
              PARTNERS HUB ADMIN
            </Typography>
          </Link>
          <IconButton
            variant="text"
            color="white"
            size="sm"
            ripple={false}
            className="absolute right-0 top-0 grid rounded-br-none rounded-tl-none xl:hidden"
            onClick={() => setOpenSidenav(dispatch, false)}
          >
            <XMarkIcon strokeWidth={2.5} className="h-5 w-5 text-white" />
          </IconButton>
        </div>
        <div className="m-4">
          {adminRoutes.map(({ layout, title, pages }, key) => (
            <ul key={key} className="mb-4 flex flex-col gap-1">
              {title && (
                <li className="mx-3.5 mt-4 mb-2">
                  <Typography
                    variant="small"
                    color={sidenavType === "dark" ? "white" : "blue-gray"}
                    className="font-black uppercase opacity-75"
                  >
                    {title}
                  </Typography>
                </li>
              )}
              {pages.map(({ icon, name, path }) => {
                const isActive = pathname === `/admin${path}`;
                return (
                  <li key={name}>
                    <Link href={`/admin${path}`}>
                      <Button
                        variant={isActive ? "gradient" : "text"}
                        color={
                          isActive
                            ? sidenavColor
                            : sidenavType === "dark"
                            ? "white"
                            : "blue-gray"
                        }
                        className="flex items-center gap-4 px-4 capitalize"
                        fullWidth
                      >
                        {icon}
                        <Typography
                          color="inherit"
                          className="font-medium capitalize"
                        >
                          {name}
                        </Typography>
                      </Button>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <div className="p-4 xl:ml-80">
        {/* Top Navbar */}
        <Navbar
          className="sticky top-4 z-40 flex h-max max-w-full py-2 px-4"
          fullWidth
          variant="transparent"
        >
          <div className="flex items-center justify-between text-blue-gray-900">
            <div className="flex items-center gap-2">
              <IconButton
                ripple={false}
                size="sm"
                variant="text"
                className="block xl:hidden"
                onClick={() => setOpenSidenav(dispatch, true)}
              >
                <Bars3Icon className="h-5 w-5" />
              </IconButton>
              <Typography
                as="a"
                href="#"
                className="mr-4 cursor-pointer py-1.5 font-medium"
              >
                Admin Dashboard
              </Typography>
            </div>
            <div className="flex items-center gap-2">
              <Typography variant="small" color="blue-gray">
                Welcome, {user?.email?.split('@')[0] || 'Admin'}
              </Typography>
            </div>
          </div>
        </Navbar>

        {/* Page Content */}
        <div className="mt-4">
          {children}
        </div>
      </div>
    </div>
  );
}