import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CameraRecord, CameraAnalytics } from '../types';
import { peopleDetector, DetectionResult } from '../services/peopleDetector';
import { cameraApi } from '../services/cameraApi';

interface LocalCamera {
  localId: string;    // local detection reference id
  backendRecord: CameraRecord;
  stream: MediaStream | null;
  latestDetection: DetectionResult | null;
  analytics: CameraAnalytics | null;
  modelReady: boolean;
}

const CameraTile: React.FC<{
  cam: LocalCamera;
  isSelected: boolean;
  onSelect: () => void;
  onDisconnect: () => void;
  onVideoReady: (videoEl: HTMLVideoElement) => void;
}> = ({ cam, isSelected, onSelect, onDisconnect, onVideoReady }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Attach stream to video
  useEffect(() => {
    if (videoRef.current && cam.stream) {
      videoRef.current.srcObject = cam.stream;
      videoRef.current.play().then(() => {
        if (videoRef.current) onVideoReady(videoRef.current);
      }).catch(() => {});
    }
  }, [cam.stream]);

  // Draw bounding boxes
  useEffect(() => {
    if (canvasRef.current && videoRef.current && cam.latestDetection) {
      peopleDetector.drawBoxes(
        canvasRef.current,
        cam.latestDetection.boundingBoxes,
        videoRef.current.videoWidth,
        videoRef.current.videoHeight,
      );
    }
  }, [cam.latestDetection]);

  const det = cam.latestDetection;

  return (
    <div
      onClick={onSelect}
      className={`relative bg-white/5 border rounded-2xl overflow-hidden backdrop-blur-md cursor-pointer transition-all hover:border-white/30 ${
        isSelected ? 'border-[#2E37A4]/60 ring-1 ring-[#2E37A4]/30' : 'border-white/10'
      }`}
    >
      {/* Video + overlay container */}
      <div className="relative aspect-video bg-[#0A1B39]">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {/* Live badge */}
        <div className="absolute top-3 left-3 z-10 px-2.5 py-1 bg-black/60 backdrop-blur border border-white/10 rounded-lg flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-semibold text-[#fff] tracking-wider uppercase">Live</span>
        </div>

        {/* People count badge */}
        {det && (
          <div className="absolute top-3 right-3 z-10 px-2.5 py-1 bg-black/60 backdrop-blur border border-white/10 rounded-lg flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-[#7ec8ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-sm font-bold text-[#fff] tabular-nums">{det.peopleCount}</span>
            <span className="text-[10px] font-medium text-[#ffffffa6]">in view</span>
          </div>
        )}

        {/* Density indicator */}
        {det && (
          <div className="absolute bottom-3 left-3 z-10">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
              det.density === 'High' ? 'bg-[#EF1E1E] text-[#fff]' :
              det.density === 'Medium' ? 'bg-[#E04F16] text-[#fff]' :
              'bg-[#1B7F46] text-[#fff]'
            }`}>
              {det.density} Density
            </span>
          </div>
        )}

        {/* Loading model overlay */}
        {!cam.modelReady && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
            <div className="text-center space-y-2">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
              <p className="text-xs text-[#ffffffb3]">Starting the detector…</p>
            </div>
          </div>
        )}
      </div>

      {/* Camera info bar */}
      <div className="p-3 flex justify-between items-center">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--pc-text)] truncate">{cam.backendRecord.name}</p>
          <p className="text-[11px] text-[var(--pc-text-muted)]">{cam.backendRecord.location}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDisconnect(); }}
          className="shrink-0 px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-[11px] font-medium transition-all cursor-pointer"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

export function CameraMonitorView() {
  const [cameras, setCameras] = useState<LocalCamera[]>([]);
  const [selectedCameraIdx, setSelectedCameraIdx] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Add camera form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCameraName, setNewCameraName] = useState('');
  const [newCameraLocation, setNewCameraLocation] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Track model state
  const [modelLoaded, setModelLoaded] = useState(false);

  // Load model on mount
  useEffect(() => {
    peopleDetector.loadModel()
      .then(() => setModelLoaded(true))
      .catch(err => {
        console.error('[CameraMonitor] Failed to load model:', err);
        setError('Failed to load AI detection model. Detection will use estimation mode.');
      });

    return () => {
      peopleDetector.stopAll();
    };
  }, []);

  // Set up detection callbacks whenever cameras change
  const setupDetection = useCallback((cameraId: string, backendId: string, videoEl: HTMLVideoElement) => {
    peopleDetector.onDetection(cameraId, (result) => {
      // Update local state
      setCameras(prev => prev.map(c =>
        c.backendRecord.id === backendId
          ? { ...c, latestDetection: result, modelReady: true }
          : c
      ));

      // Post analytics to backend
      const analyticsData = {
        peopleCount: result.peopleCount,
        queueCount: Math.max(0, result.peopleCount - 1), // Estimate queue as people minus one potential staff
        zoneCounts: {
          'Detection Area': result.peopleCount,
        },
        densityLevel: result.density,
      };

      cameraApi.postCameraAnalytics(backendId, analyticsData)
        .then(analytics => {
          setCameras(prev => prev.map(c =>
            c.backendRecord.id === backendId ? { ...c, analytics } : c
          ));
        })
        .catch(e => console.error('Analytics post failed:', e));
    });

    if (modelLoaded) {
      peopleDetector.startDetection(cameraId, videoEl);
    }
  }, [modelLoaded]);

  const handleAddCamera = async () => {
    if (!newCameraName.trim()) return;
    setConnecting(true);
    setError(null);

    try {
      // Get webcam stream
      const localId = `cam-${Date.now()}`;
      const stream = await peopleDetector.startCamera(localId);

      // Register on backend
      const backendRecord = await cameraApi.connectCamera({
        name: newCameraName.trim(),
        location: newCameraLocation.trim() || 'Unspecified',
        type: 'webcam',
      });

      const newCam: LocalCamera = {
        localId,
        backendRecord,
        stream,
        latestDetection: null,
        analytics: null,
        modelReady: modelLoaded,
      };

      setCameras(prev => [...prev, newCam]);
      setSelectedCameraIdx(cameras.length); // Select the new camera
      setShowAddForm(false);
      setNewCameraName('');
      setNewCameraLocation('');

    } catch (err: any) {
      setError(err.message || 'Failed to connect camera. Check permissions.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (index: number) => {
    const cam = cameras[index];
    if (!cam) return;

    peopleDetector.stopCamera(cam.localId);

    // Also stop by whatever ID was used
    if (cam.stream) {
      cam.stream.getTracks().forEach(t => t.stop());
    }

    try {
      await cameraApi.disconnectCamera(cam.backendRecord.id);
    } catch (e) {
      console.error('Backend disconnect failed:', e);
    }

    setCameras(prev => prev.filter((_, i) => i !== index));
    if (selectedCameraIdx >= cameras.length - 1) {
      setSelectedCameraIdx(Math.max(0, cameras.length - 2));
    }
  };

  const selectedCamera = cameras[selectedCameraIdx] || null;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--pc-text)]">Camera Monitoring</h2>
          <p className="mt-1 text-sm text-[var(--pc-text-muted)]">
            Each connected camera is read by an on-device model that counts how many people are in
            frame. Nothing leaves this machine — no image is uploaded, and no face is identified or stored.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="pc-btn-primary shrink-0 flex items-center gap-2 px-5 py-2.5 text-sm font-semibold cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Camera
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-start gap-3">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-sm whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {/* Add Camera Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={() => setShowAddForm(false)}>
          <div
            className="w-full max-w-sm rounded-3xl border border-white/[0.15] bg-[#12122b]/95 text-white shadow-2xl backdrop-blur-2xl p-6 space-y-5"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h3 className="text-xl font-bold text-[var(--pc-text)] font-display">Connect a camera</h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--pc-text-muted)]">
                Name the position you are monitoring — a lobby, a ward entrance. The video comes from a
                camera attached to this computer, which is what a browser is allowed to open; a hospital
                CCTV stream reaches it by pointing that camera at the wall display, or through a bridge
                that republishes the stream as a webcam device.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[var(--pc-text)] font-medium text-[13px] mb-1.5">Camera Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Main Lobby Camera"
                  value={newCameraName}
                  onChange={e => setNewCameraName(e.target.value)}
                  className="w-full px-4 py-2.5 glass-input rounded-2xl placeholder-white/40 text-white text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[var(--pc-text)] font-medium text-[13px] mb-1.5">Location</label>
                <input
                  type="text"
                  placeholder="e.g. Front Desk, Waiting Hall"
                  value={newCameraLocation}
                  onChange={e => setNewCameraLocation(e.target.value)}
                  className="w-full px-4 py-2.5 glass-input rounded-2xl placeholder-white/40 text-white text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 px-4 py-2.5 bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.15] rounded-2xl text-white font-medium text-sm transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCamera}
                disabled={connecting || !newCameraName.trim()}
                className="pc-btn-primary flex-1 px-4 py-2.5 text-sm transition-all cursor-pointer disabled:opacity-50 font-semibold"
              >
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {cameras.length === 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center backdrop-blur-md">
          <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-medium text-white mb-2">No Cameras Connected</h3>
          <p className="text-white/50 max-w-sm mx-auto mb-6 text-sm">
            Add cameras to start monitoring crowd density with AI-powered people detection. You can name each camera and assign it to a location.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="pc-btn-primary px-6 py-2.5 font-semibold text-sm rounded-xl transition-all cursor-pointer font-semibold"
          >
            Add Your First Camera
          </button>
        </div>
      )}

      {/* Camera grid + Analytics sidebar */}
      {cameras.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Camera feeds */}
          <div className="lg:col-span-2 space-y-6">
            {/* Grid of cameras */}
            <div className={`grid gap-4 ${cameras.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
              {cameras.map((cam, idx) => (
                <CameraTile
                  key={cam.backendRecord.id}
                  cam={cam}
                  isSelected={idx === selectedCameraIdx}
                  onSelect={() => setSelectedCameraIdx(idx)}
                  onDisconnect={() => handleDisconnect(idx)}
                  onVideoReady={(videoEl) => setupDetection(cam.localId, cam.backendRecord.id, videoEl)}
                />
              ))}
            </div>

            {/* Model status */}
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3 backdrop-blur-md">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${modelLoaded ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`} />
              <p className="text-xs text-white/60">
                {modelLoaded
                  ? 'TensorFlow.js COCO-SSD model active — detecting people in real-time'
                  : 'Loading AI detection model...'}
              </p>
            </div>
          </div>

          {/* Analytics sidebar */}
          <div className="space-y-6">
            {/* Selected camera analytics */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
              <h3 className="text-lg font-medium text-white mb-1">
                {selectedCamera?.backendRecord.name || 'Live Analytics'}
              </h3>
              <p className="text-xs text-white/40 mb-6">{selectedCamera?.backendRecord.location || 'Select a camera'}</p>

              <div className="space-y-6">
                <div>
                  <p className="text-sm text-white/50 mb-1">Status</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${selectedCamera ? 'bg-green-400' : 'bg-white/20'}`} />
                    <span className="text-lg font-medium text-white/90">
                      {selectedCamera ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-white/50 mb-1">People Detected</p>
                    <p className="text-2xl font-light text-white">
                      {selectedCamera?.latestDetection?.peopleCount ?? '-'}
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-white/50 mb-1">Density Level</p>
                    <p className={`text-lg font-medium ${
                      selectedCamera?.latestDetection?.density === 'High' ? 'text-red-400' :
                      selectedCamera?.latestDetection?.density === 'Medium' ? 'text-orange-400' :
                      selectedCamera?.latestDetection?.density === 'Low' ? 'text-green-400' : 'text-white/30'
                    }`}>
                      {selectedCamera?.latestDetection?.density ?? '-'}
                    </p>
                  </div>
                </div>

                {/* Detection confidence */}
                {selectedCamera?.latestDetection && selectedCamera.latestDetection.boundingBoxes.length > 0 && (
                  <div>
                    <p className="text-sm text-white/50 mb-3">Detection Confidence</p>
                    <div className="space-y-2">
                      {selectedCamera.latestDetection.boundingBoxes.slice(0, 5).map((box, i) => {
                        const pct = Math.round(box.score * 100);
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-xs text-white/50 w-16 shrink-0">Person {i + 1}</span>
                            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  pct >= 70 ? 'bg-green-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-white/60 w-10 text-right font-mono">{pct}%</span>
                          </div>
                        );
                      })}
                      {selectedCamera.latestDetection.boundingBoxes.length > 5 && (
                        <p className="text-[11px] text-white/30 italic">
                          +{selectedCamera.latestDetection.boundingBoxes.length - 5} more detections
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Summary across all cameras */}
            {cameras.length > 1 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <h3 className="text-sm font-medium text-white mb-4">All Cameras Summary</h3>
                <div className="space-y-3">
                  {cameras.map((cam, idx) => (
                    <div key={cam.backendRecord.id} className="flex justify-between items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                        <span className="text-xs text-white/70 truncate">{cam.backendRecord.name}</span>
                      </div>
                      <span className="text-xs font-bold text-white bg-white/10 px-2 py-0.5 rounded-md shrink-0">
                        {cam.latestDetection?.peopleCount ?? 0}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                    <span className="text-xs text-white/50 font-medium">Total People</span>
                    <span className="text-sm font-bold text-white">
                      {cameras.reduce((sum, c) => sum + (c.latestDetection?.peopleCount ?? 0), 0)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Privacy notice */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 backdrop-blur-md">
              <div className="flex gap-3">
                <svg className="w-5 h-5 shrink-0 text-[var(--pc-info-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[13px] leading-relaxed text-[var(--pc-info-text)]">
                  <strong>Privacy:</strong> TensorFlow.js runs entirely in your browser. Video frames never leave your device. Only anonymous people counts are sent to the server.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
