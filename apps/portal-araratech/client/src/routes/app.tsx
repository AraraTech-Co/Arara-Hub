import { Dashboard } from "@/views/dashboard/dashboard";
import { Help } from "@/views/dashboard/help";
import { Sales } from "@/views/dashboard/sales";
import { Tickets } from "@/views/dashboard/tickets";
import { TicketDetail } from "@/views/dashboard/ticket-detail";
import { OnboardingView } from "@/views/onboarding/onboarding";

interface AppRoutes {
  path: string;
  view: React.ComponentType;
  layout: string;
  permission: string;
  title: string;
}

const Routes: AppRoutes[] = [
  {
    path: "/dashboard",
    view: Dashboard,
    layout: "app",
    permission: "user",
    title: "Dashboard",
  },
  {
    path: "/welcome",
    view: OnboardingView,
    layout: "onboarding",
    permission: "user",
    title: "Welcome",
  },
  {
    path: "/help",
    view: Help,
    layout: "app",
    permission: "user",
    title: "Get Help",
  },
  {
    path: "/sales",
    view: Sales,
    layout: "app",
    permission: "sales",
    title: "Vendas",
  },
  {
    path: "/tickets",
    view: Tickets,
    layout: "app",
    permission: "agent",
    title: "Chamados",
  },
  {
    path: "/tickets/:id",
    view: TicketDetail,
    layout: "app",
    permission: "agent",
    title: "Detalhe do Chamado",
  },
];

export default Routes;
