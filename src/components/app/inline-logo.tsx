import { cx } from "@/utils/cx";

/** The Inline brand mark: three ledger lines with a bright tagging dot. */
export const InlineLogo = ({ className }: { className?: string }) => (
    <div className={cx("flex items-center gap-2.5", className)}>
        <svg viewBox="0 0 32 32" aria-hidden="true" className="size-8 shrink-0">
            <rect width="32" height="32" rx="8" className="fill-brand-600" />
            <path d="M9 10.5h14M9 16h7M9 21.5h14" stroke="white" strokeWidth="3" strokeLinecap="round" />
            <circle cx="21.5" cy="16" r="2.75" fill="#00F0FF" />
        </svg>
        <span className="text-lg font-semibold tracking-tight text-primary">
            Inline
            <span className="ml-2 rounded-md bg-brand-50 px-1.5 py-0.5 align-middle text-[10px] font-bold tracking-wide text-brand-700 uppercase ring-1 ring-brand-200 ring-inset">
                XBRL
            </span>
        </span>
    </div>
);
