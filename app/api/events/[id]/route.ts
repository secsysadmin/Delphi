import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { archiveEvent, getEvent, saveEvent } from "@/lib/store";
import type { EventInput } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const includeDrafts = new URL(request.url).searchParams.get("admin") === "1" && await isAdmin();
  const event = await getEvent(id, includeDrafts);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  return NextResponse.json({ event });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const event = await saveEvent((await request.json()) as EventInput, id);
    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update event." }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    await archiveEvent(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not archive event." }, { status: 400 });
  }
}
