// /src/pages/login.js
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";
import { loginWithGoogle } from "@/lib/firebase";
import { createUserProfile, setLastLogin } from "@/lib/userProfile";
import { Button } from "@/components/ui/button";
import { LogIn, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { user, isAdmin, loading } = useAuth();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    console.log("[LoginPage] Effect running - loading:", loading, "user:", user?.email || "null", "isAdmin:", isAdmin);
    
    // Only redirect if we have a user AND we're not in the middle of processing a redirect
    // Check if this is a redirect from Google by looking at the URL
    const isReturningFromGoogle = typeof window !== 'undefined' && 
      (window.location.search.includes('state=') || window.location.hash.includes('access_token'));
    
    if (isReturningFromGoogle) {
      console.log("[LoginPage] Detected return from Google, waiting for auth...");
      // Don't redirect yet, let AuthContext handle the redirect result first
      return;
    }
    
    // Wait for auth to fully initialize and avoid double redirects
    if (!loading && user && !isRedirecting) {
      console.log("[LoginPage] User authenticated, preparing redirect...");
      setIsRedirecting(true);
      
      const redirect = router.query.redirect;
      
      // Redirect immediately - no artificial delay needed
      if (redirect === 'admin') {
        // User wants to access admin, check if they're admin
        if (isAdmin) {
          console.log("[LoginPage] Redirecting to admin");
          router.replace("/admin");
        } else {
          alert("Admin privileges required. Redirecting to homepage.");
          console.log("[LoginPage] Not admin, redirecting to home");
          router.replace("/");
        }
      } else {
        // Normal login - redirect to river conditions or home
        console.log("[LoginPage] Redirecting to river-conditions");
        router.replace("/river-conditions");
      }
    }
  }, [loading, user, isAdmin, router, isRedirecting]);

  const handleLogin = async () => {
    try {
      console.log("[LoginPage] Starting login...");
      // loginWithGoogle now tries popup first, then redirect
      const result = await loginWithGoogle();
      
      // If popup succeeded, result will be returned
      if (result?.user) {
        console.log("[LoginPage] Popup login successful:", result.user.email);
        console.log("[LoginPage] User data:", {
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL
        });
        
        // Update profile with current login data - WAIT for completion
        try {
          console.log("[LoginPage] Updating profile...");
          await Promise.all([
            createUserProfile(result.user.uid, {
              email: result.user.email,
              displayName: result.user.displayName,
              photoURL: result.user.photoURL,
            }),
            setLastLogin(
              result.user.uid, 
              result.user.email,
              result.user.displayName || '',
              result.user.photoURL
            )
          ]);
          console.log("[LoginPage] Profile updated successfully");
        } catch (error) {
          console.error("[LoginPage] Error updating profile:", error);
        }
        
        // User state will be updated by AuthContext
      }
      // If redirect was used, code after this won't run because browser redirects
    } catch (err) {
      console.error("Login error:", err);
      if (err.code === 'auth/popup-blocked') {
        alert("Popup was blocked. Please allow popups for this site and try again.");
      } else if (err.code === 'auth/popup-closed-by-user') {
        console.log("User closed the popup");
      } else {
        alert("Google sign-in failed. Please try again.");
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full bg-card border border-border p-8 rounded-xl shadow-md">
        <h1 className="text-3xl font-bold mb-6 text-center">Login</h1>

        <p className="text-sm text-muted-foreground text-center mb-8">
          Sign in with your Google account to access River Valley Report.
        </p>

        <Button
          onClick={handleLogin}
          className="w-full gap-2"
          variant="default"
        >
          <LogIn className="w-4 h-4" />
          Sign In with Google
        </Button>
      </div>
    </div>
  );
}
