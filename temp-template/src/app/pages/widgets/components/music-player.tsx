"use client";

import { MusicCard } from "@/widgets/cards";

type Props = {};

export default function MusicPlayer({}: Props) {
  return (
    <div className="tw-relative">
      <MusicCard
        image="/img/bg-profile.jpeg"
        name="Some Kind Of Blues"
        artist="Deftones"
      />
    </div>
  );
}
