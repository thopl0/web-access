import type { Metadata } from "next";
import Link from "next/link";

import { LegalShell, LegalSection } from "@/components/marketing/Legal";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What data we collect when you scan a site or hold an account, why we collect it, who we share it with, and the choices you have. In plain English.",
};

const UPDATED = "20 June 2026";

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy policy"
      updated={UPDATED}
      intro={
        <>
          This explains what {SITE_NAME} does with information when you scan a site or hold an
          account — what we collect, why, who else touches it, and what you can ask us to do about
          it. We&apos;ve kept it in plain language on purpose.
        </>
      }
    >
      <LegalSection n={1} id="short-version" title="The short version">
        <ul>
          <li>
            We collect what we need to run an accessibility scan and show you the results — the URL
            you give us, the content of the page we fetch, and the issues we find.
          </li>
          <li>
            We store <strong>results</strong>, not a mirror of your site: the findings, severity,
            and cropped screenshots of the elements that have problems.
          </li>
          <li>
            To produce those results we rely on a few trusted third-party services (hosting, AI
            processing, payments, email). We don&apos;t sell your data and we don&apos;t run
            advertising trackers.
          </li>
          <li>
            You can ask us to show you, correct, or delete your data at any time through our{" "}
            <Link href="/contact">contact page</Link>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={2} id="who-we-are" title="Who we are, and what this covers">
        <p>
          This policy covers {SITE_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) — the website, the
          free scan, your account, and the dashboard. It does not cover other companies&apos; sites
          we link to, or the sites you choose to scan, which have their own privacy practices.
        </p>
        <p>
          For anything in this policy — including a request to access or delete your data — reach us
          through the <Link href="/contact">contact page</Link>.
        </p>
      </LegalSection>

      <LegalSection n={3} id="what-we-collect" title="What we collect">
        <h3>When you run a scan</h3>
        <ul>
          <li>
            <strong>The URL you submit</strong> and the public page content we fetch from it, so we
            can analyse it the way assistive technology would.
          </li>
          <li>
            <strong>The results</strong> we generate: the accessibility issues, their severity and
            WCAG mapping, suggested fixes, and cropped screenshots of the specific elements that have
            problems. We keep these results — not a full copy of your site.
          </li>
          <li>
            <strong>Anti-abuse signals for the free public scan</strong>: your IP address, a
            first-party cookie, and a basic browser signature, used only to enforce the free weekly
            scan limit and stop automated abuse.
          </li>
        </ul>

        <h3>When you hold an account</h3>
        <ul>
          <li>
            <strong>Account details</strong> — your email address and a securely hashed password (we
            never store your password in readable form).
          </li>
          <li>
            <strong>The sites you add</strong> and their scan history, so we can monitor them and
            show changes over time.
          </li>
          <li>
            <strong>Billing information</strong>, if you upgrade to a paid plan. Payments are handled
            by a third-party payment processor; we never see or store your full card number.
          </li>
        </ul>

        <h3>Automatically</h3>
        <ul>
          <li>
            <strong>Basic technical logs</strong> — things like request times and errors — which
            help us keep the service running and secure.
          </li>
          <li>
            <strong>Messages you send us</strong> through the contact form, so we can reply.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n={4} id="how-we-use" title="How we use it">
        <p>We use the information above to:</p>
        <ul>
          <li>run your scans and show you the results;</li>
          <li>monitor your sites and alert you when a scan finds critical issues or something regresses;</li>
          <li>send you account, scan, and (if you&apos;re registered) periodic digest emails;</li>
          <li>take payment and manage your subscription;</li>
          <li>prevent abuse of the free scan and keep the service secure;</li>
          <li>fix problems and improve how the product works.</li>
        </ul>
      </LegalSection>

      <LegalSection n={5} id="third-parties" title="Third-party services">
        <p>
          We don&apos;t sell your data and we don&apos;t share it for advertising. To deliver the
          product, though, a few trusted third-party services process data on our behalf:
        </p>
        <ul>
          <li><strong>Hosting and infrastructure</strong>, which stores your data and runs the app.</li>
          <li>
            <strong>AI processing</strong>, used to judge image descriptions and write
            plain-language fixes. To do this, the content and screenshots of a page you ask us to
            scan may be sent to these AI services solely to produce your results.
          </li>
          <li><strong>Payment processing</strong>, for paid plans.</li>
          <li><strong>Email delivery</strong>, for the messages described above.</li>
        </ul>
        <p>
          These providers may process data in countries other than your own. We&apos;re continuing
          to formalise the full list of these providers and the safeguards around them, and will set
          it out here in more detail as the service grows. If you need specifics before then, ask us
          through the <Link href="/contact">contact page</Link>.
        </p>
        <p>We may also disclose information where the law requires it, or to protect our rights and users.</p>
      </LegalSection>

      <LegalSection n={6} id="cookies" title="Cookies">
        <p>We keep cookies to a minimum:</p>
        <ul>
          <li>
            a <strong>session cookie</strong> to keep you signed in;
          </li>
          <li>
            a long-lived <strong>first-party cookie</strong> on the free scan, used as one of the
            anti-abuse signals that enforce the weekly limit;
          </li>
          <li>
            <strong>optional analytics cookies</strong> from Google Analytics, which help us see how
            the site is used — which pages people visit and roughly where they arrive from — so we can
            improve it. These measure usage in aggregate and aren&apos;t used to identify you, and we
            only set them <strong>if you accept</strong>.
          </li>
        </ul>
        <p>
          The analytics cookies are off until you opt in on the cookie banner. You can change or
          withdraw that choice at any time with the &ldquo;Cookie settings&rdquo; link in the footer.
          We don&apos;t use advertising or cross-site ad-tracking cookies.
        </p>
      </LegalSection>

      <LegalSection n={7} id="retention" title="How long we keep it">
        <p>
          We keep your account and the scan results for your sites for as long as your account is
          active, so your history and monitoring stay useful. Results from the free, anonymous public
          scan are kept for a limited period and then become eligible for deletion.
        </p>
        <p>
          When you delete a site or close your account, we delete or anonymise the associated data,
          except where we&apos;re required to keep certain records (for example, billing records) for
          a limited time.
        </p>
      </LegalSection>

      <LegalSection n={8} id="your-rights" title="Your choices and rights">
        <p>
          You can ask us to show you the personal data we hold about you, correct it, export it, or
          delete it. Depending on where you live, you may have additional rights under laws such as
          the GDPR or CCPA — and you can exercise them the same way: just ask us through the{" "}
          <Link href="/contact">contact page</Link>. We won&apos;t charge you for a reasonable
          request, and we won&apos;t treat you differently for making one.
        </p>
      </LegalSection>

      <LegalSection n={9} id="security" title="Security">
        <p>
          We take reasonable measures to protect your data — including hashing passwords and
          access-controlling the screenshots and reports tied to a scan. No method of storage or
          transmission is perfectly secure, though, so we can&apos;t promise absolute security. If we
          ever become aware of a breach that affects you, we&apos;ll act on it and tell you where the
          law requires.
        </p>
      </LegalSection>

      <LegalSection n={10} id="children" title="Children">
        <p>
          This service is for site owners and is not directed at children. We don&apos;t knowingly
          collect personal data from children. If you believe a child has given us their information,
          tell us and we&apos;ll remove it.
        </p>
      </LegalSection>

      <LegalSection n={11} id="changes" title="Changes to this policy">
        <p>
          As the product grows, this policy will too. When we make a meaningful change we&apos;ll
          update the page and the &ldquo;last updated&rdquo; date at the top. Continuing to use the
          service after a change means you accept the updated policy.
        </p>
      </LegalSection>

      <LegalSection n={12} id="contact" title="Contact us">
        <p>
          Questions about this policy, or a request about your data? Reach us through the{" "}
          <Link href="/contact">contact page</Link> and we&apos;ll get back to you.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
