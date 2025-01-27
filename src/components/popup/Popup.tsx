import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Home } from "./Home"
import { Analysis } from "./Analysis"
import { Settings } from "./Settings"
import { ThemeProvider } from "@/components/theme-provider"
import { ModeToggle } from "@/components/mode-toggle"
import { OnboardingTutorial } from "@/components/OnboardingTutorial"
import "@/styles/enhanced-ui.css"

export function Popup() {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['tutorialShown'], (result) => {
      setIsOnboardingComplete(result.tutorialShown === true);
    });
  }, []);

  if (!isOnboardingComplete) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="tabflow-theme">
        <div className="enhanced-popup p-4">
          <OnboardingTutorial onComplete={() => setIsOnboardingComplete(true)} />
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="tabflow-theme">
      <div className="enhanced-popup p-4">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            TabFlow
          </h1>
          <ModeToggle />
        </div>
        
        <Tabs defaultValue="home" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-muted/50">
            <TabsTrigger value="home" className="tab-trigger">Home</TabsTrigger>
            <TabsTrigger value="analysis" className="tab-trigger">Analysis</TabsTrigger>
            <TabsTrigger value="settings" className="tab-trigger">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="home" className="tab-restore">
            <Home />
          </TabsContent>
          <TabsContent value="analysis" className="tab-restore">
            <Analysis />
          </TabsContent>
          <TabsContent value="settings" className="tab-restore">
            <Settings />
          </TabsContent>
        </Tabs>
      </div>
    </ThemeProvider>
  );
}
