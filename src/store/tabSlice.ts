import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { storage } from '@/services/storage';
import { AppDispatch, store } from './store';

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favicon: string;
  closedAt: number;
  sessionId?: string;
}

interface TabState {
  closedTabs: TabInfo[];
  searchQuery: string;
  wasManuallyCleared: boolean;
  lastSyncTime: number;
  isLoading: boolean;
}

const initialState: TabState = {
  closedTabs: [],
  searchQuery: '',
  wasManuallyCleared: false,
  lastSyncTime: 0,
  isLoading: true,
};

// Thunk actions for async storage operations
export const initializeState = () => async (dispatch: AppDispatch) => {
  try {
    const [tabs, meta] = await Promise.all([
      storage.getAllTabs(),
      storage.getMetaData(),
    ]);
    
    dispatch(setInitialState({
      tabs,
      wasManuallyCleared: meta.wasManuallyCleared,
      lastSyncTime: meta.lastSyncTime,
    }));
    
    // Cleanup old tabs (older than 30 days)
    storage.cleanup();
  } catch (error) {
    console.error('Failed to initialize state:', error);
  }
};

const tabSlice = createSlice({
  name: 'tabs',
  initialState,
  reducers: {
    setInitialState: (state, action: PayloadAction<{
      tabs: TabInfo[];
      wasManuallyCleared: boolean;
      lastSyncTime: number;
    }>) => {
      state.closedTabs = action.payload.tabs;
      state.wasManuallyCleared = action.payload.wasManuallyCleared;
      state.lastSyncTime = action.payload.lastSyncTime;
      state.isLoading = false;
    },
    addClosedTab: (state, action: PayloadAction<TabInfo>) => {
      // Prevent duplicates within a short time window (5 seconds)
      const isDuplicate = state.closedTabs.some(
        tab => tab.url === action.payload.url && 
        Math.abs(tab.closedAt - action.payload.closedAt) < 5000
      );
      
      if (!isDuplicate) {
        const newTab = { ...action.payload }; // Create a copy to avoid proxy issues
        state.closedTabs.unshift(newTab);
        
        // Use setTimeout to handle storage after state update is complete
        setTimeout(() => {
          storage.addTab(newTab)
            .catch(error => {
              console.error('Failed to store closed tab:', error);
              // Dispatch removal action instead of directly modifying state
              store.dispatch(removeClosedTab(newTab.id));
            });
        }, 0);
      }
    },
    removeClosedTab: (state, action: PayloadAction<number>) => {
      state.closedTabs = state.closedTabs.filter(tab => tab.id !== action.payload);
      // Remove from IndexedDB
      storage.removeTab(action.payload).catch(console.error);
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    clearClosedTabs: (state) => {
      state.closedTabs = [];
      state.wasManuallyCleared = true;
      // Clear IndexedDB
      storage.clearAllTabs().catch(console.error);
      storage.updateMetaData({ wasManuallyCleared: true }).catch(console.error);
    },
    updateLastSyncTime: (state) => {
      state.lastSyncTime = Date.now();
      // Update in IndexedDB
      storage.updateMetaData({ lastSyncTime: state.lastSyncTime }).catch(console.error);
    },
  },
});

export const { 
  setInitialState,
  addClosedTab, 
  removeClosedTab, 
  setSearchQuery, 
  clearClosedTabs,
  updateLastSyncTime 
} = tabSlice.actions;

export default tabSlice.reducer;