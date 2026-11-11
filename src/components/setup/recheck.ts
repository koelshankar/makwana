import { toast } from "sonner";
import { projectStore } from "@/store/project-store";

/**
 * After a room edit, placements are kept and the rules re-check them in Design.
 * Tell the salesperson how many units that affects. `wallIds` limits the count to those walls.
 */
export function notifyRecheck(wallIds?: string[]) {
  const { modules, appliances } = projectStore.getState().project;
  const onWall = (wallId: string) => !wallIds || wallIds.includes(wallId);
  const n =
    modules.filter((m) => onWall(m.wallId)).length +
    appliances.filter((a) => a.kind === "free" && onWall(a.wallId)).length;
  if (n > 0) toast.warning(`${n} unit${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} re-checking in Design.`);
}
