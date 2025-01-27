export interface TabState {
    id: number;
    url: string;
    title: string;
    score: number;
    domain: string;
    lastActive: number;
    isPlaying: boolean;
    hasUnsavedForm: boolean;
    hasPendingDownload: boolean;
    isPinned: boolean;
    countdownStartTime?: number;
    favicon?: string;
    hasContentScript?: boolean;
    error?: string;
}

export interface TabManagerConfig {
    specialDomains: Set<string>;
    countdownTimer: number;
    inactiveThreshold: number;
    batchIntervalTimer: number;
}

export interface ClosedTab {
    id: number;
    title: string;
    url: string;
    favicon: string;
    closedAt: number;
}