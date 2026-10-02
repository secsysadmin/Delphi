import { NextResponse } from "next/server";
import { currentAdminEmail, isAdmin } from "@/lib/auth";
import { deleteAdminUser } from "@/lib/admin-users";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const currentEmail = await currentAdminEmail();
  if (!currentEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await deleteAdminUser((await params).id, currentEmail);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete administrator." }, { status: 400 });
  }
}
