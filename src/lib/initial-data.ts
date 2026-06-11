import type { AppState, BankAccount, Collaborator, Statement, XbrlTag } from "./types";

const accepted = (concept: string, confidence = 0.97): XbrlTag => ({ concept, confidence, status: "accepted" });

/* ---------------------------------- 10-Q statements ---------------------------------- */
/* Values in thousands of USD. Some current-period cells start empty + untagged so the
   GCS ingest → import → AI-tag → export demo arc has real work to do. */

const balanceSheet10Q: Statement = {
    id: "balance-sheet",
    name: "Balance Sheet",
    columns: ["Jun 30, 2026", "Dec 31, 2025"],
    periodType: "instant",
    rows: [
        { id: "bs-h-assets", label: "Assets", indent: 0, kind: "header", values: [null, null], tag: null, source: null },
        { id: "bs-h-current-assets", label: "Current assets", indent: 1, kind: "header", values: [null, null], tag: null, source: null },
        { id: "bs-cash", label: "Cash and cash equivalents", indent: 2, kind: "line", values: [184205, 152883], tag: accepted("us-gaap:CashAndCashEquivalentsAtCarryingValue"), source: "gl_trial_balance_q1_2026.csv", sourceKind: "file" },
        { id: "bs-sti", label: "Short-term investments", indent: 2, kind: "line", values: [92410, 101560], tag: accepted("us-gaap:ShortTermInvestments"), source: "gl_trial_balance_q1_2026.csv", sourceKind: "file" },
        { id: "bs-ar", label: "Accounts receivable, net", indent: 2, kind: "line", values: [67332, 58247], tag: accepted("us-gaap:AccountsReceivableNetCurrent"), source: "gl_trial_balance_q1_2026.csv", sourceKind: "file" },
        { id: "bs-inventory", label: "Inventories", indent: 2, kind: "line", values: [null, 38012], tag: null, source: null },
        { id: "bs-prepaid", label: "Prepaid expenses and other current assets", indent: 2, kind: "line", values: [null, 9873], tag: null, source: null },
        { id: "bs-total-current-assets", label: "Total current assets", indent: 1, kind: "subtotal", values: [null, null], tag: accepted("us-gaap:AssetsCurrent"), source: null },
        { id: "bs-ppe", label: "Property and equipment, net", indent: 1, kind: "line", values: [88114, 84630], tag: accepted("us-gaap:PropertyPlantAndEquipmentNet"), source: "gl_trial_balance_q1_2026.csv", sourceKind: "file" },
        { id: "bs-rou", label: "Operating lease right-of-use assets", indent: 1, kind: "line", values: [24560, 26118], tag: null, source: "Manual entry", sourceKind: "manual" },
        { id: "bs-goodwill", label: "Goodwill", indent: 1, kind: "line", values: [56900, 56900], tag: accepted("us-gaap:Goodwill"), source: "Manual entry", sourceKind: "manual" },
        { id: "bs-intangibles", label: "Intangible assets, net", indent: 1, kind: "line", values: [18224, 19887], tag: null, source: "Manual entry", sourceKind: "manual" },
        { id: "bs-other-assets", label: "Other non-current assets", indent: 1, kind: "line", values: [7415, 6902], tag: null, source: "Manual entry", sourceKind: "manual" },
        { id: "bs-total-assets", label: "Total assets", indent: 0, kind: "total", values: [null, null], tag: accepted("us-gaap:Assets"), source: null },
        { id: "bs-h-liab", label: "Liabilities and stockholders’ equity", indent: 0, kind: "header", values: [null, null], tag: null, source: null },
        { id: "bs-h-current-liab", label: "Current liabilities", indent: 1, kind: "header", values: [null, null], tag: null, source: null },
        { id: "bs-ap", label: "Accounts payable", indent: 2, kind: "line", values: [28441, 24310], tag: accepted("us-gaap:AccountsPayableCurrent"), source: "gl_trial_balance_q1_2026.csv", sourceKind: "file" },
        { id: "bs-accrued-comp", label: "Accrued compensation and benefits", indent: 2, kind: "line", values: [19778, 22054], tag: accepted("us-gaap:EmployeeRelatedLiabilitiesCurrent"), source: "gl_trial_balance_q1_2026.csv", sourceKind: "file" },
        { id: "bs-deferred-rev-current", label: "Deferred revenue, current", indent: 2, kind: "line", values: [48112, 41205], tag: accepted("us-gaap:ContractWithCustomerLiabilityCurrent"), source: "gl_trial_balance_q1_2026.csv", sourceKind: "file" },
        { id: "bs-lease-current", label: "Operating lease liabilities, current", indent: 2, kind: "line", values: [6240, 6105], tag: null, source: "Manual entry", sourceKind: "manual" },
        { id: "bs-other-current-liab", label: "Other current liabilities", indent: 2, kind: "line", values: [null, 7420], tag: null, source: null },
        { id: "bs-total-current-liabilities", label: "Total current liabilities", indent: 1, kind: "subtotal", values: [null, null], tag: accepted("us-gaap:LiabilitiesCurrent"), source: null },
        { id: "bs-ltd", label: "Long-term debt", indent: 1, kind: "line", values: [120000, 120000], tag: accepted("us-gaap:LongTermDebtNoncurrent"), source: "Manual entry", sourceKind: "manual" },
        { id: "bs-deferred-rev-noncurrent", label: "Deferred revenue, non-current", indent: 1, kind: "line", values: [22406, 19884], tag: null, source: "Manual entry", sourceKind: "manual" },
        { id: "bs-lease-noncurrent", label: "Operating lease liabilities, non-current", indent: 1, kind: "line", values: [20118, 21930], tag: null, source: "Manual entry", sourceKind: "manual" },
        { id: "bs-other-noncurrent-liab", label: "Other non-current liabilities", indent: 1, kind: "line", values: [5210, 4876], tag: null, source: "Manual entry", sourceKind: "manual" },
        { id: "bs-total-liabilities", label: "Total liabilities", indent: 0, kind: "subtotal", values: [null, null], tag: accepted("us-gaap:Liabilities"), source: null },
        { id: "bs-h-equity", label: "Stockholders’ equity", indent: 1, kind: "header", values: [null, null], tag: null, source: null },
        { id: "bs-common-stock", label: "Common stock and additional paid-in capital", indent: 2, kind: "line", values: [412330, 401205], tag: accepted("us-gaap:CommonStocksIncludingAdditionalPaidInCapital"), source: "equity_rollforward_q2.xlsx", sourceKind: "file" },
        { id: "bs-aoci", label: "Accumulated other comprehensive loss", indent: 2, kind: "line", values: [null, -2884], tag: null, source: null },
        { id: "bs-accumulated-deficit", label: "Accumulated deficit", indent: 2, kind: "line", values: [-94869, -111093], tag: accepted("us-gaap:RetainedEarningsAccumulatedDeficit"), source: "equity_rollforward_q2.xlsx", sourceKind: "file" },
        { id: "bs-total-equity", label: "Total stockholders’ equity", indent: 1, kind: "subtotal", values: [null, null], tag: accepted("us-gaap:StockholdersEquity"), source: null },
        { id: "bs-total-liab-equity", label: "Total liabilities and stockholders’ equity", indent: 0, kind: "total", values: [null, null], tag: accepted("us-gaap:LiabilitiesAndStockholdersEquity"), source: null },
    ],
};

