"use client";

import { useEffect, useRef } from "react";

const PLAYBACK_RATE = 0.4;

export function LoginBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const applyRate = () => {
      video.playbackRate = PLAYBACK_RATE;
    };

    applyRate();
    video.addEventListener("loadedmetadata", applyRate);
    video.addEventListener("play", applyRate);
    video.addEventListener("ratechange", () => {
      if (video.playbackRate !== PLAYBACK_RATE) {
        video.playbackRate = PLAYBACK_RATE;
      }
    });

    void video.play().catch(() => {
      // Autoplay can be blocked; muted + playsInline usually succeeds.
    });

    return () => {
      video.removeEventListener("loadedmetadata", applyRate);
      video.removeEventListener("play", applyRate);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src="/api/login-background"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      {/* Dim flashes / high-contrast spikes for photosensitive comfort */}
      <div className="absolute inset-0 bg-[#181e26]/50" />
    </div>
  );
}
