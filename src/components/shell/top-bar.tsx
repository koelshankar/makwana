"use client";

import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MANAGER_NAME, type ApprovalMode } from "@/domain/quote";
import { emptyMehta, newProject, sampleDesign } from "@/domain/seed";
import type { Project } from "@/domain/types";
import { cn } from "@/lib/utils";
import { projectStore, useHasBlocked, useProjectStore, useRoomValidation } from "@/store/project-store";

const STEPS = [
  { href: "/setup", label: "Room Setup" },
  { href: "/design", label: "Design" },
  { href: "/quote", label: "Quote" },
] as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

function Stepper() {
  const pathname = usePathname();
  const room = useRoomValidation();
  const blocked = useHasBlocked();
  const current = Math.max(0, STEPS.findIndex((s) => pathname.startsWith(s.href)));

  const blockers = [
    null,
    room.ok ? null : "Finish the room first: " + room.issues[0]?.message,
    !room.ok ? "Finish the room first." : blocked ? "Resolve the blocked checks in Design first." : null,
  ];

  return (
    <nav aria-label="Steps" className="flex items-center">
      {STEPS.map((step, i) => {
        const state = i === current ? "current" : i < current ? "done" : "todo";
        const blocker = blockers[i];
        const content = (
          <span className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex size-[26px] items-center justify-center rounded-full border text-[12px] font-medium num",
                state === "current" && "border-mk-ink bg-mk-ink text-white",
                state === "done" && "border-mk-ink-2 text-mk-ink",
                state === "todo" && "border-[#cfcac2] text-mk-faint",
              )}
            >
              {state === "done" ? <CheckIcon className="size-3.5" strokeWidth={2.5} /> : i + 1}
            </span>
            <span
              className={cn(
                "text-[15px]",
                state === "current" && "font-semibold text-mk-ink",
                state === "done" && "text-mk-ink-2",
                state === "todo" && "text-mk-faint",
              )}
            >
              {step.label}
            </span>
          </span>
        );
        return (
          <div key={step.href} className="flex items-center">
            {i > 0 && <span className="mx-5 h-px w-14 bg-[#cfcac2]" />}
            {state === "current" ? (
              <span aria-current="step">{content}</span>
            ) : blocker ? (
              <Tooltip>
                <TooltipTrigger render={<span className="cursor-not-allowed opacity-70" aria-disabled="true" />}>
                  {content}
                </TooltipTrigger>
                <TooltipContent side="bottom">{blocker}</TooltipContent>
              </Tooltip>
            ) : (
              <Link href={step.href} className="rounded-md hover:opacity-80">
                {content}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function DemoMenu({ preparedBy, user }: { preparedBy: string; user: string }) {
  const router = useRouter();
  const { role, approvalMode } = useProjectStore((s) => s.settings);
  const { setRole, setApprovalMode } = projectStore.getState();
  const load = (project: Project, label: string) => {
    projectStore.getState().loadProject(project);
    router.push("/setup");
    toast.success(label);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Demo menu"
            className="flex size-10 items-center justify-center rounded-full bg-mk-subtle text-[13px] font-semibold text-mk-ink-2 outline-none hover:bg-mk-line focus-visible:ring-2 focus-visible:ring-mk-accent"
          />
        }
      >
        {initials(user)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Demo</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => load(newProject, "Started a new, empty project")}>New project (empty)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => load(emptyMehta, "Loaded the Mehta room")}>Load Mehta room</DropdownMenuItem>
          <DropdownMenuItem onClick={() => load(sampleDesign, "Loaded the sample design")}>Load sample design</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Role</DropdownMenuLabel>
          {role === "salesperson" ? (
            <DropdownMenuItem
              onClick={() => {
                setRole("manager");
                toast(`Now viewing as ${MANAGER_NAME}`);
              }}
            >
              Switch to Manager ({MANAGER_NAME})
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => {
                setRole("salesperson");
                toast(`Now viewing as ${preparedBy}`);
              }}
            >
              Switch to Salesperson ({preparedBy})
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Manager approval</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={approvalMode} onValueChange={(v) => setApprovalMode(v as ApprovalMode)}>
            <DropdownMenuRadioItem value="always">Always</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="flagged">Only when flagged</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>Undo ⌘Z · Redo ⇧⌘Z</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar() {
  const name = useProjectStore((s) => s.project.name);
  const site = useProjectStore((s) => s.project.siteAddress);
  const preparedBy = useProjectStore((s) => s.project.preparedBy);
  const role = useProjectStore((s) => s.settings.role);
  const user = role === "manager" ? MANAGER_NAME : preparedBy;

  return (
    <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-mk-line bg-mk-panel px-7">
      <div className="flex min-w-0 items-center gap-6">
        <div className="leading-none">
          <div className="text-[16px] font-semibold tracking-[0.32em] text-mk-ink">MAKWANA</div>
          <div className="mt-1.5 text-[8.5px] font-medium tracking-[0.36em] text-mk-muted">MODULAR KULTURE</div>
        </div>
        <span className="h-9 w-px bg-mk-line" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[15px] font-semibold">{name || "Untitled project"}</div>
          <div className="truncate text-[13px] text-mk-muted">{site || "No site address yet"}</div>
        </div>
      </div>

      <Stepper />

      <div className="flex items-center justify-end gap-3.5">
        <div className="text-right leading-tight">
          <div className="text-[15px] font-semibold" data-user>
            {user}
          </div>
          <div className="text-[13px] text-mk-muted">{role === "manager" ? "Approvals · " : ""}Experience Centre, Andheri</div>
        </div>
        <DemoMenu preparedBy={preparedBy} user={user} />
      </div>
    </header>
  );
}
