import { useRef, useState } from "react";
import { Bank, Check, Cloud01, FolderCheck, LinkExternal01, RefreshCw01, UploadCloud01, XClose } from "@untitledui/icons";
import { FileIcon } from "@untitledui/file-icons";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Toggle } from "@/components/base/toggle/toggle";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { BANK_INSTITUTIONS, CURRENT_USER, FILE_CONTENTS, GCS_INGEST_FILES, LINKED_ACCOUNTS } from "@/lib/initial-data";
import type { StoredFile } from "@/lib/types";
import { applyCsvToStatement, formatCurrency, parseFinancialCsv } from "@/lib/xbrl";
import { useApp } from "@/store/app-context";
import { cx } from "@/utils/cx";

/** Contents of files uploaded this session (not persisted — demo files live in FILE_CONTENTS). */
const uploadedContents = new Map<string, string>();

const fileType = (name: string): string => name.split(".").pop() ?? "empty";

const FOLDERS = ["All files", "Source data", "Workpapers", "Prior filings", "Cloud ingest"];

export const DataSources = () => {
    const { state, dispatch, toast } = useApp();
    const [folder, setFolder] = useState("All files");
    const [gcsModalOpen, setGcsModalOpen] = useState(false);
    const [bankModalOpen, setBankModalOpen] = useState(false);
    const [bucketName, setBucketName] = useState("meridian-fin-data");
    const [connecting, setConnecting] = useState(false);
    const [connectingBank, setConnectingBank] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const visibleFiles = state.files.filter((f) => folder === "All files" || f.folder === folder);

    /* ----------------------------- Upload ----------------------------- */

    const ingestUpload = async (fileList: FileList | File[]) => {
        for (const file of Array.from(fileList)) {
            const id = `up-${Date.now()}-${file.name}`;
            const stored: StoredFile = {
                id,
                name: file.name,
                folder: "Source data",
                size: file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`,
                origin: "upload",
                addedAt: "Just now",
                status: "ready",
            };
            if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
                uploadedContents.set(id, await file.text());
            }
            dispatch({ type: "ADD_FILE", file: stored });
            dispatch({ type: "LOG", actor: CURRENT_USER.name, avatar: CURRENT_USER.avatar, text: `uploaded ${file.name}` });
        }
        toast({ title: "Upload complete", description: "Balance sheet files can now be imported into the report.", color: "success" });
    };

    /* ----------------------------- Import → report ----------------------------- */

    const importToReport = (file: StoredFile) => {
        const content = FILE_CONTENTS[file.name] ?? uploadedContents.get(file.id);
        if (!content) return;
        const parsed = parseFinancialCsv(content);
        if (!parsed.length) {
            toast({ title: "Nothing to import", description: "No `label,value` rows were found in this file.", color: "warning" });
            return;
        }

        let matched = 0;
        let tagged = 0;
        state.statements["10-Q"].forEach((statement) => {
            const result = applyCsvToStatement(statement, parsed, file.name, file.origin === "gcs" ? "gcs" : "file");
            if (result.matched) {
                dispatch({ type: "SET_ROWS", doc: "10-Q", stmtId: statement.id, rows: result.rows });
                matched += result.matched;
                tagged += result.tagged;
            }
        });

        if (!matched) {
            toast({ title: "No line items matched", description: "Column A labels didn’t match any report line items.", color: "warning" });
            return;
        }

        dispatch({ type: "UPDATE_FILE", id: file.id, patch: { status: "mapped", mappedTo: "10-Q · Balance Sheet", syncEnabled: true } });
        dispatch({ type: "COMPLETE_TASK", id: "t1" });
        dispatch({ type: "LOG", actor: CURRENT_USER.name, avatar: CURRENT_USER.avatar, text: `imported ${file.name} — ${matched} line items mapped` });
        toast({
            title: `${matched} line items pulled into the 10-Q`,
            description:
                tagged > 0
                    ? `${tagged} new XBRL tag suggestions were generated. Auto-sync is on for future periods.`
                    : "Values updated. Auto-sync is on for future periods.",
            color: "success",
        });
    };

    /* ----------------------------- Google Cloud ----------------------------- */

    const connectGcs = () => {
        setConnecting(true);
        window.setTimeout(() => {
            setConnecting(false);
            setGcsModalOpen(false);
            dispatch({ type: "CONNECT_GCS", bucket: bucketName });
            dispatch({ type: "LOG", actor: CURRENT_USER.name, avatar: CURRENT_USER.avatar, text: `connected Google Cloud bucket gs://${bucketName}` });
            toast({ title: "Google Cloud connected", description: `Ingesting files from gs://${bucketName}…`, color: "brand" });

            GCS_INGEST_FILES.forEach((f, i) => {
                const id = `gcs-${f.name}`;
                window.setTimeout(() => {
                    dispatch({
                        type: "ADD_FILE",
                        file: { id, name: f.name, folder: "Cloud ingest", size: f.size, origin: "gcs", addedAt: "Just now", status: "ingesting" },
                    });
                    window.setTimeout(() => dispatch({ type: "UPDATE_FILE", id, patch: { status: "ready" } }), 1400);
                }, 600 + i * 900);
            });
            window.setTimeout(
                () => toast({ title: `${GCS_INGEST_FILES.length} files ingested from GCS`, description: "trial_balance_q2_2026.csv is ready to import.", color: "success" }),
                600 + GCS_INGEST_FILES.length * 900 + 1400,
            );
        }, 1600);
    };

    /* ----------------------------- Banks ----------------------------- */

    const connectBank = (institutionId: string) => {
        setConnectingBank(institutionId);
        window.setTimeout(() => {
            setConnectingBank(null);
            setBankModalOpen(false);
            dispatch({ type: "CONNECT_BANKS", accounts: LINKED_ACCOUNTS });
            dispatch({ type: "LOG", actor: CURRENT_USER.name, avatar: CURRENT_USER.avatar, text: "linked 2 bank accounts" });
            toast({ title: "Bank accounts linked", description: "2 accounts connected with read-only access.", color: "success" });
        }, 1800);
    };

    const pullBankBalances = () => {
        const totalThousands = Math.round(state.banks.reduce((sum, account) => sum + account.balance, 0) / 1000);
        const balanceSheet = state.statements["10-Q"].find((s) => s.id === "balance-sheet");
        if (!balanceSheet) return;
        dispatch({
            type: "SET_ROWS",
            doc: "10-Q",
            stmtId: "balance-sheet",
            rows: balanceSheet.rows.map((row) =>
                row.id === "bs-cash" ? { ...row, values: [totalThousands, row.values[1]], source: "Linked banks (2)", sourceKind: "bank" as const } : row,
            ),
        });
        dispatch({ type: "COMPLETE_TASK", id: "t3" });
        dispatch({ type: "LOG", actor: CURRENT_USER.name, avatar: CURRENT_USER.avatar, text: "pulled live bank balances into Cash and cash equivalents" });
        toast({ title: "Cash updated from linked banks", description: `$${totalThousands.toLocaleString()}K pulled into the 10-Q balance sheet.`, color: "success" });
    };

    return (
        <div className="flex flex-col gap-6 px-4 py-6 lg:px-8 lg:py-8">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-display-xs font-semibold text-primary">Data sources</h1>
                    <p className="mt-1 text-md text-tertiary">Ingest balance sheets, GL extracts, and live bank data — Inline pulls them into the right line items.</p>
                </div>
                <div className="flex gap-3">
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".csv,.xlsx,.xls,.pdf,.txt"
                        className="hidden"
                        onChange={(e) => e.target.files?.length && ingestUpload(e.target.files)}
                    />
                    <Button size="md" color="secondary" iconLeading={UploadCloud01} onClick={() => fileInputRef.current?.click()}>
                        Upload balance sheet
                    </Button>
                    {!state.gcsBucket && (
                        <Button size="md" color="primary" iconLeading={Cloud01} onClick={() => setGcsModalOpen(true)}>
                            Connect Google Cloud
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {/* File system */}
                <div
                    className={cx(
                        "flex flex-col rounded-2xl bg-primary shadow-xs ring-1 transition duration-100 ease-linear xl:col-span-2",
                        dragging ? "ring-2 ring-brand-500" : "ring-secondary",
                    )}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        if (e.dataTransfer.files.length) ingestUpload(e.dataTransfer.files);
                    }}
                >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-5 py-4">
                        <div className="flex items-center gap-2">
                            <h3 className="text-md font-semibold text-primary">Files</h3>
                            <Badge color="gray" size="sm" type="pill-color">
                                {state.files.length}
                            </Badge>
                        </div>
                        <p className="text-xs text-quaternary">Drag & drop anywhere in this panel to upload</p>
                    </div>

                    {/* Folder chips */}
                    <div className="flex flex-wrap gap-2 px-5 py-3">
                        {FOLDERS.map((f) => (
                            <button
                                key={f}
                                onClick={() => setFolder(f)}
                                className={cx(
                                    "cursor-pointer rounded-full px-3 py-1 text-sm font-medium transition duration-100 ease-linear",
                                    folder === f ? "bg-brand-600 text-white" : "bg-secondary_subtle text-tertiary ring-1 ring-secondary ring-inset hover:bg-secondary",
                                )}
                            >
                                {f}
                                {f === "Cloud ingest" && state.gcsBucket && (
                                    <span className="ml-1.5 inline-block size-1.5 rounded-full bg-success-500 align-middle" />
                                )}
                            </button>
                        ))}
                    </div>

                    <ul className="flex flex-col px-3 pb-3">
                        {visibleFiles.length === 0 && (
                            <li className="px-3 py-8 text-center text-sm text-quaternary">
                                {folder === "Cloud ingest" && !state.gcsBucket ? "Connect Google Cloud to ingest files from your bucket." : "No files here yet."}
                            </li>
                        )}
                        {visibleFiles.map((file) => {
                            const importable = file.status !== "ingesting" && (FILE_CONTENTS[file.name] || uploadedContents.get(file.id));
                            return (
                                <li
                                    key={file.id}
                                    className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition duration-100 ease-linear hover:bg-primary_hover"
                                >
                                    <FileIcon type={fileType(file.name)} size={36} className="shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate text-sm font-medium text-secondary">{file.name}</p>
                                            {file.origin === "gcs" && (
                                                <Badge color="blue" size="sm" type="pill-color" className="shrink-0">
                                                    GCS
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-quaternary">
                                            {file.folder} · {file.size} · {file.addedAt}
                                        </p>
                                    </div>

                                    {file.status === "ingesting" && (
                                        <BadgeWithDot color="blue" size="sm" type="pill-color">
                                            Ingesting…
                                        </BadgeWithDot>
                                    )}
                                    {file.status === "mapped" && (
                                        <div className="flex items-center gap-3">
                                            <Badge color="success" size="sm" type="pill-color" className="max-md:hidden">
                                                <FolderCheck className="mr-1 size-3" data-icon />
                                                {file.mappedTo}
                                            </Badge>
                                            <Toggle
                                                size="sm"
                                                slim
                                                aria-label="Auto-sync future periods"
                                                isSelected={!!file.syncEnabled}
                                                onChange={(on) => {
                                                    dispatch({ type: "UPDATE_FILE", id: file.id, patch: { syncEnabled: on } });
                                                    toast({
                                                        title: on ? "Auto-sync enabled" : "Auto-sync paused",
                                                        description: on
                                                            ? `Future periods will pull from ${file.name} automatically.`
                                                            : `${file.name} will no longer sync.`,
                                                        color: "brand",
                                                    });
                                                }}
                                            />
                                        </div>
                                    )}
                                    {file.status === "ready" && importable && (
                                        <Button size="sm" color="secondary" onClick={() => importToReport(file)}>
                                            Import to 10-Q
                                        </Button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* Connections rail */}
                <div className="flex flex-col gap-6">
                    {/* Google Cloud */}
                    <div className="flex flex-col gap-4 rounded-2xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
                        <div className="flex items-start justify-between">
                            <FeaturedIcon icon={Cloud01} color="brand" theme="light" size="md" />
                            {state.gcsBucket ? (
                                <BadgeWithDot color="success" size="sm" type="pill-color">
                                    Connected
                                </BadgeWithDot>
                            ) : (
                                <Badge color="gray" size="sm" type="pill-color">
                                    Off
                                </Badge>
                            )}
                        </div>
                        <div>
                            <h3 className="text-md font-semibold text-primary">Google Cloud Storage</h3>
                            <p className="mt-0.5 text-sm text-tertiary">
                                {state.gcsBucket
                                    ? `Watching gs://${state.gcsBucket} — new exports ingest automatically.`
                                    : "Stream GL extracts and trial balances straight from your bucket."}
                            </p>
                        </div>
                        {state.gcsBucket ? (
                            <div className="flex items-center gap-2 rounded-lg bg-secondary_subtle px-3 py-2">
                                <RefreshCw01 className="size-4 text-fg-success-secondary" />
                                <span className="font-mono text-xs text-secondary">gs://{state.gcsBucket}</span>
                            </div>
                        ) : (
                            <Button size="sm" color="primary" iconLeading={Cloud01} onClick={() => setGcsModalOpen(true)}>
                                Connect bucket
                            </Button>
                        )}
                    </div>

                    {/* Banks */}
                    <div className="flex flex-col gap-4 rounded-2xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
                        <div className="flex items-start justify-between">
                            <FeaturedIcon icon={Bank} color="brand" theme="light" size="md" />
                            {state.banksConnected ? (
                                <BadgeWithDot color="success" size="sm" type="pill-color">
                                    {state.banks.length} linked
                                </BadgeWithDot>
                            ) : (
                                <Badge color="gray" size="sm" type="pill-color">
                                    Off
                                </Badge>
                            )}
                        </div>
                        <div>
                            <h3 className="text-md font-semibold text-primary">Bank accounts</h3>
                            <p className="mt-0.5 text-sm text-tertiary">
                                {state.banksConnected
                                    ? "Live balances feed Cash and cash equivalents."
                                    : "Link accounts read-only and pull live balances into the report."}
                            </p>
                        </div>

                        {state.banksConnected ? (
                            <>
                                <ul className="flex flex-col gap-2">
                                    {state.banks.map((account) => (
                                        <li key={account.id} className="flex items-center justify-between rounded-lg bg-secondary_subtle px-3 py-2.5">
                                            <div>
                                                <p className="text-sm font-medium text-secondary">
                                                    {account.institution} ··{account.mask}
                                                </p>
                                                <p className="text-xs text-quaternary">
                                                    {account.name} · synced {account.lastSync.toLowerCase()}
                                                </p>
                                            </div>
                                            <p className="font-mono text-sm font-semibold text-primary">{formatCurrency(account.balance)}</p>
                                        </li>
                                    ))}
                                </ul>
                                <Button size="sm" color="primary" iconLeading={RefreshCw01} onClick={pullBankBalances}>
                                    Pull balances into 10-Q
                                </Button>
                            </>
                        ) : (
                            <Button size="sm" color="primary" iconLeading={LinkExternal01} onClick={() => setBankModalOpen(true)}>
                                Link bank account
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* GCS modal */}
            <ModalOverlay isOpen={gcsModalOpen} onOpenChange={setGcsModalOpen} isDismissable>
                <Modal className="max-w-md">
                    <Dialog>
                        <div className="w-full rounded-2xl bg-primary p-6 shadow-xl">
                            <div className="flex items-start justify-between">
                                <FeaturedIcon icon={Cloud01} color="brand" theme="light" size="lg" />
                                <button
                                    aria-label="Close"
                                    onClick={() => setGcsModalOpen(false)}
                                    className="cursor-pointer rounded-md p-1.5 text-fg-quaternary transition duration-100 ease-linear hover:bg-primary_hover"
                                >
                                    <XClose className="size-5" />
                                </button>
                            </div>
                            <h2 className="mt-4 text-lg font-semibold text-primary">Connect Google Cloud Storage</h2>
                            <p className="mt-1 text-sm text-tertiary">
                                Inline watches the bucket and ingests new exports automatically. Read-only service account, SOC 2 controls.
                            </p>
                            <div className="mt-5">
                                <Input
                                    label="Bucket"
                                    value={bucketName}
                                    onChange={setBucketName}
                                    placeholder="my-finance-bucket"
                                    hint="We’ll request roles/storage.objectViewer on this bucket."
                                />
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <Button size="md" color="secondary" onClick={() => setGcsModalOpen(false)}>
                                    Cancel
                                </Button>
                                <Button size="md" color="primary" isLoading={connecting} showTextWhileLoading onClick={connectGcs}>
                                    {connecting ? "Authorizing…" : "Connect bucket"}
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>

            {/* Bank modal */}
            <ModalOverlay isOpen={bankModalOpen} onOpenChange={setBankModalOpen} isDismissable>
                <Modal className="max-w-md">
                    <Dialog>
                        <div className="w-full rounded-2xl bg-primary p-6 shadow-xl">
                            <div className="flex items-start justify-between">
                                <FeaturedIcon icon={Bank} color="brand" theme="light" size="lg" />
                                <button
                                    aria-label="Close"
                                    onClick={() => setBankModalOpen(false)}
                                    className="cursor-pointer rounded-md p-1.5 text-fg-quaternary transition duration-100 ease-linear hover:bg-primary_hover"
                                >
                                    <XClose className="size-5" />
                                </button>
                            </div>
                            <h2 className="mt-4 text-lg font-semibold text-primary">Link a bank account</h2>
                            <p className="mt-1 text-sm text-tertiary">Read-only connection. Balances sync every hour and feed the balance sheet.</p>
                            <ul className="mt-5 flex flex-col gap-2">
                                {BANK_INSTITUTIONS.map((bank) => (
                                    <li key={bank.id}>
                                        <button
                                            onClick={() => connectBank(bank.id)}
                                            disabled={!!connectingBank}
                                            className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 ring-secondary ring-inset transition duration-100 ease-linear hover:bg-primary_hover disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <span
                                                className="flex size-9 items-center justify-center rounded-lg text-sm font-bold text-white"
                                                style={{ backgroundColor: bank.color }}
                                            >
                                                {bank.name[0]}
                                            </span>
                                            <span className="flex-1 text-left text-sm font-semibold text-secondary">{bank.name}</span>
                                            {connectingBank === bank.id ? (
                                                <Badge color="brand" size="sm" type="pill-color">
                                                    Connecting…
                                                </Badge>
                                            ) : (
                                                <Check className="size-4 text-fg-quaternary opacity-0 transition group-hover:opacity-100" />
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
};
