import { NextResponse } from "next/server";
import { rejectNonAdminMutation } from "@/lib/api-guard";
import { reorderEvents } from "@/lib/store";

export async function POST(request: Request) {
  const rejected = await rejectNonAdminMutation(request);
  if (rejected) return rejected;
  const { ids } = await request.json() as { ids?: string[] };
  if (!Array.isArray(ids)) return NextResponse.json({ error: "Event order is required." }, { status: 400 });
  await reorderEvents(ids);
  return NextResponse.json({ ok: true });
}
