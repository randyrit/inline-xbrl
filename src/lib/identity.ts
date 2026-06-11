import { CURRENT_USER } from "./initial-data";

/** Anonymous visitors get a `Color Expression Animal` name; the color drives their cursor. */
const COLORS: { word: string; hex: string }[] = [
    { word: "Orange", hex: "#F79009" },
    { word: "Coral", hex: "#F04438" },
    { word: "Magenta", hex: "#EE46BC" },
    { word: "Violet", hex: "#7A5AF8" },
    { word: "Indigo", hex: "#444CE7" },
    { word: "Sky", hex: "#0BA5EC" },
    { word: "Teal", hex: "#15B79E" },
    { word: "Green", hex: "#17B26A" },
    { word: "Lime", hex: "#66C61C" },
    { word: "Amber", hex: "#EAAA08" },
    { word: "Rose", hex: "#F63D68" },
    { word: "Cobalt", hex: "#2970FF" },
];

const EXPRESSIONS = [
    "Happy", "Sleepy", "Curious", "Brave", "Dizzy", "Cheerful", "Sneaky", "Calm",
    "Witty", "Jumpy", "Mellow", "Plucky", "Zesty", "Dreamy", "Spry", "Chipper",
];

const ANIMALS = [
    "Bamboo", "Panda", "Otter", "Falcon", "Lynx", "Quokka", "Narwhal", "Gecko",
    "Heron", "Koala", "Pangolin", "Marmot", "Ibex", "Toucan", "Axolotl", "Wombat",
];

export interface Identity {
    id: string;
    name: string;
    color: string;
    /** True for signed-in account holders — they show their real display name. */
    isAccount: boolean;
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const generateAnonymousIdentity = (): Identity => {
    const color = pick(COLORS);
    return {
        id: crypto.randomUUID(),
        name: `${color.word} ${pick(EXPRESSIONS)} ${pick(ANIMALS)}`,
        color: color.hex,
        isAccount: false,
    };
};

const STORAGE_KEY = "inline-identity-v1";

/** Identity persists for the browser session — every new visitor gets a fresh random name. */
export const loadIdentity = (): Identity => {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as Identity;
    } catch {
        // fall through to a fresh identity
    }
    const identity = generateAnonymousIdentity();
    saveIdentity(identity);
    return identity;
};

export const saveIdentity = (identity: Identity): void => {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    } catch {
        // Session storage unavailable — identity just won't survive a refresh.
    }
};

/** "Signing in" to the demo account keeps the session id but swaps to the real display name. */
export const signInIdentity = (current: Identity): Identity => ({
    ...current,
    name: CURRENT_USER.name,
    color: "#155EEF",
    isAccount: true,
});

export const signOutIdentity = (current: Identity): Identity => {
    const anon = generateAnonymousIdentity();
    return { ...anon, id: current.id };
};

/** Initials for the avatar circle, e.g. "Orange Happy Bamboo" → "OB". */
export const identityInitials = (identity: Identity): string => {
    const parts = identity.name.split(" ");
    return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
};
