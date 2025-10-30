"use client";

import React from "react";

// @react-jvectormap
import { VectorMap } from "@react-jvectormap/core";
import { worldMerc } from "@react-jvectormap/world";

// Sales by country data
const MAP_CONFIG = {
  map: worldMerc,
  zoomOnScroll: false,
  zoomButtons: false,
  markersSelectable: true,
  backgroundColor: "transparent",
  selectedMarkers: ["1", "3"],
  markers: [
    {
      name: "USA",
      latLng: [40.71296415909766, -74.00437720027804],
    },
    {
      name: "Germany",
      latLng: [51.17661451970939, 10.97947735117339],
    },
    {
      name: "Brazil",
      latLng: [-7.596735421549542, -54.781694323779185],
    },
    {
      name: "Russia",
      latLng: [62.318222797104276, 89.81564777631716],
    },
    {
      name: "China",
      latLng: [22.320178999475512, 114.17161225541399],
    },
  ],
  regionStyle: {
    initial: {
      fill: "#dee2e7",
      "fill-opacity": 1,
      stroke: "none",
      "stroke-width": 0,
      "stroke-opacity": 0,
    },
  },
  markerStyle: {
    initial: {
      fill: "#000",
      stroke: "#ffffff",
      "stroke-width": 5,
      "stroke-opacity": 0.5,
      r: 7,
    },
    hover: {
      fill: "#000",
      stroke: "#ffffff",
      "stroke-width": 5,
      "stroke-opacity": 0.5,
    },
    selected: {
      fill: "#000",
      stroke: "#ffffff",
      "stroke-width": 5,
      "stroke-opacity": 0.5,
    },
  },
  onRegionTipShow: () => false,
  onMarkerTipShow: () => false,
};

type Props = {};

export default function WorldMap({}: Props) {
  return (
    <div className="tw-mt-12 tw-h-full tw-min-h-max lg:-tw-mt-24">
      <VectorMap {...MAP_CONFIG} className="tw-col-span-1 !tw-h-72 tw-w-full" />
    </div>
  );
}
