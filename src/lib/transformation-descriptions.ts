export interface TransformationDescription {
  label: string;
  description: string;
}

export interface PhaseDescription {
  label: string;
  description: string;
}

export const TRANSFORMATION_DESCRIPTIONS: Record<string, TransformationDescription> = {
  filter: {
    label: "Filter",
    description:
      "Remove noise such as empty rows, duplicate rows, and rows matching specific keywords.",
  },
  filterRows: {
    label: "Filter Rows",
    description:
      "Keep or remove rows based on a regex pattern applied to a specific column.",
  },
  trimColumns: {
    label: "Trim Columns",
    description:
      "Drop unwanted columns or keep only a specified subset of columns.",
  },
  padColumns: {
    label: "Pad Columns",
    description:
      "Forward-fill empty cells by carrying the last non-empty value down through each column.",
  },
  unpivot: {
    label: "Unpivot",
    description:
      "Melt wide columns into rows, turning column headers into values in a new name/value pair.",
  },
  expand: {
    label: "Expand",
    description:
      "Flatten hierarchical/indented data into separate nesting-level columns.",
  },
  aggregate: {
    label: "Aggregate",
    description:
      "Group rows by key columns and compute aggregations (sum, count, min, max, avg, concat, first).",
  },
  mapRows: {
    label: "Map Rows",
    description:
      "Apply row-by-row conditional transformations or lookup-table mappings to derive or fill column values.",
  },
  reduce: {
    label: "Reduce",
    description:
      "Aggregate multiple columns by key columns with explicit control over output column names.",
  },
  map: {
    label: "Map",
    description:
      "Map source columns to target schema paths and assign default values. Always the final step.",
  },
  handleBalanceSheet: {
    label: "Balance Sheet",
    description:
      "Flatten balance-sheet-style hierarchies using star/indent conventions into nesting-level columns.",
  },
  handleUnstructuredData: {
    label: "Unstructured Data",
    description:
      "Collapse all columns in each row into a single text column for unstructured processing.",
  },
  handleStructuredData: {
    label: "Structured Data",
    description:
      "Pass structured data through without modification.",
  },
};

export const PHASE_DESCRIPTIONS: Record<string, PhaseDescription> = {
  cleansing: {
    label: "Cleansing",
    description:
      "Prepare and enrich the data without losing information — remove noise, fill gaps, and reshape.",
  },
  transformation: {
    label: "Transformation",
    description:
      "Reshape the cleansed data into the target schema — trim, aggregate, and map to final columns.",
  },
};

export function getTransformationDescription(tool: string): TransformationDescription {
  return (
    TRANSFORMATION_DESCRIPTIONS[tool] ?? {
      label: tool.charAt(0).toUpperCase() + tool.slice(1),
      description: "Custom transformation step.",
    }
  );
}

export function getPhaseDescription(phase: string): PhaseDescription {
  return (
    PHASE_DESCRIPTIONS[phase] ?? {
      label: phase.charAt(0).toUpperCase() + phase.slice(1),
      description: "",
    }
  );
}
