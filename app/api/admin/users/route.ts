import { NextResponse } from "next/server";
import { createAdminUser, listAdminUsers } from "@/lib/admin-users";
import { rejectNonAdmin } from "@/lib/api-guard";
import { publicError } from "@/lib/errors";

export async function GET() {
  const rejected = await rejectNonAdmin();
  if (rejected) return rejected;
  return NextResponse.json({ users: await listAdminUsers() });
}

export async function POST(request: Request) {
  const rejected = await rejectNonAdmin(request);
  if (rejected) return rejected;
  try {
    const { email } = await request.json() as { email?: string };
    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
    const user = await createAdminUser(email);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Unable to add administrator.") }, { status: 400 });
  }
}
