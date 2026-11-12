"use client";

// Throwaway spike: the Design screen's 3D scene on its own.
import { KitchenScene } from "@/components/three/kitchen-scene";
import { useBlockedIds, useProjectStore } from "@/store/project-store";

export default function Scene() {
  const project = useProjectStore((s) => s.project);
  const blocked = useBlockedIds();
  return <KitchenScene project={project} selectedId={null} blockedIds={blocked} interactive={false} />;
}