const incomeStatement10Q: Statement = {
    id: "income-statement",
    name: "Income Statement",
    columns: ["Three months ended Jun 30, 2026", "Three months ended Jun 30, 2025"],
    periodType: "duration",
    rows: [
        { id: "is-revenue", label: "Revenue", indent: 0, kind: "line", values: [128440, 104212], tag: accepted("us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax"), source: "revenue_by_segment_q2.csv", sourceKind: "file" },
        { id: "is-cost-of-revenue", label: "Cost of revenue", indent: 0, kind: "line", values: [54221, 46890], tag: accepted("us-gaap:CostOfRevenue"), source: "gl_trial_balance_q1_2026.csv", sourceKind: "file" },
        { id: "is-gross-profit", label: "Gross profit", indent: 0, kind: "subtotal", values: [null, null], tag: accepted("us-gaap:GrossProfit"), source: null },
        { id: "is-h-opex", label: "Operating expenses", indent: 0, kind: "header", values: [null, null], tag: null, source: null },
        { id: "is-rd", label: "Research and development", indent: 1, kind: "line", values: [28114, 24667], tag: null, source: "gl_trial_balance_q1_2026.csv", sourceKind: "file" },
        { id: "is-sm", label: "Sales and marketing", indent: 1, kind: "line", values: [21408, 19224], tag: null, source: "gl_trial_balance_q1_2026.csv", sourceKind: "file" },
        { id: "is-ga", label: "General and administrative", indent: 1, kind: "line", values: [12030, 11415], tag: null, source: "gl_trial_balance_q1_2026.csv", sourceKind: "file" },
        { id: "is-total-opex", label: "Total operating expenses", indent: 0, kind: "subtotal", values: [null, null], tag: null, source: null },
        { id: "is-operating-income", label: "Income from operations", indent: 0, kind: "subtotal", values: [null, null], tag: accepted("us-gaap:OperatingIncomeLoss"), source: null },
        { id: "is-interest", label: "Interest expense, net", indent: 0, kind: "line", values: [-1540, -1612], tag: null, source: "Manual entry", sourceKind: "manual" },
        { id: "is-other-income", label: "Other income (expense), net", indent: 0, kind: "line", values: [612, -188], tag: null, source: "Manual entry", sourceKind: "manual" },
        { id: "is-pretax-income", label: "Income before income taxes", indent: 0, kind: "subtotal", values: [null, null], tag: null, source: null },
        { id: "is-tax", label: "Provision for income taxes", indent: 0, kind: "line", values: [2113, 47], tag: null, source: "Manual entry", sourceKind: "manual" },
        { id: "is-net-income", label: "Net income", indent: 0, kind: "total", values: [null, null], tag: accepted("us-gaap:NetIncomeLoss"), source: null },
    ],
};

