import type { Metadata } from "next";
import Link from "next/link";

import { LegalShell, LegalSection } from "@/components/marketing/Legal";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The terms for using the scanner and your account — what the service does, the rules of use, billing, and the limits of what an automated tool can promise.",
};

const UPDATED = "20 June 2026";

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of service"
      updated={UPDATED}
      intro={
        <>
          These terms cover your use of {SITE_NAME} — the scanner, your account, and everything in
          the dashboard. They&apos;re written to be readable, but they&apos;re still the agreement
          between you and us, so please read them.
        </>
      }
    >
      <LegalSection n={1} id="short-version" title="The short version">
        <ul>
          <li>Only scan sites you own or have permission to scan.</li>
          <li>
            Our tool finds a lot, but it <strong>can&apos;t guarantee</strong> your site is legally
            compliant or fully accessible — it&apos;s a powerful aid, not a certificate.
          </li>
          <li>AI-generated fixes are suggestions. Review them before you ship them.</li>
          <li>Use the service fairly, and don&apos;t try to break or abuse it.</li>
        </ul>
        <p>The sections below say all of that more carefully.</p>
      </LegalSection>

      <LegalSection n={2} id="agreement" title="Agreeing to these terms">
        <p>
          By creating an account or using {SITE_NAME} — including the free scan — you agree to these
          terms. If you&apos;re using it on behalf of an organisation, you confirm you&apos;re
          allowed to accept these terms for them. If you don&apos;t agree, please don&apos;t use the
          service.
        </p>
      </LegalSection>

      <LegalSection n={3} id="what-it-is" title="What the service does">
        <p>
          {SITE_NAME} loads a web page the way assistive technology does, checks it against
          recognised accessibility guidelines, and reports the issues it finds along with suggested
          fixes. Some checks are deterministic; some use AI. We may add, change, or remove features
          over time as the product develops.
        </p>
      </LegalSection>

      <LegalSection n={4} id="accounts" title="Your account">
        <p>
          You&apos;re responsible for keeping your login details safe and for everything that happens
          under your account. Give us accurate information when you sign up, and let us know promptly
          if you think someone else has accessed your account.
        </p>
      </LegalSection>

      <LegalSection n={5} id="acceptable-use" title="Acceptable use">
        <p>When you use the service, you agree that you will:</p>
        <ul>
          <li>
            <strong>only scan sites you own or are authorised to test.</strong> Scanning someone
            else&apos;s site without permission is your responsibility, not ours;
          </li>
          <li>not use it for anything illegal, harmful, or infringing;</li>
          <li>
            not try to overload, disrupt, probe, or reverse-engineer the service, or get around its
            limits and security;
          </li>
          <li>not resell or republish the service as your own without our agreement.</li>
        </ul>
        <p>We may suspend or limit accounts that break these rules.</p>
      </LegalSection>

      <LegalSection n={6} id="your-content" title="The sites and content you submit">
        <p>
          When you submit a URL, you give us permission to fetch and process that page — including
          taking screenshots of it — to produce your results, and you confirm you have the right to
          let us do so. You keep ownership of your sites and content; we only use what you submit to
          provide the service to you, as described in our{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>
      </LegalSection>

      <LegalSection n={7} id="billing" title="Plans, billing, and cancellation">
        <p>
          The service offers a free tier with set limits and paid plans with more. Paid plans are
          billed in advance for the period you choose, through our payment processor. You can cancel
          at any time; your plan stays active until the end of the period you&apos;ve already paid
          for, and we don&apos;t generally refund part-used periods unless the law requires it. If we
          change prices, we&apos;ll give you notice before it affects you.
        </p>
      </LegalSection>

      <LegalSection n={8} id="no-guarantee" title="Accessibility results are not a guarantee">
        <p>
          This matters, so we&apos;ll say it plainly. {SITE_NAME} helps you find and fix
          accessibility problems, but it <strong>does not guarantee</strong> that your site complies
          with the ADA, the European Accessibility Act, WCAG, or any other law or standard, and it
          does not protect you from complaints or legal claims.
        </p>
        <ul>
          <li>
            Automated and AI-based checks can miss issues, and can occasionally flag something that
            isn&apos;t really a problem.
          </li>
          <li>
            A clean scan means we didn&apos;t detect issues with the checks we ran — not that your
            site is perfectly accessible.
          </li>
          <li>
            You are responsible for the changes you make to your own site, including whether and how
            you apply our suggestions.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={9} id="ai-output" title="AI-generated suggestions">
        <p>
          Some fixes, summaries, and prompts are generated automatically, including by AI. They&apos;re
          provided to help you and may not always be correct or complete. Treat them as suggestions:
          review them, and confirm they&apos;re right for your site before you publish them.
        </p>
      </LegalSection>

      <LegalSection n={10} id="not-legal-advice" title="Not legal advice">
        <p>
          Nothing in the service or on this site is legal advice. Accessibility law is complex and
          varies by place. If you need to know whether your site meets a specific legal obligation,
          please consult a qualified professional.
        </p>
      </LegalSection>

      <LegalSection n={11} id="warranty" title="The service is provided “as is”">
        <p>
          We work hard to make the service useful and reliable, but we provide it &ldquo;as
          is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, whether express
          or implied. We don&apos;t promise the service will be uninterrupted, error-free, or that
          its results will be complete or fit a particular purpose.
        </p>
      </LegalSection>

      <LegalSection n={12} id="liability" title="Limitation of liability">
        <p>
          To the fullest extent the law allows, {SITE_NAME} will not be liable for any indirect,
          incidental, or consequential losses, or for lost profits, data, or goodwill, arising from
          your use of (or inability to use) the service — including any reliance on its results or
          AI-generated suggestions. Where we are found liable despite this, our total liability to
          you is limited to the amount you paid us for the service in the twelve months before the
          claim. Some places don&apos;t allow certain limits, so parts of this may not apply to you.
        </p>
      </LegalSection>

      <LegalSection n={13} id="indemnity" title="Your responsibility to us">
        <p>
          You agree to cover us for claims and costs that arise from your misuse of the service or
          your breach of these terms — for example, scanning a site you weren&apos;t authorised to
          test.
        </p>
      </LegalSection>

      <LegalSection n={14} id="termination" title="Suspension and termination">
        <p>
          You can stop using the service and close your account at any time. We may suspend or end
          your access if you breach these terms or use the service in a way that risks harm to it or
          to others. Sections that by their nature should survive — such as the disclaimers and the
          limits on liability — continue to apply after your access ends.
        </p>
      </LegalSection>

      <LegalSection n={15} id="changes" title="Changes to these terms">
        <p>
          We may update these terms as the service changes. When we make a meaningful change,
          we&apos;ll update the page and the &ldquo;last updated&rdquo; date at the top. If you keep
          using the service after that, you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection n={16} id="contact" title="Contact us">
        <p>
          Questions about these terms? Reach us through the{" "}
          <Link href="/contact">contact page</Link>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
