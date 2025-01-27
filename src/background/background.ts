/// <reference types="chrome"/>

import { store } from "@/store/store";
import { ClosureManager } from "../Utils/closureManager";
import { ScoreManager } from "../Utils/scoreManager";
import { TabManagerConfig, TabState } from "../types/types";
import { addClosedTab, clearClosedTabs } from "@/store/tabSlice";
import { StorageService } from "../services/storage";

interface ExtendedDownloadItem extends chrome.downloads.DownloadItem {
  tabId?: number;
}

interface ExtendedDownloadDelta extends chrome.downloads.DownloadDelta {
  tabId?: number;
}

class TabManager {
    private scoreManager!: ScoreManager;
    private closureManager!: ClosureManager;
    private storageService: StorageService;
    private visibleTabs: Set<number> = new Set();
    private lastUpdate: number = Date.now();
    private updateInterval: number = 60000; // 1 minute
    private extensionClosedTabs: Set<number> = new Set(); // Track tabs closed by extension

    private logTabsStatus() {
      chrome.tabs.query({}, tabs => {
        console.table(
          tabs.map(tab => {
            const state = tab.id ? this.scoreManager.getTabState(tab.id) : null;
            const decay = tab.id ? this.scoreManager.getDecayRate(tab.id, this.visibleTabs) : 0;
            const boost = tab.id ? this.scoreManager.calculateBoosts(tab.id, this.visibleTabs) : 0;
            return {
              'Tab ID': tab.id,
              'Title': tab.title,
              'Score': tab.id ? this.scoreManager.getTabScore(tab.id) : 0,
              'Decay': decay,
              'Boost': boost,
              'Is Playing Audio': tab.audible || false,
              'Is Visible': tab.id ? this.visibleTabs.has(tab.id) : false,
              'Has Unsaved Form': state?.hasUnsavedForm || false,
              'Has Pending Download': state?.hasPendingDownload || false,
              'Is Playing Media': state?.isPlaying || false,
              'Last Active': state?.lastActive || 'N/A',
            };
          })
        );
      });
    }
  
