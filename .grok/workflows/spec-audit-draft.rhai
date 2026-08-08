let meta = #{
    name: "spec-audit-draft",
    description: "Audit architecture.md v0.2 against implementation reality (primary sources only)",
    when_to_use: "When auditing the ICONOSTASIS architecture spec for feasibility defects before implementation",
    phases: [
        #{ title: "Context", detail: "one investigator per subsystem reads its sections" },
        #{ title: "Feasibility", detail: "primary-source feasibility check per subsystem" },
        #{ title: "Verify", detail: "independent skeptics adversarially challenge findings" },
        #{ title: "Synthesize", detail: "ranked report with section refs, severity, evidence, edit text" },
    ],
};

// --- schemas ---
let context_schema = #{
    "type": "object",
    "required": ["section", "title", "summary", "constraints", "amd_touched"],
    "properties": #{
        "section": #{ "type": "integer" },
        "title": #{ "type": "string" },
        "summary": #{ "type": "string" },
        "constraints": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["cite", "text"],
                "properties": #{
                    "cite": #{ "type": "string" },
                    "text": #{ "type": "string" },
                },
            },
        },
        "amd_touched": #{
            "type": "array",
            "maxItems": 12,
            "items": #{ "type": "string" },
        },
        "priority_hooks": #{
            "type": "array",
            "maxItems": 6,
            "items": #{ "type": "string" },
        },
    },
};

let feasibility_schema = #{
    "type": "object",
    "required": ["section", "findings"],
    "properties": #{
        "section": #{ "type": "integer" },
        "findings": #{
            "type": "array",
            "maxItems": 6,
            "items": #{
                "type": "object",
                "required": ["id", "title", "severity", "spec_cite", "claim", "primary_source", "evidence", "proposed_edit"],
                "properties": #{
                    "id": #{ "type": "string" },
                    "title": #{ "type": "string" },
                    "severity": #{ "type": "string" },
                    "spec_cite": #{ "type": "string" },
                    "claim": #{ "type": "string" },
                    "primary_source": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                    "proposed_edit": #{ "type": "string" },
                    "amd_ids": #{
                        "type": "array",
                        "maxItems": 6,
                        "items": #{ "type": "string" },
                    },
                },
            },
        },
        "clean_notes": #{
            "type": "array",
            "maxItems": 8,
            "items": #{ "type": "string" },
        },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["finding_id", "survives", "reason", "evidence"],
    "properties": #{
        "finding_id": #{ "type": "string" },
        "survives": #{ "type": "boolean" },
        "reason": #{ "type": "string" },
        "evidence": #{ "type": "string" },
        "severity_adjustment": #{ "type": "string" },
        "source_url": #{ "type": "string" },
    },
};

let report_schema = #{
    "type": "object",
    "required": ["markdown"],
    "properties": #{
        "markdown": #{ "type": "string" },
        "finding_count": #{ "type": "integer" },
        "dropped_count": #{ "type": "integer" },
    },
};

// --- helpers ---
fn trimmed(s) {
    if type_of(s) != "string" { return ""; }
    s.trim();
    s
}

fn digit_of(ch) {
    if ch == '0' { return 0; }
    if ch == '1' { return 1; }
    if ch == '2' { return 2; }
    if ch == '3' { return 3; }
    if ch == '4' { return 4; }
    if ch == '5' { return 5; }
    if ch == '6' { return 6; }
    if ch == '7' { return 7; }
    if ch == '8' { return 8; }
    if ch == '9' { return 9; }
    -1
}

fn parse_int_simple(s) {
    let t = trimmed(s);
    if t == "" { return -1; }
    let n = 0;
    let i = 0;
    let any = false;
    while i < t.len() {
        let d = digit_of(t[i]);
        if d < 0 { return -1; }
        n = n * 10 + d;
        any = true;
        i += 1;
    }
    if any { n } else { -1 }
}

fn find_dash(s) {
    let i = 0;
    while i < s.len() {
        if s[i] == '-' { return i; }
        i += 1;
    }
    -1
}

fn clamp_section(n) {
    if n >= 7 && n <= 14 { return n; }
    -1
}

