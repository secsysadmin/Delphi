import { NextResponse } from "next/server";
import { rejectNonAdmin } from "@/lib/api-guard";
import { publicError } from "@/lib/errors";
import { getEvents, saveEvent } from "@/lib/store";
import type { EventInput } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const wantsDrafts = new URL(request.url).searchParams.get("scope") === "all";
  const rejected = wantsDrafts ? await rejectNonAdmin() : null;
  if (rejected) return rejected;
  const events = await getEvents({ includeDrafts: wantsDrafts });
  return NextResponse.json({ events });
}

export async function POST(request: Request) {
  const rejected = await rejectNonAdmin(request);
  if (rejected) return rejected;
  try {
    const event = await saveEvent((await request.json()) as EventInput);
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Could not save event.") }, { status: 400 });
  }
}
