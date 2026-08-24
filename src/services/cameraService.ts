export interface CameraProvider {
  start(): Promise<MediaStream>;
  stop(): void;
  onDetection(callback: (count: number, density: 'Low' | 'Medium' | 'High', zones: Record<string, number>) => void): void;
}

export class WebcamService implements CameraProvider {
  private stream: MediaStream | null = null;
  private detectionInterval: number | null = null;
  private onDetectionCallback: ((count: number, density: 'Low' | 'Medium' | 'High', zones: Record<string, number>) => void) | null = null;

  async start(): Promise<MediaStream> {
    if (this.stream) {
      return this.stream;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      
      // Simulate people detection loop (since we are not loading a heavy ML model in this prototype)
      this.startMockDetectionLoop();

      return this.stream;
    } catch (err) {
      console.error('Camera access denied or unavailable', err);
      throw new Error('Could not access camera. Please check permissions.');
    }
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.detectionInterval !== null) {
      window.clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }

  onDetection(callback: (count: number, density: 'Low' | 'Medium' | 'High', zones: Record<string, number>) => void): void {
    this.onDetectionCallback = callback;
  }

  private startMockDetectionLoop() {
    this.detectionInterval = window.setInterval(() => {
      if (this.onDetectionCallback) {
        // Generate random realistic numbers for the prototype
        const baseCount = Math.floor(Math.random() * 25) + 5; 
        
        let density: 'Low' | 'Medium' | 'High' = 'Low';
        if (baseCount > 20) density = 'High';
        else if (baseCount > 10) density = 'Medium';

        // Distribute among zones roughly
        const zones = {
          'Registration': Math.floor(baseCount * 0.4),
          'Billing': Math.floor(baseCount * 0.2),
          'Pharmacy': Math.floor(baseCount * 0.2),
          'Waiting Area': baseCount - Math.floor(baseCount * 0.8)
        };

        this.onDetectionCallback(baseCount, density, zones);
      }
    }, 5000) as unknown as number;
  }
}

// Export a singleton instance for the app to use
export const cameraService = new WebcamService();
