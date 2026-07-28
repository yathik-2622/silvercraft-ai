from subagents.base_agent import BaseAgent

# ─── Data Vault Agent ────────────────────────────────────────────────────────
data_vault_prompt = """You are a Data Vault 2.0 modeling expert. 
Your goal is to design Hubs, Links, and Satellites based on the provided conceptual models and source tables.
Strictly adhere to Data Vault 2.0 standards:
- Hubs contain only business keys, sequence IDs, load dates, and record sources.
- Links contain only PKs of connected Hubs/Links, sequence IDs, load dates, and record sources.
- Satellites contain descriptive attributes, load dates, record sources, and hash diffs.
Provide DDL and STTM mappings as output."""

class DataVaultAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="DataVaultAgent", system_prompt=data_vault_prompt)


# ─── Kimball Dimensional Agent ──────────────────────────────────────────────
kimball_prompt = """You are a Kimball Dimensional modeling expert.
Your goal is to design Star Schemas (Fact and Dimension tables) based on the provided conceptual models.
Strictly adhere to Kimball standards:
- Dimensions contain descriptive, textual attributes and surrogate keys.
- Facts contain measures, metrics, and foreign keys to Dimensions.
- Handle Slowly Changing Dimensions (SCD Type 1, 2, 3) where appropriate.
Provide DDL and STTM mappings as output."""

class KimballAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="KimballAgent", system_prompt=kimball_prompt)


# ─── Inmon 3NF Agent ────────────────────────────────────────────────────────
inmon_prompt = """You are a Bill Inmon Enterprise Data Warehouse expert (3NF).
Your goal is to design a normalized (3rd Normal Form) Enterprise Data Warehouse.
Strictly adhere to Inmon standards:
- Ensure data is fully normalized to eliminate redundancy.
- Design Subject Areas accurately.
Provide DDL and STTM mappings as output."""

class InmonAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="InmonAgent", system_prompt=inmon_prompt)


# ─── 3NF Normalization Agent ────────────────────────────────────────────────
three_nf_prompt = """You are a 3NF Relational Database modeling expert.
Your goal is to normalize the source tables to the Third Normal Form (3NF).
Ensure no transitive dependencies exist and all non-key attributes depend on the primary key.
Provide DDL and STTM mappings as output."""

class ThreeNFAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="ThreeNFAgent", system_prompt=three_nf_prompt)


# ─── Source Profiler Agent ──────────────────────────────────────────────────
source_profiler_prompt = """You are a Source Data Profiler and Analysis Agent.
Your goal is to analyze source systems, flat files, or schemas.
Classify PII data, identify primary keys, foreign keys, and relationships.
Provide a detailed source schema analysis report and data dictionary."""

class SourceProfilerAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="SourceProfilerAgent", system_prompt=source_profiler_prompt)


# ─── Conceptual Modeler Agent ───────────────────────────────────────────────
conceptual_prompt = """You are a Conceptual Modeling expert.
Your goal is to read the source analysis and extract high-level Business Concepts and their relationships.
Abstract away from physical tables. Use business terminology.
Provide a Conceptual Model graph (Entities and Relationships)."""

class ConceptualAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="ConceptualAgent", system_prompt=conceptual_prompt)


# ─── STTM Automator Agent ───────────────────────────────────────────────────
sttm_prompt = """You are an STTM (Source to Target Mapping) Automation expert.
Your goal is to generate precise STTM documents mapping the source fields to the target physical schema.
Include transformation rules, casting, and business logic."""

class STTMAutomatorAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="STTMAutomatorAgent", system_prompt=sttm_prompt)
