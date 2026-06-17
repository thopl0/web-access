import { NavServer } from "@/components/NavServer";
import { Footer } from "@/components/Footer";

/** Public marketing chrome: skip link, the top nav, and the footer sitemap. */
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* Skip link — first focusable element on every public page. */}
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <NavServer />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
