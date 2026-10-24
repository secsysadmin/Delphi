import { NextResponse } from "next/server";
import { publicError } from "@/lib/errors";
import { currentAdminEmail, isAdmin, isSameOriginRequest } from "@/lib/auth";
import { deleteAdminUser } from "@/lib/admin-users";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const currentEmail = await currentAdminEmail();
  if (!currentEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await deleteAdminUser((await params).id, currentEmail);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Unable to delete administrator.") }, { status: 400 });
  }
}
