"use client";

/**
 * Footer affordance to re-open the cookie consent banner — so a visitor can change or withdraw their
 * analytics choice at any time (a GDPR consent requirement). Dispatches the event the CookieConsent
 * component listens for; styled to match the surrounding footer links.
 */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("wa:cookie-settings"))}
      className={className}
    >
      Cookie settings
    </button>
  );
}
