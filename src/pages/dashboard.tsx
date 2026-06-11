import { ArrowRight, Bank, CheckDone01, Cloud01, Database01, File02, MagicWand01, Send01, UploadCloud01 } from "@untitledui/icons";
import { useNavigate } from "react-router";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { ProgressBarCircle } from "@/components/base/progress-indicators/progress-circles";
import { ProgressBarBase } from "@/components/base/progress-indicators/progress-indicators";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { COLLABORATORS, CURRENT_USER } from "@/lib/initial-data";
import { COMPANY, DOC_META, docProgress, tagStats } from "@/lib/xbrl";
import type { DocType } from "@/lib/types";
import { useApp } from "@/store/app-context";
import { cx } from "@/utils/cx";

const FilingCard = ({ doc }: { doc: DocType }) => {
    const { state, dispatch } = useApp();
    const navigate = useNavigate();
    const progress = docProgress(state, doc);
    const stats = tagStats(state, doc);
    const meta = DOC_META[doc];
    const tasks = state.tasks.filter((t) => t.doc === doc);
    const tasksDone = tasks.filter((t) => t.done).length;

    return (
        <div className="flex flex-col gap-5 rounded-2xl bg-primary p-5 shadow-xs ring-1 ring-secondary lg:p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <FeaturedIcon icon={File02} color="brand" theme="light" size="md" />
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-primary">Form {doc}</h3>
                            <BadgeWithDot color={progress >= 60 ? "success" : "warning"} size="sm" type="pill-color">
                                In construction
                            </BadgeWithDot>
                        </div>
                        <p className="text-sm text-tertiary">
                            {meta.period} · due {meta.due}
                        </p>
                    </div>
                </div>
                <ProgressBarCircle value={progress} size="xxs" />
            </div>

            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-secondary_subtle p-3">
                    <p className="text-xs font-medium text-tertiary">Tag coverage</p>
                    <p className="mt-0.5 text-lg font-semibold text-brand-secondary">{stats.coverage}%</p>
                </div>
                <div className="rounded-lg bg-secondary_subtle p-3">
                    <p className="text-xs font-medium text-tertiary">Suggestions</p>
                    <p className="mt-0.5 text-lg font-semibold text-primary">{stats.suggested}</p>
                </div>
                <div className="rounded-lg bg-secondary_subtle p-3">
                    <p className="text-xs font-medium text-tertiary">Tasks</p>
                    <p className="mt-0.5 text-lg font-semibold text-primary">
                        {tasksDone}<span className="text-sm font-medium text-quaternary">/{tasks.length}</span>
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-between gap-4">
                <div className="flex -space-x-2">
                    {[CURRENT_USER, ...COLLABORATORS].map((person) => (
                        <Avatar key={person.id} src={person.avatar} alt={person.name} size="xs" className="ring-[1.5px] ring-bg-primary" />
                    ))}
                </div>
                <Button
                    size="sm"
                    color={doc === "10-Q" ? "primary" : "secondary"}
                    iconTrailing={ArrowRight}
                    onClick={() => {
                        dispatch({ type: "SET_DOC", doc });
                        navigate("/builder");
                    }}
                >
                    Open in builder
                </Button>
            </div>
        </div>
    );
};

const TasksCard = () => {
    const { state, dispatch, toast } = useApp();
    const remaining = state.tasks.filter((t) => !t.done).length;

    return (
        <div className="flex flex-col rounded-2xl bg-primary shadow-xs ring-1 ring-secondary">
            <div className="flex items-center justify-between gap-4 border-b border-secondary px-5 py-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-md font-semibold text-primary">Remaining tasks</h3>
                    <Badge color="brand" size="sm" type="pill-color">
                        {remaining} open
                    </Badge>
                </div>
                <CheckDone01 className="size-5 text-fg-quaternary" />
            </div>
            <ul className="flex flex-col px-2 py-2">
                {(["10-Q", "10-K"] as DocType[]).map((doc) => (
                    <li key={doc} className="flex flex-col">
                        <p className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-quaternary uppercase">Form {doc}</p>
                        {state.tasks
                            .filter((t) => t.doc === doc)
                            .map((task) => (
                                <label
                                    key={task.id}
                                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition duration-100 ease-linear hover:bg-primary_hover"
                                >
                                    <Checkbox
                                        isSelected={task.done}
                                        onChange={(done) => {
                                            dispatch({ type: "TOGGLE_TASK", id: task.id });
                                            if (done) toast({ title: "Task completed", description: task.label, color: "success" });
                                        }}
                                    />
                                    <span className={cx("text-sm font-medium", task.done ? "text-quaternary line-through" : "text-secondary")}>
                                        {task.label}
                                    </span>
                                </label>
                            ))}
                    </li>
                ))}
            </ul>
        </div>
    );
};

