import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// HashRouter so the app works from any static host (GitHub Pages) without rewrite rules.
import { HashRouter, Route, Routes } from "react-router";
import { AppLayout } from "@/components/app/app-layout";
import { Dashboard } from "@/pages/dashboard";
import { DataSources } from "@/pages/data-sources";
import { Filings } from "@/pages/filings";
import { NotFound } from "@/pages/not-found";
import { ReportBuilder } from "@/pages/report-builder";
import { RouteProvider } from "@/providers/router-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { AppProvider } from "@/store/app-context";
import "@/styles/globals.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ThemeProvider>
            <HashRouter>
                <RouteProvider>
                    <AppProvider>
                        <Routes>
                            <Route element={<AppLayout />}>
                                <Route path="/" element={<Dashboard />} />
                                <Route path="/builder" element={<ReportBuilder />} />
                                <Route path="/data" element={<DataSources />} />
                                <Route path="/filings" element={<Filings />} />
                            </Route>
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </AppProvider>
                </RouteProvider>
            </HashRouter>
        </ThemeProvider>
    </StrictMode>,
);
