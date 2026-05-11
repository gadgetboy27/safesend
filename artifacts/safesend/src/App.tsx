import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Login from "@/pages/auth/login";
import AuthVerify from "@/pages/auth/verify";
import NewDeal from "@/pages/deals/new";
import MyDeals from "@/pages/deals/list";
import DealDetail from "@/pages/deals/detail";
import SellerOnboard from "@/pages/seller/onboard";
import SellerStatus from "@/pages/seller/status";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminDealDetail from "@/pages/admin/deal-detail";
import PublicTracking from "@/pages/track/tracking";
import HowItWorks from "@/pages/how-it-works";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";
import EscrowAgreement from "@/pages/escrow-agreement";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/auth/verify" component={AuthVerify} />
      <Route path="/deals/new" component={NewDeal} />
      <Route path="/deals" component={MyDeals} />
      <Route path="/deals/:id" component={DealDetail} />
      <Route path="/seller/onboard" component={SellerOnboard} />
      <Route path="/seller/status" component={SellerStatus} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/deals/:id" component={AdminDealDetail} />
      <Route path="/track/:dealId" component={PublicTracking} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/escrow-agreement" component={EscrowAgreement} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
