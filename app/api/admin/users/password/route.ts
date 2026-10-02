import { NextResponse } from "next/server";
import { currentAdminEmail, isAdmin } from "@/lib/auth";
import { updateAdminPassword } from "@/lib/admin-users";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = await currentAdminEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { oldPassword, newPassword, confirmPassword } = await request.json() as { oldPassword?: string; newPassword?: string; confirmPassword?: string };
    if (!oldPassword || !newPassword || !confirmPassword) return NextResponse.json({ error: "Complete all password fields." }, { status: 400 });
    if (newPassword !== confirmPassword) return NextResponse.json({ error: "New password and confirmation do not match." }, { status: 400 });
    await updateAdminPassword(email, oldPassword, newPassword);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to change password." }, { status: 400 });
  }
}
