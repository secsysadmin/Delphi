import { NextResponse } from "next/server";
import { isAdmin, isSameOriginRequest } from "@/lib/auth";
import { deleteRegistration } from "@/lib/store";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, registrationId } = await params;
  const deleted = await deleteRegistration(id, registrationId);
  if (!deleted) return NextResponse.json({ error: "Participant not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
