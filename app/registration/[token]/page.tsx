import type { Metadata } from "next";
import Link from "next/link";
import { ManageRegistration } from "@/components/manage-registration";
import { registrationIdFromManageToken } from "@/lib/auth";
import { findRegistration, getEvent } from "@/lib/store";

// The URL grants access, so keep it out of search indexes and outgoing Referer headers.
export const metadata: Metadata = { title: "Your registration", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ManageRegistrationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const registrationId = registrationIdFromManageToken(token);
  const registration = registrationId ? await findRegistration(registrationId) : null;
  const event = registration ? await getEvent(registration.eventId, true) : null;
  if (!registration || !event) return (
    <div className="shell empty-state page-space">
      <h2>This link isn&apos;t valid</h2>
      <p>It may be incomplete. Open the event page and use &ldquo;Already registered?&rdquo; to get a new link by email.</p>
      <Link href="/" className="button button--primary">Browse events</Link>
    </div>
  );
  return <ManageRegistration token={token} event={event} initialRegistration={registration} />;
}
