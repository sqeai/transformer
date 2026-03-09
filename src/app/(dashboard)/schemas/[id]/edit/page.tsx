"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditSchemaRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  useEffect(() => {
    router.replace(`/schemas/${id}`);
  }, [id, router]);

  return null;
}
