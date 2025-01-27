import { TabManagerConfig, TabState } from "../types/types";
import { DecayRates } from "../types/userPreferences";

export class ScoreManager {
    private tabScores: Map<number, number> = new Map();
    private tabStates: Map<number, TabState> = new Map();
    private config: TabManagerConfig;
    private decayRates: DecayRates;
    private DEFAULT_SCORE = 2.0;
    
    constructor(config: TabManagerConfig) {
      this.config = config;
      // Initialize with medium aggressiveness by default
      this.decayRates = {
        normal: -0.067,
        special: -0.033
      };
      
      // Load user preferences for decay rates from sync storage
      chrome.storage.sync.get(['settings'], (result) => {
        if (result.settings?.decayRates) {
          this.decayRates = result.settings.decayRates;
          console.log('%cDecay rates loaded from settings:', 'color: #4CAF50;', this.decayRates);
        }
      });

      // Listen for settings changes
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync' && changes.settings?.newValue?.decayRates) {
          this.decayRates = changes.settings.newValue.decayRates;
          console.log('%cDecay rates updated:', 'color: #4CAF50;', this.decayRates);
        }
      });

      console.log('%cScore Manager Active', 'color: #E91E63; font-size: 14px;');
      console.log('Initial Config:', {
        specialDomains: Array.from(config.specialDomains),
        countdownTimer: config.countdownTimer,
        inactiveThreshold: config.inactiveThreshold,
        batchIntervalTimer: config.batchIntervalTimer,
        decayRates: this.decayRates
      });
    }
  
    private isSpecialDomain(domain: string): boolean {
      // Convert domain to lowercase for case-insensitive comparison
      domain = domain.toLowerCase();
      
      // Check if the domain or any of its parent domains are in specialDomains
      return Array.from(this.config.specialDomains).some(specialDomain => {
        specialDomain = specialDomain.toLowerCase();
        return domain === specialDomain || domain.endsWith('.' + specialDomain);
      });
    }

    public getDecayRate(tabId: number, visibleTabs: Set<number>): number {
      const state = this.tabStates.get(tabId);
      if (!state) return 0;
      
      // No decay for active or important tabs
      if (visibleTabs.has(tabId) || 
          state.isPlaying || 
          state.hasUnsavedForm || 
          state.hasPendingDownload ||
          state.isPinned) {
        return 0;
      }

      const timeSinceLastActive = (Date.now() - state.lastActive) / (1000 * 60); // in minutes
      
      // Get base decay rate based on domain type
      const isSpecialDomain = this.isSpecialDomain(state.domain);
      let baseDecay = isSpecialDomain ? this.decayRates.special : this.decayRates.normal;

      // Apply time-based scaling to make decay more aggressive over time
      const timeScale = Math.min(1 + (timeSinceLastActive / 60), 2); // Max 2x decay after 1 hour
      const finalDecay = baseDecay * timeScale;

      // Log scoring information
      console.log(
        `%c🎯 Tab Score [${state.domain}]:%c\n` +
        `├─ Type: ${isSpecialDomain ? '⭐ Special' : '📄 Normal'}\n` +
        `├─ Base Decay: ${baseDecay.toFixed(3)}\n` +
        `├─ Time Scale: ${timeScale.toFixed(2)}x\n` +
        `└─ Final Decay: ${finalDecay.toFixed(3)}`,
        'color: #2196F3; font-weight: bold;',
        'color: #666; font-family: monospace;'
      );

      return finalDecay;
    }

    public calculateBoosts(tabId: number, visibleTabs: Set<number>): number {
      const state = this.tabStates.get(tabId);
      if (!state) return 0;
      
      let boost = 0;
      
      // Visible boost
      if (visibleTabs.has(tabId)) boost += 0.7;
      
      // Hidden tab boosts - these apply even when tab is not visible
      if (state.isPlaying) boost += 1.0; // Increased to overcome decay
      if (state.hasUnsavedForm) boost += 0.8; // Increased to overcome decay
      if (state.hasPendingDownload) boost += 1.5; // Increased to overcome decay
      
      // Domain boost - if any tab with same domain is visible
      const hasDomainVisible = Array.from(visibleTabs).some(visibleTabId => {
        if (visibleTabId === tabId) return false; // Don't boost for own visibility
        const tab = this.tabStates.get(visibleTabId);
        if (!tab) return false;

        // Check if domains match or are subdomains of each other
        const domain1 = state.domain.toLowerCase();
        const domain2 = tab.domain.toLowerCase();
        return domain1 === domain2 || 
               domain1.endsWith('.' + domain2) || 
               domain2.endsWith('.' + domain1);
      });

      if (hasDomainVisible && !state.isPinned) {
        boost += 0.2; // Small boost for related domain tabs
      }
      
      return boost;
    }

    public resetAllScores(): void {
      for (const [tabId] of this.tabScores) {
        this.tabScores.set(tabId, this.DEFAULT_SCORE);
      }
      console.log('%cAll tab scores reset to default', 'color: #E91E63; font-size: 14px;');
    }

    updateScore(tabId: number, elapsedMinutes: number, visibleTabs: Set<number>): number {
      const currentScore = this.getTabScore(tabId);
      const decayRate = this.getDecayRate(tabId, visibleTabs);
      const boostRate = this.calculateBoosts(tabId, visibleTabs);
      
      // Apply both decay and boost, then clamp between 0 and 2
      const scoreChange = (decayRate + boostRate) * elapsedMinutes;
      const newScore = Math.min(2.0, Math.max(0.0, currentScore + scoreChange));
      
      this.tabScores.set(tabId, newScore);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`Tab ${tabId} score updated:`, {
          previousScore: currentScore,
          newScore,
          decayRate,
          boostRate,
          elapsedMinutes,
          scoreChange
        });
      }
      
      return newScore;
    }
  
    public addTab(tabId: number, domain: string, title: string, url: string = '', favicon: string = ''): void {
      // Initialize with default score
      this.tabScores.set(tabId, this.DEFAULT_SCORE);
      
      // Initialize tab state
      this.tabStates.set(tabId, {
        id: tabId,
        url,
        title,
        domain,
        favicon,
        score: this.DEFAULT_SCORE,
        lastActive: Date.now(),
        isPlaying: false,
        hasUnsavedForm: false,
        hasPendingDownload: false,
        isPinned: false
      });
    }
  
    removeTab(tabId: number): void {
      this.tabStates.delete(tabId);
      this.tabScores.delete(tabId);
    }
  
    updateTabState(tabId: number, updates: Partial<TabState>): void {
      const state = this.tabStates.get(tabId);
      if (state) {
        Object.assign(state, updates);
      }
    }
  
    getTabScore(tabId: number): number {
      return this.tabScores.get(tabId) ?? 0;
    }
  
    getTabState(tabId: number): TabState | undefined {
      return this.tabStates.get(tabId);
    }

    public updateConfig(config: TabManagerConfig): void {
      this.config = config;
      console.log('%cScore Manager config updated:', 'color: #4CAF50;', {
        specialDomains: Array.from(config.specialDomains),
        countdownTimer: config.countdownTimer,
        inactiveThreshold: config.inactiveThreshold,
        batchIntervalTimer: config.batchIntervalTimer
      });
    }
  }