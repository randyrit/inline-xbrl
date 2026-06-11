import type { AppState, DocType, Statement, StatementRow, XbrlTag } from "./types";

/**
 * Keyword → US-GAAP concept rules used by the AI auto-tagger.
 * Ordered: the first matching rule wins.
 */
const CONCEPT_RULES: { match: RegExp; concept: string }[] = [
    { match: /cash and cash equivalents/i, concept: "us-gaap:CashAndCashEquivalentsAtCarryingValue" },
    { match: /short-?term investments/i, concept: "us-gaap:ShortTermInvestments" },
    { match: /accounts receivable/i, concept: "us-gaap:AccountsReceivableNetCurrent" },
    { match: /inventor/i, concept: "us-gaap:InventoryNet" },
    { match: /prepaid/i, concept: "us-gaap:PrepaidExpenseAndOtherAssetsCurrent" },
    { match: /total current assets/i, concept: "us-gaap:AssetsCurrent" },
    { match: /property and equipment/i, concept: "us-gaap:PropertyPlantAndEquipmentNet" },
    { match: /right-?of-?use/i, concept: "us-gaap:OperatingLeaseRightOfUseAsset" },
    { match: /goodwill/i, concept: "us-gaap:Goodwill" },
    { match: /intangible/i, concept: "us-gaap:FiniteLivedIntangibleAssetsNet" },
    { match: /other non-?current assets/i, concept: "us-gaap:OtherAssetsNoncurrent" },
    { match: /total assets/i, concept: "us-gaap:Assets" },
    { match: /accounts payable/i, concept: "us-gaap:AccountsPayableCurrent" },
    { match: /accrued compensation/i, concept: "us-gaap:EmployeeRelatedLiabilitiesCurrent" },
    { match: /deferred revenue, current/i, concept: "us-gaap:ContractWithCustomerLiabilityCurrent" },
    { match: /deferred revenue, non-?current/i, concept: "us-gaap:ContractWithCustomerLiabilityNoncurrent" },
    { match: /lease liabilities, current/i, concept: "us-gaap:OperatingLeaseLiabilityCurrent" },
    { match: /lease liabilities, non-?current/i, concept: "us-gaap:OperatingLeaseLiabilityNoncurrent" },
    { match: /other current liabilities/i, concept: "us-gaap:OtherLiabilitiesCurrent" },
    { match: /total current liabilities/i, concept: "us-gaap:LiabilitiesCurrent" },
    { match: /long-?term debt/i, concept: "us-gaap:LongTermDebtNoncurrent" },
    { match: /other non-?current liabilities/i, concept: "us-gaap:OtherLiabilitiesNoncurrent" },
    { match: /total liabilities and stockholders/i, concept: "us-gaap:LiabilitiesAndStockholdersEquity" },
    { match: /total liabilities/i, concept: "us-gaap:Liabilities" },
    { match: /common stock/i, concept: "us-gaap:CommonStocksIncludingAdditionalPaidInCapital" },
    { match: /comprehensive (income|loss)/i, concept: "us-gaap:AccumulatedOtherComprehensiveIncomeLossNetOfTax" },
    { match: /accumulated deficit|retained earnings/i, concept: "us-gaap:RetainedEarningsAccumulatedDeficit" },
    { match: /total stockholders/i, concept: "us-gaap:StockholdersEquity" },
    { match: /cost of revenue/i, concept: "us-gaap:CostOfRevenue" },
    { match: /revenue/i, concept: "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" },
    { match: /gross profit/i, concept: "us-gaap:GrossProfit" },
    { match: /research and development/i, concept: "us-gaap:ResearchAndDevelopmentExpense" },
    { match: /sales and marketing/i, concept: "us-gaap:SellingAndMarketingExpense" },
    { match: /general and administrative/i, concept: "us-gaap:GeneralAndAdministrativeExpense" },
    { match: /total operating expenses/i, concept: "us-gaap:OperatingExpenses" },
    { match: /income from operations/i, concept: "us-gaap:OperatingIncomeLoss" },
    { match: /interest/i, concept: "us-gaap:InterestIncomeExpenseNet" },
    { match: /other income/i, concept: "us-gaap:OtherNonoperatingIncomeExpense" },
    { match: /before income taxes/i, concept: "us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments" },
    { match: /provision for income taxes/i, concept: "us-gaap:IncomeTaxExpenseBenefit" },
    { match: /net income/i, concept: "us-gaap:NetIncomeLoss" },
];

