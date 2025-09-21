"use client";
import { useState } from "react";

// @tanstack/react-table
import {
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  flexRender,
} from "@tanstack/react-table";

// data
import { orderListDataTable } from "@/data";

// @material-tailwind/react
import {
  Card,
  Input,
  Typography,
  Button,
  CardBody,
  CardFooter,
} from "@material-tailwind/react";

// @heroicons/react
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { ChevronUpDownIcon } from "@heroicons/react/24/solid";

type Props = {};

export default function OrdersTable({}: Props) {
  const [sorting, setSorting] = useState([]);
  const columnHelper = createColumnHelper();
  const [data] = useState(() => [...orderListDataTable]);
  const [filtering, setFiltering] = useState("");

  const columns: any = [
    columnHelper.accessor("id", {
      cell: (info) => info.getValue(),
      footer: (info) => info.column.id,
    }),
    columnHelper.accessor("date", {
      cell: (info) => info.getValue(),
      // @ts-ignore
      footer: (info) => info.column.date,
    }),
    {
      accessorFn: (row: any) => row.status,
      id: "status",
      cell: (info: any) => info.getValue(),
      header: () => "status",
    },
    {
      accessorFn: (row: any) => row.customer,
      id: "customer",
      cell: (info: any) => info.getValue(),
      header: () => "Customer",
    },
    columnHelper.accessor("product", {
      header: "Product",
      footer: (info) => info.column.id,
    }),
    columnHelper.accessor("revenue", {
      header: "Revenue",
      footer: (info) => info.column.id,
    }),
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
    <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm tw-mt-4 tw-scroll-mt-4">
      <CardBody className="tw-flex tw-items-center tw-px-4 tw-justify-end">
        <div className="tw-w-52">
          <Input
            variant="outlined"
            value={filtering}
            onChange={(e) => setFiltering(e.target.value)}
            label="Search"
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
                    className="tw-px-5 tw-py-2 tw-uppercase"
                  >
                    <Typography
                      color="blue-gray"
                      className="tw-flex tw-cursor-pointer tw-items-center tw-justify-between tw-gap-2 tw-text-xs !tw-font-bold tw-leading-none tw-opacity-40"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}

                      <ChevronUpDownIcon className="tw-h-4 tw-w-4" />
                    </Typography>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="!tw-border-y !tw-border-x-0">
                    <Typography
                      variant="small"
                      className="!tw-font-medium !tw-text-blue-gray-500 tw-py-2 tw-px-4"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </Typography>
                  </td>
                ))}
              </tr>
            ))}
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
  );
}
