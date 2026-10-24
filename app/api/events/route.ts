import { NextResponse } from "next/server";
import { publicError } from "@/lib/errors";
import { isAdmin, isSameOriginRequest } from "@/lib/auth";
import { getEvents, saveEvent } from "@/lib/store";
import type { EventInput } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wantsDrafts = url.searchParams.get("scope") === "all";
  if (wantsDrafts && !(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const events = await getEvents({ includeDrafts: wantsDrafts });
  return NextResponse.json({ events, mode: process.env.DATABASE_URL ? "database" : "preview" });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const event = await saveEvent((await request.json()) as EventInput);
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Could not save event.") }, { status: 400 });
  }
}
