"use client";

import SharedLayoutWrapper from '../components/template/SharedLayoutWrapper';
import { adminRoutes } from '../config/admin-routes';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SharedLayoutWrapper 
      routes={adminRoutes}
      brandName="Admin Portal"
    >
      {children}
    </SharedLayoutWrapper>
  );
}

