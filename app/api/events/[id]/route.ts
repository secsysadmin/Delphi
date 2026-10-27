import { NextResponse } from "next/server";
import { rejectNonAdminMutation } from "@/lib/api-guard";
import { isAdmin } from "@/lib/auth";
import { publicError } from "@/lib/errors";
import { archiveEvent, getEvent, saveEvent } from "@/lib/store";
import type { EventInput } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const includeDrafts = new URL(request.url).searchParams.get("admin") === "1" && await isAdmin();
    const event = await getEvent(id, includeDrafts);
    if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    return NextResponse.json({ event });
  } catch (error) {
    console.error(`Could not load event ${id}`, error);
    return NextResponse.json({ error: "Could not load this event. Please try again." }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = await rejectNonAdminMutation(request);
  if (rejected) return rejected;
  try {
    const { id } = await params;
    const event = await saveEvent((await request.json()) as EventInput, id);
    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Could not update event.") }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = await rejectNonAdminMutation(request);
  if (rejected) return rejected;
  try {
    const { id } = await params;
    await archiveEvent(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Could not archive event.") }, { status: 400 });
  }
}
