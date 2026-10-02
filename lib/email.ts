import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { Resend } from "resend";
import type { EventSlot, Registration, RegistrationEvent } from "@/types";
import { formatDate, formatTime } from "@/lib/utils";

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[character]!);
const defaultFrom = "Student Engineers' Council <no-reply@sec.tamu.edu>";
const hasSesCredentials = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const ses = hasSesCredentials ? new SESClient({ region: process.env.AWS_REGION || "us-east-1" }) : null;

function emailProvider() {
  if (process.env.EMAIL_PROVIDER === "resend") return process.env.RESEND_API_KEY ? "resend" : null;
  if (process.env.EMAIL_PROVIDER === "ses") return ses ? "ses" : null;
  return ses ? "ses" : process.env.RESEND_API_KEY ? "resend" : null;
}

function mailboxAddress(value: string) {
  return value.match(/<([^>]+)>/)?.[1] ?? value;
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function base64Mime(value: string) {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function rawMessage({ from, to, subject, html, text }: { from: string; to: string; subject: string; html: string; text: string }) {
  const boundary = "=_SEC_Registration_Boundary";
  return [
    `From: ${cleanHeader(from)}`,
    `To: ${cleanHeader(to)}`,
    `Subject: ${cleanHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Mime(text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Mime(html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function deliverEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  const provider = emailProvider();
  if (!provider) return null;
  const from = process.env.EMAIL_FROM || defaultFrom;
  if (provider === "ses") {
    const response = await ses!.send(new SendRawEmailCommand({
      Source: mailboxAddress(from),
      Destinations: [to],
      RawMessage: { Data: Buffer.from(rawMessage({ from, to, subject, html, text })) },
    }));
    return response.MessageId ?? null;
  }
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data, error } = await resend.emails.send({ from, to, subject, html, text });
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

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
  const candidateAccent = slot?.accentColor || event.accentColor || "#500000";
  const accent = /^#[0-9a-f]{6}$/i.test(candidateAccent) ? candidateAccent : "#500000";
  const eventDate = slot?.startAt ?? event.startAt;
  const room = slot?.location || event.location;
  return `<!doctype html><html><body style="margin:0;background:#f4f1ed;font-family:Arial,sans-serif;color:#242321"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#4d0710;color:#fff;padding:24px 28px"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.8">Student Engineers' Council</div><h1 style="font-size:24px;margin:8px 0 0">Registration confirmed</h1></div><div style="background:#fff;padding:28px;border:1px solid #e4dfd8;border-top:0"><p style="font-size:16px;line-height:1.7;white-space:pre-line">${escapeHtml(renderTemplate(body, registration, event, slot))}</p><div style="margin:26px 0 8px;padding:20px;border:1px solid ${accent};background:#f7f4f1"><strong style="display:block;font-size:20px">${escapeHtml(event.title)}</strong>${slot ? `<span style="display:block;margin-top:6px">${escapeHtml(slot.label)}</span>` : ""}<span style="display:block;margin-top:6px">${escapeHtml(formatDate(eventDate, true))} · ${escapeHtml(formatTime(eventDate))}</span><span style="display:block;margin-top:4px">${escapeHtml(room)}</span></div><p style="font-size:12px;color:#6b6864;margin-top:28px">SEC Registration Hub · Texas A&M University</p></div></div></body></html>`;
}

export async function sendConfirmation(registration: Registration, event: RegistrationEvent, slot?: EventSlot | null) {
  const subject = renderTemplate(slot?.confirmationSubject || event.confirmationSubject, registration, event, slot);
  const body = slot?.confirmationBody || event.confirmationBody;
  const id = await deliverEmail({ to: registration.email, subject, html: emailHtml(body, registration, event, slot), text: renderTemplate(body, registration, event, slot) });
  return { status: id ? "sent" : "previewed", id };
}

export async function sendBroadcast(registrations: Registration[], event: RegistrationEvent, subject: string, body: string) {
  if (!emailProvider()) return { sent: registrations.length, preview: true };
  for (const registration of registrations) {
    const renderedSubject = renderTemplate(subject, registration, event);
    const renderedBody = renderTemplate(body, registration, event);
    await deliverEmail({
      to: registration.email,
      subject: renderedSubject,
      text: renderedBody,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px"><div style="height:8px;background:#4d0710"></div><div style="font-size:16px;line-height:1.7;white-space:pre-line;padding:24px 4px">${escapeHtml(renderedBody)}</div><p style="color:#777;font-size:12px">SEC Registration Hub · Texas A&M University</p></div>`,
    });
  }
  return { sent: registrations.length, preview: false };
}
