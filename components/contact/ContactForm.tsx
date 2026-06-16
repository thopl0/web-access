"use client";

import { useId, useRef, useState } from "react";
import { CircleCheck, Send } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { TextField, TextAreaField } from "@/components/ui/Field";
import { cn } from "@/lib/utils";

/** The topic options for the optional <select>. First entry is the placeholder. */
const TOPICS = [
  { value: "", label: "Pick one (optional)" },
  { value: "general", label: "Just saying hi" },
  { value: "scan", label: "A question about scans" },
  { value: "billing", label: "Billing or plans" },
  { value: "bug", label: "Something looks broken" },
  { value: "accessibility", label: "An accessibility problem on this site" },
] as const;

type FieldName = "name" | "email" | "message";
type Errors = Partial<Record<FieldName, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactForm() {
  // Stable, unique ids so multiple instances never collide.
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Refs for focus management: first invalid field on error, the confirmation
  // on success.
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  function validate(data: FormData): Errors {
    const next: Errors = {};
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const message = String(data.get("message") ?? "").trim();

    if (!name) next.name = "Tell us what to call you.";
    if (!email) {
      next.email = "We need an email to write back to.";
    } else if (!EMAIL_RE.test(email)) {
      next.email = "That email doesn't look right — check for a typo.";
    }
    if (!message) next.message = "Add a line or two so we know how to help.";

    return next;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const found = validate(data);
    setErrors(found);

    if (Object.keys(found).length > 0) {
      // Move focus to the FIRST invalid field, in DOM order.
      const order: FieldName[] = ["name", "email", "message"];
      const firstBad = order.find((f) => found[f]);
      if (firstBad) {
        const el = form.querySelector<HTMLElement>(`#${CSS.escape(id(firstBad))}`);
        el?.focus();
      }
      return;
    }

    setSending(true);

    // TODO: wire to real backend endpoint — POST these fields to the contact
    // API and surface a real error state if the request fails.
    await new Promise((resolve) => setTimeout(resolve, 700));

    setSending(false);
    setSent(true);

    // Defer focus to the confirmation until after it renders.
    requestAnimationFrame(() => successRef.current?.focus());
  }

  function sendAnother() {
    setSent(false);
    setErrors({});
    formRef.current?.reset();
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id("name"))}`)?.focus();
    });
  }

  if (sent) {
    return (
      <div
        ref={successRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className="flex flex-col items-start gap-5 outline-none focus-visible:outline-3 focus-visible:outline-[var(--color-blue)] focus-visible:outline-offset-4"
      >
        <span className="inline-flex size-14 items-center justify-center border-[3px] border-[var(--ink)] bg-green text-on-accent shadow-ink">
          <CircleCheck className="size-7" strokeWidth={2.75} aria-hidden="true" />
        </span>
        <h3 className="font-display text-2xl sm:text-3xl text-fg">
          Thanks — your message is on its way.
        </h3>
        <p className="text-fg-soft text-lg max-w-md">
          A real person reads these. We&apos;ll get back to you at the email you
          gave us, usually within a working day or two.
        </p>
        <Button type="button" variant="yellow" onClick={sendAnother}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <fieldset
        aria-describedby={id("required-note")}
        className="flex flex-col gap-6 border-0 p-0 m-0 min-w-0"
      >
        <legend className="font-display font-bold text-fg text-lg mb-2">
          Send us a message
        </legend>

        {/* Required-fields explanation, tied to the fieldset via aria-describedby
            so a screen reader hears it when it enters the group. */}
        <p id={id("required-note")} className="text-sm text-fg-soft -mt-2">
          Fields marked{" "}
          <span className="text-pink font-bold">
            *<span className="sr-only"> (required)</span>
          </span>{" "}
          are required.
        </p>

        <TextField
          id={id("name")}
          name="name"
          label="Name"
          required
          autoComplete="name"
          error={errors.name}
        />

        <TextField
          id={id("email")}
          name="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          hint="So we can write back. We won't add you to anything."
          error={errors.email}
        />

        {/* Optional topic select — hand-built so we can match the field styling
            and keep a visible focus ring. Label + control are wired by htmlFor. */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor={id("topic")}
            className="font-display font-bold text-fg"
          >
            Subject or topic
            <span className="text-fg-soft font-normal"> (optional)</span>
          </label>
          <select
            id={id("topic")}
            name="topic"
            defaultValue=""
            className={cn(
              "w-full min-h-[44px] border-[3px] border-[var(--color-line)] bg-surface text-fg",
              "px-4 py-3 text-base focus:outline-none",
              "focus-visible:outline-3 focus-visible:outline-[var(--color-blue)] focus-visible:outline-offset-2",
            )}
          >
            {TOPICS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <TextAreaField
          id={id("message")}
          name="message"
          label="Message"
          required
          rows={6}
          hint="What's going on? The more specific, the faster we can help."
          error={errors.message}
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="blue" size="lg" disabled={sending} aria-disabled={sending}>
          {sending ? "Sending…" : "Send message"}
          <Send className="size-5" strokeWidth={2.75} aria-hidden="true" />
        </Button>
        {sending ? (
          <span className="text-fg-soft text-sm">Hang tight…</span>
        ) : null}
      </div>
    </form>
  );
}
