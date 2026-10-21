import type { Metadata } from "next";
import { EventRegistration } from "@/components/event-registration";
import { getEvent } from "@/lib/store";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug).catch(() => null);
  return { title: event?.title ?? "Event registration", description: event?.summary || undefined };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EventRegistration slug={slug} />;
}
