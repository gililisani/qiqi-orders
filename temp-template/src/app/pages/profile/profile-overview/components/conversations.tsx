"use client";

// @material-tailwind/react
import {
  Avatar,
  Typography,
  Button,
  List,
  ListItem,
  ListItemPrefix,
  ListItemSuffix,
} from "@material-tailwind/react";

// data
import { conversationsData } from "@/data";

type Props = {};

export default function Conversations({}: Props) {
  return (
    <div>
      <Typography variant="h6" color="blue-gray" className="tw-mb-3">
        Conversation
      </Typography>
      <List>
        {conversationsData.map(({ img, name, message }) => (
          <ListItem className="!tw-px-0" key={name}>
            <ListItemPrefix>
              <Avatar
                src={img}
                alt={name}
                variant="rounded"
                className="tw-shadow-lg tw-shadow-blue-gray-500/25"
              />
            </ListItemPrefix>
            <div className="tw-flex tw-flex-col tw-gap-1">
              <Typography
                variant="small"
                color="blue-gray"
                className="!tw-font-semibold"
              >
                {name}
              </Typography>
              <Typography className="tw-text-xs !tw-font-normal !tw-text-blue-gray-500">
                {message}
              </Typography>
            </div>
            <ListItemSuffix>
              <Button variant="text" size="sm" color="gray">
                reply
              </Button>
            </ListItemSuffix>
          </ListItem>
        ))}
      </List>
    </div>
  );
}
