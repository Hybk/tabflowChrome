import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { AggressivenessLevel } from '@/types/userPreferences';

export interface SettingsState {
  countdownTimer: number; // in minutes
  inactiveThreshold: number; // score threshold
  specialDomains: string[];
  batchIntervalTimer: number; // in minutes
  decayRates: {
    normal: number;
    special: number;
  };
  isLoading: boolean;
  pendingChanges: boolean;
}

// Comprehensive settings for each aggressiveness level
export const AGGRESSIVENESS_PRESETS = {
  high: {
    countdownTimer: 15, // 15 minutes - more aggressive
    batchIntervalTimer: 0.5, // 30 seconds
    decayRates: {
      normal: -0.1,
      special: -0.05
    }
  },
  medium: {
    countdownTimer: 30, // 30 minutes - balanced
    batchIntervalTimer: 1, // 1 minute
    decayRates: {
      normal: -0.067,
      special: -0.033
    }
  },
  low: {
    countdownTimer: 60, // 1 hour - more relaxed
    batchIntervalTimer: 2, // 2 minutes
    decayRates: {
      normal: -0.033,
      special: -0.016
    }
  }
} as const;

const defaultSettings: SettingsState = {
  ...AGGRESSIVENESS_PRESETS.medium,
  inactiveThreshold: 0.0,
  specialDomains: [],
  isLoading: true,
  pendingChanges: false,
};

export const loadSettings = createAsyncThunk(
  'settings/loadSettings',
  async () => {
    const result = await chrome.storage.sync.get(['settings']);
    return result.settings || defaultSettings;
  }
);

export const applyOnboardingSettings = createAsyncThunk(
  'settings/applyOnboardingSettings',
  async ({ domains, aggressiveness }: { domains: string[], aggressiveness: AggressivenessLevel }) => {
    const presetSettings = AGGRESSIVENESS_PRESETS[aggressiveness];
    
    const settingsToSave = {
      ...defaultSettings,
      ...presetSettings, // Apply all preset values for the chosen aggressiveness level
      specialDomains: domains,
      isLoading: false,
      pendingChanges: false
    };

    await chrome.storage.sync.set({ settings: settingsToSave });
    
    console.log('%cOnboarding settings applied:', 'color: #4CAF50; font-weight: bold;');
    console.table({
      'Aggressiveness Level': aggressiveness,
      'Countdown Timer': `${presetSettings.countdownTimer} minutes`,
      'Batch Interval': `${presetSettings.batchIntervalTimer} minutes`,
      'Normal Decay Rate': presetSettings.decayRates.normal,
      'Special Decay Rate': presetSettings.decayRates.special,
      'Special Domains': domains
    });
    
    // Notify background script
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage({ 
        type: 'SETTINGS_UPDATED', 
        settings: settingsToSave
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Failed to notify background script:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });

    return settingsToSave;
  }
);

export const saveSettings = createAsyncThunk(
  'settings/saveSettings',
  async (settings: Partial<SettingsState>) => {
    const { isLoading, pendingChanges, ...settingsToSave } = settings;
    await chrome.storage.sync.set({ settings: settingsToSave });
    
    console.log('%cSettings saved successfully:', 'color: #4CAF50; font-weight: bold;');
    console.table({
      'Countdown Timer': `${settings.countdownTimer} minutes`,
      'Inactive Threshold': settings.inactiveThreshold,
      'Batch Interval': `${settings.batchIntervalTimer} minutes`,
      'Special Domains': settings.specialDomains,
      'Decay Rates': settings.decayRates
    });
    
    // Notify background script
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage({ 
        type: 'SETTINGS_UPDATED', 
        settings: settingsToSave
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Failed to notify background script:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });

    return settingsToSave;
  }
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState: { ...defaultSettings },
  reducers: {
    initializeSettings: (state, action: PayloadAction<Partial<SettingsState>>) => {
      const { isLoading, pendingChanges, ...settings } = action.payload;
      Object.assign(state, { ...defaultSettings, ...settings, isLoading: false, pendingChanges: false });
    },
    updateCountdownTimer: (state, action: PayloadAction<number>) => {
      state.countdownTimer = action.payload;
      state.pendingChanges = true;
    },
    updateInactiveThreshold: (state, action: PayloadAction<number>) => {
      state.inactiveThreshold = action.payload;
      state.pendingChanges = true;
    },
    addSpecialDomain: (state, action: PayloadAction<string>) => {
      if (!state.specialDomains.includes(action.payload)) {
        state.specialDomains.push(action.payload);
        state.pendingChanges = true;
      }
    },
    removeSpecialDomain: (state, action: PayloadAction<string>) => {
      state.specialDomains = state.specialDomains.filter(domain => domain !== action.payload);
      state.pendingChanges = true;
    },
    updateBatchIntervalTimer: (state, action: PayloadAction<number>) => {
      state.batchIntervalTimer = action.payload;
      state.pendingChanges = true;
    },
    resetSettings: (state) => {
      const { isLoading, pendingChanges, ...settings } = defaultSettings;
      Object.assign(state, settings);
      state.pendingChanges = true;
    },
    clearPendingChanges: (state) => {
      state.pendingChanges = false;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSettings.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(loadSettings.fulfilled, (state, action) => {
        Object.assign(state, { ...action.payload, isLoading: false });
      })
      .addCase(saveSettings.fulfilled, (state, action) => {
        Object.assign(state, { ...action.payload, pendingChanges: false });
      })
      .addCase(applyOnboardingSettings.fulfilled, (state, action) => {
        Object.assign(state, { ...action.payload, isLoading: false, pendingChanges: false });
      });
  }
});

export const {
  initializeSettings,
  updateCountdownTimer,
  updateInactiveThreshold,
  addSpecialDomain,
  removeSpecialDomain,
  updateBatchIntervalTimer,
  resetSettings,
  clearPendingChanges,
} = settingsSlice.actions;

export default settingsSlice.reducer;
