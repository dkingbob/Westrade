import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/dashboard";
import Trades from "@/pages/trades";
import Portfolio from "@/pages/portfolio";
import Analytics from "@/pages/analytics";
import Strategies from "@/pages/strategies";
import Risk from "@/pages/risk";
import Backtest from "@/pages/backtest";
import Sentiment from "@/pages/sentiment";
import Notifications from "@/pages/notifications";
import Connections from "@/pages/connections";
import Help from "@/pages/help";
import Presets from "@/pages/presets";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

function ProtectedRouter() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/trades" component={Trades} />
        <Route path="/portfolio" component={Portfolio} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/strategies" component={Strategies} />
        <Route path="/risk" component={Risk} />
        <Route path="/backtest" component={Backtest} />
        <Route path="/sentiment" component={Sentiment} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/connections" component={Connections} />
        <Route path="/help" component={Help} />
        <Route path="/presets" component={Presets} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route component={ProtectedRouter} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,  "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
