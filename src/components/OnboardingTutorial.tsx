import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { AggressivenessLevel } from '@/types/userPreferences';
import { 
  toggleDomain, 
  setAggressivenessLevel, 
  completeOnboarding,
  selectSelectedDomains,
  selectAggressivenessLevel
} from '@/store/onboardingSlice';
import { applyOnboardingSettings } from '@/store/settingsSlice';
import { AppDispatch } from '@/store/store';

interface OnboardingTutorialProps {
  onComplete?: () => void;
}

const DOMAIN_OPTIONS = [
  { domain: 'google.com', emoji: '🔍', label: 'Google' },
  { domain: 'youtube.com', emoji: '▶️', label: 'YouTube' },
  { domain: 'spotify.com', emoji: '🎵', label: 'Spotify' },
  { domain: 'github.com', emoji: '💻', label: 'GitHub' },
  { domain: 'gmail.com', emoji: '📧', label: 'Gmail' }
];

const tutorialSteps = [
  {
    title: "Welcome to TabFlow! 👋",
    content: "Let's personalize TabFlow to work best for you. We'll set up your preferences in just a few steps."
  },
  {
    title: "Pick Your Frequent Websites 🌟",
    content: "Select the websites you use frequently. These will be given special treatment with slower decay rates.",
    isPreference: true,
    type: 'domains'
  },
  {
    title: "Choose Your Style 🎮",
    content: "How aggressively should TabFlow manage your tabs? This affects how quickly inactive tabs will decay.",
    isPreference: true,
    type: 'aggressiveness'
  },
  {
    title: "All Set! 🎉",
    content: "Your preferences have been saved. You can always adjust these settings later in the options menu."
  }
];

export function OnboardingTutorial({ onComplete }: OnboardingTutorialProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [currentStep, setCurrentStep] = useState(0);
  
  const selectedDomains = useSelector(selectSelectedDomains);
  const aggressivenessLevel = useSelector(selectAggressivenessLevel);

  const handleNext = async () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Apply settings from onboarding
      await dispatch(applyOnboardingSettings({
        domains: selectedDomains,
        aggressiveness: aggressivenessLevel
      }));

      // Mark onboarding as complete
      dispatch(completeOnboarding());

      // Save completion status
      chrome.storage.local.set({ tutorialShown: true });

      // Notify parent
      onComplete?.();
    }
  };

  const handleDomainToggle = (domain: string) => {
    dispatch(toggleDomain(domain));
  };

  const handleAggressivenessChange = (level: AggressivenessLevel) => {
    dispatch(setAggressivenessLevel(level));
  };

  const renderPreferenceContent = () => {
    const step = tutorialSteps[currentStep];
    if (!step.isPreference) return <p className="text-muted-foreground">{step.content}</p>;

    if (step.type === 'domains') {
      return (
        <div className="space-y-4">
          <p className="text-muted-foreground mb-4">{step.content}</p>
          <div className="grid grid-cols-2 gap-3">
            {DOMAIN_OPTIONS.map(({ domain, emoji, label }) => {
              const isSelected = selectedDomains.includes(domain);
              return (
                <Button
                  key={domain}
                  variant={isSelected ? "default" : "outline"}
                  className={`h-16 ${isSelected ? 'bg-primary' : ''}`}
                  onClick={() => handleDomainToggle(domain)}
                >
                  <div className="flex flex-col items-center">
                    <span className="text-xl mb-1">{emoji}</span>
                    <span>{label}</span>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
      );
    }

    if (step.type === 'aggressiveness') {
      return (
        <div className="space-y-4">
          <p className="text-muted-foreground mb-4">{step.content}</p>
          <RadioGroup
            value={aggressivenessLevel}
            onValueChange={handleAggressivenessChange}
            className="grid gap-3"
          >
            <Label
              htmlFor="high"
              className={`flex items-center space-x-3 p-4 rounded-lg border cursor-pointer
                ${aggressivenessLevel === 'high' ? 'bg-primary border-primary' : 'hover:bg-accent'}`}
            >
              <RadioGroupItem value="high" id="high" />
              <div>
                <div className="font-semibold">🚀 High Speed</div>
                <div className="text-sm text-muted-foreground">Closes tabs quickly (15 min, faster updates)</div>
              </div>
            </Label>
            <Label
              htmlFor="medium"
              className={`flex items-center space-x-3 p-4 rounded-lg border cursor-pointer
                ${aggressivenessLevel === 'medium' ? 'bg-primary border-primary' : 'hover:bg-accent'}`}
            >
              <RadioGroupItem value="medium" id="medium" />
              <div>
                <div className="font-semibold">⚖️ Balanced</div>
                <div className="text-sm text-muted-foreground">Moderate approach (30 min, normal updates)</div>
              </div>
            </Label>
            <Label
              htmlFor="low"
              className={`flex items-center space-x-3 p-4 rounded-lg border cursor-pointer
                ${aggressivenessLevel === 'low' ? 'bg-primary border-primary' : 'hover:bg-accent'}`}
            >
              <RadioGroupItem value="low" id="low" />
              <div>
                <div className="font-semibold">🐢 Relaxed</div>
                <div className="text-sm text-muted-foreground">Keeps tabs longer (1 hour, slower updates)</div>
              </div>
            </Label>
          </RadioGroup>
        </div>
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50">
      <div className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
        <div className="w-[500px] rounded-lg border bg-card p-8 shadow-lg">
          <h2 className="text-2xl font-bold mb-4">{tutorialSteps[currentStep].title}</h2>
          {renderPreferenceContent()}
          <div className="mt-8 flex justify-end">
            <Button onClick={handleNext} size="lg">
              {currentStep < tutorialSteps.length - 1 ? 'Next →' : 'Get Started 🚀'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
