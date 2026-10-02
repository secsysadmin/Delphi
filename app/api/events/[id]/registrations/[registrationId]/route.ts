import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deleteRegistration } from "@/lib/store";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, registrationId } = await params;
  const deleted = await deleteRegistration(id, registrationId);
  if (!deleted) return NextResponse.json({ error: "Participant not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
