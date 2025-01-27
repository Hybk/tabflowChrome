export class TabStateMonitor {
    private static instance: TabStateMonitor;
    
    private constructor() {
      console.log('%cTabFlow Content Script Active', 'color: #FF9800; font-size: 14px;');
      this.initMediaMonitoring();
      this.initFormMonitoring();
      this.initMessageListener();
      
      // Initial state check
      this.checkMediaState();
      this.checkFormState();
      console.log('✓ Content Script Initialized');
    }
  
    static getInstance(): TabStateMonitor {
      if (!TabStateMonitor.instance) {
        TabStateMonitor.instance = new TabStateMonitor();
      }
      return TabStateMonitor.instance;
    }
  
    private initMediaMonitoring(): void {
      const mediaEvents = ['play', 'pause', 'ended'];
      
      mediaEvents.forEach(event => {
        document.addEventListener(event, () => this.checkMediaState(), true);
      });
  
      // Picture-in-Picture monitoring
      document.addEventListener('enterpictureinpicture', () => {
        this.sendMessage('mediaStateChanged', { isPlaying: true });
      });
  
      document.addEventListener('leavepictureinpicture', () => {
        this.checkMediaState();
      });
    }
  
    private initFormMonitoring(): void {
      // Monitor all forms
      document.addEventListener('change', (event) => {
        if (event.target instanceof HTMLFormElement) {
          event.target.dataset.modified = 'true';
          this.checkFormState();
        }
      }, true);
  
      // Monitor all inputs
      document.addEventListener('input', (event) => {
        if (event.target instanceof HTMLInputElement || 
            event.target instanceof HTMLTextAreaElement) {
          event.target.dataset.modified = 'true';
          this.checkFormState();
        }
      }, true);
  
      // Monitor form submissions
      document.addEventListener('submit', (event) => {
        if (event.target instanceof HTMLFormElement) {
          event.target.dataset.modified = 'false';
          this.checkFormState();
        }
      }, true);
    }
  
    private initMessageListener(): void {
      chrome.runtime.onMessage.addListener((message: { type: string }) => {
        switch (message.type) {
          case 'checkMediaState':
            this.checkMediaState();
            break;
          case 'checkFormState':
            this.checkFormState();
            break;
        }
      });
    }
  
    private checkMediaState(): void {
      const mediaElements = document.querySelectorAll<HTMLMediaElement>('video, audio');
      const isPlaying = Array.from(mediaElements).some(
        media => !media.paused && !media.ended && media.currentTime > 0
      );
      
      this.sendMessage('mediaStateChanged', { isPlaying });
    }
  
    private checkFormState(): void {
      const forms = document.querySelectorAll('form');
      const inputs = document.querySelectorAll('input, textarea');
      
      const hasUnsavedChanges = Array.from(forms).some(form => form.dataset.modified === 'true') ||
                               Array.from(inputs).some(input => 
                                 (input as HTMLInputElement).dataset?.modified === 'true'
                               );
                               
      this.sendMessage('formStateChanged', { hasUnsavedForm: hasUnsavedChanges });
    }
  
    private sendMessage(type: string, data: any): void {
      chrome.runtime.sendMessage({
        type,
        ...data
      });
    }
  }
  
  // Initialize the monitor
  TabStateMonitor.getInstance();