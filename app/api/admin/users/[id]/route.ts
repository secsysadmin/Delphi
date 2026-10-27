import { NextResponse } from "next/server";
import { deleteAdminUser } from "@/lib/admin-users";
import { rejectNonAdminMutation } from "@/lib/api-guard";
import { currentAdminEmail } from "@/lib/auth";
import { publicError } from "@/lib/errors";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = await rejectNonAdminMutation(request);
  if (rejected) return rejected;
  const currentEmail = await currentAdminEmail();
  if (!currentEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await deleteAdminUser((await params).id, currentEmail);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: publicError(error, "Unable to delete administrator.") }, { status: 400 });
  }
}
