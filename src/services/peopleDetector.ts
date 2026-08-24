import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export interface DetectionResult {
  peopleCount: number;
  density: 'Low' | 'Medium' | 'High';
  boundingBoxes: Array<{ x: number; y: number; width: number; height: number; score: number }>;
}

export interface CameraInstance {
  id: string;        // local instance id
  stream: MediaStream;
  videoElement: HTMLVideoElement | null;
  detecting: boolean;
}

export interface CameraProvider {
  start(): Promise<MediaStream>;
  stop(): void;
  onDetection(callback: (result: DetectionResult) => void): void;
}

/**
 * PeopleDetectionService
 * Uses TensorFlow.js COCO-SSD model to detect people in real-time from webcam feeds.
 * Runs entirely client-side — no video data leaves the browser.
 */
class PeopleDetectionService {
  private model: cocoSsd.ObjectDetection | null = null;
  private modelLoading: Promise<cocoSsd.ObjectDetection> | null = null;
  private streams: Map<string, MediaStream> = new Map();
  private detectionLoops: Map<string, number> = new Map();
  private callbacks: Map<string, (result: DetectionResult) => void> = new Map();
  private canvasCache: Map<string, HTMLCanvasElement> = new Map();

  /**
   * Load the COCO-SSD model (lazy, cached).
   * First call downloads the model (~6MB); subsequent calls return cached.
   */
  async loadModel(): Promise<cocoSsd.ObjectDetection> {
    if (this.model) return this.model;

    if (this.modelLoading) return this.modelLoading;

    this.modelLoading = (async () => {
      // Ensure TF.js backend is ready
      await tf.ready();
      console.log('[PeopleDetection] TF.js backend:', tf.getBackend());

      const m = await cocoSsd.load({
        base: 'lite_mobilenet_v2', // Fastest model variant for real-time use
      });
      console.log('[PeopleDetection] COCO-SSD model loaded');
      this.model = m;
      return m;
    })();

    return this.modelLoading;
  }

  /**
   * Start a webcam stream and begin detection.
   * Handles permission checks and provides clear error messages.
   */
  async startCamera(cameraId: string): Promise<MediaStream> {
    // If already have a stream for this camera, return it
    const existing = this.streams.get(cameraId);
    if (existing) return existing;

    // Check if mediaDevices API is available (requires HTTPS or localhost)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Camera access is not available. Make sure you are using HTTPS or localhost, and your browser supports camera access.'
      );
    }

    // Pre-check permission state if the Permissions API is available
    try {
      if (navigator.permissions) {
        const permStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (permStatus.state === 'denied') {
          throw new Error(
            'Camera permission was previously denied. To fix this:\n' +
            '1. Click the lock/site-info icon in the address bar\n' +
            '2. Find "Camera" and change it to "Allow"\n' +
            '3. Reload the page and try again\n\n' +
            'On macOS: Go to System Settings → Privacy & Security → Camera and enable your browser.'
          );
        }
      }
    } catch (permErr: any) {
      // If it's our own error, re-throw it
      if (permErr.message?.includes('Camera permission was previously denied')) {
        throw permErr;
      }
      // Otherwise ignore — some browsers don't support permission query for camera
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' },
        audio: false,
      });

      this.streams.set(cameraId, stream);
      return stream;
    } catch (err: any) {
      // Provide specific error messages based on the error type
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error(
          'Camera access was denied. Please allow camera access:\n\n' +
          '• Chrome: Click the camera icon in the address bar → Allow → Reload\n' +
          '• Safari: Go to Safari → Settings → Websites → Camera → Allow for localhost\n' +
          '• macOS: System Settings → Privacy & Security → Camera → Enable your browser\n\n' +
          'After granting permission, click "Add Camera" again.'
        );
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No camera found. Please connect a webcam and try again.');
      }
      if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        throw new Error(
          'Camera is being used by another application. Close other apps using the camera (e.g. FaceTime, Zoom, Teams) and try again.'
        );
      }
      if (err.name === 'OverconstrainedError') {
        // Try again with relaxed constraints
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          this.streams.set(cameraId, stream);
          return stream;
        } catch {
          throw new Error('Camera does not meet the required constraints. Please try a different camera.');
        }
      }
      throw new Error(`Camera error: ${err.message || 'Unknown error occurred'}`);
    }
  }

  /**
   * Start the detection loop for a specific camera.
   * Requires a <video> element that is already playing the stream.
   */
  startDetection(cameraId: string, videoElement: HTMLVideoElement): void {
    // Stop any existing loop
    this.stopDetection(cameraId);

    const detect = async () => {
      if (!this.model) return;

      const callback = this.callbacks.get(cameraId);
      if (!callback) return;

      // Only detect if video is playing and has valid dimensions
      if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return;

      try {
        const predictions = await this.model.detect(videoElement);

        // Filter for "person" class only
        const people = predictions.filter(p => p.class === 'person' && p.score >= 0.40);
        const count = people.length;

        let density: 'Low' | 'Medium' | 'High' = 'Low';
        if (count >= 8) density = 'High';
        else if (count >= 4) density = 'Medium';

        const boundingBoxes = people.map(p => ({
          x: p.bbox[0],
          y: p.bbox[1],
          width: p.bbox[2],
          height: p.bbox[3],
          score: p.score,
        }));

        callback({ peopleCount: count, density, boundingBoxes });
      } catch (err) {
        console.error('[PeopleDetection] Detection error:', err);
      }
    };

    // Run detection every 1.5 seconds for balanced performance
    const intervalId = window.setInterval(detect, 1500);
    this.detectionLoops.set(cameraId, intervalId);

    // Run first detection immediately
    detect();
  }

  /**
   * Stop detection for a specific camera but keep the stream alive.
   */
  stopDetection(cameraId: string): void {
    const intervalId = this.detectionLoops.get(cameraId);
    if (intervalId !== undefined) {
      window.clearInterval(intervalId);
      this.detectionLoops.delete(cameraId);
    }
  }

  /**
   * Stop stream and detection for a specific camera.
   */
  stopCamera(cameraId: string): void {
    this.stopDetection(cameraId);

    const stream = this.streams.get(cameraId);
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      this.streams.delete(cameraId);
    }

    this.callbacks.delete(cameraId);
    this.canvasCache.delete(cameraId);
  }

  /**
   * Stop everything.
   */
  stopAll(): void {
    for (const cameraId of this.streams.keys()) {
      this.stopCamera(cameraId);
    }
  }

  /**
   * Register a detection callback for a specific camera.
   */
  onDetection(cameraId: string, callback: (result: DetectionResult) => void): void {
    this.callbacks.set(cameraId, callback);
  }

  /**
   * Draw bounding boxes on a canvas overlay.
   */
  drawBoxes(
    canvas: HTMLCanvasElement,
    boxes: DetectionResult['boundingBoxes'],
    videoWidth: number,
    videoHeight: number,
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = videoWidth;
    canvas.height = videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const box of boxes) {
      const confidence = Math.round(box.score * 100);

      // Box
      ctx.strokeStyle = box.score >= 0.7 ? '#22c55e' : box.score >= 0.5 ? '#f59e0b' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      // Label background
      const label = `Person ${confidence}%`;
      ctx.font = '12px Inter, system-ui, sans-serif';
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(box.x, box.y - 20, textWidth + 8, 20);

      // Label text
      ctx.fillStyle = '#000';
      ctx.fillText(label, box.x + 4, box.y - 6);
    }
  }
}

// Singleton
export const peopleDetector = new PeopleDetectionService();
