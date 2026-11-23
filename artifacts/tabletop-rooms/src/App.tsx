import { useEffect, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { Route, Switch, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import HomePage from "@/pages/home";
import DashboardPage from "@/pages/dashboard";
import RoomPage from "@/pages/room";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error(
    "Missing VITE_CLERK_PUBLISHABLE_KEY in GitHub Actions variables",
  );
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#a45f37",
    colorForeground: "#29313a",
    colorMutedForeground: "#6b7379",
    colorDanger: "#b5483e",
    colorBackground: "#f6f1e6",
    colorInput: "#fbf8f1",
    colorInputForeground: "#29313a",
    colorNeutral: "#d6cdbd",
    fontFamily: "DM Sans",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#f6f1e6] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#29313a] font-serif",
    headerSubtitle: "text-[#6b7379]",
    socialButtonsBlockButtonText: "text-[#29313a]",
    formFieldLabel: "text-[#29313a]",
    footerActionLink: "text-[#a45f37]",
    footerActionText: "text-[#6b7379]",
    dividerText: "text-[#6b7379]",
    identityPreviewEditButton: "text-[#a45f37]",
    formFieldSuccessText: "text-[#40765e]",
    alertText: "text-[#29313a]",
    logoBox: "mb-2",
    logoImage: "max-h-10",
    socialButtonsBlockButton: "border-[#d6cdbd] bg-[#fbf8f1]",
    formButtonPrimary: "bg-[#a45f37] text-[#fbf8f1]",
    formFieldInput: "border-[#d6cdbd] bg-[#fbf8f1] text-[#29313a]",
    footerAction: "text-[#6b7379]",
    dividerLine: "bg-[#d6cdbd]",
    alert: "border-[#d6cdbd]",
    otpCodeFieldInput: "border-[#d6cdbd] bg-[#fbf8f1] text-[#29313a]",
    formFieldRow: "text-[#29313a]",
    main: "text-[#29313a]",
  },
};

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <HomePage />
      </Show>
    </>
  );
}

function ProtectedDashboard() {
  return (
    <>
      <Show when="signed-in">
        <DashboardPage />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function SignInPage() {
  return (
    <div className="auth-page">
      <div className="auth-intro">
        <div className="auth-brand-lockup">
          <img src={`${basePath}/logo.svg`} alt="" />
          <span>Dungeon<span className="brand-light">smith</span></span>
        </div>
      </div>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="auth-page">
      <div className="auth-intro">
        <div className="auth-brand-lockup">
          <img src={`${basePath}/logo.svg`} alt="" />
          <span>Dungeon<span className="brand-light">smith</span></span>
        </div>
      </div>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function ClerkCacheSync() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const id = user?.id ?? null;

      if (
        previousId.current !== undefined &&
        previousId.current !== id
      ) {
        client.clear();
      }

      previousId.current = id;
    });

    return unsubscribe;
  }, [addListener, client]);

  return null;
}

function RoutedErrorBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const [location] = useLocation();

  return (
    <ErrorBoundary resetKey={location}>
      {children}
    </ErrorBoundary>
  );
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back, storyteller",
            subtitle: "Sign in to manage your D&D campaign rooms.",
          },
        },
        signUp: {
          start: {
            title: "Make a little room",
            subtitle: "Create a DM account to host online D&D campaigns.",
          },
        },
      }}
      routerPush={(to: string) => setLocation(stripBase(to))}
      routerReplace={(to: string) =>
        setLocation(stripBase(to), { replace: true })
      }
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkCacheSync />
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="/dashboard">
                <ProtectedDashboard />
              </Route>
              <Route path="/room/:code">
                <RoomPage />
              </Route>
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkRoutes />
    </WouterRouter>
  );
}

export default App;
