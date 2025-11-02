"use client";

import React from "react";
import AdminLayoutWrapper from "../components/template/AdminLayoutWrapper";
import { adminRoutes } from "../config/admin-routes";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminLayoutWrapper routes={adminRoutes}>
      {children}
    </AdminLayoutWrapper>
  );
}

