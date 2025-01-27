import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import {
  loadSettings,
  updateCountdownTimer,
  updateInactiveThreshold,
  addSpecialDomain,
  removeSpecialDomain,
  updateBatchIntervalTimer,
  resetSettings,
  saveSettings,
} from '@/store/settingsSlice';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { X, Save, RotateCcw } from "lucide-react";
import { useState, useEffect } from 'react';
import { AppDispatch } from '@/store/store';

export function Settings() {
  const dispatch = useDispatch<AppDispatch>();
  const settings = useSelector((state: RootState) => state.settings);
  const [newDomain, setNewDomain] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Load settings on mount
  useEffect(() => {
    dispatch(loadSettings());
  }, [dispatch]);

  // Show loading state
  if (settings.isLoading) {
    return <div className="flex items-center justify-center h-full">Loading settings...</div>;
  }

  const handleSave = async () => {
    setSaveStatus('saving');
    await dispatch(saveSettings(settings));
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    if (newDomain) {
      dispatch(addSpecialDomain(newDomain));
      setNewDomain('');
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      console.log('%cResetting settings to defaults...', 'color: #FF5722; font-weight: bold;');
      dispatch(resetSettings());
    }
  };

  return (
    <ScrollArea className="h-[350px]">
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-4">
            <Label htmlFor="countdown">
              Countdown Timer: {settings.countdownTimer} minutes
            </Label>
            <Slider
              id="countdown"
              min={1}
              max={60}
              step={1}
              value={[settings.countdownTimer]}
              onValueChange={([value]) => {
                dispatch(updateCountdownTimer(value));
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-4">
            <Label htmlFor="threshold">
              Inactive Threshold: {settings.inactiveThreshold}
            </Label>
            <Slider
              id="threshold"
              min={0}
              max={2}
              step={0.1}
              value={[settings.inactiveThreshold]}
              onValueChange={([value]) => {
                dispatch(updateInactiveThreshold(value));
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-4">
            <Label htmlFor="batchInterval">
              Batch Interval: {settings.batchIntervalTimer} Minutte
            </Label>
            <Slider
              id="batchInterval"
              min={1}
              max={60}
              step={1}
              value={[settings.batchIntervalTimer]}
              onValueChange={([value]) => {
                dispatch(updateBatchIntervalTimer(value));
              }}
              className="w-full"
            />
          </div>

          <div className="space-y-4">
            <Label>Special Domains</Label>
            <form onSubmit={handleAddDomain} className="flex gap-2">
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g., gmail.com"
                className="flex-1"
              />
              <Button type="submit" variant="outline">
                Add
              </Button>
            </form>
            <div className="flex flex-wrap gap-2 mt-2">
              {settings.specialDomains.map((domain) => (
                <Badge
                  key={domain}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {domain}
                  <button
                    onClick={() => dispatch(removeSpecialDomain(domain))}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex justify-between gap-2">
            <Button
              variant="outline"
              onClick={handleReset}
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              className="flex items-center gap-2"
              disabled={saveStatus === 'saved' || !settings.pendingChanges}
            >
              <Save className="h-4 w-4" />
              {saveStatus === 'saved' ? 'Saved!' : settings.pendingChanges ? 'Save Changes' : 'No Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </ScrollArea>
  );
}
