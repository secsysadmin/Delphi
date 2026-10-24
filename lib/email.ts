import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { Resend } from "resend";
import type { EventSlot, Registration, RegistrationEvent } from "@/types";
import { confirmationColors, confirmationTemplate, fillTemplate, formatRange, templateValues } from "@/lib/utils";

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[character]!);
const defaultFrom = "Student Engineers' Council <no-reply@sec.tamu.edu>";
const hasSesCredentials = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const ses = hasSesCredentials ? new SESClient({ region: process.env.AWS_REGION || "us-east-1" }) : null;

export function emailProvider() {
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

export function encodeHeader(value: string) {
  const clean = cleanHeader(value);
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  const words: string[] = [];
  let chunk = "";
  for (const character of clean) {
    if (Buffer.byteLength(chunk + character, "utf8") > 39) {
      words.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk) words.push(chunk);
  return words.map((word) => `=?UTF-8?B?${Buffer.from(word, "utf8").toString("base64")}?=`).join("\r\n ");
}

function encodeMailbox(value: string) {
  const match = cleanHeader(value).match(/^(.*?)\s*<([^>]+)>$/);
  if (!match || !match[1]) return cleanHeader(value);
  const name = match[1].replace(/^"|"$/g, "");
  return `${/^[\x20-\x7e]*$/.test(name) ? `"${name.replace(/(["\\])/g, "\\$1")}"` : encodeHeader(name)} <${match[2]}>`;
}

function base64Mime(value: string) {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export function rawMessage({ from, to, subject, html, text }: { from: string; to: string; subject: string; html: string; text: string }) {
  const boundary = "=_SEC_Registration_Boundary";
  return [
    `From: ${encodeMailbox(from)}`,
    `To: ${cleanHeader(to)}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
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

const isThrottle = (error: unknown) => {
  const { name, message } = (error ?? {}) as { name?: string; message?: string };
  return name === "Throttling" || name === "ThrottlingException" || /rate exceeded|too many requests/i.test(message ?? "");
};

async function deliverEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  const provider = emailProvider();
  if (!provider) return null;
  const from = process.env.EMAIL_FROM || defaultFrom;
  for (let attempt = 1; ; attempt++) {
    try {
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
      if (error) throw Object.assign(new Error(error.message), { name: error.name });
      return data?.id ?? null;
    } catch (error) {
      if (attempt >= 3 || !isThrottle(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

export function renderTemplate(template: string, registration: Pick<Registration, "firstName" | "lastName">, event: RegistrationEvent, slot?: EventSlot | null) {
  return fillTemplate(template, templateValues(registration, event, slot));
}

export function whenAndWhere(event: Pick<RegistrationEvent, "startAt" | "endAt" | "location" | "showDateInConfirmation">, slot?: Pick<EventSlot, "startAt" | "endAt" | "location"> | null) {
  const start = slot?.startAt ?? event.startAt;
  const end = slot?.endAt ?? event.endAt;
  return { when: formatRange(start, end, event.showDateInConfirmation !== false), room: slot?.location || event.location };
}

export function confirmationEmail(registration: Pick<Registration, "firstName" | "lastName">, event: RegistrationEvent, slot?: EventSlot | null) {
  const template = confirmationTemplate(event, slot);
  const subject = renderTemplate(template.subject, registration, event, slot);
  const body = renderTemplate(template.body, registration, event, slot);
  const { background: accent, foreground } = confirmationColors(event.accentColor, slot?.accentColor);
  const { when, room } = whenAndWhere(event, slot);
  const text = [body, "", event.title, slot?.label, when, room].filter((line) => line !== undefined && line !== null).join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ed;font-family:Arial,sans-serif;color:#242321"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#4d0710;color:#fff;padding:24px 28px"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.8">Student Engineers' Council</div><h1 style="font-size:24px;margin:8px 0 0">Registration Confirmed</h1></div><div style="background:#fff;padding:28px;border:1px solid #e4dfd8;border-top:0"><p style="font-size:16px;line-height:1.7;white-space:pre-line">${escapeHtml(body)}</p><div style="margin:26px 0 8px;padding:20px;border:1px solid ${accent};background:${accent};color:${foreground}"><strong style="display:block;font-size:20px">${escapeHtml(event.title)}</strong>${slot ? `<span style="display:block;margin-top:6px">${escapeHtml(slot.label)}</span>` : ""}<span style="display:block;margin-top:6px">${escapeHtml(when)}</span><span style="display:block;margin-top:4px">${escapeHtml(room)}</span></div><p style="font-size:12px;color:#6b6864;margin-top:28px">SEC Registration Hub · Texas A&amp;M University</p></div></div></body></html>`;
  return { subject, text, html };
}

export async function sendConfirmation(registration: Registration, event: RegistrationEvent, slot?: EventSlot | null, to = registration.email) {
  const { subject, text, html } = confirmationEmail(registration, event, slot);
  const id = await deliverEmail({ to, subject, html, text });
  return { status: id ? "sent" : "previewed", id };
}

export type BroadcastResult = { sent: number; failed: number; failedEmails: string[]; preview: boolean };

export async function sendBroadcast(registrations: Registration[], event: RegistrationEvent, subject: string, body: string): Promise<BroadcastResult> {
  if (!emailProvider()) return { sent: registrations.length, failed: 0, failedEmails: [], preview: true };
  const failedEmails: string[] = [];
  const queue = [...registrations];
  const interval = 1000 / (Number(process.env.EMAIL_SEND_RATE) || 10);
  let nextStart = Date.now();
  const pace = async () => {
    const start = Math.max(nextStart, Date.now());
    nextStart = start + interval;
    if (start > Date.now()) await new Promise((resolve) => setTimeout(resolve, start - Date.now()));
  };
  const worker = async () => {
    for (let registration = queue.shift(); registration; registration = queue.shift()) {
      await pace();
      const slot = event.slots.find((item) => item.id === registration!.slotId) ?? null;
      const renderedBody = renderTemplate(body, registration, event, slot);
      try {
        await deliverEmail({
          to: registration.email,
          subject: renderTemplate(subject, registration, event, slot),
          text: renderedBody,
          html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px"><div style="height:8px;background:#4d0710"></div><div style="font-size:16px;line-height:1.7;white-space:pre-line;padding:24px 4px">${escapeHtml(renderedBody)}</div><p style="color:#777;font-size:12px">SEC Registration Hub · Texas A&amp;M University</p></div>`,
        });
      } catch (error) {
        failedEmails.push(registration.email);
        console.error(`Broadcast to registration ${registration.id} failed`, error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, registrations.length) }, worker));
  return { sent: registrations.length - failedEmails.length, failed: failedEmails.length, failedEmails, preview: false };
}
