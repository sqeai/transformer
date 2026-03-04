"use client";

import Link from "next/link";
import { UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const features = [
  {
    title: "AI-Powered Mapping",
    description:
      "Map messy columns into your target schema faster with guided AI suggestions.",
  },
  {
    title: "Schema Governance",
    description:
      "Manage field definitions, schema ownership, and edit permissions in one place.",
  },
  {
    title: "Pipeline Ready Output",
    description:
      "Preview, validate, and export cleansed data for downstream analytics and automation.",
  },
];

const guideSteps = [
  {
    title: "1. Upload & Prepare Data",
    description:
      "Select multiple files and define boundaries so AI can clean and unify all selected inputs.",
    image: "/guides/03-select-multiple-sheets.jpg",
    alt: "Select multiple files and prepare raw data",
  },
  {
    title: "2. Let AI Determine Mapping",
    description:
      "Use Auto-map with AI and review suggested links for each file mapping.",
    image: "/guides/04-ai-mapping-determination.jpg",
    alt: "AI mapping determination screen",
  },
  {
    title: "3. Save Mapping to Schema",
    description:
      "Review schema details and mapped fields, then save and reuse for future datasets.",
    image: "/guides/02-schema-mapping-result.jpg",
    alt: "Schema mapping result and saved output structure",
  },
  {
    title: "4. Export Clean Data",
    description:
      "Export transformed results to XLSX/CSV or downstream destinations after AI-assisted mapping.",
    image: "/guides/05-data-export.jpg",
    alt: "Data export options after mapping",
  },
];

export default function Home() {
  const { user, loading } = useAuth();
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "User";

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.35),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.25),_transparent_42%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center">
            <img
              src="/sqe-logo-placeholder.png"
              alt="Company logo"
              className="h-12 w-auto max-w-[340px] rounded-md border border-cyan-300/50 bg-white/95 p-1"
            />
          </div>
          <div className="flex items-center gap-2">
            {!loading && user ? (
              <Button
                asChild
                variant="ghost"
                className="text-slate-100 hover:bg-slate-800"
              >
                <Link href="/datasets">
                  <UserCircle2 className="h-5 w-5" />
                  {`Hi ${firstName}`}
                </Link>
              </Button>
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className="text-slate-100 hover:bg-slate-800"
                >
                  <Link href="/login">Log in</Link>
                </Button>
                <Button
                  asChild
                  className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                >
                  <Link href="/signup">Sign up</Link>
                </Button>
              </>
            )}
          </div>
        </header>

        <section className="mt-14 flex flex-1 flex-col justify-center">
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight sm:text-6xl">
            Build trusted datasets from raw files.
          </h1>
          <p className="mt-5 max-w-3xl text-base text-slate-300 sm:text-lg">
            Transform inconsistent source data into governed, export-ready structure with assisted mapping, preview workflows, and schema-centered collaboration.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              <Link href="/signup">Get Started</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-slate-500 bg-transparent text-slate-100 hover:bg-slate-800"
            >
              <Link href="/datasets">Open Workspace</Link>
            </Button>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-5"
              >
                <h2 className="text-lg font-medium text-cyan-200">{feature.title}</h2>
                <p className="mt-2 text-sm text-slate-300">{feature.description}</p>
              </article>
            ))}
          </div>

          <div className="mt-16 rounded-2xl border border-slate-700/80 bg-slate-900/55 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/90">
              AI Mapping Showcase
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              See how AI determines mapping automatically
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              The screenshot below highlights the mapping canvas where AI links source columns to your target schema.
            </p>
            <img
              src="/guides/01-ai-mapping-frontpage.jpg"
              alt="AI mapping canvas showing automatic mapping suggestions"
              className="mt-5 w-full rounded-xl border border-slate-700/90 bg-slate-950/60"
            />
          </div>

          <div className="mt-12">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/90">
              How-To Guide
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Clean data in four steps
            </h2>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {guideSteps.map((step) => (
                <article
                  key={step.title}
                  className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4"
                >
                  <img
                    src={step.image}
                    alt={step.alt}
                    className="w-full rounded-lg border border-slate-700/80 bg-slate-950/70"
                  />
                  <h3 className="mt-4 text-lg font-medium text-cyan-200">{step.title}</h3>
                  <p className="mt-1 text-sm text-slate-300">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <footer className="mt-12 flex flex-col items-center gap-4 border-t border-slate-800 pt-8 pb-4 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Contact Us</p>
          <div className="flex items-center gap-4">
            <a
              href="https://wa.me/6288212599900?text=Hi%2C%20I%27d%20like%20to%20learn%20more%20about%20AI%20Data%20Cleanser"
              target="_blank"
              rel="noreferrer"
              aria-label="Contact Nico on WhatsApp"
              className="rounded-full border border-emerald-300/50 bg-emerald-500/20 p-3 transition hover:bg-emerald-500/30"
            >
              <img src="/whatsapp-logo.png" alt="WhatsApp" className="h-7 w-7" />
            </a>
            <a
              href="mailto:nico.alimin@smma.id"
              aria-label="Email Nico"
              className="rounded-full border border-cyan-300/50 bg-cyan-500/20 p-3 transition hover:bg-cyan-500/30"
            >
              <img src="/email-logo.svg" alt="Email" className="h-7 w-7" />
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
