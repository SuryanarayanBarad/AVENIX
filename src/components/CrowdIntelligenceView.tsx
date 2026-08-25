import React, { useState } from 'react';
import { 
  Radar, 
  Activity, 
  ShieldCheck, 
  TrendingUp, 
  Clock, 
  Radio, 
  AlertCircle
} from 'lucide-react';
import { FacilityZone, SensorNode } from '../types';

interface CrowdIntelligenceViewProps {
  zones: FacilityZone[];
  sensors: SensorNode[];
}

export const CrowdIntelligenceView: React.FC<CrowdIntelligenceViewProps> = ({
  zones,
  sensors,
}) => {
  const [selectedZone, setSelectedZone] = useState<FacilityZone>(zones[0]);
  const [activeLayer, setActiveLayer] = useState<'all' | 'thermal' | 'lidar'>('all');
  const [forecastMinuteOffset, setForecastMinuteOffset] = useState<number>(0);
  const [hoveredNode, setHoveredNode] = useState<SensorNode | null>(null);

  const totalOccupancy = zones.reduce((sum, z) => sum + z.currentOccupancy, 0);
  const totalCapacity = zones.reduce((sum, z) => sum + z.maxCapacity, 0);
  const totalOccupancyPct = Math.round((totalOccupancy / totalCapacity) * 100);

  const timelineSteps = [
    { label: 'Now (Live)', offset: 0 },
    { label: '+15 min', offset: 15 },
    { label: '+30 min', offset: 30 },
    { label: '+45 min', offset: 45 },
    { label: '+60 min', offset: 60 },
  ];

  return (
    <div className="space-y-6 pb-12 text-white">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white font-display">Crowd Intelligence & Spatial Sensing</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#2E37A4]/20 text-[#2E37A4] border border-[#2E37A4]/30 backdrop-blur-md">
              LiDAR & Thermal Matrix
            </span>
          </div>
          <p className="text-xs text-white/60 mt-1">
            Anonymous real-time photon and thermal point-clouds mapped to facility ground floor coordinates.
          </p>
        </div>

        {/* Layer Toggles (Frosted Glass Pills) */}
        <div className="flex items-center bg-white/[0.06] p-1 rounded-2xl border border-white/[0.12] text-xs backdrop-blur-md">
          <button
            onClick={() => setActiveLayer('all')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
              activeLayer === 'all' ? 'bg-[#2E37A4] text-white font-bold shadow-md shadow-[#2E37A4]/30' : 'text-white/60 hover:text-white'
            }`}
          >
            All Sensors (42)
          </button>
          <button
            onClick={() => setActiveLayer('lidar')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
              activeLayer === 'lidar' ? 'bg-[#2E37A4] text-white font-bold shadow-md shadow-[#2E37A4]/30' : 'text-white/60 hover:text-white'
            }`}
          >
            LiDAR (18)
          </button>
          <button
            onClick={() => setActiveLayer('thermal')}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
              activeLayer === 'thermal' ? 'bg-[#2E37A4] text-white font-bold shadow-md shadow-[#2E37A4]/30' : 'text-white/60 hover:text-white'
            }`}
          >
            Thermal (24)
          </button>
        </div>
      </div>

      {/* 3 Top Telemetry Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="p-5 rounded-3xl glass-panel-elevated">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">Total Facility Occupancy</span>
            <div className="w-8 h-8 rounded-2xl bg-[#2E37A4]/20 text-[#2E37A4] flex items-center justify-center border border-[#2E37A4]/30">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-light text-white font-display mt-2">
            {totalOccupancy.toLocaleString()} <span className="text-xs font-normal text-white/50">/ {totalCapacity.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#2E37A4] font-semibold mt-1">
            <div className="w-20 bg-white/[0.10] h-2 rounded-full overflow-hidden">
              <div className="h-full bg-[#2E37A4] rounded-full shadow-[0_0_6px_rgba(46,55,164,0.8)]" style={{ width: `${totalOccupancyPct}%` }} />
            </div>
            <span>{totalOccupancyPct}% Capacity</span>
          </div>
        </div>

        <div className="p-5 rounded-3xl glass-panel-elevated">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">AI Inflow Velocity</span>
            <div className="w-8 h-8 rounded-2xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-500/30">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-light text-emerald-400 font-display mt-2">
            +12.4% <span className="text-xs font-normal text-white/50">velocity</span>
          </div>
          <p className="text-[11px] text-white/60 mt-1">
            Surge velocity peaking toward 12:00 PM triage rush
          </p>
        </div>

        <div className="p-5 rounded-3xl glass-panel-elevated">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60">Sensor Network Status</span>
            <div className="w-8 h-8 rounded-2xl bg-teal-500/20 text-teal-300 flex items-center justify-center border border-teal-500/30">
              <Radio className="w-4 h-4 text-teal-300 animate-pulse" />
            </div>
          </div>
          <div className="text-3xl font-light text-white font-display mt-2">
            42 / 42 <span className="text-xs font-normal text-white/50">Online</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-teal-300 font-medium mt-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>0 PII Captured • 100% Privacy Preserved</span>
          </div>
        </div>

      </div>

      {/* Floorplan & Zone Densities Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Interactive Floorplan Canvas (8 cols) */}
        <div className="lg:col-span-8 glass-panel-elevated rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[480px]">
          
          {/* Top Floorplan Bar */}
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <Radar className="w-5 h-5 text-[#2E37A4] animate-spin" style={{ animationDuration: '10s' }} />
              <div>
                <h3 className="font-bold text-sm font-display text-white">CityCare Ground Floor Spatial Matrix</h3>
                <span className="text-[10px] text-white/50 font-mono">Live Sensor Coordinate Grid (Z-Index 0.00m)</span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-white/60">
                <span className="w-2 h-2 rounded-full bg-[#2E37A4] shadow-[0_0_6px_rgba(46,55,164,0.8)]" />
                LiDAR
              </span>
              <span className="flex items-center gap-1 text-white/60">
                <span className="w-2 h-2 rounded-full bg-[#00D3C7] shadow-[0_0_6px_rgba(255,125,184,0.8)]" />
                Thermal
              </span>
              <span className="flex items-center gap-1 text-rose-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                Critical Zone (90%)
              </span>
            </div>
          </div>

          {/* SVG Hospital Floorplan Graphic (Frosted Glass Canvas) */}
          <div className="relative my-4 w-full h-[320px] bg-black/40 rounded-2xl border border-white/[0.12] p-3 overflow-hidden backdrop-blur-md">
            
            {/* Grid overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

            {/* Render Facility Zones */}
            {zones.map((zone) => {
              const isSelected = selectedZone.id === zone.id;
              
              const adjustedDensity = Math.min(100, Math.max(10, 
                forecastMinuteOffset === 0 ? zone.densityPct :
                zone.id === 'z-waiting' ? zone.densityPct + (forecastMinuteOffset === 30 ? 6 : 4) :
                zone.densityPct
              ));

              const heatColors = {
                Critical: 'bg-rose-500/25 border-rose-500/60 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.25)]',
                Congested: 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]',
                Moderate: 'bg-[#2E37A4]/20 border-[#2E37A4]/50 text-purple-200 shadow-[0_0_15px_rgba(46,55,164,0.2)]',
                Optimal: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
              };

              return (
                <div
                  key={zone.id}
                  onClick={() => setSelectedZone(zone)}
                  className={`absolute rounded-2xl border transition-all cursor-pointer p-2.5 flex flex-col justify-between backdrop-blur-md ${
                    heatColors[zone.status]
                  } ${isSelected ? 'ring-2 ring-white shadow-2xl scale-[1.02]' : 'hover:border-white/60'}`}
                  style={{
                    left: `${zone.x}%`,
                    top: `${zone.y}%`,
                    width: `${zone.width}%`,
                    height: `${zone.height}%`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] truncate text-white">{zone.name}</span>
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/50 text-white">
                      {adjustedDensity}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-white/70">
                    <span>{zone.currentOccupancy} pers</span>
                    <span>{zone.sensorType}</span>
                  </div>
                </div>
              );
            })}

            {/* Sensor Nodes Placement */}
            {sensors.map((sensor) => {
              if (activeLayer === 'lidar' && sensor.type !== 'LiDAR') return null;
              if (activeLayer === 'thermal' && sensor.type !== 'Thermal') return null;

              return (
                <div
                  key={sensor.id}
                  onMouseEnter={() => setHoveredNode(sensor)}
                  onMouseLeave={() => setHoveredNode(null)}
                  className={`absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer transition-transform hover:scale-150 ${
                    sensor.type === 'LiDAR'
                      ? 'bg-[#2E37A4] shadow-[0_0_8px_rgba(46,55,164,0.9)]'
                      : 'bg-[#00D3C7] shadow-[0_0_8px_rgba(255,125,184,0.9)]'
                  }`}
                  style={{ left: `${sensor.x}%`, top: `${sensor.y}%` }}
                >
                  <span className={`w-full h-full rounded-full block animate-ping opacity-75 ${
                    sensor.type === 'LiDAR' ? 'bg-[#2E37A4]' : 'bg-[#00D3C7]'
                  }`} />
                </div>
              );
            })}

            {/* Tooltip on Sensor hover */}
            {hoveredNode && (
              <div
                className="absolute z-30 p-2.5 glass-panel-elevated bg-[#12122b]/95 border border-white/20 rounded-xl text-[10px] shadow-2xl pointer-events-none text-white backdrop-blur-xl"
                style={{ left: `${hoveredNode.x + 2}%`, top: `${hoveredNode.y + 2}%` }}
              >
                <div className="font-bold text-white">{hoveredNode.id} ({hoveredNode.type})</div>
                <div className="text-white/60">{hoveredNode.activeReadings} spatial points detected</div>
                <div className="text-emerald-400">99.8% vector accuracy</div>
              </div>
            )}

          </div>

          {/* AI Forecast Time Scrubber Bar (Frosted Glass Bar) */}
          <div className="bg-white/[0.04] rounded-2xl p-3 border border-white/[0.10] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#2E37A4]" />
              <span className="font-bold text-white">AI Inflow Forecast Timeline:</span>
            </div>

            <div className="flex items-center bg-white/[0.06] border border-white/[0.10] rounded-xl p-1">
              {timelineSteps.map((step) => (
                <button
                  key={step.offset}
                  onClick={() => setForecastMinuteOffset(step.offset)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    forecastMinuteOffset === step.offset
                      ? 'bg-[#2E37A4] text-white shadow-md shadow-[#2E37A4]/30'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Right: Selected Zone Details & Breakdown (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Selected Zone Deep Dive */}
          <div className="glass-panel-elevated rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.10] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Selected Zone</span>
                <h3 className="text-base font-bold text-white font-display">{selectedZone.name}</h3>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border backdrop-blur-md ${
                selectedZone.status === 'Critical' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              }`}>
                {selectedZone.status}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white/60">Current Occupancy:</span>
                <span className="font-bold text-white">{selectedZone.currentOccupancy} / {selectedZone.maxCapacity}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-white/60">Density Ratio:</span>
                <span className="font-bold text-rose-400">{selectedZone.densityPct}% Full</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-white/60">Sensing Tech:</span>
                <span className="font-bold text-[#2E37A4]">{selectedZone.sensorType}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-white/60">Active Nodes:</span>
                <span className="font-bold text-white">{selectedZone.activeNodes} Nodes Online</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-white/60">Inflow Trend:</span>
                <span className="font-bold text-amber-300 capitalize">{selectedZone.trend} (+8% / 15m)</span>
              </div>
            </div>

            {selectedZone.densityPct >= 85 && (
              <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2 backdrop-blur-md">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-white">Congestion Alert</strong>
                  <span className="text-rose-200/80">Zone density exceeds 85% safety threshold. Suggest opening overflow counter.</span>
                </div>
              </div>
            )}
          </div>

          {/* All Zones List */}
          <div className="glass-panel-elevated rounded-3xl p-6 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/50">All Facility Zones</h4>
            <div className="space-y-2 text-xs">
              {zones.map((z) => (
                <button
                  key={z.id}
                  onClick={() => setSelectedZone(z)}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    selectedZone.id === z.id
                      ? 'border-[#2E37A4] bg-[#2E37A4]/20 font-semibold text-white shadow-[0_0_12px_rgba(46,55,164,0.25)]'
                      : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white'
                  }`}
                >
                  <span className="truncate text-white">{z.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-md ${
                    z.densityPct >= 85 ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}>
                    {z.densityPct}%
                  </span>
                </button>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
