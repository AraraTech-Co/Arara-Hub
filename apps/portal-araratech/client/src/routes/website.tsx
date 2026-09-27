import { Home } from "views/website/home";
import { Contact } from "views/website/contact";
import { Pricing } from "views/website/pricing";
import { Terms } from "views/website/terms";
import { Privacy } from "views/website/privacy";

interface Route {
  path: string;
  view: React.ComponentType;
  layout: string;
  title: string;
}

const Routes: Route[] = [
  {
    path: "/",
    view: Home,
    layout: "home",
    title: "SaaS Boilerplate for Node.js",
  },
  {
    path: "/contact",
    view: Contact,
    layout: "home",
    title: "Contact",
  },
  {
    path: "/pricing",
    view: Pricing,
    layout: "home",
    title: "Pricing",
  },
  {
    path: "/privacy",
    view: Privacy,
    layout: "home",
    title: "Privacy Policy",
  },
  {
    path: "/terms",
    view: Terms,
    layout: "home",
    title: "Terms & Conditions",
  },
];

export default Routes;
