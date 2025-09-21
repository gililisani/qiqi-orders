import React from "react";

import SimpleDataTables from "./components/simple-data-table";
import SearchDataTables from "./components/search-data-table";

export default function DataTablesPage() {
  return (
    <>
      {/** Simple DataTable */}
      <SimpleDataTables />

      {/** Search DataTable */}
      <SearchDataTables />
    </>
  );
}
