"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isRoomClosed } from "@/domain/geometry";
import { cn } from "@/lib/utils";
import { useProjectStore, useRoomValidation } from "@/store/project-store";

function Chip({ tone, children }: { tone: "ok" | "warn" | "muted"; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[13.5px] text-mk-ink-2">
      <span className={cn("size-2 shrink-0 rounded-full", tone === "ok" ? "bg-mk-ok" : tone === "warn" ? "bg-mk-warn" : "bg-mk-faint")} />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function SetupFooter() {
  const router = useRouter();
  const room = useProjectStore((s) => s.project.room);
  const validation = useRoomValidation();
  const closed = isRoomClosed(room);
  const nFeatures = room.features.length;

  const start = (
    <Button
      size="lg"
      className="h-[46px] gap-2.5 rounded-lg px-6 text-[15px]"
      disabled={!validation.ok}
      onClick={() => router.push("/design")}
    >
      Start Designing <ArrowRight className="size-4" />
    </Button>
  );

  return (
    <footer className="flex h-[72px] shrink-0 items-center justify-between gap-6 border-t border-mk-line bg-mk-panel pr-8 pl-[400px]">
      <div className="flex min-w-0 items-center gap-7">
        <Chip tone={closed ? "ok" : "warn"}>{closed ? `Room closed · ${room.walls.length} walls` : `Room open · ${room.walls.length} walls`}</Chip>
        <Chip tone={nFeatures ? "ok" : "muted"}>
          {nFeatures} feature{nFeatures === 1 ? "" : "s"} placed
        </Chip>
        <Chip tone={validation.ok ? "ok" : "warn"}>{validation.ok ? "Ready for design" : validation.issues[0].message}</Chip>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Button variant="outline" size="lg" className="h-[46px] rounded-lg px-6 text-[15px]" onClick={() => toast.success("Draft saved")}>
          Save draft
        </Button>
        {validation.ok ? (
          start
        ) : (
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} className="cursor-not-allowed" />}>{start}</TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm flex-col items-start">
              <span className="font-medium">Fix these before designing:</span>
              <ul className="list-disc pl-4">
                {validation.issues.slice(0, 5).map((i) => (
                  <li key={i.message}>{i.message}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </footer>
  );
}
