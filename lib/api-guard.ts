import { NextResponse } from "next/server";
import { isAdmin, isSameOriginRequest } from "@/lib/auth";

export async function rejectNonAdmin() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function rejectNonAdminMutation(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return rejectNonAdmin();
}
