// /src/pages/admin/index.js
// Admin User Privileges Dashboard
// Displays all users with their subscription tier, login stats, and location data

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Search,
  Users,
  Loader2,
  Clock,
  MapPin,
  ArrowUpDown,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function AdminUserPrivilegesPage() {
  const router = useRouter();
  const { isAdmin, loading } = useAuth();

  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState("All");
  const [sortBy, setSortBy] = useState("lastLogin"); // "lastLogin" | "timeSpent"
  const [usingFallback, setUsingFallback] = useState(false);

  const {
    data: users = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      try {
        // Try server-side API first
        console.log("[Admin] Fetching from server API...");
        const response = await fetch("/api/admin/users");
        if (response.ok) {
          const data = await response.json();
          console.log("[Admin] Server API returned:", data.length, "users");
          console.log("[Admin] Sample user:", data[0]);
          // If we got data, return it
          if (data && data.length > 0) {
            setUsingFallback(false);
            return data;
          }
        } else {
          console.log("[Admin] Server API failed with status:", response.status);
        }
      } catch (err) {
        console.log("[Admin] Server API error, using client SDK:", err);
      }
      
      // Fallback to client SDK if server fails or returns empty
      console.log("[Admin] Using client SDK fallback to fetch users");
      setUsingFallback(true);
      const usersRef = collection(firestore, "userProfiles");
      const snapshot = await getDocs(usersRef);
      
      const users = snapshot.docs.map((doc) => {
        const data = doc.data();
        
        // Convert Firestore Timestamps to ISO strings
        const convertTimestamp = (timestamp) => {
          if (!timestamp) return null;
          try {
            if (timestamp.toDate) {
              return timestamp.toDate().toISOString();
            }
            if (timestamp instanceof Date) {
              return timestamp.toISOString();
            }
            if (timestamp.seconds) {
              return new Date(timestamp.seconds * 1000).toISOString();
            }
          } catch (error) {
            console.error("Error converting timestamp:", error);
          }
          return null;
        };

        return {
          uid: doc.id,
          email: data.email || "",
          displayName: data.displayName || "",
          photoURL: data.photoURL || null,
          privileges: {
            tier: data.privileges?.tier || "Basic",
          },
          stats: {
            lastLoginAt: convertTimestamp(data.stats?.lastLoginAt),
            lastLoginAtRaw: data.stats?.lastLoginAt?.seconds
              ? data.stats.lastLoginAt.seconds * 1000
              : null,
            totalOnlineSeconds: data.stats?.totalOnlineSeconds || 0,
          },
          lastLocation: data.lastLocation
            ? {
                lat: data.lastLocation.lat,
                lon: data.lastLocation.lon,
                city: data.lastLocation.city || null,
                state: data.lastLocation.state || null,
                county: data.lastLocation.county || null,
                updatedAt: convertTimestamp(data.lastLocation.updatedAt),
              }
            : null,
        };
      });
      
      console.log("[Admin] Fetched", users.length, "users from client SDK");
      return users;
    },
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  // Format time spent online
  const formatTimeSpent = (seconds) => {
    if (!seconds || seconds === 0) return "—";
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  // Format last login date
  const formatLastLogin = (isoString) => {
    if (!isoString) return "Never";
    
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
    } catch {
      return "Invalid date";
    }
  };

  // Get badge color based on tier
  const getTierBadgeVariant = (tier) => {
    switch (tier) {
      case "Premium":
        return "default";
      case "Plus":
        return "secondary";
      default:
        return "outline";
    }
  };

  // Filter and sort users
  const filteredAndSortedUsers = useMemo(() => {
    let filtered = users.filter((user) => {
      // Filter by search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        if (!user.email?.toLowerCase().includes(term)) {
          return false;
        }
      }

      // Filter by tier
      if (tierFilter !== "All" && user.privileges?.tier !== tierFilter) {
        return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === "lastLogin") {
        // Sort by last login (newest first)
        const aTime = a.stats?.lastLoginAtRaw || 0;
        const bTime = b.stats?.lastLoginAtRaw || 0;
        return bTime - aTime;
      } else if (sortBy === "timeSpent") {
        // Sort by time spent (highest first)
        const aTime = a.stats?.totalOnlineSeconds || 0;
        const bTime = b.stats?.totalOnlineSeconds || 0;
        return bTime - aTime;
      }
      return 0;
    });

    return filtered;
  }, [users, searchTerm, tierFilter, sortBy]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Checking permissions…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full p-6 text-center space-y-4">
          <h1 className="text-xl font-semibold">Access Denied</h1>
          <p className="text-muted-foreground">
            You don&apos;t have permission to view this page.
          </p>
          <Button onClick={() => router.push("/")}>Go to Homepage</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/")}
              className="hidden sm:inline-flex"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Admin
              </p>
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <Users className="w-5 h-5" />
                User Privileges
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Fallback Warning Banner */}
      {usingFallback && (
        <div className="bg-yellow-50 border-b-2 border-yellow-400">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
            <p className="text-sm font-bold text-red-600">
              Fallback Data being displayed. Might NOT show detailed information and actions might not be available or operable.
            </p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <Card className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Filters and Search */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Active Users</h2>
              <p className="text-sm text-muted-foreground">
                View and manage user subscriptions and activity
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              {/* Tier Filter */}
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="px-3 py-2 border rounded-md bg-background text-sm"
              >
                <option value="All">All Tiers</option>
                <option value="Basic">Basic</option>
                <option value="Plus">Plus</option>
                <option value="Premium">Premium</option>
              </select>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border rounded-md bg-background text-sm"
              >
                <option value="lastLogin">Last Login</option>
                <option value="timeSpent">Time Spent</option>
              </select>

              {/* Search */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email…"
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 bg-muted/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Total Users
              </p>
              <p className="text-2xl font-bold">{users.length}</p>
            </Card>
            <Card className="p-4 bg-muted/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Premium Users
              </p>
              <p className="text-2xl font-bold">
                {users.filter((u) => u.privileges?.tier === "Premium").length}
              </p>
            </Card>
            <Card className="p-4 bg-muted/50">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Plus Users
              </p>
              <p className="text-2xl font-bold">
                {users.filter((u) => u.privileges?.tier === "Plus").length}
              </p>
            </Card>
          </div>

          {/* Users List */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="py-10 text-center text-destructive">
              <p className="font-medium mb-2">Error loading users</p>
              <p className="text-sm">{error.message}</p>
            </div>
          ) : filteredAndSortedUsers.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <p className="font-medium mb-2">No users found</p>
              <p className="text-sm">
                {searchTerm || tierFilter !== "All"
                  ? "Try adjusting your filters."
                  : "No users have logged in yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAndSortedUsers.map((user) => (
                <div
                  key={user.uid}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  {/* Left: Profile Picture + User Info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Profile Picture */}
                    <div className="flex-shrink-0">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName || user.email}
                          className="w-12 h-12 rounded-full object-cover ring-2 ring-offset-2 ring-muted"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center ring-2 ring-offset-2 ring-muted">
                          <Users className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* User Info */}
                    <div className="space-y-2 flex-1 min-w-0">
                      {/* Email and Badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex flex-col">
                          {user.displayName && (
                            <h3 className="font-semibold text-base truncate">
                              {user.displayName}
                            </h3>
                          )}
                          <p className="text-sm text-muted-foreground truncate">
                            {user.email}
                          </p>
                        </div>
                        <Badge variant={getTierBadgeVariant(user.privileges?.tier)}>
                          {user.privileges?.tier || "Basic"}
                        </Badge>
                      </div>

                      {/* Last Login */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        <span>
                          Last login: {formatLastLogin(user.stats?.lastLoginAt)}
                        </span>
                      </div>

                      {/* Location Info */}
                      {user.lastLocation ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                            <span className="font-medium">
                              {user.lastLocation.city && user.lastLocation.state
                                ? `${user.lastLocation.city}, ${user.lastLocation.state}`
                                : "Unknown Location"}
                              {user.lastLocation.county && ` (${user.lastLocation.county} County)`}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground pl-6">
                            Coordinates: {user.lastLocation.lat.toFixed(6)}, {user.lastLocation.lon.toFixed(6)}
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="w-4 h-4 flex-shrink-0" />
                          <span className="italic">No location tracked</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Stats */}
                  <div className="flex flex-row lg:flex-col gap-4 lg:gap-2 lg:items-end lg:text-right lg:min-w-[120px]">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        Time Online
                      </p>
                      <p className="text-lg font-semibold">
                        {formatTimeSpent(user.stats?.totalOnlineSeconds)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

