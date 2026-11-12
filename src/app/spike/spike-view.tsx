"use client";

// Throwaway spike: proves the world transform (corners, duct-box notch, countertop cut-outs).
import dynamic from "next/dynamic";

const Scene = dynamic(() => import("./scene"), { ssr: false });

export function SpikeView() {
  return (
    <div className="h-screen w-screen bg-neutral-100">
      <Scene />
    </div>
  );
}
