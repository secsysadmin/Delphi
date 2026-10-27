import { NextResponse } from "next/server";
import { isAdmin, isSameOriginRequest } from "@/lib/auth";

export async function rejectNonAdmin(request?: Request) {
  if (request && !isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
