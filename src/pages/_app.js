// /src/pages/_app.js
import "@/styles/globals.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/context/AuthContext";
import { UserProfileProvider } from "@/context/UserProfileContext";
import { useEffect } from "react";
import { useUserProfile } from "@/context/UserProfileContext";
import { useRouter } from "next/router";

function ServiceWorkerRegistration() {
  const { profile } = useUserProfile();
  
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Dev hardening: a previously registered localhost SW can serve stale /_next chunks.
    // Always unregister SW and clear its caches in development.
    if (process.env.NODE_ENV !== "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => {});

      if ("caches" in window) {
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith("rvr-"))
                .map((key) => caches.delete(key))
            )
          )
          .catch(() => {});
      }

      return;
    }

    const enabled = profile?.offlineMode?.enabled;
    if (process.env.NODE_ENV === "production" && enabled && "serviceWorker" in navigator) {
      const register = () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      };
      if (document.readyState === "complete") {
        register();
        return;
      }

      window.addEventListener("load", register);
      return () => {
        window.removeEventListener("load", register);
      };
    }
  }, [profile?.offlineMode?.enabled]);
  
  return null;
}

// Handle Firebase auth redirect on ANY page
function AuthRedirectHandler() {
  const router = useRouter();
  
  useEffect(() => {
    // Check if this is a redirect from Google OAuth
    const isAuthRedirect = 
      window.location.search.includes('state=') || 
      window.location.search.includes('code=') ||
      window.location.hash.includes('access_token');
    
    if (isAuthRedirect && router.pathname !== '/login') {
      console.log("[_app] Detected OAuth redirect on wrong page, redirecting to /login");
      // Preserve the query params and redirect to login page
      const fullUrl = window.location.href;
      const url = new URL(fullUrl);
      router.replace('/login' + url.search + url.hash);
    }
  }, [router]);
  
  return null;
}

export default function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <UserProfileProvider>
        <QueryClientProvider client={queryClient}>
          <AuthRedirectHandler />
          <ServiceWorkerRegistration />
          <Component {...pageProps} />
        </QueryClientProvider>
      </UserProfileProvider>
    </AuthProvider>
  );
}
