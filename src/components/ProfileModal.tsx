import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Camera, Mail, Phone, Shield, Trash2, User as UserIcon } from 'lucide-react';
import { profileApi } from '../services/authApi';
import { User } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onSaved: (user: User) => void;
}

const modalEase = [0.22, 1, 0.36, 1] as const;

/** 4 MB, matching the server-side limit in lib/imageStorage.ts. */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/**
 * Self-service profile editor. It shows only display information — email and
 * role are read-only here, and passwords or tokens are never part of this view.
 */
export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, user, onClose, onSaved }) => {
  const shouldReduceMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;
    setName(user.name ?? '');
    setPhone(user.phone ?? '');
    setPhotoPreview(user.avatarUrl ?? null);
    setPhotoData(null);
    setRemovePhoto(false);
    setError('');
    setStatus('');
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const initials = (user.name || '')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const handlePhotoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Choose an image file (PNG, JPEG, WebP, or GIF).');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('That image is larger than 4 MB. Choose a smaller photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setPhotoData(dataUrl);
      setPhotoPreview(dataUrl);
      setRemovePhoto(false);
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);

    try {
      const result = await profileApi.update({
        name: name.trim(),
        phone: phone.trim() ? phone.trim() : null,
        ...(photoData ? { photo: photoData } : {}),
        ...(removePhoto ? { removePhoto: true } : {}),
      });
      onSaved(result.user);
      setStatus('Profile saved.');
      setPhotoData(null);
      setRemovePhoto(false);
    } catch (err: any) {
      setError(err.message || 'Could not save your profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence initial={false}>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.14, ease: modalEase }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/[0.20] bg-[#12122b]/95 text-white shadow-2xl glass-panel-elevated backdrop-blur-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Your profile"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: modalEase }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="p-6 pb-4">
            <h3 className="font-bold text-xl font-display text-white text-center">Profile</h3>
            <p className="text-xs text-white/60 text-center mt-1">Update the name and photo other people see</p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4 text-xs">
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-2.5 rounded-xl font-medium text-center">
                {error}
              </div>
            )}
            {status && !error && (
              <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-xl font-medium text-center">
                {status}
              </div>
            )}

            {/* Photo */}
            <div className="flex flex-wrap items-center gap-4">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt={user.name}
                  className="w-16 h-16 rounded-2xl object-cover border border-white/20 shadow-lg shadow-[#8e7dff]/20"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#8e7dff] to-[#ff7db8] flex items-center justify-center text-white font-bold text-lg border border-white/20 shadow-lg shadow-[#8e7dff]/20">
                  {initials || <UserIcon className="w-6 h-6" />}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.15] text-white font-semibold transition-all cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-[#8e7dff]" />
                  Upload photo
                </button>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoPreview(null);
                      setPhotoData(null);
                      setRemovePhoto(true);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-2xl text-white/60 hover:text-white font-medium transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handlePhotoSelected}
              />
            </div>

            <div>
              <label className="block text-white/80 font-bold mb-1.5">Full Name</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Kumar"
                  className="w-full pl-9 pr-4 py-2.5 glass-input rounded-2xl placeholder-white/40 text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-white/80 font-bold mb-1.5">Phone (optional)</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full pl-9 pr-4 py-2.5 glass-input rounded-2xl placeholder-white/40 text-white"
                />
              </div>
            </div>

            {/* Read-only account facts — never editable from a profile screen */}
            <div className="space-y-2 rounded-2xl border border-white/[0.10] bg-white/[0.04] p-3">
              <div className="flex items-center gap-2 text-white/60">
                <Mail className="w-3.5 h-3.5 text-white/40" />
                <span className="truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-2 text-white/60">
                <Shield className="w-3.5 h-3.5 text-white/40" />
                <span>{user.role}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-5 py-3 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.15] text-white font-semibold transition-all cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#8e7dff] to-purple-600 hover:opacity-90 text-white font-bold shadow-lg shadow-[#8e7dff]/30 cursor-pointer border border-white/20 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