fn parse_section_range(raw) {
    // Returns array of section ints in 7..14. Default 7-14.
    // Accepts: "", "7-14", "8", "7-9"
    let s = trimmed(raw);
    let from = 7;
    let to = 14;
    if s != "" {
        let dash = find_dash(s);
        if dash < 0 {
            let n = clamp_section(parse_int_simple(s));
            if n > 0 {
                from = n;
                to = n;
            }
        } else {
            let left = s.sub_string(0, dash);
            let right = s.sub_string(dash + 1, s.len() - dash - 1);
            let a = clamp_section(parse_int_simple(left));
            let b = clamp_section(parse_int_simple(right));
            if a > 0 { from = a; }
            if b > 0 { to = b; }
            if from > to {
                let tmp = from;
                from = to;
                to = tmp;
            }
        }
    }
    let out = [];
    let i = from;
    while i <= to {
        out.push(i);
        i += 1;
    }
    out
}

fn section_title(n) {
    if n == 7 { return "Operator Graph Engine"; }
    if n == 8 { return "Render Engine"; }
    if n == 9 { return "Generative AI Layer (BYOK)"; }
    if n == 10 { return "Story Engine (the Liturgy Layer)"; }
    if n == 11 { return "Audio & Interaction"; }
    if n == 12 { return "Persistence & File Format"; }
    if n == 13 { return "Export & Standalone Player"; }
    if n == 14 { return "Publishing (Buzz, Nostr, and Ours)"; }
    "Unknown"
}

fn priority_target_for(n) {
    if n == 7 {
        return "PRIORITY TARGET: arrival-policy table GPU cost and crossfade caps (section 7.1) - dual-resource blends, fade caps, queue behavior under WebGL2/WebGPU without blocking cook; primary sources only.";
    }
    if n == 8 {
        return "PRIORITY TARGET: measured tier probe and point governor (section 8.4) - browser APIs for wayside/chapel/cathedral classification and scene-total point budget; primary sources only.";
    }
    if n == 9 {
        return "PRIORITY TARGET: hybrid direct/helper routing including Private Network Access (section 9.5, also 15.2) - CORS, PNA/local-network-access, CSP reload vs Chromium/WHATWG/Fetch primary docs only.";
    }
    if n == 14 {
        return "PRIORITY TARGET: NIP-96 / Blossom upload flow (section 14.3) - official NIPs and Blossom protocol primary docs/source; kind 31333 vs kind-1 as written.";
    }
    "No special priority target for this subsystem beyond full feasibility of claims as written."
}

fn ground_rules() {
    let g = "";
    g += "GROUND RULES (binding):\n";
    g += "1. architecture.md v0.2 is the sole binding spec. CHANGELOG AMD-01 through AMD-20 are SETTLED decisions.\n";
    g += "2. Challenge a settled AMD only with primary-source evidence that the decision is infeasible AS WRITTEN - never preferences.\n";
    g += "3. Primary sources only: vendor docs, formal specs (WHATWG/W3C/Khronos/IETF), official NIPs, library source. Blogs/tutorials are NOT sources.\n";
    g += "4. Read architecture.md with read_file/grep. Do not invent section text.\n";
    g += "5. Out of scope: implementation, code edits, deep-research beyond the subsystem.\n";
    g
}

// --- args: section_range string "7-14" | from/to ints | section int ---
let range_raw = "";
if args != () {
    if args.section_range != () {
        range_raw = args.section_range;
        if type_of(range_raw) != "string" {
            range_raw = range_raw.to_string();
        }
    } else if args.sections != () {
        range_raw = args.sections;
        if type_of(range_raw) != "string" {
            range_raw = range_raw.to_string();
        }
    } else if args.section != () {
        range_raw = args.section.to_string();
    } else if args.from != () || args.to != () {
        let f = 7;
        let t = 14;
        if args.from != () { f = args.from; }
        if args.to != () { t = args.to; }
        range_raw = f.to_string() + "-" + t.to_string();
    }
}