    constructor() {
      console.log('%cTabFlow Extension Initialized', 'color: #4CAF50; font-size: 20px; font-weight: bold;');
      this.storageService = new StorageService();
      
      // Load settings from storage
      chrome.storage.sync.get(['settings'], (result) => {
        this.initializeWithSettings(result.settings);
      });

      // Handle browser startup
      this.handleBrowserStartup();

      // Listen for settings updates
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message.type === 'SETTINGS_UPDATED') {
          console.log('%cSettings updated:', 'color: #2196F3; font-weight: bold;');
          console.table(message.settings);
          this.initializeWithSettings(message.settings);
          sendResponse({ success: true });
        }
      });
    }

    private async handleBrowserStartup(): Promise<void> {
      try {
        const isNewSession = await this.storageService.isNewBrowserSession();
        if (isNewSession) {
          console.log('%cNew browser session detected - Resetting tab scores', 'color: #4CAF50; font-size: 14px;');
          // Reset scores after a short delay to ensure all tabs are loaded
          setTimeout(() => {
            this.scoreManager?.resetAllScores();
            this.initializeExistingTabs();
          }, 2000);
        }
      } catch (error) {
        console.error('Error handling browser startup:', error);
      }
    }

    private initializeWithSettings(settings: any) {
      const config: TabManagerConfig = {
        specialDomains: new Set(settings?.specialDomains || ['mail.google.com', 'web.whatsapp.com']),
        countdownTimer: settings?.countdownTimer || 30,
        inactiveThreshold: settings?.inactiveThreshold || 0.0,
        batchIntervalTimer: settings?.batchIntervalTimer || 1
      };

      if (!this.scoreManager) {
        // First time initialization
        this.scoreManager = new ScoreManager(config);
        this.closureManager = new ClosureManager(this.scoreManager, config, this);
        this.initializeEventListeners();
        this.startUpdateInterval();
      } else {
        // Update existing instances
        this.scoreManager.updateConfig(config);
        this.closureManager = new ClosureManager(this.scoreManager, config, this);
      }

      console.log('%cTab Manager Settings:', 'color: #2196F3; font-weight: bold;');
      console.table({
        'Countdown Timer': `${config.countdownTimer} minutes`,
        'Inactive Threshold': config.inactiveThreshold,
        'Batch Interval': `${config.batchIntervalTimer} minutes`,
        'Special Domains': Array.from(config.specialDomains)
      });
      
      // Log current tabs status
      this.logTabsStatus();
    }
  
    private async initializeExistingTabs(): Promise<void> {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          const domain = new URL(tab.url || '').hostname;
          this.scoreManager.addTab(
            tab.id,
            domain,
            tab.title || '',
            tab.url || '',
            tab.favIconUrl || ''
          );
          if (tab.active) {
            this.visibleTabs.add(tab.id);
          }
        }
      }
      this.logTabsStatus();
    }

    private async initializeTab(tab: chrome.tabs.Tab): Promise<void> {
      if (!tab.id || !tab.url) {
        console.debug('Skipping tab initialization: Missing tab ID or URL');
        return;
      }

      try {
        const domain = new URL(tab.url).hostname;
        
        // Check if we have permission to access this tab
        const hasPermission = await chrome.permissions.contains({
          permissions: ['tabs'],
          origins: [tab.url]
        });

        if (!hasPermission) {
          console.log(`No permission to access tab ${tab.id} (${domain}). Initializing with basic info only.`);
          this.scoreManager.addTab(
            tab.id,
            domain,
            tab.title || '',
            tab.url,
            tab.favIconUrl || ''
          );
          return;
        }

        // Initialize with full access
        this.scoreManager.addTab(
          tab.id,
          domain,
          tab.title || '',
          tab.url,
          tab.favIconUrl || ''
        );

        if (tab.active) {
          this.visibleTabs.add(tab.id);
        }
      } catch (error) {
        console.error(`Tab initialization failed for tab ${tab.id}:`, error);
        // Still try to initialize with basic info on error
        if (tab.id && tab.url) {
          try {
            const domain = new URL(tab.url).hostname;
            this.scoreManager.addTab(
              tab.id,
              domain,
              tab.title || '',
              tab.url,
              tab.favIconUrl || ''
            );
          } catch (fallbackError) {
            console.error('Failed to initialize tab with basic info:', fallbackError);
          }
        }
      }
    }

  
  
  
  
  
    private initializeEventListeners(): void {
      // Tab Events
      chrome.tabs.onCreated.addListener(tab => this.initializeTab(tab));
      
      chrome.tabs.onRemoved.addListener((tabId, _) => {
        // If this tab wasn't closed by our extension, it was manually closed by the user
        if (!this.extensionClosedTabs.has(tabId)) {
          // Get tab info before it's fully removed
          chrome.tabs.get(tabId).then(async tab => {
            if (chrome.runtime.lastError) {
              // Tab might be already gone, try to get from score manager
              const state = this.scoreManager.getTabState(tabId);
              if (state) {
                const sessions = await chrome.sessions.getRecentlyClosed();
                const matchingSession = sessions.find(s => 
                  s.tab?.url === state.url && s.tab?.title === state.title
                );

                store.dispatch(addClosedTab({
                  id: tabId,
                  title: state.title,
                  url: state.url,
                  favicon: state.favicon || '',
                  closedAt: Date.now(),
                  sessionId: matchingSession?.tab?.sessionId
                }));
              }
            } else if (tab) {
              const sessions = await chrome.sessions.getRecentlyClosed();
              const matchingSession = sessions.find(s => 
                s.tab?.url === tab.url && s.tab?.title === tab.title
              );

              store.dispatch(addClosedTab({
                id: tab.id || 0,
                title: tab.title || '',
                url: tab.url || '',
                favicon: tab.favIconUrl || '',
                closedAt: Date.now(),
                sessionId: matchingSession?.tab?.sessionId
              }));
            }
          }).catch(async () => {
            // Tab info not available, fallback to score manager state
            const state = this.scoreManager.getTabState(tabId);
            if (state) {
              const sessions = await chrome.sessions.getRecentlyClosed();
              const matchingSession = sessions.find(s => 
                s.tab?.url === state.url && s.tab?.title === state.title
              );

              store.dispatch(addClosedTab({
                id: tabId,
                title: state.title,
                url: state.url,
                favicon: state.favicon || '',
                closedAt: Date.now(),
                sessionId: matchingSession?.tab?.sessionId
              }));
            }
          });
        }
        
        // Clean up
        this.extensionClosedTabs.delete(tabId);
        this.scoreManager.removeTab(tabId);
        this.visibleTabs.delete(tabId);
      });

      chrome.tabs.onActivated.addListener(({ tabId }) => {
        this.visibleTabs.clear();
        this.visibleTabs.add(tabId);
      });
  
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (!tab.url) return;
  
        const updates: Partial<TabState> = {};
  
        if (changeInfo.audible !== undefined) {
          updates.isPlaying = changeInfo.audible;
        }
  
        if (changeInfo.pinned !== undefined) {
          updates.isPinned = changeInfo.pinned;
        }
  
        if (Object.keys(updates).length > 0) {
          this.scoreManager.updateTabState(tabId, updates);
        }
      });
  
      // Download Events
      chrome.downloads.onCreated.addListener((downloadItem: ExtendedDownloadItem) => {
        if (downloadItem.tabId && downloadItem.tabId > 0) {
          this.scoreManager.updateTabState(downloadItem.tabId, {
            hasPendingDownload: true
          });
        }
      });
  
      chrome.downloads.onChanged.addListener((downloadDelta: ExtendedDownloadDelta) => {
        if (downloadDelta.state && downloadDelta.tabId && downloadDelta.tabId > 0) {
          const isComplete = downloadDelta.state.current === 'complete' || 
                            downloadDelta.state.current === 'interrupted';
          
          if (isComplete) {
            this.scoreManager.updateTabState(downloadDelta.tabId, {
              hasPendingDownload: false
            });
          }
        }
      });
  
      // Content Script Messages
      chrome.runtime.onMessage.addListener((message, sender) => {
        if (!sender.tab?.id) return;
        
        const tabId = sender.tab.id;
        
        switch (message.type) {
          case 'mediaStateChanged':
            this.scoreManager.updateTabState(tabId, {
              isPlaying: message.isPlaying
            });
            break;
            
          case 'formStateChanged':
            this.scoreManager.updateTabState(tabId, {
              hasUnsavedForm: message.hasUnsavedForm
            });
            break;
        }
      });
    }
  
  
    private startUpdateInterval(): void {
      setInterval(() => {
        const now = Date.now();
        const elapsedMinutes = (now - this.lastUpdate) / 60000;
        
        console.log('\n%cPeriodic Update - ' + new Date().toLocaleTimeString(), 'color: #9C27B0; font-size: 14px;');
        this.logTabsStatus();
        
        chrome.tabs.query({}, tabs => {
          tabs.forEach(tab => {
            if (tab.id) {
              this.scoreManager.updateScore(
                tab.id, 
                elapsedMinutes, 
                this.visibleTabs
              );
              this.closureManager.checkInactivity(tab.id);
            }
          });
          
          this.closureManager.processBatchClosure();
          this.lastUpdate = now;
        });
      }, this.updateInterval);
    }
  }
  
  // Initialize the tab manager when the extension is installed
  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install' || details.reason === 'update') {
      // Clear the closed tabs in IndexedDB and Redux store
      store.dispatch(clearClosedTabs());
      
      // Only clear sync storage settings, preserve other IndexedDB data
      chrome.storage.sync.get(['settings'], async (result) => {
        // Only preserve user settings, clear everything else
        chrome.storage.sync.clear();
        if (result.settings) {
          chrome.storage.sync.set({ settings: result.settings });
        }
      });
    }

    // Don't initialize TabManager immediately, wait for onboarding
    chrome.storage.local.get(['tutorialShown'], (result) => {
      if (result.tutorialShown) {
        new TabManager();
      } else {
        console.log('🎯 Waiting for onboarding completion before initializing TabManager...');
      }
    });
  });

  // Listen for changes in storage to detect when onboarding is complete
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.tutorialShown?.newValue === true) {
      console.log('🎉 Onboarding complete, initializing TabManager...');
      new TabManager();
    }
  });

  chrome.runtime.onSuspend.addListener(() => {
    // No need to clear storage on suspend as IndexedDB persists properly
    console.log('TabFlow Extension suspended');
  });