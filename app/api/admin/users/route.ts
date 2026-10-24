import { NextResponse } from "next/server";
import { publicError } from "@/lib/errors";
import { createAdminUser, listAdminUsers } from "@/lib/admin-users";
import { isAdmin, isSameOriginRequest } from "@/lib/auth";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ users: await listAdminUsers() });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { email } = await request.json() as { email?: string };
    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
    const user = await createAdminUser(email);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Unable to add administrator.") }, { status: 400 });
  }
}
