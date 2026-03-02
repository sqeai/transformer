import type { SchemaField, SqlCompatibleType } from "./types";

export interface SchemaPreset {
  id: string;
  name: string;
  description: string;
  defaultSchemaName?: string;
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

const fixedInstrumentFields: SchemaField[] = [
  makeField("position_id", 1),
  makeField("asset_liability", 2),
  makeField("bs_grouping", 3),
  makeField("account_description", 4),
  makeField("counterparty", 5),
  makeField("currency", 6),
  makeField("start_date", 7, "DATE"),
  makeField("end_date", 8, "DATE"),
  makeField("principal_amount", 9, "NUMERIC"),
  makeField("principal_outstanding", 10, "NUMERIC"),
  makeField("installment_schedule", 11),
  makeField("purchase_price", 12, "NUMERIC"),
  makeField("coupon_rate", 13, "NUMERIC"),
  makeField("type", 14),
  makeField("coupon_payment_freq", 15),
  makeField("coupon_next_payment_date", 16, "DATE"),
  makeField("account_name_sub_entity", 17),
  makeField("classification", 18),
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
    id: "fis-fixed-instrument-schema",
    name: "FIS Fixed Instrument Schema",
    description: "Fixed instrument layout for position-level balances, coupon details, and maturity dates.",
    defaultSchemaName: "fixed_instrument_test",
    fields: fixedInstrumentFields,
  },
  {
    id: "repo-shares",
    name: "Repo Shares",
    description: "Repurchase agreement tracking with settlement dates, returns, coupons, and bond details.",
    fields: repoShareFields,
  },
];
