// @heroicons/react
import {
  DocumentIcon,
  LockClosedIcon,
  UserIcon,
  UserGroupIcon,
  HeartIcon,
  ShieldCheckIcon,
  BellIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";

export const sidenavCardData = [
  {
    icon: UserIcon,
    name: "Profile",
  },
  {
    icon: DocumentIcon,
    name: "Basic Info",
  },
  {
    icon: LockClosedIcon,
    name: "Change Password",
  },
  {
    icon: ShieldCheckIcon,
    name: "2FA",
  },
  {
    icon: UserGroupIcon,
    name: "Accounts",
  },
  {
    icon: BellIcon,
    name: "Notifications",
  },
  {
    icon: HeartIcon,
    name: "Sessions",
  },
  {
    icon: TrashIcon,
    name: "Delete Account",
  },
];

export default sidenavCardData;
