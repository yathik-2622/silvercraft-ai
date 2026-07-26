import * as XLSX from "xlsx";
import {
  SourceTableProfile,
  ConceptualConcept,
  ConceptualRelationship,
  LogicalEntity,
  PhysicalTable,
  SttmMappingRow
} from "../types";

/**
 * Export Stage 1 Specific Reports
 */
export function exportDataProfilerExcel(sourceTables: SourceTableProfile[], filename = "Data_Profiler_Output.xlsx") {
  const wb = XLSX.utils.book_new();
  const profilerRows: any[] = [];
  sourceTables.forEach((table) => {
    table.columns.forEach((col) => {
      profilerRows.push({
        "Table Name": table.tableName,
        "Column Name": col.columnName,
        "Data Type": col.dataType,
        "Null %": `${col.nullPercentage}%`,
        "Distinct Count": col.distinctCount,
        "Total Rows": col.totalRows,
        "Sample Values": col.sampleValues.join(", "),
        "Description": col.description
      });
    });
  });
  const profilerSheet = XLSX.utils.json_to_sheet(profilerRows);
  XLSX.utils.book_append_sheet(wb, profilerSheet, "Data Profiler");
  XLSX.writeFile(wb, filename);
}

export function exportDataDictionaryExcel(sourceTables: SourceTableProfile[], filename = "Data_Dictionary_Output.xlsx") {
  const wb = XLSX.utils.book_new();
  const dictRows: any[] = [];
  sourceTables.forEach((table) => {
    table.columns.forEach((col) => {
      dictRows.push({
        "Table": table.tableName,
        "Column": col.columnName,
        "Data Type": col.dataType,
        "Key Type": col.isPrimaryKey ? "PK" : col.isForeignKey ? "FK" : "Attribute",
        "Business Description": col.description
      });
    });
  });
  const dictSheet = XLSX.utils.json_to_sheet(dictRows);
  XLSX.utils.book_append_sheet(wb, dictSheet, "Data Dictionary");
  XLSX.writeFile(wb, filename);
}

export function exportClassificationExcel(sourceTables: SourceTableProfile[], filename = "Classification_Output.xlsx") {
  const wb = XLSX.utils.book_new();
  const classRows: any[] = [];
  sourceTables.forEach((table) => {
    table.columns.forEach((col) => {
      classRows.push({
        "Table Name": table.tableName,
        "Column Name": col.columnName,
        "Data Type": col.dataType,
        "Sensitivity": col.sensitivity || "Internal",
        "Classification": col.classification || "Internal",
        "Masking Strategy": col.maskingStrategy || "None"
      });
    });
  });
  const classSheet = XLSX.utils.json_to_sheet(classRows);
  XLSX.utils.book_append_sheet(wb, classSheet, "Classification Matrix");
  XLSX.writeFile(wb, filename);
}

export function exportSourceRelationshipsExcel(sourceRelationships: any[], filename = "Source_Relationships_Output.xlsx") {
  const wb = XLSX.utils.book_new();
  const relRows = sourceRelationships.map((r) => ({
    "Source Table": r.sourceTable,
    "Source Column (FK)": r.sourceColumn,
    "Cardinality": r.cardinality,
    "Target Table": r.targetTable,
    "Target Column (PK)": r.targetColumn,
    "Description": r.description || ""
  }));
  const relSheet = XLSX.utils.json_to_sheet(relRows);
  XLSX.utils.book_append_sheet(wb, relSheet, "Source Relationships");
  XLSX.writeFile(wb, filename);
}

