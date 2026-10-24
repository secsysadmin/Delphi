import { NextResponse } from "next/server";
import { publicError } from "@/lib/errors";
import { isAdmin, isSameOriginRequest } from "@/lib/auth";
import { archiveEvent, getEvent, saveEvent } from "@/lib/store";
import type { EventInput } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const includeDrafts = new URL(request.url).searchParams.get("admin") === "1" && await isAdmin();
    const event = await getEvent(id, includeDrafts);
    if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    return NextResponse.json({ event });
  } catch (error) {
    console.error("Could not load event", error);
    return NextResponse.json({ error: "Could not load this event. Please try again." }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const event = await saveEvent((await request.json()) as EventInput, id);
    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Could not update event.") }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    await archiveEvent(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Could not archive event.") }, { status: 400 });
  }
}
