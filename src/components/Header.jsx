import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";
import { useState } from "react";

export default function Header() {
  const router = useRouter();
  const pathname = router.pathname;
  const { user, isAdmin, loginWithGoogle, logout, loading } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isLoggingOut) {
      console.log("[Header] Logout already in progress, ignoring click");
      return;
    }
    
    console.log("[Header] Logout button clicked");
    setIsLoggingOut(true);
    
    try {
      await logout();
    } catch (error) {
      console.error("[Header] Logout error:", error);
      setIsLoggingOut(false);
    }
  };

  const navItems = [
    { name: "River Conditions", href: "/river-conditions" },
    { name: "Weather", href: "/weather" },
    { name: "Compass", href: "/compass" },
  ];

  return (
    <header className="w-full border-b border-border bg-background/80 backdrop-blur z-[999] static">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4">

        {/* Brand */}
        <Link
          href="/"
          className="text-2xl font-bold tracking-tight"
          style={{ color: "#177245" }} // RVR green
        >
          River Valley Report
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-6 text-sm font-medium">
          {navItems.map(({ name, href }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`transition-colors duration-200 ${
                  isActive
                    ? "text-[hsl(142,70%,35%)] font-semibold" // active green
                    : "text-foreground/70 hover:text-[hsl(142,70%,35%)]"
                }`}
              >
                {name}
              </Link>
            );
          })}

          {/* Login / Admin / Logout */}
          <div className="flex items-center gap-3 ml-4">
            {loading ? (
              <span className="text-xs text-muted-foreground">Checking login…</span>
            ) : user ? (
              <>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="text-xs text-foreground/80 hover:text-[hsl(142,70%,35%)]"
                  >
                    Admin
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="text-xs text-foreground/70 hover:text-[hsl(142,70%,35%)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoggingOut ? "Logging out..." : "Logout"}
                </button>
              </>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="text-xs text-foreground/70 hover:text-[hsl(142,70%,35%)] transition-colors"
              >
                Login
              </button>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
