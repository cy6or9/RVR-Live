// src/pages/compass.js
import Head from "next/head";
import { useState, useEffect } from "react";
import { DeviceCompass } from "@/components/DeviceCompass";
import Header from "@/components/Header";
import { Maximize2, Minimize2 } from "lucide-react";

export default function CompassPage() {
  const [windData, setWindData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Get user location and fetch wind data
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lon: longitude });
          
          // Fetch wind data for location
          try {
            setLoading(true);
            const response = await fetch(
              `/api/weather?lat=${latitude}&lon=${longitude}`
            );
            if (response.ok) {
              const data = await response.json();
              setWindData({
                windSpeed: data.windSpeed,
                windDir: data.windDir,
              });
            }
          } catch (error) {
            console.error("Error fetching wind data:", error);
          } finally {
            setLoading(false);
          }
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }
  }, []);

  // Fullscreen toggle functionality
  const toggleFullscreen = async () => {
    try {
      if (!isFullscreen) {
        // Enter fullscreen
        const element = document.documentElement;
        if (element.requestFullscreen) {
          await element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
          await element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
          await element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
          await element.msRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error("Error toggling fullscreen:", error);
    }
  };

  // Listen for fullscreen changes (e.g., ESC key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  return (
    <>
      <Head>
        <title>Device Compass - River Valley Report</title>
        <meta
          name="description"
          content="Interactive device compass with wind direction overlay"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>

      <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-black">
        {/* Header - Hidden in fullscreen mode */}
        {!isFullscreen && <Header />}

        {/* Fullscreen Toggle Button - Positioned absolutely */}
        <button
          onClick={toggleFullscreen}
          className={`fixed z-[1000] p-3 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 rounded-lg backdrop-blur-sm text-emerald-400 transition-all ${
            isFullscreen ? 'top-4 right-4' : 'top-20 right-4'
          }`}
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
        </button>

        {/* Fullscreen Compass */}
        <main className="flex-1 flex items-center justify-center p-4">
          <DeviceCompass
            windDirectionDeg={windData?.windDir}
            windSpeedMph={windData?.windSpeed}
            userLocation={userLocation}
            size={Math.min(typeof window !== 'undefined' ? window.innerWidth * 0.9 : 400, typeof window !== 'undefined' ? window.innerHeight * 0.75 : 400, 500)}
          />
        </main>
      </div>
    </>
  );
}
