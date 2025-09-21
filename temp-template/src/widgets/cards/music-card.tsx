/* eslint-disable @next/next/no-img-element */
import React from "react";

// @material-tailwind/react
import { Typography, IconButton } from "@material-tailwind/react";

// @heroicons/react
import { PlayIcon, BackwardIcon, ForwardIcon } from "@heroicons/react/24/solid";

type PropTypes = {
  name: string;
  artist: string;
  image: string;
  playProps?: () => void;
  prevProps?: () => void;
  nextProps?: () => void;
};

export function MusicCard({
  name,
  artist,
  image,
  playProps,
  prevProps,
  nextProps,
}: PropTypes) {
  return (
    <div>
      <div className="tw-absolute tw-h-40 tw-w-full tw-overflow-hidden tw-rounded-xl tw-bg-blue-gray-900">
        <img
          src={image}
          alt="music cover"
          className={`tw-absolute tw-h-full tw-w-full tw-object-cover tw-object-center tw-opacity-20`}
        />
      </div>
      <div className="tw-relative tw-p-6 tw-text-white">
        <Typography variant="h5">{name}</Typography>
        <Typography className="!tw-font-normal">{artist}</Typography>
        <div className="tw-mt-6 tw-flex tw-gap-3">
          <IconButton
            variant="outlined"
            className="tw-rounded-full"
            color="white"
            {...prevProps}
          >
            <BackwardIcon className="tw-h-4 tw-w-4" />
          </IconButton>
          <IconButton
            variant="outlined"
            className="tw-rounded-full"
            color="white"
            {...playProps}
          >
            <PlayIcon className="tw-h-4 tw-w-4" />
          </IconButton>
          <IconButton
            variant="outlined"
            className="tw-rounded-full"
            color="white"
            {...nextProps}
          >
            <ForwardIcon className="tw-h-4 tw-w-4" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

export default MusicCard;
