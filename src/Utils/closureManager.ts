import { ScoreManager } from "./scoreManager";
import { TabManagerConfig} from "../types/types";
import { store } from '../store/store';
import { addClosedTab } from '../store/tabSlice';

export class ClosureManager {
  private scoreManager: ScoreManager;
  private config: TabManagerConfig;
  private tabsToClose: Set<number> = new Set();
  private lastBatchTime: number = Date.now();
  private inactiveQueue: Map<number, number> = new Map(); // Tabs in countdown stage
  private closureQueue: number[] = []; // Tabs ready for batch closure
  private isProcessingBatch = false;
  private tabManager: any; // Reference to TabManager

  constructor(
    scoreManager: ScoreManager,
    config: TabManagerConfig,
    tabManager: any
  ) {
    this.scoreManager = scoreManager;
    this.config = config;
    this.tabManager = tabManager;
    
    console.log('%cClosure Manager Active', 'color: #795548; font-size: 14px;');
    console.log('Closure Settings:', {
      inactiveThreshold: config.inactiveThreshold,
      countdownTimer: `${config.countdownTimer} minutes`,
      batchIntervalTimer: `${config.batchIntervalTimer} minutes`
    });
  }

  checkInactivity(tabId: number): void {
    const score = this.scoreManager.getTabScore(tabId);
    const state = this.scoreManager.getTabState(tabId);
    
    if (!state || state.isPinned) return;

    // If score is above threshold, remove from all queues
    if (score > this.config.inactiveThreshold) {
      if (this.inactiveQueue.has(tabId)) {
        console.log(`%cCancelling countdown for tab ${tabId} - score increased to ${score}`, 'color: #4CAF50; font-weight: bold;');
      }
      this.inactiveQueue.delete(tabId);
      this.closureQueue = this.closureQueue.filter(id => id !== tabId);
      this.tabsToClose.delete(tabId);
      return;
    }

    // Only start countdown if not already in any queue
    if (score <= this.config.inactiveThreshold && 
        !this.inactiveQueue.has(tabId) && 
        !this.closureQueue.includes(tabId) && 
        !this.tabsToClose.has(tabId)) {
      this.inactiveQueue.set(tabId, Date.now());
      console.log(`%cStarting countdown for tab ${tabId}`, 'color: #FF9800; font-weight: bold;', {
        title: state.title,
        score,
        threshold: this.config.inactiveThreshold,
        countdownTimer: `${this.config.countdownTimer} minutes`
      });
    }
  }

  async processBatchClosure(): Promise<void> {
    if (this.isProcessingBatch) return;
    this.isProcessingBatch = true;

    try {
      const now = Date.now();
      
      // First, check countdown completion
      const countdownDuration = this.config.countdownTimer * 60 * 1000;
      
      // Move completed countdowns to closure queue
      for (const [tabId, startTime] of this.inactiveQueue.entries()) {
        const score = this.scoreManager.getTabScore(tabId);
        
        // Remove from countdown if score increased
        if (score > this.config.inactiveThreshold) {
          console.log(`%cRemoving tab ${tabId} from countdown - score increased to ${score}`, 'color: #4CAF50; font-weight: bold;');
          this.inactiveQueue.delete(tabId);
          continue;
        }
        
        // Move to closure queue if countdown completed
        if (now - startTime >= countdownDuration) {
          if (!this.closureQueue.includes(tabId)) {
            this.closureQueue.push(tabId);
            console.log(`%cTab ${tabId} countdown complete, moving to batch closure`, 'color: #4CAF50; font-weight: bold;');
          }
          this.inactiveQueue.delete(tabId);
        }
      }

      // Log countdown status
      if (this.inactiveQueue.size > 0) {
        console.log('%cCountdown Status:', 'color: #FF9800; font-weight: bold;');
        console.table(Array.from(this.inactiveQueue.entries()).map(([tabId, startTime]) => ({
          'Tab ID': tabId,
          'Title': this.scoreManager.getTabState(tabId)?.title || 'Unknown',
          'Score': this.scoreManager.getTabScore(tabId),
          'Time Left (mins)': Math.max(0, 
            this.config.countdownTimer - ((now - startTime) / (60 * 1000))
          ).toFixed(1)
        })));
      }
      
      // Process first batch immediately, subsequent batches after interval
      const isFirstBatch = this.lastBatchTime === 0;
      const elapsedMinutes = (now - this.lastBatchTime) / 60000;
      
      // Check closure queue for score changes before processing
      this.closureQueue = this.closureQueue.filter(tabId => {
        const score = this.scoreManager.getTabScore(tabId);
        const state = this.scoreManager.getTabState(tabId);
        if (score > this.config.inactiveThreshold) {
          console.log(`%cRemoving tab ${tabId} from batch queue - score increased to ${score}`, 'color: #4CAF50; font-weight: bold;');
          return false;
        }
        return state && !state.isPinned;
      });
      
      if ((isFirstBatch || elapsedMinutes >= this.config.batchIntervalTimer) && this.closureQueue.length > 0) {
        console.log('%cProcessing Batch Closure', 'color: #795548; font-size: 14px; font-weight: bold;');
        
        // Get batch size
        const batchSize = Math.min(this.closureQueue.length, this.closureQueue.length >= 10 ? 5 : 2);
        const batch = this.closureQueue.slice(0, batchSize);
        
        // Final score check before closing
        const eligibleTabs = batch.filter(tabId => {
          const score = this.scoreManager.getTabScore(tabId);
          const state = this.scoreManager.getTabState(tabId);
          
          if (score > this.config.inactiveThreshold) {
            console.log(`%cSkipping tab ${tabId} - score increased to ${score} during batch processing`, 'color: #4CAF50; font-weight: bold;');
            // Remove from closure queue
            this.closureQueue = this.closureQueue.filter(id => id !== tabId);
            return false;
          }
          
          return state && !state.isPinned;
        });
        
        if (eligibleTabs.length > 0) {
          // Remove processed tabs from the queue
          this.closureQueue = this.closureQueue.filter(id => !eligibleTabs.includes(id));
          
          console.log('%cClosing Batch:', 'color: #D32F2F; font-weight: bold;', {
            batchSize: eligibleTabs.length,
            remainingTabs: this.closureQueue.length,
            tabs: eligibleTabs.map(tabId => ({
              id: tabId,
              title: this.scoreManager.getTabState(tabId)?.title,
              score: this.scoreManager.getTabScore(tabId)
            }))
          });
          
          // Close tabs
          await this.closeTabs(eligibleTabs);
        }
        
        this.lastBatchTime = now;
      }
    } finally {
      this.isProcessingBatch = false;
    }
  }

