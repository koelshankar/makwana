import { notFound } from "next/navigation";
import { SpikeView } from "./spike-view";

/** Throwaway spike; development builds only. */
export default function SpikePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SpikeView />;
}
