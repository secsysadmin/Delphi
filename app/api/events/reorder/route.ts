import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { reorderEvents } from "@/lib/store";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { ids } = await request.json() as { ids?: string[] };
  if (!Array.isArray(ids)) return NextResponse.json({ error: "Event order is required." }, { status: 400 });
  await reorderEvents(ids);
  return NextResponse.json({ ok: true });
}