/* ---------------------------------- 10-K statements ---------------------------------- */
/* The annual report is early in construction: current-year column mostly open. */

const stripForAnnual = (statement: Statement, columns: string[]): Statement => ({
    ...statement,
    columns,
    rows: statement.rows.map((row, i) => ({
        ...row,
        values: [row.kind === "line" && i % 3 !== 0 ? null : row.values[0], row.values[1] ?? row.values[0]],
        tag: row.tag && i % 2 === 0 ? row.tag : null,
        source: row.tag && i % 2 === 0 ? "Rolled forward from FY2025 10-K" : null,
        sourceKind: undefined,
    })),
});

const balanceSheet10K = stripForAnnual(balanceSheet10Q, ["Dec 31, 2026 (draft)", "Dec 31, 2025"]);
const incomeStatement10K = stripForAnnual(incomeStatement10Q, ["Year ended Dec 31, 2026 (draft)", "Year ended Dec 31, 2025"]);

/* ---------------------------------- Collaborators ---------------------------------- */

export const CURRENT_USER = {
    id: "randy",
    name: "Randy Ritts",
    role: "Controller",
    email: "randy@meridianrobotics.com",
    avatar: "https://www.untitledui.com/images/avatars/orlando-diggs?fm=webp&q=80",
};

export const COLLABORATORS: Collaborator[] = [
    { id: "maya", name: "Maya Chen", role: "Senior Accountant", color: "#EE46BC", avatar: "https://www.untitledui.com/images/avatars/candice-wu?fm=webp&q=80" },
    { id: "dev", name: "Dev Patel", role: "Technical Accounting", color: "#F79009", avatar: "https://www.untitledui.com/images/avatars/zahir-mays?fm=webp&q=80" },
    { id: "sofia", name: "Sofia Reyes", role: "External Auditor", color: "#17B26A", avatar: "https://www.untitledui.com/images/avatars/ava-wright?fm=webp&q=80" },
];

/* ---------------------------------- Connections ---------------------------------- */

export const BANK_INSTITUTIONS = [
    { id: "chase", name: "JPMorgan Chase", color: "#155EEF" },
    { id: "mercury", name: "Mercury", color: "#0A1B3D" },
    { id: "brex", name: "Brex", color: "#F04438" },
    { id: "wells", name: "Wells Fargo", color: "#D92D20" },
];

export const LINKED_ACCOUNTS: BankAccount[] = [
    { id: "chase-op", institution: "JPMorgan Chase", name: "Operating Account", mask: "8841", balance: 112440180.1, lastSync: "Just now" },
    { id: "mercury-tr", institution: "Mercury", name: "Treasury Account", mask: "4521", balance: 71765212.34, lastSync: "Just now" },
];

/** Files that stream in when the Google Cloud Storage bucket is connected. */
export const GCS_INGEST_FILES = [
    { name: "trial_balance_q2_2026.csv", size: "48 KB" },
    { name: "revenue_by_segment_q2.csv", size: "21 KB" },
    { name: "lease_schedule_fy2026.xlsx", size: "186 KB" },
    { name: "fixed_assets_register.csv", size: "204 KB" },
];

