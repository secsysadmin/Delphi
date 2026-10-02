import type { Metadata } from "next";
import { EventRegistration } from "@/components/event-registration";

export const metadata: Metadata = { title: "Event registration" };

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EventRegistration slug={slug} />;
}
