---
name: pii-classification
description: Detect, classify, and recommend masking or tokenization strategies for PII, PHI, and sensitive financial columns.
skill_kind: subtask
stage_binding: source_analysis
---

# PII Classification Standard

Flag columns by sensitivity tier: Restricted (SSN, passport, account numbers),
Confidential (name, email, phone, address, DOB), Internal (IP, device ID).
Recommend masking per tier: SHA-256 hash, tokenization, truncation, suppression.
