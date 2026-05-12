---
sourceFile: "qa_checks.csv"
exportedBy: "Kortex"
exportDate: "2026-02-09T20:47:49.092Z"
---

# qa_checks.csv

87241e4a-0b41-4710-a042-f6beb24078e4

qa\_checks.csv

ada4e9ff-3b19-4f59-bfaa-3a270006cddd

check\_name,purpose,expected\_outcome,severity
Alias mapping – Data type mismatch,Ensure alias mapping only maps fields with the same data type to prevent invalid data mappings.,System validates that alias mappings are only created between fields of the same type and rejects incompatible mappings.,high
Alias mapping – Missing default and required properties,Verify new and old fields in an alias mapping have identical default values and 'required' attributes to avoid unexpected behavior.,Both fields share the same default values and required properties before alias mapping is accepted.,medium
Alias mapping – Circular alias references,Detect cycles in alias mappings that could create infinite loops or unresolved references.,System prevents or flags circular alias mappings and ensures mappings terminate correctly.,medium
Alias mapping – Non‑existent target field,Ensure alias mappings refer to existing fields and fail gracefully when a mapped field is missing.,System validates target field existence before saving the mapping and returns an error if the field is missing.,medium
Alias mapping – Data loss on field migration,Verify that moving or renaming a field preserves existing values via alias mapping and prevents reversion to default values.,"After field migration, user‑entered values persist in the new field; no data loss occurs.",high
Compliance log – Required event coverage,"Ensure compliance logs capture all audit events needed to meet standards such as HIPAA, PCI DSS, SOC2, SOX, NIST and ISO 27001.",Logs contain every required event for each applicable regulatory standard; missing events trigger alerts.,high
Compliance log – Retention duration,"Verify that compliance logs are retained for the mandated period (e.g., up to seven years for SOX).",Logs are stored for at least the required retention duration and are not deleted prematurely.,high
Compliance log – Extraneous data,"Check that compliance logs contain only necessary audit records, minimizing exposure of unrelated or sensitive information.",Logs include only the records needed for compliance and exclude unrelated events or personal data.,medium
Compliance log – Access control,Confirm that only authorized personnel can view or modify compliance logs and that all access is audited.,Access control policies restrict log access to authorized roles; all access and changes are logged.,high
Compliance log – Tamper detection,Ensure compliance logs are tamper‑proof and cryptographically verifiable to maintain integrity.,Logs are protected against unauthorized changes; cryptographic signatures verify integrity and detect tampering.,high
SDI logging – Log presence and availability,Confirm that SDI logs exist in the designated directory so SIP messages and call data can be analyzed.,SDI log files are created and accessible; missing logs are flagged and appropriate alerts are generated.,high
SDI logging – Event time window,"Verify that SDI logs capture events from a configurable window (e.g., five minutes before and after call events).",Logs include complete call context within the specified time window; gaps trigger warnings.,medium
SDI logging – Message correlation,Ensure SIP messages in call flow diagrams correctly map to entries in SDI logs using sequence numbers and correlation IDs.,"Each SIP message correlates with the correct SDI log entry, ensuring accurate call tracing.",medium
SDI logging – Data privacy,Check that SDI logs do not expose sensitive personal data or that such data is masked appropriately.,Logs redact or anonymize personal identifiers while retaining necessary technical details.,high
SDI logging – Performance impact,Ensure that enabling SDI logging does not degrade system performance or lead to resource exhaustion.,SDI logging operates within acceptable performance thresholds; resource usage remains stable.,medium
AI rewording – Preservation of meaning,"Validate that AI‑reworded content retains the original meaning, tone, and important details.",Reworded output conveys the same information and context as the input without distortion.,high
AI rewording – Originality of phrasing,Ensure that AI paraphrases sufficiently differ from the source text to avoid plagiarism while remaining faithful to the original.,Reworded text uses distinct phrasing and sentence structure; similarity measures stay below predefined thresholds.,medium
AI rewording – Citation retention,Verify that references and citations present in the source are preserved or updated correctly in the reworded output.,All original citations appear in the reworded text with correct formatting and placement.,high
AI rewording – Bias or inaccuracy,"Detect whether AI rewording introduces factual errors, omissions, or biased interpretations.",Reworded content remains factually accurate and unbiased; discrepancies trigger review.,high
AI rewording – Sensitive content handling,Ensure that rewording does not reveal sensitive personal information or compromise privacy.,Any sensitive data is removed or anonymized during rewording; privacy considerations are maintained.,high
Research citation – Attribution for paraphrases,"Ensure that all paraphrased material is correctly attributed to the original source, in accordance with citation guidelines.",Every paraphrased statement includes an appropriate citation to the source.,high
Research citation – Citation for summaries and facts,"Verify that summaries of others' ideas, statistics, or specific facts not considered common knowledge are cited.",Summaries and specific facts include citations; common knowledge is not cited unnecessarily.,medium
Research citation – Citation style consistency,"Check that all citations follow the designated style (APA, MLA, etc.) and use the most current edition.","Citations adhere to a single, up‑to‑date style guide throughout the document.",medium
Research citation – Citation completeness,"Ensure that each citation includes all required elements (author, title, date, source) and is accurate.",Citations are complete and correspond to a full entry in the reference list.,medium
Research citation – AI tool acknowledgment,Verify that the use of AI tools in generating or rewording content is properly disclosed and cited when required.,Documents include a note or citation acknowledging AI assistance when applicable.,low

