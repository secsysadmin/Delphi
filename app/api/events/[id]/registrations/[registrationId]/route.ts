import { NextResponse } from "next/server";
import { rejectNonAdmin } from "@/lib/api-guard";
import { deleteRegistration } from "@/lib/store";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  const rejected = await rejectNonAdmin(request);
  if (rejected) return rejected;
  const { id, registrationId } = await params;
  const deleted = await deleteRegistration(id, registrationId);
  if (!deleted) return NextResponse.json({ error: "Participant not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
