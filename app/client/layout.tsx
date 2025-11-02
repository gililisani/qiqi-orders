"use client";

import SharedLayoutWrapper from '../components/template/SharedLayoutWrapper';
import { clientRoutes } from '../config/client-routes';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <SharedLayoutWrapper 
      routes={clientRoutes}
      brandName="Client Portal"
    >
      {children}
    </SharedLayoutWrapper>
  );
}

