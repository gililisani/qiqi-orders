"use client";
import React from "react";
import { useState } from "react";

import {
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  flexRender,
} from "@tanstack/react-table";

import { AppDataTable } from "@/data";

// @material-tailwind/react
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Typography,
  CardFooter,
  Input,
} from "@material-tailwind/react";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
} from "@heroicons/react/24/solid";

export function SearchDataTables() {
  const [sorting, setSorting] = useState([]);
  const [data] = useState(() => [...AppDataTable]);
  const [filtering, setFiltering] = useState("");

  const columns = [
    {
      accessorFn: (row: any) => row.name,
      id: "name",
      cell: (info: any) => info.getValue(),
      header: () => "name",
    },
    {
      accessorFn: (row: any) => row.position,
      id: "position",
      cell: (info: any) => info.getValue(),
      header: () => "position",
    },
    {
      accessorFn: (row: any) => row.office,
      id: "office",
      cell: (info: any) => info.getValue(),
      header: () => "office",
    },
    {
      accessorFn: (row: any) => row.age,
      id: "age",
      cell: (info: any) => info.getValue(),
      header: () => "age",
    },
    {
      accessorFn: (row: any) => row.startdate,
      id: "startdate",
      cell: (info: any) => info.getValue(),
      header: () => "start date",
    },
    {
      accessorFn: (row: any) => row.salary,
      id: "salary",
      cell: (info: any) => info.getValue(),
      header: () => "salary",
    },
  ];

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter: filtering,
      sorting: sorting,
    },
    // @ts-ignore
    onSortingChange: setSorting,
    onGlobalFilterChange: setFiltering,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <>
      {/** Search DataTable */}
      <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm tw-mt-8 tw-scroll-mt-4">
        <CardHeader floated={false} shadow={false} className="tw-p-2">
          <Typography color="blue-gray" variant="h5">
            Datatable Search
          </Typography>
          <Typography
            variant="small"
            className="!tw-text-blue-gray-500 !tw-font-normal tw-mb-4 tw-mt-1"
          >
            A lightweight, extendable, dependency-free javascript HTML table
            plugin.
          </Typography>
        </CardHeader>
        <CardBody className="tw-flex tw-items-center tw-px-4 tw-justify-between">
          <div className="tw-flex tw-gap-4 tw-w-full tw-items-center">
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => {
                table.setPageSize(Number(e.target.value));
              }}
              className="tw-border tw-p-2 tw-border-blue-gray-100 tw-rounded-lg tw-max-w-[70px] tw-w-full"
            >
              {[5, 10, 15, 20, 25].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
            <Typography
              variant="small"
              className="!tw-text-blue-gray-500 !tw-font-normal"
            >
              entries per page
            </Typography>
          </div>
          <div className="tw-w-52">
            <Input
              variant="outlined"
              value={filtering}
              onChange={(e) => setFiltering(e.target.value)}
              label="Search"
              crossOrigin={undefined}
            />
          </div>
        </CardBody>
        <CardFooter className="tw-p-0 tw-overflow-scroll">
          <table className="tw-table-auto tw-text-left tw-w-full tw-min-w-max">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="tw-p-4 tw-uppercase !tw-text-blue-gray-500 !tw-font-medium"
                    >
                      <Typography
                        color="blue-gray"
                        className="tw-flex tw-items-center tw-justify-between tw-gap-2 tw-text-xs !tw-font-bold tw-leading-none tw-opacity-40"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        <ChevronUpDownIcon
                          strokeWidth={2}
                          className="tw-h-4 tw-w-4"
                        />
                      </Typography>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length
                ? table.getRowModel().rows.map((row, index) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="!tw-border-y !tw-border-x-0"
                        >
                          <Typography
                            variant="small"
                            className="!tw-font-normal !tw-text-blue-gray-500 tw-py-4 tw-px-4"
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </Typography>
                        </td>
                      ))}
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </CardFooter>
        <div className="tw-flex tw-items-center tw-justify-end tw-gap-6 tw-px-10 tw-py-6">
          <span className="tw-flex tw-items-center tw-gap-1">
            <Typography className="!tw-font-bold">Page</Typography>
            <strong>
              {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </strong>
          </span>
          <div className="tw-flex tw-items-center tw-gap-2">
            <Button
              variant="outlined"
              size="sm"
              onClick={() => {
                table.previousPage();
              }}
              disabled={!table.getCanPreviousPage()}
              className="disabled:tw-opacity-30 tw-py-2 tw-px-2"
            >
              <ChevronLeftIcon className="tw-w-4 tw-h-4 tw-stroke-blue-gray-900 tw-stroke-2" />
            </Button>
            <Button
              variant="outlined"
              size="sm"
              onClick={() => {
                table.nextPage();
              }}
              disabled={!table.getCanNextPage()}
              className="disabled:tw-opacity-30 tw-py-2 tw-px-2"
            >
              <ChevronRightIcon className="tw-w-4 tw-h-4 tw-stroke-blue-gray-900 tw-stroke-2" />
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}

export default SearchDataTables;
