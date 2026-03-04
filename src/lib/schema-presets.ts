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
  makeField("account", 1),
  makeField("description", 2),
  makeField("amount", 3, "NUMERIC"),
  makeField("date", 4, "DATE"),
  makeField("period", 5),
  makeField("currency", 6),
  makeField("category", 7),
  makeField("subcategory", 8),
  makeField("notes", 9),
  makeField("entity", 10),
  makeField("audited", 11, "BOOLEAN"),
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

const unstructuredDataFields: SchemaField[] = [
  makeField("tags", 1),
  makeField("name", 2),
  makeField("filename", 3),
  makeField("raw_context", 4),
];

const repoShareFields: SchemaField[] = [
  makeField("kode_nasabah", 1),
  makeField("nama_nasabah", 2),
  makeField("nominal_repo", 3, "NUMERIC"),
  makeField("jenis_obligasi", 4),
  makeField("tenor_tahun", 5, "INTEGER"),
  makeField("tipe_nasabah", 6),
  makeField("baru_perpanjang", 7),
  makeField("tanggal_efektif", 8, "DATE"),
  makeField("tanggal_settlement", 9, "DATE"),
  makeField("tanggal_jatuh_tempo", 10, "DATE"),
  makeField("rate_return_nasabah", 11, "FLOAT"),
  makeField("nomor_perjanjian", 12),
  makeField("nasabah_purchase_pct", 13, "FLOAT"),
  makeField("nasabah_purchase_proceed_amount", 14, "NUMERIC"),
  makeField("net_received_nasabah", 15, "NUMERIC"),
  makeField("maturity_proceed_amount", 16, "NUMERIC"),
  makeField("nama_seller", 17),
  makeField("seller", 18),
  makeField("nominal_bonds", 19, "NUMERIC"),
  makeField("check_return", 20, "NUMERIC"),
  makeField("stated_return", 21, "NUMERIC"),
  makeField("gap", 22, "NUMERIC"),
  makeField("day", 23, "INTEGER"),
  makeField("month", 24, "INTEGER"),
  makeField("year", 25, "INTEGER"),
  makeField("due_date", 26, "DATE"),
  makeField("nett_return", 27, "NUMERIC"),
  makeField("smsek_fee_pct", 28, "FLOAT"),
  makeField("smsek_fee", 29, "NUMERIC"),
  makeField("coupon_pct", 30, "FLOAT"),
  makeField("return_pct", 31, "FLOAT"),
  makeField("agent_comm", 32, "NUMERIC"),
  makeField("accrue_interest", 33, "NUMERIC"),
  makeField("bond_code", 34),
  makeField("gross_coupon", 35, "NUMERIC"),
  makeField("nett_coupon", 36, "NUMERIC"),
  makeField("bond_nominal", 37, "NUMERIC"),
];

export const SCHEMA_PRESETS: SchemaPreset[] = [
  {
    id: "financial_statement",
    name: "Financial Statement",
    description: "Standard financial statement structure with accounts, amounts, periods, and audit tracking.",
    fields: financialStatementFields,
  },
  {
    id: "fis_fixed_instrument_schema",
    name: "FIS Fixed Instrument Schema",
    description: "Fixed instrument layout for position-level balances, coupon details, and maturity dates.",
    defaultSchemaName: "fixed_instrument_test",
    fields: fixedInstrumentFields,
  },
  {
    id: "repo_shares",
    name: "Repo Shares",
    description: "Repurchase agreement tracking with settlement dates, returns, coupons, and bond details.",
    fields: repoShareFields,
  },
  {
    id: "unstructured_data",
    name: "Unstructured Data",
    description: "Flexible schema for unstructured data with tags, naming, file references, and raw context.",
    fields: unstructuredDataFields,
  },
];
