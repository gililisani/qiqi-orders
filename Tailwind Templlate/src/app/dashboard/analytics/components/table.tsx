"use client";

import React from "react";

// @widgets
import { Table } from "@/widgets/tables";
import { countriesData } from "@/data";

type Props = {};

export default function TableComponent({}: Props) {
  return <Table data={countriesData} />;
}