/** Deterministic pseudo-confidence so the demo feels stable across runs. */
const confidenceFor = (label: string): number => {
    let hash = 0;
    for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) % 997;
    return 0.86 + (hash % 14) / 100; // 0.86 – 0.99
};

/** The "AI" auto-tagger: maps a line-item label to a US-GAAP concept. */
export const autoTag = (label: string): XbrlTag | null => {
    const rule = CONCEPT_RULES.find((r) => r.match.test(label));
    if (!rule) return null;
    return { concept: rule.concept, confidence: confidenceFor(label), status: "suggested" };
};

/** Short display name for a concept, e.g. "CashAndCashEquivalents…". */
export const conceptShortName = (concept: string): string => concept.replace(/^us-gaap:/, "");

/* ---------------------------------- Calculated subtotals ---------------------------------- */

/**
 * Subtotal/total rows are computed from their member rows so imported or edited
 * numbers roll up automatically. Keyed by row id; values are [rowId, sign] pairs.
 */
export const CALC_TREE: Record<string, [string, number][]> = {
    "bs-total-current-assets": [
        ["bs-cash", 1],
        ["bs-sti", 1],
        ["bs-ar", 1],
        ["bs-inventory", 1],
        ["bs-prepaid", 1],
    ],
    "bs-total-assets": [
        ["bs-total-current-assets", 1],
        ["bs-ppe", 1],
        ["bs-rou", 1],
        ["bs-goodwill", 1],
        ["bs-intangibles", 1],
        ["bs-other-assets", 1],
    ],
    "bs-total-current-liabilities": [
        ["bs-ap", 1],
        ["bs-accrued-comp", 1],
        ["bs-deferred-rev-current", 1],
        ["bs-lease-current", 1],
        ["bs-other-current-liab", 1],
    ],
    "bs-total-liabilities": [
        ["bs-total-current-liabilities", 1],
        ["bs-ltd", 1],
        ["bs-deferred-rev-noncurrent", 1],
        ["bs-lease-noncurrent", 1],
        ["bs-other-noncurrent-liab", 1],
    ],
    "bs-total-equity": [
        ["bs-common-stock", 1],
        ["bs-aoci", 1],
        ["bs-accumulated-deficit", 1],
    ],
    "bs-total-liab-equity": [
        ["bs-total-liabilities", 1],
        ["bs-total-equity", 1],
    ],
    "is-gross-profit": [
        ["is-revenue", 1],
        ["is-cost-of-revenue", -1],
    ],
    "is-total-opex": [
        ["is-rd", 1],
        ["is-sm", 1],
        ["is-ga", 1],
    ],
    "is-operating-income": [
        ["is-gross-profit", 1],
        ["is-total-opex", -1],
    ],
    "is-pretax-income": [
        ["is-operating-income", 1],
        ["is-interest", 1],
        ["is-other-income", 1],
    ],
    "is-net-income": [
        ["is-pretax-income", 1],
        ["is-tax", -1],
    ],
};

/** Resolve a row's value for a column, computing subtotals from the calc tree. */
export const resolveValue = (statement: Statement, rowId: string, col: number, depth = 0): number | null => {
    const row = statement.rows.find((r) => r.id === rowId);
    if (!row) return null;

    const members = CALC_TREE[rowId];
    if (!members || depth > 6) return row.values[col] ?? null;

    let sum = 0;
    let sawValue = false;
    for (const [memberId, sign] of members) {
        const v = resolveValue(statement, memberId, col, depth + 1);
        if (v !== null) {
            sum += sign * v;
            sawValue = true;
        }
    }
    return sawValue ? sum : null;
};

