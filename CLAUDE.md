# Makwana Kitchen Configurator — V1 Demo

## What this is
A demo kitchen configurator for Makwana Modular Kulture. A salesperson sets up the room, drags catalogue modules onto walls, picks finishes, sees rule checks and a live price, views the kitchen in 3D, and reviews the quote. Sample data only. UI reference: docs/mockups/.

## Non-negotiable architecture
- All dimensions are integers in millimetres.
- Modules are placed relative to a wall: { wallId, layer: base | wall | loft | tall, offsetMm }. Never store free x/y positions for modules.
- One Zustand store holds the project. Plan, elevation, 3D view, rule checks and quote are all derived from it; no view keeps its own copy of the placement data.
- src/domain is pure TypeScript with no React imports. Rules and pricing are pure functions with Vitest tests.
- Each rule returns { status: pass | warning | blocked | approval, message, fixes[] }.
- 2D plan and elevation are SVG with a millimetre viewBox. 3D uses React Three Fiber and is display-only (rotate, zoom, click to select; no dragging in 3D).

## Scope (V1 only)
In: any-shape room setup with walls added one by one; module placement on straight and L-shaped runs; finish, shutter and hardware selection; sample rules; sink and hob countertop cut-outs; Level 1 3D; quote review.
Out: placement along niches, columns or duct boxes; textures; custom catalogue admin; Supabase; auth.

## Conventions
- Next.js 15 App Router, TypeScript strict, shadcn/ui, Tailwind.
- Indian number formatting for prices (₹4,12,800), GST 18%.
- Run `npm test` and `npx tsc --noEmit` before saying a task is done.
- shadcn/ui components here are built on Base UI, not Radix: use the `render` prop pattern, never `asChild`. Check the component file in src/components/ui before using a prop.
