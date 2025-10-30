"use client";

import React from "react";

// widgets
import { Table } from "@/widgets/tables";

// data
import { countriesData } from "@/data";

type Props = {};

export default function CountryTable({}: Props) {
  return (
    <div className="tw-col-span-1 tw-overflow-scroll">
      <Table data={countriesData} />{" "}
    </div>
  );
}
