'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Icons } from '@/components/ui/icons';

export default function NewProjectPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');

  // Worksite coordinates & geofence
  const [worksiteName, setWorksiteName] = useState('');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [geofenceRadius, setGeofenceRadius] = useState<string>('100');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Maharashtra');
  const [pincode, setPincode] = useState('');

  const [gpsStatus, setGpsStatus] = useState<'idle' | 'acquiring' | 'acquired' | 'error'>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Use device GPS to pin current location
  const acquireGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      return;
    }

    setGpsStatus('acquiring');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(8));
        setLongitude(position.coords.longitude.toFixed(8));
        setGpsStatus('acquired');
      },
      () => {
        setGpsStatus('error');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Project designation is required.');
      return;
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (!latitude || !longitude || isNaN(lat) || isNaN(lng)) {
      setErrorMessage('Site coordinates (latitude & longitude) are required for attendance geofence verification. Use "Pin My Location" or enter manually.');
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setErrorMessage('Invalid coordinates. Latitude must be -90 to 90, longitude -180 to 180.');
      return;
    }

    const radius = parseInt(geofenceRadius) || 100;
    if (radius < 10 || radius > 5000) {
      setErrorMessage('Geofence radius must be between 10m and 5000m.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await api.projects.create({
        name: name.trim(),
        description: description.trim() || undefined,
        startDate,
        endDate: endDate || undefined,
        worksiteName: worksiteName.trim() || undefined,
        latitude: lat,
        longitude: lng,
        geofenceRadiusMeters: radius,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
      });

      if (res.success && res.project) {
        router.push(`/contractor/projects/${res.project.id}`);
      } else {
        router.push('/contractor');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create worksite project.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full p-4 sm:p-6 max-w-2xl">
      <div className="mb-4">
        <Link
          href="/contractor"
          className="min-h-[44px] text-xs font-bold uppercase text-[var(--ink)] hover:underline inline-flex items-center gap-1"
        >
          <Icons.ArrowLeft size={16} />
          BACK TO DASHBOARD
        </Link>
      </div>

      <div className="bg-white border-2 border-[var(--ink)] p-6 border-t-8 border-t-[var(--register-blue)]">
        <div className="border-b border-[var(--ink-10)] pb-4 mb-6">
          <div className="text-[10px] font-bold font-mono tracking-widest uppercase text-[var(--register-blue)]">
            FORM P-1 · NEW PROJECT REGISTRATION
          </div>
          <h1 className="text-xl font-bold uppercase text-[var(--ink)] mt-0.5">
            Register Worksite Project
          </h1>
          <p className="text-xs text-[var(--ink-60)] mt-1">
            Establish a formal project register with site coordinates for attendance geofence verification.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 mb-4 border-l-4 border-l-[#B91C1C] bg-[#FEF2F2] text-[#991B1B] text-xs font-semibold">
            <div className="flex items-center gap-1.5 mb-0.5 font-bold uppercase">
              <Icons.AlertTriangle size={14} />
              <span>REGISTRATION REJECTED</span>
            </div>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project Name */}
          <div>
            <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
              PROJECT NAME / SITE IDENTIFIER *
            </label>
            <input
              id="projectName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nariman Point Commercial Tower A"
              className="w-full min-h-[44px] border-2 border-[var(--ink)] p-2.5 text-sm outline-none focus:bg-[#FFFDF5]"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
              PROJECT SCOPE & SITE DESCRIPTION
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. RCC Structure, foundation piling, and brick masonry workforce..."
              rows={3}
              className="w-full min-h-[44px] border-2 border-[var(--ink)] p-2.5 text-xs font-sans outline-none focus:bg-[#FFFDF5]"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                COMMENCEMENT DATE *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-h-[44px] border border-[var(--ink)] p-2 text-xs font-data"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--ink)] mb-1">
                EXPECTED COMPLETION DATE
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full min-h-[44px] border border-[var(--ink)] p-2 text-xs font-data"
              />
            </div>
          </div>

          {/* Site Coordinates Section */}
          <div className="border-2 border-[var(--site-orange)] bg-[#FFFDF5] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Icons.MapPin size={16} className="text-[var(--site-orange)]" />
              <span className="text-xs font-bold uppercase text-[var(--ink)]">
                SITE COORDINATES & GEOFENCE (REQUIRED)
              </span>
            </div>

            <p className="text-[10px] text-[var(--ink-60)] mb-3">
              Attendance verification uses GPS geofencing. Workers must be within the radius of these coordinates to mark attendance.
            </p>

            {/* GPS Pin button */}
            <Button
              type="button"
              variant="yellow"
              fullWidth
              size="md"
              onClick={acquireGps}
              isLoading={gpsStatus === 'acquiring'}
              className="mb-3"
            >
              <Icons.MapPin size={16} className="mr-2" />
              {gpsStatus === 'acquired' ? '📍 LOCATION PINNED — TAP TO RE-PIN' : '📍 PIN MY CURRENT LOCATION'}
            </Button>

            {gpsStatus === 'error' && (
              <div className="text-xs text-[#B91C1C] mb-2">
                GPS unavailable. Enter coordinates manually below.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--ink)] mb-1">
                  LATITUDE *
                </label>
                <input
                  id="latitude"
                  type="text"
                  inputMode="decimal"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="e.g. 19.07609800"
                  className="w-full min-h-[44px] border border-[var(--ink)] p-2 text-xs font-data outline-none focus:bg-white"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--ink)] mb-1">
                  LONGITUDE *
                </label>
                <input
                  id="longitude"
                  type="text"
                  inputMode="decimal"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="e.g. 72.87765600"
                  className="w-full min-h-[44px] border border-[var(--ink)] p-2 text-xs font-data outline-none focus:bg-white"
                  required
                />
              </div>
            </div>

            {/* Geofence Radius */}
            <div className="mb-3">
              <label className="block text-[10px] font-bold uppercase text-[var(--ink)] mb-1">
                GEOFENCE RADIUS (METERS) *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={geofenceRadius}
                  onChange={(e) => setGeofenceRadius(e.target.value)}
                  className="flex-1"
                />
                <input
                  id="geofenceRadius"
                  type="number"
                  min="10"
                  max="5000"
                  value={geofenceRadius}
                  onChange={(e) => setGeofenceRadius(e.target.value)}
                  className="w-20 min-h-[44px] border border-[var(--ink)] p-1.5 text-xs font-data text-center"
                />
                <span className="text-xs font-bold text-[var(--ink-60)]">m</span>
              </div>
              <p className="text-[10px] text-[var(--ink-60)] mt-1">
                Workers must be within this radius to mark attendance. Default: 100m. Larger sites may need 200-500m.
              </p>
            </div>

            {/* Worksite Name */}
            <div className="mb-3">
              <label className="block text-[10px] font-bold uppercase text-[var(--ink)] mb-1">
                WORKSITE / GATE NAME
              </label>
              <input
                id="worksiteName"
                type="text"
                value={worksiteName}
                onChange={(e) => setWorksiteName(e.target.value)}
                placeholder="e.g. Main Gate, Pier 42 Casting Yard"
                className="w-full min-h-[44px] border border-[var(--ink)] p-2 text-xs outline-none focus:bg-white"
              />
            </div>

            {/* Address Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--ink)] mb-1">
                  ADDRESS
                </label>
                <input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street address"
                  className="w-full min-h-[44px] border border-[var(--ink)] p-2 text-xs outline-none focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--ink)] mb-1">
                  CITY
                </label>
                <input
                  id="city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Mumbai"
                  className="w-full min-h-[44px] border border-[var(--ink)] p-2 text-xs outline-none focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--ink)] mb-1">
                  STATE
                </label>
                <input
                  id="state"
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full min-h-[44px] border border-[var(--ink)] p-2 text-xs outline-none focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--ink)] mb-1">
                  PINCODE
                </label>
                <input
                  id="pincode"
                  type="text"
                  inputMode="numeric"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="400069"
                  className="w-full min-h-[44px] border border-[var(--ink)] p-2 text-xs outline-none focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-[var(--ink-10)] flex gap-2">
            <Link href="/contractor" className="flex-1">
              <Button variant="secondary" size="md" fullWidth>
                CANCEL
              </Button>
            </Link>
            <Button
              type="submit"
              variant="primary"
              size="md"
              fullWidth
              isLoading={isLoading}
              className="flex-1"
            >
              REGISTER PROJECT
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
