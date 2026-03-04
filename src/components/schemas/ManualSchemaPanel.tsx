"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface ManualSchemaPanelProps {
  prompt: string;
  onPromptChange: (next: string) => void;
  onCreateSchema: () => void;
  creating: boolean;
}

export function ManualSchemaPanel({
  prompt,
  onPromptChange,
  onCreateSchema,
  creating,
}: ManualSchemaPanelProps) {
  return (
    <>
      <DialogHeader className="shrink-0 pb-4">
        <DialogTitle>Describe to AI</DialogTitle>
        <DialogDescription>
          Paste headers, sample rows, JSON, or any notes. The schema agent will
          infer the fields for you.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-1 min-h-0 flex-col gap-4">
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={`Paste anything here, for example:
invoice_no, invoice_date, customer_name, currency, subtotal, vat, total

or

JSON sample:
{"customerId":"C-001","orderDate":"2026-03-03","amount":125000}`}
          className="flex-1 min-h-[360px] resize-none font-mono text-sm"
        />
        <div className="flex justify-end">
          <Button
            onClick={onCreateSchema}
            disabled={!prompt.trim() || creating}
          >
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Inferring fields...
              </>
            ) : (
              "Create Schema"
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
