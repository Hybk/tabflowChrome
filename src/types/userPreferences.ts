export type AggressivenessLevel = 'high' | 'medium' | 'low';

export interface DecayRates {
    normal: number;
    special: number;
}

export interface AggressivenessSettings {
    high: DecayRates;
    medium: DecayRates;
    low: DecayRates;
}

export interface FrequentDomain {
    domain: string;
    isSelected: boolean;
}

export interface UserPreferences {
    aggressivenessLevel: AggressivenessLevel;
    frequentDomains: FrequentDomain[];
    customDecayRates: DecayRates;
}
