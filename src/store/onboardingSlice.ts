import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AggressivenessLevel } from '@/types/userPreferences';

export interface OnboardingState {
  selectedDomains: string[];
  aggressivenessLevel: AggressivenessLevel;
  isComplete: boolean;
}

const initialState: OnboardingState = {
  selectedDomains: [],
  aggressivenessLevel: 'medium',
  isComplete: false,
};



export const onboardingSlice = createSlice({
  name: 'onboarding',
  initialState,
  reducers: {
    toggleDomain: (state, action: PayloadAction<string>) => {
      const index = state.selectedDomains.indexOf(action.payload);
      if (index === -1) {
        state.selectedDomains.push(action.payload);
      } else {
        state.selectedDomains.splice(index, 1);
      }
    },
    setAggressivenessLevel: (state, action: PayloadAction<AggressivenessLevel>) => {
      state.aggressivenessLevel = action.payload;
    },
    completeOnboarding: (state) => {
      state.isComplete = true;
    },
    resetOnboarding: () => initialState,
  },
});

export const {
  toggleDomain,
  setAggressivenessLevel,
  completeOnboarding,
  resetOnboarding,
} = onboardingSlice.actions;

export const selectOnboardingState = (state: { onboarding: OnboardingState }) => state.onboarding;
export const selectSelectedDomains = (state: { onboarding: OnboardingState }) => state.onboarding.selectedDomains;
export const selectAggressivenessLevel = (state: { onboarding: OnboardingState }) => state.onboarding.aggressivenessLevel;
export const selectIsOnboardingComplete = (state: { onboarding: OnboardingState }) => state.onboarding.isComplete;

export default onboardingSlice.reducer;
