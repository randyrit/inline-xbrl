import { useState } from "react";
import { AlertCircle, CheckCircle, Download01, FileCheck02, Loading02, Send01, ShieldTick, XClose } from "@untitledui/icons";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Tab, TabList, Tabs } from "@/components/application/tabs/tabs";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { CURRENT_USER } from "@/lib/initial-data";
import type { DocType } from "@/lib/types";
import { COMPANY, DOC_META, downloadXbrl, generateAccession, isBalanced, tagStats } from "@/lib/xbrl";
import { useApp } from "@/store/app-context";
import { cx } from "@/utils/cx";

type CheckStatus = "pending" | "running" | "pass" | "warn" | "fail";

interface ValidationCheck {
    id: string;
    label: string;
    detail: string;
    status: CheckStatus;
}

const buildChecks = (): ValidationCheck[] => [
    { id: "schema", label: "Taxonomy & schema validation", detail: "us-gaap/2026 · dei/2026", status: "pending" },
    { id: "calc", label: "Calculation consistency", detail: "Subtotals roll up, balance sheet ties", status: "pending" },
    { id: "context", label: "Required contexts & units", detail: "Instant + duration contexts, ISO-4217 USD", status: "pending" },
    { id: "coverage", label: "XBRL tag coverage", detail: "Every reported fact mapped to a concept", status: "pending" },
    { id: "efm", label: "EDGAR Filer Manual checks", detail: "EFM 6.5 syntax & semantics", status: "pending" },
];

const CheckRow = ({ check }: { check: ValidationCheck }) => (
    <li className="flex items-center gap-3 px-4 py-3">
        {check.status === "pending" && <span className="size-5 shrink-0 rounded-full border-2 border-secondary" />}
        {check.status === "running" && <Loading02 className="size-5 shrink-0 animate-spin text-fg-brand-primary" />}
        {check.status === "pass" && <CheckCircle className="size-5 shrink-0 text-fg-success-primary" />}
        {check.status === "warn" && <AlertCircle className="size-5 shrink-0 text-fg-warning-primary" />}
        {check.status === "fail" && <AlertCircle className="size-5 shrink-0 text-fg-error-primary" />}
        <div className="min-w-0 flex-1">
            <p className={cx("text-sm font-medium", check.status === "pending" ? "text-quaternary" : "text-secondary")}>{check.label}</p>
            <p className="text-xs text-quaternary">{check.detail}</p>
        </div>
        {check.status === "pass" && (
            <Badge color="success" size="sm" type="pill-color">
                Pass
            </Badge>
        )}
        {check.status === "warn" && (
            <Badge color="warning" size="sm" type="pill-color">
                Warning
            </Badge>
        )}
        {check.status === "fail" && (
            <Badge color="error" size="sm" type="pill-color">
                Fail
            </Badge>
        )}
    </li>
);