  private async closeTabs(tabIds: number[]): Promise<void> {
    // Add all tabs to tabsToClose set to prevent re-entry into countdown
    tabIds.forEach(id => this.tabsToClose.add(id));
    
    for (const tabId of tabIds) {
      // Final score check right before closing
      const score = this.scoreManager.getTabScore(tabId);
      if (score > this.config.inactiveThreshold) {
        console.log(`%cAborting close for tab ${tabId} - score increased to ${score} during closure`, 'color: #4CAF50; font-weight: bold;');
        this.tabsToClose.delete(tabId);
        continue;
      }
      
      await this.closeTab(tabId);
    }
  }

  private async closeTab(tabId: number): Promise<void> {
    const state = this.scoreManager.getTabState(tabId);
    const score = this.scoreManager.getTabScore(tabId);
    
    // Final safety check before closing
    if (state && 
        score <= this.config.inactiveThreshold && 
        !state.isPlaying && 
        !state.hasUnsavedForm && 
        !state.hasPendingDownload && 
        !state.isPinned) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab) return;

        // Skip chrome:// URLs
        if (tab.url?.startsWith('chrome://')) {
          console.log(`%cSkipping chrome:// URL tab ${tabId}`, 'color: #FF9800; font-weight: bold;');
          this.tabsToClose.delete(tabId);
          return;
        }
        
        // One last score check
        const finalScore = this.scoreManager.getTabScore(tabId);
        if (finalScore > this.config.inactiveThreshold) {
          console.log(`%cFinal abort for tab ${tabId} - score increased to ${finalScore} at last check`, 'color: #4CAF50; font-weight: bold;');
          this.tabsToClose.delete(tabId);
          return;
        }
        
        // Mark this tab as being closed by the extension
        this.tabManager.extensionClosedTabs.add(tabId);

        // Get session ID for better restoration
        const sessions = await chrome.sessions.getRecentlyClosed();
        const matchingSession = sessions.find(s => 
          s.tab?.url === tab.url && s.tab?.title === tab.title
        );

        // Store tab info before closing
        const tabInfo = {
          id: tab.id || 0,
          title: tab.title || '',
          url: tab.url || '',
          favicon: tab.favIconUrl || '',
          closedAt: Date.now(),
          sessionId: matchingSession?.tab?.sessionId
        };

        // Dispatch to Redux store before closing
        store.dispatch(addClosedTab(tabInfo));
        
        // Close the tab
        await chrome.tabs.remove(tabId);
        console.log(`%cTab closed and added to popup: ${tabInfo.title}`, 'color: #2196F3; font-weight: bold;');
      } catch (error) {
        console.error(`Failed to close tab ${tabId}:`, error);
        // Clean up tracking in case of error
        this.tabManager.extensionClosedTabs.delete(tabId);
        this.tabsToClose.delete(tabId);
      }
    } else {
      // Log why tab wasn't closed
      console.log(`%cSkipping tab ${tabId} - conditions not met:`, 'color: #FF9800; font-weight: bold;', {
        score,
        threshold: this.config.inactiveThreshold,
        isPlaying: state?.isPlaying,
        hasUnsavedForm: state?.hasUnsavedForm,
        hasPendingDownload: state?.hasPendingDownload,
        isPinned: state?.isPinned
      });
      this.tabsToClose.delete(tabId);
    }
  }
}