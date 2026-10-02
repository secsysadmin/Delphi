import { Resend } from "resend";
import type { EventSlot, Registration, RegistrationEvent } from "@/types";
import { formatDate, formatTime } from "@/lib/utils";

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[character]!);

function replacements(registration: Registration, event: RegistrationEvent, slot?: EventSlot | null) {
  return {
    "{{firstName}}": registration.firstName,
    "{{name}}": `${registration.firstName} ${registration.lastName}`,
    "{{event}}": event.title,
    "{{slot}}": slot?.label ?? "",
    "{{date}}": formatDate(slot?.startAt ?? event.startAt),
    "{{time}}": formatTime(slot?.startAt ?? event.startAt),
    "{{room}}": slot?.location || event.location,
  };
}

export function renderTemplate(template: string, registration: Registration, event: RegistrationEvent, slot?: EventSlot | null) {
  return Object.entries(replacements(registration, event, slot)).reduce((text, [key, value]) => text.replaceAll(key, value), template);
}

function emailHtml(body: string, registration: Registration, event: RegistrationEvent, slot?: EventSlot | null) {
  const accent = slot?.accentColor || event.accentColor || "#500000";
  const eventDate = slot?.startAt ?? event.startAt;
  const room = slot?.location || event.location;
  return `<!doctype html><html><body style="margin:0;background:#f4f1ed;font-family:Arial,sans-serif;color:#242321"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:${accent};color:#fff;padding:24px 28px;border-radius:14px 14px 0 0"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.8">Student Engineers' Council</div><h1 style="font-size:24px;margin:8px 0 0">Registration confirmed</h1></div><div style="background:#fff;padding:28px;border:1px solid #e4dfd8;border-top:0"><p style="font-size:16px;line-height:1.7;white-space:pre-line">${escapeHtml(renderTemplate(body, registration, event, slot))}</p><div style="margin:26px 0 8px;padding:20px;border-left:6px solid ${accent};background:#f7f4f1"><strong style="display:block;font-size:20px">${escapeHtml(event.title)}</strong>${slot ? `<span style="display:block;margin-top:6px">${escapeHtml(slot.label)}</span>` : ""}<span style="display:block;margin-top:6px">${escapeHtml(formatDate(eventDate, true))}</span><span style="display:block;margin-top:4px">${escapeHtml(room)}</span></div><p style="font-size:12px;color:#6b6864;margin-top:28px">SEC Registration Hub · Texas A&M University</p></div></div></body></html>`;
}

export async function sendConfirmation(registration: Registration, event: RegistrationEvent, slot?: EventSlot | null) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return { status: "previewed", id: null };
  const resend = new Resend(process.env.RESEND_API_KEY);
  const subject = renderTemplate(slot?.confirmationSubject || event.confirmationSubject, registration, event, slot);
  const body = slot?.confirmationBody || event.confirmationBody;
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: registration.email,
    subject,
    html: emailHtml(body, registration, event, slot),
  });
  if (error) throw new Error(error.message);
  return { status: "sent", id: data?.id ?? null };
}

export async function sendBroadcast(registrations: Registration[], event: RegistrationEvent, subject: string, body: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return { sent: registrations.length, preview: true };
  const resend = new Resend(process.env.RESEND_API_KEY);
  for (const registration of registrations) {
    const renderedSubject = renderTemplate(subject, registration, event);
    const renderedBody = renderTemplate(body, registration, event);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: registration.email,
      subject: renderedSubject,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px"><div style="height:8px;background:${event.accentColor};border-radius:8px"></div><div style="font-size:16px;line-height:1.7;white-space:pre-line;padding:24px 4px">${escapeHtml(renderedBody)}</div><p style="color:#777;font-size:12px">SEC Registration Hub · Texas A&M University</p></div>`,
    });
    if (error) throw new Error(error.message);
  }
  return { sent: registrations.length, preview: false };
}
