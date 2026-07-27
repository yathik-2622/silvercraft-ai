MARKETPLACE_TEMPLATES = [
    {
        "template_id": "tpl_source_profiler",
        "name": "Source Data Profiler",
        "framework": "langgraph",
        "description": "Profiles source tables, column quality, null rates, distinct counts, and sensitive fields.",
        "default_system_prompt": "Profile source datasets and return structured table, column, quality, and sensitivity findings.",
        "suggested_tools": ["source-analysis", "pii-classification"],
        "category": "Data Modeling",
        "icon": "Database",
        "tags": ["profiling", "quality", "source-analysis"],
        "hitl_enabled": False,
        "a2a_enabled": True,
    },
    {
        "template_id": "tpl_pii_guardian",
        "name": "PII Guardian",
        "framework": "langgraph",
        "description": "Detects PII, PHI, and financial fields and recommends masking or suppression.",
        "default_system_prompt": "Classify sensitive data and recommend masking, tokenization, hashing, or suppression rules.",
        "suggested_tools": ["pii-classification"],
        "category": "Governance",
        "icon": "ShieldCheck",
        "tags": ["pii", "governance", "security"],
        "hitl_enabled": True,
        "a2a_enabled": True,
    },
    {
        "template_id": "tpl_conceptual_modeler",
        "name": "Conceptual Modeler",
        "framework": "langchain",
        "description": "Derives business concepts, entities, and relationships from source context.",
        "default_system_prompt": "Create a conceptual business model with entities, relationships, and assumptions from source profiles.",
        "suggested_tools": ["source-analysis"],
        "category": "Modeling",
        "icon": "Lightbulb",
        "tags": ["conceptual", "modeling"],
        "hitl_enabled": False,
        "a2a_enabled": True,
    },
    {
        "template_id": "tpl_logical_normalizer",
        "name": "Logical Normalizer",
        "framework": "crewai",
        "description": "Normalizes entities into 3NF/Data Vault-ready logical structures.",
        "default_system_prompt": "Normalize conceptual entities into logical tables with keys, relationships, and data standards.",
        "suggested_tools": ["3nf-normalization", "data-vault"],
        "category": "Modeling",
        "icon": "GitBranch",
        "tags": ["3nf", "logical", "data-vault"],
        "hitl_enabled": False,
        "a2a_enabled": True,
    },
    {
        "template_id": "tpl_sttm_automator",
        "name": "STTM Automator",
        "framework": "agno",
        "description": "Generates source-to-target mappings, transformation rules, and physical DDL hints.",
        "default_system_prompt": "Generate STTM rows, transformation logic, target data types, and implementation notes.",
        "suggested_tools": ["sttm", "dimensional-modeling"],
        "category": "Delivery",
        "icon": "FileText",
        "tags": ["sttm", "ddl", "physical"],
        "hitl_enabled": False,
        "a2a_enabled": True,
    },
]


