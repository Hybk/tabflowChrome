import { configureStore } from '@reduxjs/toolkit';
import tabReducer from './tabSlice';
import settingsReducer from './settingsSlice';
import onboardingReducer from './onboardingSlice';

export const store = configureStore({
  reducer: {
    tabs: tabReducer,
    settings: settingsReducer,
    onboarding: onboardingReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
