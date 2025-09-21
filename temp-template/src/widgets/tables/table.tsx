import React from "react";

// @material-tailwind/react
import { Typography, Avatar } from "@material-tailwind/react";

type PropTypes = {
  data: {}[];
};
export function Table({ data }: PropTypes) {
  return (
    <table className="tw-w-full !tw-min-w-[480px] !tw-table-auto">
      <tbody>
        {data.map((obj: any, key) => (
          <tr
            key={key}
            className={
              data.length - 1 !== key
                ? "tw-border-b tw-border-blue-gray-50"
                : ""
            }
          >
            {Object.keys(obj).map((el, key) =>
              typeof obj[el] === "object" && obj[el]["img"] ? (
                <td key={el} className="tw-py-3 tw-px-4">
                  <div className="tw-flex tw-items-center tw-gap-4">
                    <Avatar
                      src={obj[el]["img"]}
                      alt={obj[el]["name"]}
                      size={obj[el]["imgSize"] || "xs"}
                      className="tw-h-auto"
                      variant="square"
                    />
                    <div>
                      <Typography className="tw-min-w-max tw-text-xs !tw-font-medium tw-capitalize !tw-text-blue-gray-500">
                        {el}:
                      </Typography>
                      <Typography
                        variant="small"
                        color="blue-gray"
                        className="!tw-font-normal"
                      >
                        {obj[el]["name"]}
                      </Typography>
                    </div>
                  </div>
                </td>
              ) : (
                <td
                  key={el}
                  className="tw-py-3 tw-px-4 tw-text-center !tw-border-0"
                >
                  <Typography className="tw-min-w-max tw-text-xs !tw-font-medium tw-capitalize !tw-text-blue-gray-500">
                    {el}:
                  </Typography>
                  <Typography
                    variant="small"
                    color="blue-gray"
                    className="!tw-font-normal"
                  >
                    {obj[el]}
                  </Typography>
                </td>
              )
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default Table;
