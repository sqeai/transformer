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
    title: "1. Create Your Schema with AI",
    description:
      "Describe the schema you need and let AI generate the field definitions, types, and structure for you.",
    image: "/guides/001-schema-creation.png",
    alt: "AI-assisted schema creation from a natural language description",
  },
  {
    title: "2. Upload Raw Data",
    description:
      "Import raw Excel spreadsheets and CSV files directly — no reformatting required.",
    image: "/guides/002-upload-raw-data.png",
    alt: "Uploading raw Excel and CSV files",
  },
  {
    title: "3. AI-Powered Transformation",
    description:
      "Let AI transform your raw data and automatically determine the mapping to your target schema.",
    image: "/guides/003-ai-transformation.png",
    alt: "AI transforming and mapping raw data to the target schema",
  },
  {
    title: "4. Review & Approve",
    description:
      "Approve and review transformed data through a structured approval flow before merging into the final dataset.",
    image: "/guides/004-approval-flow.png",
    alt: "Approval flow for reviewing transformed data before merging",
  },
  {
    title: "5. Export to BigQuery",
    description:
      "Push your finalized, cleansed data to BigQuery automatically — ready for analytics and reporting.",
    image: "/guides/005-add-to-bigquery.png",
    alt: "Exporting final data to BigQuery",
  },
  {
    title: "6. Manage Any Data Type",
    description:
      "Organize and govern schemas across multiple businesses, departments, and data types from a single workspace.",
    image: "/guides/006-manage-multiple-businesses.png",
    alt: "Managing schemas across multiple businesses and data types",
  },
];

export default function Home() {
  const { user, loading } = useAuth();
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "User";

  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.08),_transparent_42%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/sqe-logo-placeholder.png"
              alt="SQE logo"
              className="h-8 w-auto"
            />
            <img
              src="/transformer-logo.png"
              alt="Transformer logo"
              className="h-10 w-10 rounded-md"
            />
            <span className="text-xl font-semibold tracking-tight text-slate-900">
              Transformer
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!loading && user ? (
              <Button
                asChild
                variant="ghost"
                className="text-slate-700 hover:bg-slate-100"
              >
                <Link href="/assistant">
                  <UserCircle2 className="h-5 w-5" />
                  {`Hi ${firstName}`}
                </Link>
              </Button>
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className="text-slate-700 hover:bg-slate-100"
                >
                  <Link href="/login">Log in</Link>
                </Button>
                <Button
                  asChild
                  className="bg-cyan-500 text-white hover:bg-cyan-600"
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
          <p className="mt-5 max-w-3xl text-base text-slate-600 sm:text-lg">
            Transform inconsistent source data into governed, export-ready structure with assisted mapping, preview workflows, and schema-centered collaboration.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-cyan-500 text-white hover:bg-cyan-600">
              <Link href="/signup">Get Started</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-slate-300 bg-transparent text-slate-700 hover:bg-slate-100"
            >
              <Link href="/assistant">Open Workspace</Link>
            </Button>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-xl border border-slate-200 bg-slate-50 p-5"
              >
                <h2 className="text-lg font-medium text-cyan-600">{feature.title}</h2>
                <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
              </article>
            ))}
          </div>

          <div className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-600/90">
              Before &amp; After
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              From messy spreadsheets to structured data
            </h2>
            <div className="relative mt-6 flex items-center gap-0 overflow-hidden rounded-xl">
              {/* Before — raw Excel, fades out toward center */}
              <div className="relative w-[45%] shrink-0">
                <img
                  src="/overview-excel-raw.png"
                  alt="Raw messy Excel data before transformation"
                  className="w-full rounded-l-xl"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-white" />
              </div>

              {/* Center — Transformer logo */}
              <div className="relative z-10 flex shrink-0 flex-col items-center gap-2 px-4">
                <img
                  src="/transformer-logo.png"
                  alt="Transformer logo"
                  className="h-14 w-14 rounded-lg drop-shadow-[0_0_12px_rgba(14,165,233,0.4)]"
                />
                <span className="text-sm font-semibold tracking-tight text-cyan-600">
                  Transformer
                </span>
              </div>

              {/* After — structured BigQuery, fades out toward center */}
              <div className="relative w-[45%] shrink-0">
                <img
                  src="/overview-structured-bigquery.png"
                  alt="Clean structured data in BigQuery after transformation"
                  className="w-full rounded-r-xl"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-white" />
              </div>
            </div>
          </div>

          <div className="mt-12">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-600/90">
              How-To Guide
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Clean data in six steps
            </h2>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {guideSteps.map((step) => (
                <article
                  key={step.title}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <img
                    src={step.image}
                    alt={step.alt}
                    className="w-full rounded-lg border border-slate-200 bg-white"
                  />
                  <h3 className="mt-4 text-lg font-medium text-cyan-600">{step.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <footer className="mt-12 flex flex-col items-center gap-4 border-t border-slate-200 pt-8 pb-4 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Contact Us</p>
          <div className="flex items-center gap-4">
            <a
              href="https://wa.me/6288212599900?text=Hi%2C%20I%27d%20like%20to%20learn%20more%20about%20AI%20Data%20Cleanser"
              target="_blank"
              rel="noreferrer"
              aria-label="Contact Nico on WhatsApp"
              className="rounded-full border border-emerald-300/50 bg-emerald-500/10 p-3 transition hover:bg-emerald-500/20"
            >
              <img src="/whatsapp-logo.png" alt="WhatsApp" className="h-7 w-7" />
            </a>
            <a
              href="mailto:nico.alimin@smma.id"
              aria-label="Email Nico"
              className="rounded-full border border-cyan-300/50 bg-cyan-500/10 p-3 transition hover:bg-cyan-500/20"
            >
              <img src="/email-logo.svg" alt="Email" className="h-7 w-7" />
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
