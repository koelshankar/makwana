"use client";

import { RoomPlan } from "./plan/room-plan";
import { FeaturesSection } from "./features-section";
import { ProjectSection } from "./project-section";
import { SetupFooter } from "./setup-footer";
import { CeilingRow, WallsSection } from "./walls-section";

export function SetupScreen() {
  return (
    <>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[376px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-mk-line bg-mk-panel px-6 pt-4 pb-6">
          <ProjectSection />
          <WallsSection />
          <div className="border-t border-mk-line pt-3">
            <CeilingRow />
          </div>
          <FeaturesSection />
        </aside>
        <RoomPlan />
      </div>
      <SetupFooter />
    </>
  );
}