BUILTIN_SKILLS = [
    {
        "key": "source-analysis",
        "name": "Source Analysis",
        "description": "Profile source tables, columns, quality, and source semantics.",
        "content": """# Source Analysis Skill

Purpose: profile raw and curated source structures before modeling decisions are made.

Use this skill to produce:
- Source inventory grouped by system, schema, table, file, or stream.
- Column profile with datatype, null percentage, distinct count, sample-safe value patterns, and semantic meaning.
- Primary-key, foreign-key, natural-key, and degenerate-key candidates.
- Data-quality checks: completeness, uniqueness, referential integrity, freshness, duplicate handling, schema drift, late-arriving records, and invalid values.
- Medallion placement guidance: raw source preservation for bronze, validation and cleansing for silver, dimensional or aggregated business outputs for gold.

Required output sections:
1. Source inventory
2. Column profile
3. Candidate keys and joins
4. Data quality findings
5. Bronze/Silver/Gold placement
6. Modeling risks and assumptions

Grounding references: Azure Databricks medallion architecture and Delta Lake design guidance.""",
        "source_urls": [
            "https://learn.microsoft.com/en-us/azure/databricks/lakehouse/medallion",
            "https://learn.microsoft.com/en-us/azure/databricks/lakehouse-architecture/deployment-guide/delta-lake",
        ],
    },
    {
        "key": "pii-classification",
        "name": "PII Classification",
        "description": "Classify sensitive columns and recommend protection rules.",
        "content": """# PII Classification Skill

Purpose: detect sensitive data before it is modeled, joined, exported, or exposed to downstream marts.

Classify each sensitive field as one of:
- Direct identifier
- Quasi identifier
- PHI
- PCI
- Financial confidential
- Internal confidential

For each finding return:
- Column and table
- Sensitivity type
- Confidence and evidence
- Recommended protection: suppress, tokenize, encrypt, hash, redact, mask, or restrict
- Downstream modeling impact
- Human-review requirement when confidence is low or exposure is high

Required output sections:
1. Sensitive field inventory
2. Classification rationale
3. Protection rules
4. Modeling impact
5. HITL review items""",
    },
    {
        "key": "3nf-normalization",
        "name": "3NF Normalization",
        "description": "Normalize logical entities into 3NF structures.",
        "content": """# 3NF Normalization Skill

Purpose: design a normalized foundation layer for validated enterprise records.

Use this skill to:
- Identify business entities from profiled sources.
- Separate repeating groups, lookup/reference data, transactions, and history.
- Assign candidate keys, primary keys, foreign keys, alternate keys, and uniqueness rules.
- Remove partial and transitive dependencies.
- Preserve audit columns such as source system, load timestamp, effective date, and record source when required.
- Produce relationship cardinalities and optionality.

Required output sections:
1. Entity list
2. Attribute allocation
3. Key strategy
4. Relationship matrix
5. Normalization decisions
6. Exceptions and denormalization rationale

Grounding reference: Databricks data warehousing guidance notes silver-layer warehouses commonly use 3NF or Data Vault models.""",
        "source_urls": ["https://learn.microsoft.com/en-us/%20%20azure/databricks/sql/get-started/data-warehousing-concepts"],
    },
    {
        "key": "dimensional-modeling",
        "name": "Dimensional Modeling",
        "description": "Create Kimball-style fact and dimension models.",
        "content": """# Dimensional Modeling Skill

Purpose: design analytics-ready product-layer marts using dimensional modeling.

Follow the dimensional design flow:
- Gather business requirements and source data realities.
- Select business process.
- Declare grain before choosing facts.
- Identify facts as measurable events.
- Identify dimensions as descriptive context.
- Mark additive, semi-additive, and non-additive measures.
- Define conformed dimensions, degenerate dimensions, junk dimensions, and SCD handling where needed.

Required output sections:
1. Business process and grain
2. Fact tables
3. Dimension tables
4. Measures and additivity
5. SCD and surrogate-key strategy
6. Star/snowflake schema notes
7. BI query examples

Grounding references: Kimball dimensional modeling techniques and fact/dimension guidance.""",
        "source_urls": [
            "https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/",
            "https://www.kimballgroup.com/2003/01/fact-tables-and-dimension-tables/",
        ],
    },
    {
        "key": "data-vault",
        "name": "Data Vault",
        "description": "Design hubs, links, and satellites for Data Vault 2.0.",
        "content": """# Data Vault Skill

Purpose: design auditable, historized foundation models for enterprise integration.

Use this skill to:
- Identify business keys and assign hubs.
- Identify relationships and assign links.
- Identify descriptive/history attributes and assign satellites.
- Include load timestamp, record source, hash key, and hashdiff strategy.
- Separate raw vault and business vault concerns.
- Preserve source traceability and historization.

Required output sections:
1. Hubs
2. Links
3. Satellites
4. Hash-key/hashdiff rules
5. Record-source and load-date rules
6. Raw-vault versus business-vault decisions""",
    },
    {
        "key": "sttm",
        "name": "STTM",
        "description": "Generate source-to-target mapping details.",
        "content": """# STTM Skill

Purpose: generate implementation-ready source-to-target mapping specifications.

For every target attribute provide:
- Source system, source object, and source column
- Target schema, table, and column
- Datatype mapping
- Transformation expression
- Nullability and defaulting rule
- Key and relationship role
- Data-quality validation rule
- Rejection/quarantine handling
- Lineage note and dependency

Required output sections:
1. Mapping table
2. Transformation rules
3. Validation rules
4. Load strategy
5. Exceptions and open questions""",
    },
    {
        "key": "semantic-layer",
        "name": "Semantic Layer",
        "description": "Define entities, measures, dimensions, and governed metric semantics.",
        "content": """# Semantic Layer Skill

Purpose: define governed business semantics on top of modeled data products.

Use this skill to produce:
- Entities and entity keys.
- Measures with aggregation rules.
- Dimensions for slicing, including categorical and time dimensions.
- Metric definitions with filters, time grains, and ownership.
- Join paths and ambiguity warnings.
- Business glossary alignment.

Required output sections:
1. Semantic models
2. Entities
3. Measures
4. Dimensions
5. Metrics
6. Governance and ambiguity notes

Grounding reference: dbt semantic model concepts: entities, measures, and dimensions.""",
        "source_urls": ["https://docs.getdbt.com/docs/build/semantic-models/"],
    },
]
