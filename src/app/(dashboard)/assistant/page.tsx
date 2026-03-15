"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AnalystChat } from "@/components/analyst/AnalystChat";
import { Loader2, FolderOpen, MessageSquare, BarChart3 } from "lucide-react";

type PageState = "loading" | "chat" | "no-access";

export default function AssistantPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("loading");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/users/me/sidebar-access");
        if (!res.ok) return;
        const data = await res.json();

        if (cancelled) return;

        if (data.canChat) {
          setPageState("chat");
          return;
        }

        const foldersRes = await fetch("/api/folders");
        if (!foldersRes.ok) return;
        const foldersData = await foldersRes.json();
        const folders = foldersData.folders ?? [];

        if (cancelled) return;

        if (folders.length > 0) {
          router.replace(`/folders/${folders[0].id}`);
        } else {
          setPageState("no-access");
        }
      } catch {
        /* ignore */
      }
    }

    check();
    return () => { cancelled = true; };
  }, [router]);

  if (pageState === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (pageState === "no-access") {
    return <WelcomePage />;
  }

  return <AnalystChat />;
}

function WelcomePage() {
  const highlights = [
    {
      icon: FolderOpen,
      title: "Organize Data",
      description:
        "Group schemas, datasets, and dashboards into folders with role-based access.",
    },
    {
      icon: MessageSquare,
      title: "AI Assistant",
      description:
        "Chat with an AI analyst to explore your data and generate insights.",
    },
    {
      icon: BarChart3,
      title: "Dashboards & Panels",
      description:
        "Build interactive dashboards powered by natural-language queries.",
    },
  ];

  return (
    <div className="flex h-full items-center justify-center">
      <div className="mx-auto max-w-lg text-center space-y-8">
        <div className="flex justify-center">
          <Image
            src="/transformer-logo.png"
            alt="Transformer"
            width={80}
            height={80}
            className="rounded-2xl object-contain"
          />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to Transformer
          </h1>
          <p className="text-muted-foreground">
            You don&apos;t have access to any folders yet. Please contact your
            administrator to get started.
          </p>
        </div>

        <div className="grid gap-4 text-left sm:grid-cols-3">
          {highlights.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border bg-card p-4 space-y-2"
            >
              <item.icon className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="text-xs text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
