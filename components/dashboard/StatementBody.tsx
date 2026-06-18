import type { StatementModel } from "@/lib/statement-template";

/**
 * Presentational render of a live accessibility statement. Shared by the public hosted page and the
 * owner-side preview so the two never drift. The downloadable export (route) renders the same
 * content as self-contained HTML — keep the two structures in sync.
 */

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 font-display text-xl font-bold text-fg">{children}</h2>;
}

export function StatementBody({ model: m }: { model: StatementModel }) {
  return (
    <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-fg">
      <h1 className="text-3xl text-fg sm:text-4xl">
        Accessibility statement for {m.entityName}
      </h1>

      <p className="mt-2 text-fg-soft">
        {m.entityName} is committed to making{" "}
        {m.siteHost ? (
          <a
            href={`https://${m.siteHost}`}
            className="font-bold text-link underline underline-offset-2"
            rel="noreferrer"
          >
            {m.siteHost}
          </a>
        ) : (
          "its website"
        )}{" "}
        accessible, in accordance with {m.targetLabel}.
      </p>

      <H2>Conformance status</H2>
      {m.status === "no-data" ? (
        <p className="text-fg-soft">
          This website has not yet been assessed. A conformance status will appear here once an
          accessibility scan has completed.
        </p>
      ) : (
        <>
          <p className="text-fg-soft">
            The{" "}
            <a
              href="https://www.w3.org/WAI/standards-guidelines/wcag/"
              className="font-bold text-link underline underline-offset-2"
              rel="noreferrer"
            >
              Web Content Accessibility Guidelines (WCAG)
            </a>{" "}
            define requirements to improve accessibility for people with disabilities. This website
            is <strong className="font-bold text-fg">partially conformant</strong> with{" "}
            {m.targetLabel}. Partially conformant means that some parts of the content do not fully
            conform to the accessibility standard.
          </p>
          <p className="text-fg-soft">
            Automated testing checked{" "}
            <strong className="font-bold text-fg">{m.checkedAutomatically}</strong> of{" "}
            {m.totalCriteria} success criteria;{" "}
            <strong className="font-bold text-fg">{m.manualReviewCount} require manual review</strong>{" "}
            and have not been independently audited. Automated testing reliably covers only part of
            WCAG, so the absence of detected issues is not a guarantee of full conformance.
          </p>
        </>
      )}

      {m.failing.length > 0 ? (
        <>
          <H2>Non-accessible content</H2>
          <p className="text-fg-soft">The following WCAG success criteria are known to be unmet:</p>
          <ul className="ml-5 list-disc text-fg-soft marker:text-fg-soft">
            {m.failing.map((f) => (
              <li key={f.sc} className="my-1">
                <span className="font-bold text-fg">{f.sc}</span> {f.title} (Level {f.level})
              </li>
            ))}
          </ul>
        </>
      ) : m.status === "partial-clean" ? (
        <>
          <H2>Non-accessible content</H2>
          <p className="text-fg-soft">
            Automated testing did not detect any failing success criteria. Criteria that require
            manual review have not yet been independently audited.
          </p>
        </>
      ) : null}

      <H2>Feedback</H2>
      <p className="text-fg-soft">
        We welcome your feedback on the accessibility of this website. Please let us know if you
        encounter accessibility barriers:
      </p>
      <ul className="ml-5 list-disc text-fg-soft marker:text-fg-soft">
        {m.contactEmail ? (
          <li className="my-1">
            Email:{" "}
            <a
              href={`mailto:${m.contactEmail}`}
              className="font-bold text-link underline underline-offset-2"
            >
              {m.contactEmail}
            </a>
          </li>
        ) : null}
        {m.contactUrl ? (
          <li className="my-1">
            Contact page:{" "}
            <a
              href={m.contactUrl}
              className="font-bold text-link underline underline-offset-2"
              rel="noreferrer"
            >
              {m.contactUrl}
            </a>
          </li>
        ) : null}
        {!m.contactEmail && !m.contactUrl ? (
          <li className="my-1">Please contact the site owner.</li>
        ) : null}
      </ul>

      <H2>Assessment approach</H2>
      <p className="text-fg-soft">
        {m.entityName} assessed the accessibility of this website by automated testing with{" "}
        {m.producedBy}. This statement reflects the most recent scan
        {m.lastScannedAt ? ` (${longDate(m.lastScannedAt)})` : ""} and is updated automatically as
        the site is re-scanned.
      </p>
      <p className="mt-1 text-xs text-fg-soft">Statement generated on {longDate(m.generatedAt)}.</p>
    </div>
  );
}
