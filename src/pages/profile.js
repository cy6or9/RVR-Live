// /src/pages/profile.js
// User profile and settings page
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import { useUserProfile } from "@/context/UserProfileContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MapPin,
  Star,
  Download,
  Settings,
  Moon,
  Sun,
  Layers,
  Save,
  Trash2,
} from "lucide-react";
import { ohioRiverLocks } from "@/lib/locks";

export default function ProfilePage() {
  const router = useRouter();
  const { user, loginWithGoogle } = useAuth();
  const {
    profile,
    saveMapPreferences,
    toggleFavorite,
    checkIsFavorite,
    updateOfflineSettings,
    isLoggedIn,
  } = useUserProfile();

  const [mapPrefs, setMapPrefs] = useState(null);
  const [offlinePrefs, setOfflinePrefs] = useState(null);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    if (profile) {
      setMapPrefs(profile.mapPreferences);
      setOfflinePrefs(profile.offlineMode);
    }
  }, [profile]);

  const handleSaveMapPreferences = async () => {
    try {
      setSaveStatus("Saving...");
      await saveMapPreferences(mapPrefs);
      setSaveStatus("Saved!");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (error) {
      setSaveStatus("Error saving");

    }
  };

  const handleSaveOfflineSettings = async () => {
    try {
      setSaveStatus("Saving...");
      await updateOfflineSettings(offlinePrefs);
      setSaveStatus("Saved!");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (error) {
      setSaveStatus("Error saving");

    }
  };

  if (!isLoggedIn) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-background py-12 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-4xl font-bold mb-4">User Profile</h1>
            <p className="text-muted-foreground mb-8">
              Sign in to save your preferences, favorites, and access offline mode
            </p>
            <Button onClick={loginWithGoogle} size="lg">
              Sign In with Google
            </Button>
            <div className="mt-8 text-sm text-muted-foreground">
              <p>With a free account, you can:</p>
              <ul className="mt-4 space-y-2">
                <li>✓ Save your map location and layer preferences</li>
                <li>✓ Favorite locks, dams, and stations</li>
                <li>✓ Cache data for faster loading</li>
                <li>✓ Download maps for offline use</li>
                <li>✓ Sync across devices</li>
              </ul>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Profile & Settings</h1>
            <p className="text-muted-foreground">
              Manage your preferences, favorites, and offline settings
            </p>
          </div>

          <Tabs defaultValue="map" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="map">
                <MapPin className="w-4 h-4 mr-2" />
                Map Settings
              </TabsTrigger>
              <TabsTrigger value="favorites">
                <Star className="w-4 h-4 mr-2" />
                Favorites
              </TabsTrigger>
              <TabsTrigger value="offline">
                <Download className="w-4 h-4 mr-2" />
                Offline Mode
              </TabsTrigger>
              <TabsTrigger value="account">
                <Settings className="w-4 h-4 mr-2" />
                Account
              </TabsTrigger>
            </TabsList>

            {/* Map Settings Tab */}
            <TabsContent value="map" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Default Map View</CardTitle>
                  <CardDescription>
                    Set your preferred map location and zoom level
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="lat">Default Latitude</Label>
                      <Input
                        id="lat"
                        type="number"
                        step="0.01"
                        value={mapPrefs?.defaultLocation?.lat || 38.5}
                        onChange={(e) =>
                          setMapPrefs({
                            ...mapPrefs,
                            defaultLocation: {
                              ...mapPrefs.defaultLocation,
                              lat: parseFloat(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lon">Default Longitude</Label>
                      <Input
                        id="lon"
                        type="number"
                        step="0.01"
                        value={mapPrefs?.defaultLocation?.lon || -84.5}
                        onChange={(e) =>
                          setMapPrefs({
                            ...mapPrefs,
                            defaultLocation: {
                              ...mapPrefs.defaultLocation,
                              lon: parseFloat(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zoom">Default Zoom Level</Label>
                    <Input
                      id="zoom"
                      type="number"
                      min="3"
                      max="18"
                      value={mapPrefs?.zoom || 8}
                      onChange={(e) =>
                        setMapPrefs({
                          ...mapPrefs,
                          zoom: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Map Layers</CardTitle>
                  <CardDescription>
                    Choose which layers to display by default
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Water Levels</Label>
                      <p className="text-sm text-muted-foreground">
                        Show river water level data
                      </p>
                    </div>
                    <Switch
                      checked={mapPrefs?.layers?.waterLevels}
                      onCheckedChange={(checked) =>
                        setMapPrefs({
                          ...mapPrefs,
                          layers: { ...mapPrefs.layers, waterLevels: checked },
                        })
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Weather Radar</Label>
                      <p className="text-sm text-muted-foreground">
                        Show weather radar overlay
                      </p>
                    </div>
                    <Switch
                      checked={mapPrefs?.layers?.weatherRadar}
                      onCheckedChange={(checked) =>
                        setMapPrefs({
                          ...mapPrefs,
                          layers: { ...mapPrefs.layers, weatherRadar: checked },
                        })
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Locks & Dams</Label>
                      <p className="text-sm text-muted-foreground">
                        Show lock and dam markers
                      </p>
                    </div>
                    <Switch
                      checked={mapPrefs?.layers?.locksDams}
                      onCheckedChange={(checked) =>
                        setMapPrefs({
                          ...mapPrefs,
                          layers: { ...mapPrefs.layers, locksDams: checked },
                        })
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Hazard Zones</Label>
                      <p className="text-sm text-muted-foreground">
                        Show navigation hazard areas
                      </p>
                    </div>
                    <Switch
                      checked={mapPrefs?.layers?.hazardZones}
                      onCheckedChange={(checked) =>
                        setMapPrefs({
                          ...mapPrefs,
                          layers: { ...mapPrefs.layers, hazardZones: checked },
                        })
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Traffic (Boats)</Label>
                      <p className="text-sm text-muted-foreground">
                        Show boat traffic markers
                      </p>
                    </div>
                    <Switch
                      checked={mapPrefs?.layers?.traffic}
                      onCheckedChange={(checked) =>
                        setMapPrefs({
                          ...mapPrefs,
                          layers: { ...mapPrefs.layers, traffic: checked },
                        })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>Customize the look of the map</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Dark Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Use dark theme for maps
                      </p>
                    </div>
                    <Switch
                      checked={mapPrefs?.darkMode}
                      onCheckedChange={(checked) =>
                        setMapPrefs({ ...mapPrefs, darkMode: checked })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end space-x-4">
                {saveStatus && (
                  <span className="text-sm text-muted-foreground self-center">
                    {saveStatus}
                  </span>
                )}
                <Button onClick={handleSaveMapPreferences}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Map Settings
                </Button>
              </div>
            </TabsContent>

            {/* Favorites Tab */}
            <TabsContent value="favorites" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Favorite Locks & Dams</CardTitle>
                  <CardDescription>
                    Quick access to your most-used locations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {ohioRiverLocks.map((lock) => {
                        const isFav = checkIsFavorite("locksDams", lock.id);
                        return (
                          <div
                            key={lock.id}
                            className="flex items-center justify-between p-3 rounded-lg border"
                          >
                            <div>
                              <p className="font-medium">{lock.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Mile {lock.rivermile}
                              </p>
                            </div>
                            <Button
                              variant={isFav ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggleFavorite("locksDams", lock.id)}
                            >
                              <Star
                                className={`w-4 h-4 ${isFav ? "fill-current" : ""}`}
                              />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Favorite Stations</CardTitle>
                  <CardDescription>
                    Your preferred NOAA water level stations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Visit the River Conditions page to favorite stations
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => router.push("/river-conditions")}
                  >
                    Go to River Conditions
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Offline Mode Tab */}
            <TabsContent value="offline" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Offline Mode</CardTitle>
                  <CardDescription>
                    Download data for use without internet connection
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Offline Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Cache maps and data locally
                      </p>
                    </div>
                    <Switch
                      checked={offlinePrefs?.enabled}
                      onCheckedChange={(checked) =>
                        setOfflinePrefs({ ...offlinePrefs, enabled: checked })
                      }
                    />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Offline Storage</Label>
                    <p className="text-sm text-muted-foreground mb-4">
                      Manage downloaded content for offline access
                    </p>
                    <div className="p-4 rounded-lg border bg-muted/50">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm">Map Tiles</span>
                          <Badge variant="secondary">
                            {offlinePrefs?.downloadedTiles?.length || 0} tiles
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">River Data</span>
                          <Badge variant="secondary">
                            {offlinePrefs?.lastSyncedRiverData
                              ? "Cached"
                              : "Not cached"}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Forecast Data</span>
                          <Badge variant="secondary">
                            {offlinePrefs?.lastSyncedForecast
                              ? "Cached"
                              : "Not cached"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" className="flex-1">
                      <Download className="w-4 h-4 mr-2" />
                      Download Current View
                    </Button>
                    <Button variant="outline" className="flex-1">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear Cache
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end space-x-4">
                {saveStatus && (
                  <span className="text-sm text-muted-foreground self-center">
                    {saveStatus}
                  </span>
                )}
                <Button onClick={handleSaveOfflineSettings}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Offline Settings
                </Button>
              </div>
            </TabsContent>

            {/* Account Tab */}
            <TabsContent value="account" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Account Information</CardTitle>
                  <CardDescription>Your profile details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={user?.email || ""} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Display Name</Label>
                    <Input value={user?.displayName || ""} disabled />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Account Created</Label>
                    <p className="text-sm text-muted-foreground">
                      {profile?.createdAt
                        ? new Date(profile.createdAt.seconds * 1000).toLocaleDateString()
                        : "N/A"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Last Updated</Label>
                    <p className="text-sm text-muted-foreground">
                      {profile?.updatedAt
                        ? new Date(profile.updatedAt.seconds * 1000).toLocaleDateString()
                        : "N/A"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Data Management</CardTitle>
                  <CardDescription>
                    Manage your stored preferences and data
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 rounded-lg border bg-muted/50">
                    <p className="text-sm mb-4">
                      Your profile includes map preferences, favorites, and cached data
                      for faster loading.
                    </p>
                    <Button variant="outline" className="w-full">
                      Export Profile Data
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <Footer />
    </>
  );
}
