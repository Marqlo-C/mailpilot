"use client";

import { useEffect, useRef, useState } from "react";

const PLAYBACK_RATE = 0.4;

export function LoginBackgroundVideo() {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
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
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 1. Instant Fallback Poster Frame */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/api/login-background?asset=poster"
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
          isVideoLoaded ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* 2. Fast-Start Streaming Video */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster="/api/login-background?asset=poster"
        onCanPlay={() => setIsVideoLoaded(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
          isVideoLoaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <source src="/api/login-background" type="video/mp4" />
      </video>

      {/* Dim flashes / high-contrast spikes for photosensitive comfort (exact production color grade) */}
      <div className="absolute inset-0 bg-[#181e26]/50" />
    </div>
  );
}

export const LoginVideoBackground = LoginBackgroundVideo;