let sections = parse_section_range(range_raw);
if sections.len() == 0 {
    pause("verification", "Pass args.section_range like \"7-14\" or \"8\" (subsystems section 7 through 14 only).");
}
log("spec-audit sections: " + json_encode(sections));

let rules = ground_rules();

// ============================================================================
// Phase 1 - Context
// ============================================================================
phase("Context");
let cjobs = [];
for n in sections {
    let title = section_title(n);
    let prio = priority_target_for(n);
    let prompt = "";
    prompt += "You are a CONTEXT INVESTIGATOR for ICONOSTASIS subsystem section " + n.to_string() + " (" + title + ").\n\n";
    prompt += rules;
    prompt += "\nTASK - Phase 1 Context only:\n";
    prompt += "1. Read architecture.md. Focus on YOUR subsystem section " + n.to_string();
    prompt += ", plus shared context: section 4 Product Pillars, section 16 Non-Functional Requirements, and the CHANGELOG (AMD-01..AMD-20 table near the top).\n";
    prompt += "2. Do NOT read other subsystem sections in depth except where your section explicitly cross-references them.\n";
    prompt += "3. Extract hard constraints, behavioral laws, and settled AMD items that touch your subsystem.\n";
    prompt += "4. Note priority hooks: " + prio + "\n";
    prompt += "5. Use tools (read_file, grep). Do not answer from memory.\n";
    prompt += "6. Return structured JSON matching the schema. Empty constraints only if truly none after reading.\n";
    cjobs.push(#{
        prompt: prompt,
        label: "ctx-s" + n.to_string(),
        capability_mode: "read-only",
        output_schema: context_schema,
    });
}
let cresults = parallel(cjobs);

let contexts = [];
let i = 0;
for r in cresults {
    let n = sections[i];
    if r != () && r.success && r.output != () {
        contexts.push(#{
            section: n,
            agent_id: r.agent_id,
            data: r.output,
        });
    } else {
        log("context failed for section " + n.to_string());
        contexts.push(#{
            section: n,
            agent_id: (),
            data: #{
                section: n,
                title: section_title(n),
                summary: "CONTEXT_FAILED",
                constraints: [],
                amd_touched: [],
                priority_hooks: [],
            },
        });
    }
    i += 1;
}
write_scratch_file("phase1-context.json", json_encode(contexts));

// ============================================================================
// Phase 2 - Feasibility
// ============================================================================
phase("Feasibility");
let fjobs = [];
for ctx in contexts {
    let n = ctx.section;
    let title = section_title(n);
    let prio = priority_target_for(n);
    let ctx_json = json_encode(ctx.data);
    let prompt = "";
    prompt += "You are a FEASIBILITY INVESTIGATOR for ICONOSTASIS subsystem section " + n.to_string() + " (" + title + ").\n\n";
    prompt += rules;
    prompt += "\nYour Phase-1 context JSON (may be partial):\n";
    prompt += ctx_json;
    prompt += "\n\nTASK - Phase 2 Feasibility:\n";
    prompt += "1. Re-read your architecture.md sections (section " + n.to_string() + ", plus section 4, section 16, CHANGELOG) with tools.\n";
    prompt += "2. Check each hard claim against CURRENT browser API and library capability using PRIMARY SOURCES ONLY ";
    prompt += "(prefer WHATWG/W3C/Khronos/IETF, vendor platform docs, official library docs, library SOURCE).\n";
    prompt += "3. " + prio + "\n";
    prompt += "4. Emit findings ONLY when the spec is defective, under-specified into infeasibility, contradictory, or infeasible as written. ";
    prompt += "Do NOT prefer alternative designs. Challenge AMD-01..20 only with primary-source infeasibility evidence.\n";
    prompt += "5. For each finding: id (e.g. F-" + n.to_string() + "-01), title, severity critical|high|medium|low, ";
    prompt += "spec_cite, claim, primary_source (URL), evidence, proposed_edit, amd_ids if any.\n";
    prompt += "6. clean_notes: claims checked and found feasible.\n";
    prompt += "7. Use web_search/open_page on primary sources. Drop ungrounded findings.\n";
    prompt += "8. Max 6 findings.\n";

    if ctx.agent_id != () {
        fjobs.push(#{
            prompt: prompt,
            label: "feas-s" + n.to_string(),
            capability_mode: "all",
            output_schema: feasibility_schema,
            resume_from: ctx.agent_id,
        });
    } else {
        fjobs.push(#{
            prompt: prompt,
            label: "feas-s" + n.to_string(),
            capability_mode: "all",
            output_schema: feasibility_schema,
        });
    }
}
let fresults = parallel(fjobs);