export function exportStage1Excel(sourceTables: SourceTableProfile[], sourceRelationships: any[] = [], filename = "Stage1_Source_Analysis_All.xlsx") {
  const wb = XLSX.utils.book_new();

  // 1. Profiler Sheet
  const profilerRows: any[] = [];
  sourceTables.forEach((table) => {
    table.columns.forEach((col) => {
      profilerRows.push({
        "Table Name": table.tableName,
        "Column Name": col.columnName,
        "Data Type": col.dataType,
        "Null %": `${col.nullPercentage}%`,
        "Distinct Count": col.distinctCount,
        "Total Rows": col.totalRows,
        "Sample Values": col.sampleValues.join(", "),
        "Description": col.description
      });
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(profilerRows), "Data Profiler");

  // 2. Dictionary Sheet
  const dictRows: any[] = [];
  sourceTables.forEach((table) => {
    table.columns.forEach((col) => {
      dictRows.push({
        "Table": table.tableName,
        "Column": col.columnName,
        "Data Type": col.dataType,
        "Key Type": col.isPrimaryKey ? "PK" : col.isForeignKey ? "FK" : "Attribute",
        "Business Description": col.description
      });
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dictRows), "Data Dictionary");

  // 3. Classification Sheet
  const classRows: any[] = [];
  sourceTables.forEach((table) => {
    table.columns.forEach((col) => {
      classRows.push({
        "Table Name": table.tableName,
        "Column Name": col.columnName,
        "Data Type": col.dataType,
        "Sensitivity": col.sensitivity || "Internal",
        "Classification": col.classification || "Internal",
        "Masking Strategy": col.maskingStrategy || "None"
      });
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(classRows), "Classification");

  // 4. Source Relationships Sheet
  if (sourceRelationships && sourceRelationships.length > 0) {
    const relRows = sourceRelationships.map((r) => ({
      "Source Table": r.sourceTable,
      "Source Column (FK)": r.sourceColumn,
      "Cardinality": r.cardinality,
      "Target Table": r.targetTable,
      "Target Column (PK)": r.targetColumn,
      "Description": r.description || ""
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(relRows), "Source Relationships");
  }

  XLSX.writeFile(wb, filename);
}

/**
 * Export Stage 2: Conceptual Model
 */
export function exportStage2Excel(
  concepts: ConceptualConcept[],
  relationships: ConceptualRelationship[],
  filename = "Stage2_Conceptual_Model.xlsx"
) {
  const wb = XLSX.utils.book_new();

  const conceptsRows = concepts.map((c) => ({
    "Concept Name": c.name,
    "Domain": c.domain,
    "Description": c.description,
    "Key Attributes": c.keyAttributes.join(", ")
  }));
  const conceptsSheet = XLSX.utils.json_to_sheet(conceptsRows);
  XLSX.utils.book_append_sheet(wb, conceptsSheet, "Business Concepts");

  const relRows = relationships.map((r) => {
    const src = concepts.find((c) => c.id === r.sourceConceptId)?.name || r.sourceConceptId;
    const tgt = concepts.find((c) => c.id === r.targetConceptId)?.name || r.targetConceptId;
    return {
      "Source Concept": src,
      "Relationship": r.relationshipName,
      "Target Concept": tgt,
      "Cardinality": r.cardinality,
      "Description": r.description
    };
  });
  const relSheet = XLSX.utils.json_to_sheet(relRows);
  XLSX.utils.book_append_sheet(wb, relSheet, "Concept Relationships");

  XLSX.writeFile(wb, filename);
}

/**
 * Export Stage 3: Logical Model
 */
export function exportStage3Excel(
  entities: LogicalEntity[],
  filename = "Stage3_Logical_Model.xlsx"
) {
  const wb = XLSX.utils.book_new();

  const rows: any[] = [];
  entities.forEach((entity) => {
    entity.attributes.forEach((attr) => {
      rows.push({
        "Entity Name": entity.name,
        "Logical Title": entity.logicalName,
        "Attribute Name": attr.name,
        "Data Type": attr.dataType,
        "Primary Key": attr.isPrimaryKey ? "YES" : "NO",
        "Foreign Key": attr.isForeignKey ? "YES" : "NO",
        "Nullable": attr.isNullable ? "YES" : "NO",
        "Classification": attr.classification,
        "Description": attr.description
      });
    });
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, sheet, "Logical Entities");

  XLSX.writeFile(wb, filename);
}

/**
 * Export Stage 4: Physical Model & STTM Matrix
 */
export function exportStage4Excel(
  sttmRows: SttmMappingRow[],
  physicalTables: PhysicalTable[],
  filename = "Stage4_STTM_and_Physical_Model.xlsx"
) {
  const wb = XLSX.utils.book_new();

  // STTM Matrix Sheet
  const sttmData = sttmRows.map((r) => ({
    "SOURCE_DATABASE": r.sourceDatabase || "OLTP_DB",
    "SOURCE_SCHEMA": r.sourceSchema || "PUBLIC",
    "SOURCE_TABLE": r.sourceTable,
    "SOURCE_COLUMN": r.sourceColumn,
    "SOURCE_COLUMN_DATATYPE": r.sourceType,
    "JOIN_CONDITION": r.joinCondition || "N/A",
    "FILTER_CONDITION": r.filterCondition || "N/A",
    "TRANSFORM_LOGIC": r.transformationRule,
    "DEFAULT_VALUE": r.defaultValue || "NULL",
    "TARGET_DATABASE": r.targetDatabase || "SILVER_LAKEHOUSE",
    "TARGET_SCHEMA": r.targetSchema || "ANALYTICS",
    "TARGET_TABLE": r.targetTable,
    "TARGET_COLUMN": r.targetColumn,
    "TARGET_COLUMN_DATATYPE": r.targetType,
    "TARGET_COLUMN_KEYTYPE": r.targetKeyType || (r.isPrimaryKey ? "PK" : r.isForeignKey ? "FK" : "ATTR"),
    "TARGET_COLUMN_NULLABLE": r.isNullable ? "YES" : "NO"
  }));
  const sttmSheet = XLSX.utils.json_to_sheet(sttmData);
  XLSX.utils.book_append_sheet(wb, sttmSheet, "STTM Matrix");

  // Physical Tables Sheet
  const physRows: any[] = [];
  physicalTables.forEach((tbl) => {
    tbl.columns.forEach((col) => {
      physRows.push({
        "Schema": tbl.schema,
        "Table": tbl.tableName,
        "Column": col.columnName,
        "Data Type": col.dataType,
        "PK": col.isPrimaryKey ? "YES" : "NO",
        "FK": col.isForeignKey ? "YES" : "NO",
        "Nullable": col.isNullable ? "YES" : "NO",
        "Partition Key": col.isPartitionKey ? "YES" : "NO",
        "Clustering Key": col.isClusteringKey ? "YES" : "NO",
        "Comment": col.comment
      });
    });
  });
  const physSheet = XLSX.utils.json_to_sheet(physRows);
  XLSX.utils.book_append_sheet(wb, physSheet, "Physical Tables");

  XLSX.writeFile(wb, filename);
}
