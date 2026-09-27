import { Signin } from "views/signin";
import { Dashboard } from "views/dashboard";
import { Accounts } from "views/accounts";
import { Users } from "views/users";
import { Feedback } from "views/feedback";
import { Logs } from "views/log/list";
import { LogDetail } from "views/log/detail";
import { EventGroups } from "views/event/groups";
import { Events } from "views/event/list";
import { EventDetail } from "views/event/detail";

const Routes = [
  {
    path: "/",
    view: Signin,
    layout: "auth",
    title: "Mission Control",
  },
  {
    path: "/signin",
    view: Signin,
    layout: "auth",
    title: "Mission Control",
  },
  {
    path: "/dashboard",
    view: Dashboard,
    layout: "app",
    permission: "master",
    title: "Mission Control",
  },
  {
    path: "/accounts",
    view: Accounts,
    layout: "app",
    permission: "master",
    title: "Accounts",
  },
  {
    path: "/users",
    view: Users,
    layout: "app",
    permission: "master",
    title: "Users",
  },
  {
    path: "/feedback",
    view: Feedback,
    layout: "app",
    permission: "master",
    title: "User Feedback",
  },
  {
    path: "/logs",
    view: Logs,
    layout: "app",
    permission: "master",
    title: "App Logs",
  },
  {
    path: "/logs/:id",
    view: LogDetail,
    layout: "app",
    permission: "master",
    title: "Log Detail",
  },
  {
    path: "/events",
    view: EventGroups,
    layout: "app",
    permission: "master",
    title: "Events",
  },
  {
    path: "/events/:group",
    view: Events,
    layout: "app",
    permission: "master",
    title: "Event",
  },
  {
    path: "/events/:group/:id",
    view: EventDetail,
    layout: "app",
    permission: "master",
    title: "Event Detail",
  },
];

export default Routes;