let all_findings = [];
let clean_all = [];
let fi = 0;
for r in fresults {
    let n = sections[fi];
    if r != () && r.success && r.output != () {
        if r.output.findings != () {
            for f in r.output.findings {
                all_findings.push(f);
            }
        }
        if r.output.clean_notes != () {
            for c in r.output.clean_notes {
                clean_all.push("section " + n.to_string() + ": " + c);
            }
        }
    } else {
        log("feasibility failed for section " + n.to_string());
    }
    fi += 1;
}
log("raw findings: " + all_findings.len().to_string());
write_scratch_file("phase2-findings.json", json_encode(#{ findings: all_findings, clean: clean_all }));

// Cap findings for verification budget
const MAX_VERIFY = 24;
let to_verify = [];
let dropped_cap = 0;
let vi = 0;
for f in all_findings {
    if vi < MAX_VERIFY {
        to_verify.push(f);
    } else {
        dropped_cap += 1;
    }
    vi += 1;
}
if dropped_cap > 0 {
    log("capped verification: dropped " + dropped_cap.to_string() + " findings over MAX_VERIFY");
}

// ============================================================================
// Phase 3 - Verify (skeptics)
// ============================================================================
phase("Verify");
let survived = [];
let dropped = [];

if to_verify.len() == 0 {
    log("no findings to verify");
} else {
    let vjobs = [];
    for f in to_verify {
        let fid = "unknown";
        if f.id != () { fid = f.id; }
        let fjson = json_encode(f);
        let prompt = "";
        prompt += "You are an INDEPENDENT SKEPTIC for an ICONOSTASIS architecture.md v0.2 feasibility audit.\n\n";
        prompt += rules;
        prompt += "\nFINDING UNDER CHALLENGE:\n";
        prompt += fjson;
        prompt += "\n\nTASK - Phase 3 Adversarial Verify:\n";
        prompt += "1. Independently re-check the primary source cited (open the URL / read the spec text). Do not trust the investigator.\n";
        prompt += "2. Set survives=true ONLY if: (a) the finding is traceable to a primary source you personally opened, ";
        prompt += "AND (b) that evidence shows the spec claim is infeasible or defective AS WRITTEN (not merely suboptimal).\n";
        prompt += "3. If the primary source is missing, secondary, or does not support the claim - set survives=false and DROP it. Do not soften.\n";
        prompt += "4. AMD challenges require primary-source infeasibility; preference arguments fail.\n";
        prompt += "5. Optionally severity_adjustment: raise|lower|same with reason.\n";
        prompt += "6. finding_id must match the input id. evidence must include a short quote or precise cite from the primary source.\n";
        vjobs.push(#{
            prompt: prompt,
            label: "skep-" + fid,
            capability_mode: "all",
            output_schema: verdict_schema,
        });
    }
    let vresults = parallel(vjobs);
    let vix = 0;
    for v in vresults {
        let f = to_verify[vix];
        let fid = "unknown";
        if f.id != () { fid = f.id; }
        if v != () && v.success && v.output != () && v.output.survives == true
            && v.output.evidence != () && trimmed(v.output.evidence) != "" {
            survived.push(#{
                finding: f,
                verdict: v.output,
            });
        } else {
            let reason = "unverified or failed skeptic";
            if v != () && v.success && v.output != () && v.output.reason != () {
                reason = v.output.reason;
            }
            dropped.push(#{ finding_id: fid, reason: reason });
        }
        vix += 1;
    }
}
log("survived=" + survived.len().to_string() + " dropped=" + dropped.len().to_string());
write_scratch_file("phase3-verdicts.json", json_encode(#{ survived: survived, dropped: dropped }));

// ============================================================================
// Phase 4 - Synthesize
// ============================================================================
phase("Synthesize");
let synth_payload = json_encode(#{
    section_range: sections,
    survived: survived,
    dropped: dropped,
    clean_notes: clean_all,
    capped_out: dropped_cap,
});
let sp = "";
sp += "You are the SYNTHESIZER for ICONOSTASIS architecture.md v0.2 SPEC AUDIT.\n\n";
sp += rules;
sp += "\nVerified materials (JSON):\n";
sp += synth_payload;
sp += "\n\nTASK - Phase 4 Write the full ranked report as markdown in field markdown.\n";
sp += "Required structure:\n";
sp += "# Spec audit - architecture.md v0.2\n\n";
sp += "## Meta\n- Spec: architecture.md Draft v0.2\n- Section range audited\n- Ground rule: AMD-01..20 settled\n";
sp += "- Counts: survived / dropped / clean notes\n";
sp += "- Priority targets: 7.1 arrival GPU/crossfade; 8.4 tier probe+governor; 9.5/15.2 hybrid PNA; 14.3 NIP-96/Blossom\n\n";
sp += "## Executive summary\n\n";
sp += "## Ranked defects\nFor each surviving finding, severity order critical>high>medium>low:\n";
sp += "### [severity] id - title\n- Spec: section cite\n- Claim:\n- Evidence: primary source + quote\n- AMD:\n- Proposed edit:\n\n";
sp += "## Dropped findings\nfinding_id + reason\n\n";
sp += "## Clean (feasible) claims checked\n\n";
sp += "## Method\nPhases, primary-source rule, skeptic fail-closed.\n\n";
sp += "Do not invent findings not in survived. If zero survived, say so and still fill Meta/Method/Clean.\n";
sp += "finding_count = survived length; dropped_count = dropped length.\n";

let synth = agent(sp, #{
    label: "synthesize",
    capability_mode: "read-only",
    output_schema: report_schema,
});

let report_md = "";
if synth != () && synth.success && synth.output != () && synth.output.markdown != () {
    report_md = synth.output.markdown;
} else {
    report_md = "# Spec audit - architecture.md v0.2\n\n";
    report_md += "## Meta\n";
    report_md += "- Synthesizer agent failed; mechanical fallback.\n";
    report_md += "- Survived: " + survived.len().to_string() + "\n";
    report_md += "- Dropped: " + dropped.len().to_string() + "\n\n";
    report_md += "## Ranked defects\n\n";
    for s in survived {
        let f = s.finding;
        let id = "";
        if f.id != () { id = f.id; }
        let title = "";
        if f.title != () { title = f.title; }
        let sev = "";
        if f.severity != () { sev = f.severity; }
        report_md += "### [" + sev + "] " + id + " - " + title + "\n";
        if f.spec_cite != () { report_md += "- Spec: " + f.spec_cite + "\n"; }
        if f.claim != () { report_md += "- Claim: " + f.claim + "\n"; }
        if f.primary_source != () { report_md += "- Primary source: " + f.primary_source + "\n"; }
        if f.evidence != () { report_md += "- Evidence: " + f.evidence + "\n"; }
        if f.proposed_edit != () { report_md += "- Proposed edit: " + f.proposed_edit + "\n"; }
        report_md += "\n";
    }
    report_md += "## Dropped findings\n\n";
    for d in dropped {
        let id = "";
        if d.finding_id != () { id = d.finding_id; }
        let reason = "";
        if d.reason != () { reason = d.reason; }
        report_md += "- " + id + ": " + reason + "\n";
    }
    report_md += "\n## Method\nMechanical fallback after synthesizer failure. Phases 1-3 data preserved in scratch.\n";
}

let report_path = write_scratch_file("spec-audit-report.md", report_md);
log("report scratch: " + report_path);

complete(#{
    summary: "spec-audit complete: " + survived.len().to_string() + " survived findings",
    report_path: report_path,
    report: report_md,
    survived_count: survived.len(),
    dropped_count: dropped.len(),
    sections: sections,
});
