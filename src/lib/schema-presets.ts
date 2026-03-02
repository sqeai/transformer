import type { SchemaField, SqlCompatibleType } from "./types";

export interface SchemaPreset {
  id: string;
  name: string;
  description: string;
  fields: SchemaField[];
}

function makeField(
  name: string,
  order: number,
  dataType: SqlCompatibleType = "STRING",
): SchemaField {
  return {
    id: crypto.randomUUID(),
    name,
    path: name,
    level: 1,
    order,
    dataType,
    children: [],
  };
}

const financialStatementFields: SchemaField[] = [
  makeField("Account", 1),
  makeField("Description", 2),
  makeField("Amount", 3, "NUMERIC"),
  makeField("Date", 4, "DATE"),
  makeField("Period", 5),
  makeField("Currency", 6),
  makeField("Category", 7),
  makeField("Subcategory", 8),
  makeField("Notes", 9),
  makeField("Entity", 10),
  makeField("Audited", 11, "BOOLEAN"),
];

const corporateLoanFields: SchemaField[] = [
  makeField("AssetLiability", 1),
  makeField("BS Grouping", 2),
  makeField("CorpLoan Category", 3),
  makeField("CorpLoan Name", 4),
  makeField("Facility", 5),
  makeField("Lender", 6),
  makeField("Borrower Group", 7),
  makeField("Borrower Entity", 8),
  makeField("Intermediary", 9),
  makeField("Start Date", 10, "DATE"),
  makeField("End Date", 11, "DATE"),
  makeField("Currency", 12),
  makeField("Initial Principal", 13, "NUMERIC"),
  makeField("Remaining Principal", 14, "NUMERIC"),
  makeField("Interest Rate", 15, "FLOAT"),
  makeField("Interest Payment", 16, "NUMERIC"),
  makeField("Penalty Rate", 17, "FLOAT"),
  makeField("Penalty Rate Period", 18),
  makeField("Penalty Calculated", 19, "NUMERIC"),
  makeField("Intermediary Margin", 20, "NUMERIC"),
  makeField("Installment", 21, "NUMERIC"),
  makeField("Installment Frequency", 22),
  makeField("Discounted Interest Rate", 23, "FLOAT"),
  makeField("Discounted Interest Rate Start Date", 24, "DATE"),
  makeField("Days in a Year", 25, "INTEGER"),
  makeField("Days in a Month", 26, "INTEGER"),
];

const repoShareFields: SchemaField[] = [
  makeField("Kode Nasabah", 1),
  makeField("Nama Nasabah", 2),
  makeField("Nominal Repo", 3, "NUMERIC"),
  makeField("Jenis Obligasi", 4),
  makeField("Tenor (tahun)", 5, "INTEGER"),
  makeField("Tipe Nasabah", 6),
  makeField("Baru / Perpanjang?", 7),
  makeField("Tanggal Efektif", 8, "DATE"),
  makeField("Tanggal Settlement", 9, "DATE"),
  makeField("Tanggal Jatuh Tempo", 10, "DATE"),
  makeField("Rate Return Nasabah", 11, "FLOAT"),
  makeField("Nomor Perjanjian", 12),
  makeField("Nasabah Purchase %", 13, "FLOAT"),
  makeField("Nasabah Purchase Proceed Amount", 14, "NUMERIC"),
  makeField("Net Received Nasabah", 15, "NUMERIC"),
  makeField("Maturity Proceed Amount", 16, "NUMERIC"),
  makeField("Nama Seller", 17),
  makeField("Seller", 18),
  makeField("Nominal Bonds", 19, "NUMERIC"),
  makeField("Check Return", 20, "NUMERIC"),
  makeField("Stated Return", 21, "NUMERIC"),
  makeField("Gap", 22, "NUMERIC"),
  makeField("Day", 23, "INTEGER"),
  makeField("Month", 24, "INTEGER"),
  makeField("Year", 25, "INTEGER"),
  makeField("Due Date", 26, "DATE"),
  makeField("Nett Return", 27, "NUMERIC"),
  makeField("SMSek Fee%", 28, "FLOAT"),
  makeField("SMSek Fee", 29, "NUMERIC"),
  makeField("%Coupon", 30, "FLOAT"),
  makeField("%Return", 31, "FLOAT"),
  makeField("Agent Comm", 32, "NUMERIC"),
  makeField("Accrue Interest", 33, "NUMERIC"),
  makeField("Bond Code", 34),
  makeField("Gross Coupon", 35, "NUMERIC"),
  makeField("Nett Coupon", 36, "NUMERIC"),
  makeField("Bond Nominal", 37, "NUMERIC"),
];

export const SCHEMA_PRESETS: SchemaPreset[] = [
  {
    id: "financial-statement",
    name: "Financial Statement",
    description: "Standard financial statement structure with accounts, amounts, periods, and audit tracking.",
    fields: financialStatementFields,
  },
  {
    id: "corporate-loans",
    name: "Corporate Loans",
    description: "Loan portfolio tracking with borrower details, interest rates, installments, and penalty calculations.",
    fields: corporateLoanFields,
  },
  {
    id: "repo-shares",
    name: "Repo Shares",
    description: "Repurchase agreement tracking with settlement dates, returns, coupons, and bond details.",
    fields: repoShareFields,
  },
];