/** Whether the balance sheet ties out (Assets = Liabilities + Equity) in every column. */
export const isBalanced = (statement: Statement): boolean => {
    if (statement.id !== "balance-sheet") return true;
    return statement.columns.every((_, col) => {
        const assets = resolveValue(statement, "bs-total-assets", col);
        const liabEquity = resolveValue(statement, "bs-total-liab-equity", col);
        return assets !== null && liabEquity !== null && Math.abs(assets - liabEquity) < 0.5;
    });
};

/* ---------------------------------- Formatting ---------------------------------- */

/** Accounting-style formatting: thousands separators, parentheses for negatives. */
export const formatAccounting = (value: number | null): string => {
    if (value === null) return "—";
    const abs = Math.abs(Math.round(value)).toLocaleString("en-US");
    return value < 0 ? `(${abs})` : abs;
};

export const formatCurrency = (value: number): string =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/* ---------------------------------- CSV ingest ---------------------------------- */

const normalize = (s: string): string =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();

export interface ParsedCsvRow {
    label: string;
    value: number;
    prior?: number;
}

/** Parses a simple `label,value[,prior]` CSV (quotes and $ signs tolerated). */
export const parseFinancialCsv = (text: string): ParsedCsvRow[] => {
    const rows: ParsedCsvRow[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        // Split on commas outside quotes.
        const parts = line.match(/("[^"]*"|[^,]+)/g)?.map((p) => p.replace(/^"|"$/g, "").trim()) ?? [];
        if (parts.length < 2) continue;
        const label = parts[0];
        const toNumber = (s: string): number | null => {
            const cleaned = s.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
            const n = Number(cleaned);
            return Number.isFinite(n) ? n : null;
        };
        const value = toNumber(parts[1]);
        if (value === null) continue; // skip header rows
        const prior = parts[2] ? toNumber(parts[2]) : null;
        rows.push({ label, value, ...(prior !== null ? { prior } : {}) });
    }
    return rows;
};

/**
 * Fuzzy-matches parsed CSV rows against statement line items and returns
 * updated rows. Matched line items get new values, a source attribution, and an
 * AI tag suggestion if untagged.
 */
export const applyCsvToStatement = (
    statement: Statement,
    parsed: ParsedCsvRow[],
    sourceName: string,
    sourceKind: "file" | "gcs",
): { rows: StatementRow[]; matched: number; tagged: number } => {
    let matched = 0;
    let tagged = 0;

    const rows = statement.rows.map((row) => {
        if (row.kind !== "line") return row;
        const rowNorm = normalize(row.label);
        const hit = parsed.find((p) => {
            const pNorm = normalize(p.label);
            return pNorm === rowNorm || pNorm.includes(rowNorm) || rowNorm.includes(pNorm);
        });
        if (!hit) return row;

        matched++;
        const values = [...row.values];
        values[0] = hit.value;
        if (hit.prior !== undefined && values.length > 1) values[1] = hit.prior;

        let tag = row.tag;
        if (!tag) {
            tag = autoTag(row.label);
            if (tag) tagged++;
        }

        return { ...row, values, tag, source: sourceName, sourceKind };
    });

    return { rows, matched, tagged };
};

/* ---------------------------------- SEC export ---------------------------------- */

export const COMPANY = {
    name: "Meridian Robotics, Inc.",
    ticker: "MRDN",
    exchange: "NASDAQ",
    cik: "0001834652",
    fiscalYearEnd: "December 31",
};

export const DOC_META: Record<DocType, { period: string; periodEnd: string; priorEnd: string; due: string; form: string }> = {
    "10-Q": { period: "Q2 FY2026", periodEnd: "2026-06-30", priorEnd: "2025-12-31", due: "Aug 10, 2026", form: "10-Q" },
    "10-K": { period: "FY2026", periodEnd: "2026-12-31", priorEnd: "2025-12-31", due: "Mar 1, 2027", form: "10-K" },
};

export const generateAccession = (): string => {
    const seq = String(Math.floor(Math.random() * 90000) + 10000).padStart(6, "0");
    return `0001628280-26-${seq}`;
};

/** Builds an XBRL instance document from all accepted tags in the active document. */
export const buildXbrlInstance = (state: AppState, doc: DocType): string => {
    const meta = DOC_META[doc];
    const statements = state.statements[doc];

    const contexts: string[] = [];
    const facts: string[] = [];

    statements.forEach((statement) => {
        statement.columns.forEach((columnLabel, col) => {
            const isInstant = statement.periodType === "instant";
            const date = col === 0 ? meta.periodEnd : meta.priorEnd;
            const ctxId = `${isInstant ? "i" : "d"}-${statement.id}-${col}`;

            contexts.push(
                `  <context id="${ctxId}">\n` +
                    `    <entity><identifier scheme="http://www.sec.gov/CIK">${COMPANY.cik}</identifier></entity>\n` +
                    `    <period>${
                        isInstant
                            ? `<instant>${date}</instant>`
                            : `<startDate>${date.slice(0, 5)}04-01</startDate><endDate>${date}</endDate>`
                    }</period>\n` +
                    `  </context> <!-- ${columnLabel} -->`,
            );

            statement.rows.forEach((row) => {
                if (!row.tag || row.tag.status !== "accepted") return;
                const value = resolveValue(statement, row.id, col);
                if (value === null) return;
                const element = row.tag.concept.replace(":", ":");
                facts.push(
                    `  <${element} contextRef="${ctxId}" unitRef="usd" decimals="-3">${Math.round(value * 1000)}</${element}> <!-- ${row.label} -->`,
                );
            });
        });
    });

    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<!-- Generated by Inline · ${COMPANY.name} Form ${meta.form} · ${meta.period} -->`,
        `<xbrl xmlns="http://www.xbrl.org/2003/instance"`,
        `      xmlns:us-gaap="http://fasb.org/us-gaap/2026"`,
        `      xmlns:dei="http://xbrl.sec.gov/dei/2026"`,
        `      xmlns:iso4217="http://www.xbrl.org/2003/iso4217">`,
        `  <unit id="usd"><measure>iso4217:USD</measure></unit>`,
        ...contexts,
        `  <dei:EntityRegistrantName contextRef="d-${statements[0].id}-0">${COMPANY.name}</dei:EntityRegistrantName>`,
        `  <dei:EntityCentralIndexKey contextRef="d-${statements[0].id}-0">${COMPANY.cik}</dei:EntityCentralIndexKey>`,
        `  <dei:DocumentType contextRef="d-${statements[0].id}-0">${meta.form}</dei:DocumentType>`,
        ...facts,
        `</xbrl>`,
    ].join("\n");
};

/** Triggers a browser download of the generated XBRL package. */
export const downloadXbrl = (state: AppState, doc: DocType): string => {
    const xml = buildXbrlInstance(state, doc);
    const meta = DOC_META[doc];
    const filename = `mrdn-${doc.toLowerCase().replace("-", "")}-${meta.period.toLowerCase().replace(/\s/g, "-")}.xml`;
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return filename;
};

/* ---------------------------------- Progress metrics ---------------------------------- */

export const tagStats = (state: AppState, doc: DocType): { taggable: number; tagged: number; suggested: number; coverage: number } => {
    let taggable = 0;
    let tagged = 0;
    let suggested = 0;
    state.statements[doc].forEach((statement) =>
        statement.rows.forEach((row) => {
            if (row.kind === "header") return;
            taggable++;
            if (row.tag?.status === "accepted") tagged++;
            else if (row.tag?.status === "suggested") suggested++;
        }),
    );
    return { taggable, tagged, suggested, coverage: taggable ? Math.round((tagged / taggable) * 100) : 0 };
};

export const docProgress = (state: AppState, doc: DocType): number => {
    const docTasks = state.tasks.filter((t) => t.doc === doc);
    const taskPct = docTasks.length ? docTasks.filter((t) => t.done).length / docTasks.length : 0;
    const { coverage } = tagStats(state, doc);
    return Math.round(taskPct * 50 + (coverage / 100) * 50);
};
