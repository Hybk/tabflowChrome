import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store/store';
import { setSearchQuery, removeClosedTab, addClosedTab, clearClosedTabs, initializeState } from '@/store/tabSlice';
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Undo2, Trash2, RotateCcw } from "lucide-react";
import React from 'react';
import { storage } from '@/services/storage';

export function Home() {
  const dispatch = useDispatch();
  const { closedTabs, searchQuery, wasManuallyCleared, isLoading } = useSelector((state: RootState) => state.tabs);

  // Initialize state from IndexedDB
  React.useEffect(() => {
    // @ts-ignore - Redux Thunk typing issue
    dispatch(initializeState());
  }, [dispatch]);

  // Sync with chrome tabs
  React.useEffect(() => {
    if (isLoading) return;

    const syncClosedTabs = async () => {
      if (wasManuallyCleared) return;
      
      try {
        const sessions = await chrome.sessions.getRecentlyClosed();
        
        for (const session of sessions) {
          if (session.tab && session.tab.sessionId) {
            const exists = await storage.hasTab(session.tab.sessionId);
            if (!exists) {
              dispatch(addClosedTab({
                id: session.tab.id || 0,
                title: session.tab.title || '',
                url: session.tab.url || '',
                favicon: session.tab.favIconUrl || '',
                closedAt: session.lastModified * 1000,
                sessionId: session.tab.sessionId
              }));
            }
          }
        }
      } catch (error) {
        console.error('Failed to sync closed tabs:', error);
      }
    };

    const handleTabRemoved = (_tabId: number, _removeInfo: chrome.tabs.TabRemoveInfo) => {
      // Small delay to ensure Chrome has updated its sessions
      setTimeout(syncClosedTabs, 100);
    };

    syncClosedTabs();
    chrome.tabs.onRemoved.addListener(handleTabRemoved);

    return () => {
      chrome.tabs.onRemoved.removeListener(handleTabRemoved);
    };
  }, [dispatch, wasManuallyCleared, isLoading]);

  const filteredTabs = closedTabs.filter(tab => 
    tab.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tab.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setSearchQuery(e.target.value));
  };

  const handleRestoreTab = async (tab: typeof closedTabs[0]) => {
    try {
      if (tab.sessionId) {
        // Try to restore the exact session
        await chrome.sessions.restore(tab.sessionId);
      } else {
        // Fall back to recent sessions search
        const sessions = await chrome.sessions.getRecentlyClosed();
        const matchingSession = sessions.find(
          session => session.tab?.url === tab.url && session.tab?.title === tab.title
        );

        if (matchingSession && matchingSession.tab?.sessionId) {
          await chrome.sessions.restore(matchingSession.tab.sessionId);
        } else {
          await chrome.tabs.create({ url: tab.url });
        }
      }

      dispatch(removeClosedTab(tab.id));
      window.close();
    } catch (error) {
      console.error('Failed to restore tab:', error);
      try {
        await chrome.tabs.create({ url: tab.url });
        dispatch(removeClosedTab(tab.id));
        window.close();
      } catch (fallbackError) {
        console.error('Failed to create new tab:', fallbackError);
      }
    }
  };

  const handleRestoreAll = async () => {
    try {
      for (const tab of filteredTabs) {
        await chrome.tabs.create({ url: tab.url });
        dispatch(removeClosedTab(tab.id));
      }
      window.close();
    } catch (error) {
      console.error('Failed to restore all tabs:', error);
    }
  };

  const handleClearAll = async () => {
    // Clear Redux store
    dispatch(clearClosedTabs());
    
    // Clear Chrome sessions by restoring and immediately closing them
    try {
      const sessions = await chrome.sessions.getRecentlyClosed();
      for (const session of sessions) {
        if (session.tab) {
          // Restore the tab
          const restoredTab = await chrome.sessions.restore(session.tab.sessionId);
          // If restoration was successful and we got a tab
          if (restoredTab && restoredTab.tab && restoredTab.tab.id) {
            // Immediately close the restored tab
            await chrome.tabs.remove(restoredTab.tab.id);
          }
        }
      }
    } catch (error) {
      console.error('Failed to clear sessions:', error);
    }
  };
  

  const handleKeyDown = (e: React.KeyboardEvent, tab: typeof closedTabs[0]) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRestoreTab(tab);
    }
  };

  return (
    <div className="space-y-4">
      <Input
        type="search"
        placeholder="Search closed tabs..."
        value={searchQuery}
        onChange={handleSearch}
        className="w-full"
      />
      
      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">
          Loading...
        </div>
      ) : closedTabs.length > 0 ? (
        <>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={handleRestoreAll}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Restore All
            </Button>
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={handleClearAll}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          </div>
          
          <ScrollArea className="h-[350px] px-1">
            <div className="space-y-3">
              {filteredTabs.map((tab) => (
                <Card 
                  key={tab.id}
                  className="hover:bg-accent transition-colors cursor-pointer"
                  onClick={() => handleRestoreTab(tab)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => handleKeyDown(e, tab)}
                >
                  <CardContent className="p-4 flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <img 
                        src={tab.favicon} 
                        alt="" 
                        className="w-6 h-6 rounded"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'icon-48.png';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium leading-none truncate mb-1">
                        {tab.title}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate mb-1">
                        {tab.url}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Undo2 className="h-3 w-3" />
                        {formatDistanceToNow(tab.closedAt)} ago
                      </p>
                    </div>
                    <Undo2 className="w-4 h-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </>
      ) : (
        <div className="text-center text-muted-foreground py-8">
          No closed tabs found
        </div>
      )}
    </div>
  );
}