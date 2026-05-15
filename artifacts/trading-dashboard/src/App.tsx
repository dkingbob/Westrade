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
import Sentiment from "@/pages/sentiment";
import Notifications from "@/pages/notifications";
import Connections from "@/pages/connections";
import Help from "@/pages/help";
import Presets from "@/pages/presets";
import Settings from "@/pages/settings";
import AiActivity from "@/pages/ai-activity";
import LandingPage from "@/pages/landing";
import { useTheme } from "@/hooks/use-theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

const Loading = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="text-muted-foreground text-sm font-mono">Loading…</div>
  </div>
);

// "/" — always landing page; redirect authenticated users to /dashboard
function SmartHome() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (isAuthenticated) return <Redirect to="/dashboard" />;
  return <LandingPage />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <Redirect to="/" />;
  return <Layout><Component /></Layout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={SmartHome} />
      <Route path="/login" component={LoginPage} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/trades" component={() => <ProtectedRoute component={Trades} />} />
      <Route path="/portfolio" component={() => <ProtectedRoute component={Portfolio} />} />
      <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/strategies" component={() => <ProtectedRoute component={Strategies} />} />
      <Route path="/risk" component={() => <ProtectedRoute component={Risk} />} />
      <Route path="/sentiment" component={() => <ProtectedRoute component={Sentiment} />} />
      <Route path="/notifications" component={() => <ProtectedRoute component={Notifications} />} />
      <Route path="/connections" component={() => <ProtectedRoute component={Connections} />} />
      <Route path="/help" component={() => <ProtectedRoute component={Help} />} />
      <Route path="/presets" component={() => <ProtectedRoute component={Presets} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/ai-activity" component={() => <ProtectedRoute component={AiActivity} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { mode, style } = useTheme();
  useEffect(() => {
    // theme hook handles class application
  }, [mode, style]);

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