const ConnectionsCard = () => {
    const { state } = useApp();
    const navigate = useNavigate();

    const items = [
        {
            icon: Cloud01,
            label: "Google Cloud Storage",
            detail: state.gcsBucket ? `gs://${state.gcsBucket}` : "Not connected",
            connected: !!state.gcsBucket,
        },
        {
            icon: Bank,
            label: "Linked bank accounts",
            detail: state.banksConnected ? `${state.banks.length} accounts syncing` : "Not connected",
            connected: state.banksConnected,
        },
        {
            icon: UploadCloud01,
            label: "Uploaded files",
            detail: `${state.files.length} files in workspace`,
            connected: true,
        },
    ];

    return (
        <div className="flex flex-col gap-1 rounded-2xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
            <div className="mb-2 flex items-center justify-between">
                <h3 className="text-md font-semibold text-primary">Data sources</h3>
                <Button size="sm" color="link-color" iconTrailing={ArrowRight} onClick={() => navigate("/data")}>
                    Manage
                </Button>
            </div>
            {items.map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-lg px-1 py-2">
                    <FeaturedIcon icon={item.icon} color={item.connected ? "brand" : "gray"} theme="light" size="sm" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-secondary">{item.label}</p>
                        <p className="truncate text-xs text-tertiary">{item.detail}</p>
                    </div>
                    <BadgeWithDot color={item.connected ? "success" : "gray"} size="sm" type="modern">
                        {item.connected ? "Live" : "Off"}
                    </BadgeWithDot>
                </div>
            ))}
        </div>
    );
};

const ActivityCard = () => {
    const { state } = useApp();

    return (
        <div className="flex flex-col rounded-2xl bg-primary shadow-xs ring-1 ring-secondary">
            <div className="border-b border-secondary px-5 py-4">
                <h3 className="text-md font-semibold text-primary">Activity</h3>
            </div>
            <ul className="flex flex-col gap-1 px-3 py-3">
                {state.activity.slice(0, 6).map((event) => (
                    <li key={event.id} className="flex items-start gap-3 rounded-lg px-2 py-2">
                        {event.avatar ? (
                            <Avatar src={event.avatar} alt={event.actor} size="sm" />
                        ) : (
                            <FeaturedIcon icon={Send01} color="brand" theme="light" size="sm" />
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="text-sm text-tertiary">
                                <span className="font-semibold text-secondary">{event.actor}</span> {event.text}
                            </p>
                            <p className="mt-0.5 text-xs text-quaternary">{event.time}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export const Dashboard = () => {
    const { state, dispatch } = useApp();
    const navigate = useNavigate();
    const stats10q = tagStats(state, "10-Q");

    return (
        <div className="flex flex-col gap-6 px-4 py-6 lg:px-8 lg:py-8">
            {/* Page header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                        <p className="text-sm font-semibold text-brand-secondary">{COMPANY.name}</p>
                        <Badge color="blue" size="sm" type="pill-color">
                            {COMPANY.exchange}: {COMPANY.ticker}
                        </Badge>
                    </div>
                    <h1 className="text-display-xs font-semibold text-primary">Good morning, {CURRENT_USER.name.split(" ")[0]}</h1>
                    <p className="text-md text-tertiary">
                        Your Form 10-Q is {docProgress(state, "10-Q")}% complete — {DOC_META["10-Q"].due} EDGAR deadline.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button size="md" color="secondary" iconLeading={Database01} onClick={() => navigate("/data")}>
                        Ingest data
                    </Button>
                    <Button
                        size="md"
                        color="primary"
                        iconLeading={MagicWand01}
                        onClick={() => {
                            dispatch({ type: "SET_DOC", doc: "10-Q" });
                            navigate("/builder");
                        }}
                    >
                        Continue 10-Q
                    </Button>
                </div>
            </div>

            {/* AI tagging callout */}
            {stats10q.suggested > 0 && (
                <div className="flex items-center gap-3 rounded-xl bg-brand-25 px-4 py-3 ring-1 ring-brand-200 ring-inset">
                    <MagicWand01 className="size-5 shrink-0 text-fg-brand-primary" />
                    <p className="flex-1 text-sm text-brand-secondary">
                        <span className="font-semibold">{stats10q.suggested} AI tag suggestions</span> are waiting for review on the 10-Q.
                    </p>
                    <Button size="sm" color="link-color" iconTrailing={ArrowRight} onClick={() => navigate("/builder")}>
                        Review
                    </Button>
                </div>
            )}

            {/* Filing progress cards */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <FilingCard doc="10-Q" />
                <FilingCard doc="10-K" />
            </div>

            {/* Tasks + right rail */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="xl:col-span-2">
                    <TasksCard />
                </div>
                <div className="flex flex-col gap-6">
                    <ConnectionsCard />
                    <ActivityCard />
                </div>
            </div>

            {/* Overall readiness strip */}
            <div className="flex flex-col gap-3 rounded-2xl bg-brand-950 p-5 lg:p-6">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">EDGAR readiness — Form 10-Q</p>
                    <p className="text-sm font-semibold text-brand-300">{docProgress(state, "10-Q")}%</p>
                </div>
                <ProgressBarBase value={docProgress(state, "10-Q")} className="bg-white/10" progressClassName="bg-brand-400" />
                <p className="text-xs text-brand-200">
                    {tagStats(state, "10-Q").tagged} of {tagStats(state, "10-Q").taggable} line items tagged ·{" "}
                    {state.tasks.filter((t) => t.doc === "10-Q" && !t.done).length} tasks remaining
                </p>
            </div>
        </div>
    );
};