/** Simulated contents of ingestible files, fed through the real CSV mapping pipeline. */
export const FILE_CONTENTS: Record<string, string> = {
    "trial_balance_q2_2026.csv": [
        "Account,Jun 30 2026,Dec 31 2025",
        "Cash and cash equivalents,184205,152883",
        "Short-term investments,92410,101560",
        "Accounts receivable net,67332,58247",
        "Inventories,41886,38012",
        "Prepaid expenses and other current assets,12440,9873",
        "Property and equipment net,88114,84630",
        "Operating lease right-of-use assets,24560,26118",
        "Goodwill,56900,56900",
        "Intangible assets net,18224,19887",
        "Other non-current assets,7415,6902",
        "Accounts payable,28441,24310",
        "Accrued compensation and benefits,19778,22054",
        "Deferred revenue current,48112,41205",
        "Operating lease liabilities current,6240,6105",
        "Other current liabilities,8932,7420",
        "Long-term debt,120000,120000",
        "Deferred revenue non-current,22406,19884",
        "Operating lease liabilities non-current,20118,21930",
        "Other non-current liabilities,5210,4876",
        "Common stock and additional paid-in capital,412330,401205",
        "Accumulated other comprehensive loss,(3212),(2884)",
        "Accumulated deficit,(94869),(111093)",
    ].join("\n"),
};

/* ---------------------------------- App state ---------------------------------- */

export const INITIAL_STATE: AppState = {
    activeDoc: "10-Q",
    statements: {
        "10-Q": [balanceSheet10Q, incomeStatement10Q],
        "10-K": [balanceSheet10K, incomeStatement10K],
    },
    tasks: [
        { id: "t1", label: "Import Q2 trial balance from GCS", doc: "10-Q", done: false },
        { id: "t2", label: "Map balance sheet line items", doc: "10-Q", done: true },
        { id: "t3", label: "Reconcile bank balances to GL", doc: "10-Q", done: false },
        { id: "t4", label: "Roll forward debt schedule", doc: "10-Q", done: true },
        { id: "t5", label: "Complete AI tagging review", doc: "10-Q", done: false },
        { id: "t6", label: "Draft MD&A liquidity section", doc: "10-Q", done: true },
        { id: "t7", label: "Update weighted-average share count", doc: "10-Q", done: true },
        { id: "t8", label: "Run EDGAR validation & export", doc: "10-Q", done: false },
        { id: "k1", label: "Roll forward prior-year workpapers", doc: "10-K", done: true },
        { id: "k2", label: "Ingest FY2026 GL extracts", doc: "10-K", done: false },
        { id: "k3", label: "Build out segment disclosures", doc: "10-K", done: false },
        { id: "k4", label: "Income tax provision workpapers", doc: "10-K", done: false },
        { id: "k5", label: "Deliver auditor PBC list", doc: "10-K", done: false },
        { id: "k6", label: "Draft Item 1 business section", doc: "10-K", done: false },
    ],
    files: [
        { id: "f1", name: "gl_trial_balance_q1_2026.csv", folder: "Source data", size: "47 KB", origin: "upload", addedAt: "Apr 14, 2026", status: "mapped", mappedTo: "10-Q · Balance Sheet", syncEnabled: true },
        { id: "f2", name: "equity_rollforward_q2.xlsx", folder: "Workpapers", size: "92 KB", origin: "upload", addedAt: "Jun 2, 2026", status: "mapped", mappedTo: "10-Q · Equity", syncEnabled: true },
        { id: "f3", name: "bank_recs_may_2026.xlsx", folder: "Workpapers", size: "134 KB", origin: "upload", addedAt: "Jun 5, 2026", status: "ready" },
        { id: "f4", name: "10-K_FY2025_as_filed.pdf", folder: "Prior filings", size: "2.4 MB", origin: "upload", addedAt: "Mar 2, 2026", status: "ready" },
        { id: "f5", name: "10-Q_Q1_FY2026_as_filed.pdf", folder: "Prior filings", size: "1.1 MB", origin: "upload", addedAt: "May 8, 2026", status: "ready" },
    ],
    banks: [],
    gcsBucket: null,
    banksConnected: false,
    filings: [
        { id: "fil1", doc: "10-Q", period: "Q1 FY2026", accession: "0001628280-26-019442", filedAt: "May 8, 2026", status: "accepted" },
        { id: "fil2", doc: "10-K", period: "FY2025", accession: "0001628280-26-004211", filedAt: "Mar 2, 2026", status: "accepted" },
    ],
    activity: [
        { id: "a1", actor: "Maya Chen", avatar: COLLABORATORS[0].avatar, text: "accepted 12 tag suggestions on the Income Statement", time: "2h ago" },
        { id: "a2", actor: "Dev Patel", avatar: COLLABORATORS[1].avatar, text: "uploaded equity_rollforward_q2.xlsx to Workpapers", time: "Yesterday" },
        { id: "a3", actor: "Sofia Reyes", avatar: COLLABORATORS[2].avatar, text: "left a review note on Deferred revenue, current", time: "Yesterday" },
        { id: "a4", actor: "EDGAR", text: "Form 10-Q for Q1 FY2026 was accepted by the SEC", time: "May 8" },
    ],
};
