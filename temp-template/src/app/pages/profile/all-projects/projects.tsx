"use client";

// @material-tailwind/react
import {
  Menu,
  MenuHandler,
  MenuList,
  MenuItem,
  IconButton,
} from "@/components/MaterialTailwind";

// @heroicons/react
import { EllipsisVerticalIcon } from "@heroicons/react/24/solid";

import { ProjectCard } from "@/widgets/cards";

type Props = {};

// Cards Action
function CardAction() {
  return (
    <Menu placement="left-start">
      <MenuHandler>
        <IconButton size="sm" variant="text" color="gray">
          <EllipsisVerticalIcon className="tw-h-6 tw-w-6" />
        </IconButton>
      </MenuHandler>
      <MenuList>
        <MenuItem>Action</MenuItem>
        <MenuItem>Another Action 2</MenuItem>
        <MenuItem>Something else here</MenuItem>
      </MenuList>
    </Menu>
  );
}

// Project Card Data
const PROJECT_CARD_DATA = [
  {
    title: "Slack Bot",
    img: "/img/logo-slack.svg",
    description:
      "If everything I did failed - which it doesn't, I think that it actually succeeds.",
    members: [
      { img: "/img/team-1.jpeg", name: "Romina Hadid" },
      { img: "/img/team-2.jpeg", name: "Ryan Tompson" },
      { img: "/img/team-3.jpeg", name: "Jessica Doe" },
      { img: "/img/team-4.jpeg", name: "Alexander Smith" },
    ],
    options: {
      Participants: 5,
      "Due date": "02.03.22",
    },
    action: <CardAction />,
  },
  {
    title: "Premium Support",
    img: "/img/logo-spotify.svg",
    description:
      "Pink is obviously a better color. and everything's taken away from you.",
    members: [
      { img: "/img/team-1.jpeg", name: "Romina Hadid" },
      { img: "/img/team-2.jpeg", name: "Ryan Tompson" },
      { img: "/img/team-3.jpeg", name: "Jessica Doe" },
      { img: "/img/team-4.jpeg", name: "Alexander Smith" },
    ],
    options: {
      Participants: 3,
      "Due date": "22.11.21",
    },
    action: <CardAction />,
  },
  {
    title: "Design Tools",
    img: "/img/logo-xd.svg",
    description:
      "Constantly growing. We're constantly making mistakes from which we learn and improve.",
    members: [
      { img: "/img/team-1.jpeg", name: "Romina Hadid" },
      { img: "/img/team-2.jpeg", name: "Ryan Tompson" },
      { img: "/img/team-3.jpeg", name: "Jessica Doe" },
      { img: "/img/team-4.jpeg", name: "Alexander Smith" },
    ],
    options: {
      Participants: 3,
      "Due date": "06.03.20",
    },
    action: <CardAction />,
  },
  {
    title: "Looking Great",
    img: "/img/logo-asana.svg",
    description:
      "You have the opportunity to play this game of life you need to appreciate every moment.",
    members: [
      { img: "/img/team-1.jpeg", name: "Romina Hadid" },
      { img: "/img/team-2.jpeg", name: "Ryan Tompson" },
      { img: "/img/team-3.jpeg", name: "Jessica Doe" },
      { img: "/img/team-4.jpeg", name: "Alexander Smith" },
    ],
    options: {
      Participants: 6,
      "Due date": "14.03.24",
    },
    action: <CardAction />,
  },
  {
    title: "Developer First",
    img: "/img/logo-invision.svg",
    description:
      "For standing out. But the time is now to be okay to be the greatest you.",
    members: [
      { img: "/img/team-1.jpeg", name: "Romina Hadid" },
      { img: "/img/team-2.jpeg", name: "Ryan Tompson" },
      { img: "/img/team-3.jpeg", name: "Jessica Doe" },
      { img: "/img/team-4.jpeg", name: "Alexander Smith" },
    ],
    options: {
      Participants: 4,
      "Due date": "16.01.22",
    },
    action: <CardAction />,
  },
  {
    title: "Product Development",
    img: "/img/logo-atlassian.svg",
    description:
      "We strive to embrace and drive change in our industry. We are happy to work at such a project.",
    members: [
      { img: "/img/team-1.jpeg", name: "Romina Hadid" },
      { img: "/img/team-2.jpeg", name: "Ryan Tompson" },
      { img: "/img/team-3.jpeg", name: "Jessica Doe" },
      { img: "/img/team-4.jpeg", name: "Alexander Smith" },
    ],
    options: {
      Participants: 4,
      "Due date": "16.01.22",
    },
    action: <CardAction />,
  },
];

export default function Projects({}: Props) {
  return (
    <div className="tw-mb-6 tw-grid tw-gap-x-6 tw-gap-y-12 sm:tw-grid-cols-1 md:tw-grid-cols-2 lg:tw-grid-cols-3">
      {PROJECT_CARD_DATA.map((props) => (
        <ProjectCard key={props.title} {...props} />
      ))}
    </div>
  );
}
