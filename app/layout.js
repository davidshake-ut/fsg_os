import { Plus_Jakarta_Sans, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import FaviconManager from "@/components/FaviconManager";
import BrandingVars from "@/components/BrandingVars";

const headingFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const dataMonoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-data-mono",
  display: "swap",
});

export const metadata = {
  title: "FSG OS",
  description:
    "FSG Operating System — modular business software for Technology Solutions Providers.",
};

// Appearance ("muted"/"bold") and sidebar style ("gradient"/"solid") are
// team settings (Team Branding — components/AdminPanel.jsx), not per-user
// preferences. Defaults here match the companies table's column defaults
// (migrations 0033/0034); components/BrandingVars.jsx corrects the
// attributes once the signed-in team's actual settings load.
export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-ui-theme="bold"
      data-sidebar-style="gradient"
      className={`h-full antialiased ${headingFont.variable} ${bodyFont.variable} ${dataMonoFont.variable}`}
    >
      {/* Background comes from app/globals.css's `body` rule (theme-aware
          --ui-page-bg), not a Tailwind class here — avoids a cascade race
          between this bg-[...] utility and that plain CSS rule. */}
      <body className="min-h-full flex flex-col text-slate-900">
        <SessionProvider>
          <FaviconManager />
          <BrandingVars />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
