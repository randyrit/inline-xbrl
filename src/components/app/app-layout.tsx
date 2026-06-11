import { CheckCircle, Database01, File02, Home01, LifeBuoy01, LogIn01, LogOut01, Send01, Settings01, XClose } from "@untitledui/icons";
import { Outlet, useLocation } from "react-router";
import { AvatarLabelGroup } from "@/components/base/avatar/avatar-label-group";
import { identityInitials } from "@/lib/identity";
import { MobileNavigationHeader } from "@/components/application/app-navigation/base-components/mobile-header";
import { NavList } from "@/components/application/app-navigation/base-components/nav-list";
import { NavItemBase } from "@/components/application/app-navigation/base-components/nav-item";
import type { NavItemType } from "@/components/application/app-navigation/config";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { InlineLogo } from "@/components/app/inline-logo";
import { CURRENT_USER } from "@/lib/initial-data";
import { useApp } from "@/store/app-context";
import { cx } from "@/utils/cx";

const SIDEBAR_WIDTH = 280;

const navItems: NavItemType[] = [
    { label: "Dashboard", href: "/", icon: Home01 },
    { label: "Report Builder", href: "/builder", icon: File02 },
    { label: "Data Sources", href: "/data", icon: Database01 },
    { label: "Filings & Export", href: "/filings", icon: Send01 },
];

const footerItems: NavItemType[] = [
    { label: "Settings", href: "#settings", icon: Settings01 },
    { label: "Support", href: "#support", icon: LifeBuoy01 },
];

/** Profile pinned to the bottom of the nav: account holders show their display name,
    anonymous visitors show their generated Color-Expression-Animal identity. */
const ProfileCard = () => {
    const { identity, signIn, signOut, toast } = useApp();

    return (
        <div className="relative flex items-center gap-3 rounded-xl p-3 ring-1 ring-secondary ring-inset">
            {identity.isAccount ? (
                <AvatarLabelGroup size="md" src={CURRENT_USER.avatar} title={CURRENT_USER.name} subtitle={CURRENT_USER.email} status="online" />
            ) : (
                <div className="flex min-w-0 items-center gap-3">
                    <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ backgroundColor: identity.color }}
                    >
                        {identityInitials(identity)}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-primary">{identity.name}</p>
                        <p className="text-xs text-tertiary">Anonymous guest</p>
                    </div>
                </div>
            )}
            <button
                aria-label={identity.isAccount ? "Sign out" : "Sign in to demo account"}
                title={identity.isAccount ? "Sign out" : "Sign in as Randy Ritts (demo account)"}
                onClick={() => {
                    if (identity.isAccount) {
                        signOut();
                        toast({ title: "Signed out", description: "You’re now an anonymous guest with a fresh random name.", color: "brand" });
                    } else {
                        signIn();
                        toast({ title: `Signed in as ${CURRENT_USER.name}`, description: "Collaborators now see your display name.", color: "success" });
                    }
                }}
                className="absolute top-2 right-2 cursor-pointer rounded-md p-1.5 text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
            >
                {identity.isAccount ? <LogOut01 className="size-4" /> : <LogIn01 className="size-4" />}
            </button>
        </div>
    );
};

const Sidebar = ({ activeUrl }: { activeUrl: string }) => {
    const content = (
        <aside
            style={{ "--width": `${SIDEBAR_WIDTH}px` } as React.CSSProperties}
            className="flex h-full w-full max-w-full flex-col justify-between overflow-auto border-secondary bg-primary pt-4 md:border-r lg:w-(--width) lg:pt-5"
        >
            <div className="flex flex-col gap-4 px-4 lg:px-5">
                <InlineLogo />
                <BadgeWithDot color="success" type="modern" size="sm" className="w-max">
                    All systems synced
                </BadgeWithDot>
            </div>

            <NavList activeUrl={activeUrl} items={navItems} />

            <div className="mt-auto flex flex-col gap-4 px-4 py-4 lg:px-5 lg:py-5">
                <ul className="flex flex-col">
                    {footerItems.map((item) => (
                        <li key={item.label} className="py-px">
                            <NavItemBase icon={item.icon} href={item.href} type="link" current={false}>
                                {item.label}
                            </NavItemBase>
                        </li>
                    ))}
                </ul>

                <ProfileCard />
            </div>
        </aside>
    );

    return (
        <>
            <MobileNavigationHeader>{content}</MobileNavigationHeader>

            <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex">{content}</div>

            <div style={{ paddingLeft: SIDEBAR_WIDTH }} className="invisible hidden lg:sticky lg:top-0 lg:bottom-0 lg:left-0 lg:block" />
        </>
    );
};

const ToastViewport = () => {
    const { toasts, dismissToast } = useApp();

    return (
        <div className="pointer-events-none fixed right-4 bottom-4 z-100 flex w-full max-w-sm flex-col gap-3">
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className="pointer-events-auto flex items-start gap-3 rounded-xl bg-primary p-4 shadow-lg ring-1 ring-secondary duration-300 animate-in fade-in slide-in-from-bottom-2"
                >
                    <CheckCircle
                        className={cx(
                            "mt-0.5 size-5 shrink-0",
                            t.color === "success" && "text-fg-success-primary",
                            t.color === "brand" && "text-fg-brand-primary",
                            t.color === "warning" && "text-fg-warning-primary",
                            t.color === "error" && "text-fg-error-primary",
                        )}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <p className="text-sm font-semibold text-primary">{t.title}</p>
                        {t.description && <p className="text-sm text-tertiary">{t.description}</p>}
                    </div>
                    <button
                        aria-label="Dismiss"
                        onClick={() => dismissToast(t.id)}
                        className="cursor-pointer rounded-md p-1 text-fg-quaternary transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover"
                    >
                        <XClose className="size-4" />
                    </button>
                </div>
            ))}
        </div>
    );
};

export const AppLayout = () => {
    const location = useLocation();

    return (
        <div className="flex min-h-dvh flex-col bg-secondary_subtle lg:flex-row">
            <Sidebar activeUrl={location.pathname} />
            <main className="min-w-0 flex-1">
                <Outlet />
            </main>
            <ToastViewport />
        </div>
    );
};