export const Filings = () => {
    const { state, dispatch, toast } = useApp();
    const [doc, setDoc] = useState<DocType>(state.activeDoc);
    const [checks, setChecks] = useState<ValidationCheck[]>(buildChecks());
    const [validated, setValidated] = useState(false);
    const [validating, setValidating] = useState(false);
    const [transmitOpen, setTransmitOpen] = useState(false);
    const [transmitting, setTransmitting] = useState(false);
    const [accession, setAccession] = useState<string | null>(null);

    const stats = tagStats(state, doc);
    const meta = DOC_META[doc];
    const balanceSheet = state.statements[doc].find((s) => s.id === "balance-sheet")!;

    const resetValidation = (nextDoc: DocType) => {
        setDoc(nextDoc);
        setChecks(buildChecks());
        setValidated(false);
        setAccession(null);
    };

    const runValidation = () => {
        setValidating(true);
        setValidated(false);
        const fresh = buildChecks();
        setChecks(fresh);

        const resultFor = (id: string): { status: CheckStatus; detail?: string } => {
            if (id === "calc") {
                return isBalanced(balanceSheet)
                    ? { status: "pass" }
                    : { status: "fail", detail: "Balance sheet does not tie — import missing values from Data Sources" };
            }
            if (id === "coverage") {
                if (stats.coverage === 100) return { status: "pass" };
                return {
                    status: stats.coverage >= 80 ? "warn" : "fail",
                    detail: `${stats.taggable - stats.tagged} of ${stats.taggable} line items untagged — run AI auto-tag in the builder`,
                };
            }
            return { status: "pass" };
        };

        fresh.forEach((check, i) => {
            window.setTimeout(() => {
                setChecks((prev) => prev.map((c) => (c.id === check.id ? { ...c, status: "running" } : c)));
            }, i * 800);
            window.setTimeout(() => {
                const result = resultFor(check.id);
                setChecks((prev) => prev.map((c) => (c.id === check.id ? { ...c, status: result.status, detail: result.detail ?? c.detail } : c)));
                if (i === fresh.length - 1) {
                    setValidating(false);
                    setValidated(true);
                    dispatch({ type: "LOG", actor: "Inline", text: `ran EDGAR validation on the ${doc}` });
                }
            }, i * 800 + 700);
        });
    };

    const hasFailure = checks.some((c) => c.status === "fail");
    const canTransmit = validated && !hasFailure;

    const transmit = () => {
        setTransmitting(true);
        window.setTimeout(() => {
            const acc = generateAccession();
            setAccession(acc);
            setTransmitting(false);
            dispatch({
                type: "ADD_FILING",
                record: { id: `fil-${Date.now()}`, doc, period: meta.period, accession: acc, filedAt: "Just now", status: "accepted" },
            });
            dispatch({ type: "COMPLETE_TASK", id: "t8" });
            dispatch({ type: "LOG", actor: "EDGAR", text: `Form ${doc} for ${meta.period} accepted — accession ${acc}` });
            toast({ title: `Form ${doc} accepted by EDGAR`, description: `Accession ${acc}`, color: "success" });
        }, 2600);
    };

    return (
        <div className="flex flex-col gap-6 px-4 py-6 lg:px-8 lg:py-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-display-xs font-semibold text-primary">Filings & export</h1>
                    <p className="mt-1 text-md text-tertiary">Validate the XBRL package and transmit it to SEC EDGAR.</p>
                </div>
                <Tabs selectedKey={doc} onSelectionChange={(k) => resetValidation(k as DocType)} className="w-auto">
                    <TabList type="button-border" size="sm">
                        <Tab id="10-Q">Form 10-Q</Tab>
                        <Tab id="10-K">Form 10-K</Tab>
                    </TabList>
                </Tabs>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {/* Pre-flight validation */}
                <div className="flex flex-col rounded-2xl bg-primary shadow-xs ring-1 ring-secondary xl:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-5 py-4">
                        <div className="flex items-center gap-3">
                            <FeaturedIcon icon={ShieldTick} color="brand" theme="light" size="md" />
                            <div>
                                <h3 className="text-md font-semibold text-primary">Pre-flight validation — {doc}</h3>
                                <p className="text-sm text-tertiary">
                                    {meta.period} · {stats.coverage}% tag coverage
                                </p>
                            </div>
                        </div>
                        <Button size="sm" color={validated ? "secondary" : "primary"} isLoading={validating} showTextWhileLoading onClick={runValidation}>
                            {validating ? "Validating…" : validated ? "Re-run validation" : "Run validation"}
                        </Button>
                    </div>

                    <ul className="flex flex-col divide-y divide-border-tertiary">
                        {checks.map((check) => (
                            <CheckRow key={check.id} check={check} />
                        ))}
                    </ul>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-secondary px-5 py-4">
                        {validated ? (
                            hasFailure ? (
                                <p className="flex items-center gap-1.5 text-sm font-medium text-error-primary">
                                    <AlertCircle className="size-4" /> Resolve failures before transmitting to the SEC.
                                </p>
                            ) : (
                                <p className="flex items-center gap-1.5 text-sm font-medium text-success-primary">
                                    <CheckCircle className="size-4" /> Package is EDGAR-ready.
                                </p>
                            )
                        ) : (
                            <p className="text-sm text-quaternary">Run validation to unlock transmission.</p>
                        )}
                        <div className="flex gap-3">
                            <Button
                                size="md"
                                color="secondary"
                                iconLeading={Download01}
                                onClick={() => {
                                    const filename = downloadXbrl(state, doc);
                                    toast({ title: "XBRL package downloaded", description: filename, color: "brand" });
                                }}
                            >
                                Download XBRL
                            </Button>
                            <Button size="md" color="primary" iconLeading={Send01} isDisabled={!canTransmit} onClick={() => setTransmitOpen(true)}>
                                Transmit to SEC EDGAR
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Package summary */}
                <div className="flex flex-col gap-4 rounded-2xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
                    <div className="flex items-center gap-3">
                        <FeaturedIcon icon={FileCheck02} color="brand" theme="light" size="md" />
                        <h3 className="text-md font-semibold text-primary">Submission package</h3>
                    </div>
                    <dl className="flex flex-col gap-2.5 text-sm">
                        {[
                            ["Registrant", COMPANY.name],
                            ["CIK", COMPANY.cik],
                            ["Form type", meta.form],
                            ["Period", meta.period],
                            ["Period end", meta.periodEnd],
                            ["Taxonomy", "us-gaap/2026 · dei/2026"],
                            ["Tagged facts", `${stats.tagged * 2} across ${stats.tagged} concepts`],
                        ].map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between gap-3">
                                <dt className="text-tertiary">{k}</dt>
                                <dd className="text-right font-medium text-secondary">{v}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="rounded-lg bg-secondary_subtle p-3">
                        <p className="text-xs font-semibold text-quaternary uppercase">Package contents</p>
                        <ul className="mt-2 flex flex-col gap-1.5 font-mono text-xs text-tertiary">
                            <li>mrdn-{doc.toLowerCase().replace("-", "")}.xml — instance</li>
                            <li>mrdn-2026.xsd — extension schema</li>
                            <li>mrdn-cal.xml — calculation linkbase</li>
                            <li>mrdn-pre.xml — presentation linkbase</li>
                            <li>mrdn-lab.xml — label linkbase</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Filing history */}
            <div className="flex flex-col rounded-2xl bg-primary shadow-xs ring-1 ring-secondary">
                <div className="border-b border-secondary px-5 py-4">
                    <h3 className="text-md font-semibold text-primary">Filing history</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                        <thead>
                            <tr className="border-b border-secondary text-left text-xs font-semibold text-quaternary">
                                <th className="px-5 py-2.5">Form</th>
                                <th className="px-5 py-2.5">Period</th>
                                <th className="px-5 py-2.5">Accession no.</th>
                                <th className="px-5 py-2.5">Filed</th>
                                <th className="px-5 py-2.5">Status</th>
                                <th className="px-5 py-2.5" />
                            </tr>
                        </thead>
                        <tbody>
                            {state.filings.map((filing) => (
                                <tr key={filing.id} className="border-b border-tertiary last:border-0">
                                    <td className="px-5 py-3 text-sm font-semibold text-primary">{filing.doc}</td>
                                    <td className="px-5 py-3 text-sm text-secondary">{filing.period}</td>
                                    <td className="px-5 py-3 font-mono text-sm text-tertiary">{filing.accession}</td>
                                    <td className="px-5 py-3 text-sm text-tertiary">{filing.filedAt}</td>
                                    <td className="px-5 py-3">
                                        <BadgeWithDot color="success" size="sm" type="pill-color">
                                            EDGAR accepted
                                        </BadgeWithDot>
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        <Button size="sm" color="link-color" iconLeading={Download01} onClick={() => downloadXbrl(state, filing.doc)}>
                                            XBRL
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Transmit modal */}
            <ModalOverlay isOpen={transmitOpen} onOpenChange={(open) => !transmitting && setTransmitOpen(open)} isDismissable={!transmitting}>
                <Modal className="max-w-md">
                    <Dialog>
                        <div className="w-full rounded-2xl bg-primary p-6 shadow-xl">
                            {accession ? (
                                <>
                                    <FeaturedIcon icon={CheckCircle} color="success" theme="light" size="lg" />
                                    <h2 className="mt-4 text-lg font-semibold text-primary">Filing accepted by EDGAR</h2>
                                    <p className="mt-1 text-sm text-tertiary">
                                        Form {doc} for {meta.period} was transmitted and accepted by the SEC.
                                    </p>
                                    <div className="mt-4 rounded-lg bg-success-secondary p-3 ring-1 ring-success-200 ring-inset">
                                        <p className="text-xs font-semibold text-success-primary uppercase">Accession number</p>
                                        <p className="mt-1 font-mono text-sm font-semibold text-success-primary">{accession}</p>
                                    </div>
                                    <div className="mt-6 flex justify-end gap-3">
                                        <Button
                                            size="md"
                                            color="secondary"
                                            iconLeading={Download01}
                                            onClick={() => {
                                                const filename = downloadXbrl(state, doc);
                                                toast({ title: "XBRL package downloaded", description: filename, color: "brand" });
                                            }}
                                        >
                                            Download package
                                        </Button>
                                        <Button
                                            size="md"
                                            color="primary"
                                            onClick={() => {
                                                setTransmitOpen(false);
                                                setAccession(null);
                                            }}
                                        >
                                            Done
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex items-start justify-between">
                                        <FeaturedIcon icon={Send01} color="brand" theme="light" size="lg" />
                                        {!transmitting && (
                                            <button
                                                aria-label="Close"
                                                onClick={() => setTransmitOpen(false)}
                                                className="cursor-pointer rounded-md p-1.5 text-fg-quaternary transition duration-100 ease-linear hover:bg-primary_hover"
                                            >
                                                <XClose className="size-5" />
                                            </button>
                                        )}
                                    </div>
                                    <h2 className="mt-4 text-lg font-semibold text-primary">Transmit Form {doc} to SEC EDGAR</h2>
                                    <p className="mt-1 text-sm text-tertiary">
                                        {COMPANY.name} · CIK {COMPANY.cik} · {meta.period}. This submits the live filing to the SEC — signed by{" "}
                                        {CURRENT_USER.name}, {CURRENT_USER.role}.
                                    </p>
                                    <div className="mt-4 flex items-center gap-2 rounded-lg bg-warning-primary px-3 py-2.5">
                                        <AlertCircle className="size-4 shrink-0 text-fg-warning-primary" />
                                        <p className="text-xs text-warning-primary">Transmission is final. EDGAR acceptance typically takes under a minute.</p>
                                    </div>
                                    <div className="mt-6 flex justify-end gap-3">
                                        <Button size="md" color="secondary" isDisabled={transmitting} onClick={() => setTransmitOpen(false)}>
                                            Cancel
                                        </Button>
                                        <Button size="md" color="primary" iconLeading={Send01} isLoading={transmitting} showTextWhileLoading onClick={transmit}>
                                            {transmitting ? "Transmitting…" : "Transmit filing"}
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
};
