import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Upload, UserRound, Check, X, Search, Plus, Stethoscope, Pencil, Trash2, ChevronDown, AlertCircle } from 'lucide-react';
import { ManagedDoctor } from '../../types';
import { superAdminApi } from '../../services/superAdminApi';

const panelEase = [0.22, 1, 0.36, 1] as const;

/** 4 MB, matching the server-side limit in lib/imageStorage.ts. */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** Reads a chosen file into the base64 data URL the API stores as a file. */
const readImageAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  if (!file.type.startsWith('image/')) {
    reject(new Error('Choose an image file (PNG, JPEG, WebP, or GIF).'));
    return;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    reject(new Error('That image is larger than 4 MB. Choose a smaller photo.'));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('That image could not be read.'));
  reader.readAsDataURL(file);
});

/** Doctor avatar with an initials fallback, matching the app's gradient chips. */
const DoctorAvatar: React.FC<{ doctor: { name: string; photoUrl?: string | null }; size?: string }> = ({ doctor, size = 'w-10 h-10' }) => {
  const [failed, setFailed] = useState(false);
  const initials = doctor.name.split(' ').map(part => part[0]).join('').substring(0, 2).toUpperCase();

  if (doctor.photoUrl && !failed) {
    return (
      <img
        src={doctor.photoUrl}
        alt={doctor.name}
        onError={() => setFailed(true)}
        className={`${size} rounded-xl object-cover border border-white/20 shrink-0`}
      />
    );
  }
  return (
    <div className={`${size} rounded-xl bg-gradient-to-tr from-[#2E37A4] to-[#00D3C7] flex items-center justify-center text-white font-bold text-xs border border-white/20 shrink-0`}>
      {initials || <UserRound className="w-4 h-4" />}
    </div>
  );
};

/**
 * Standard medical specializations offered as suggestions. Anything picked here
 * that the facility does not have yet is created on the spot, so the list is a
 * shortcut — not a fixed set.
 */
const SPECIALIZATION_CATALOG = [
  'Anaesthesiology', 'Cardiology', 'Cardiothoracic Surgery', 'Dentistry', 'Dermatology',
  'Diabetology', 'Emergency Medicine', 'Endocrinology', 'ENT (Otolaryngology)', 'Family Medicine',
  'Gastroenterology', 'General Medicine', 'General Surgery', 'Geriatrics', 'Gynaecology',
  'Haematology', 'Hepatology', 'Immunology', 'Infectious Diseases', 'Internal Medicine',
  'Nephrology', 'Neurology', 'Neurosurgery', 'Obstetrics', 'Oncology',
  'Ophthalmology', 'Orthopaedics', 'Paediatrics', 'Pathology', 'Physiotherapy',
  'Plastic Surgery', 'Psychiatry', 'Pulmonology', 'Radiology', 'Rheumatology',
  'Sports Medicine', 'Urology', 'Vascular Surgery',
];

/**
 * Searchable specialization picker. It lists every specialization the facility
 * has, plus standard ones it does not — typing filters both, and an unmatched
 * name can be created inline.
 */
const SpecializationPicker: React.FC<{
  departments: { id: string; name: string }[];
  value: string;
  onChange: (departmentId: string) => void;
  onCreate: (name: string) => Promise<{ id: string; name: string } | null>;
}> = ({ departments, value, onChange, onCreate }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const reduceMotion = useReducedMotion();

  const selected = departments.find(d => d.id === value);
  const term = query.trim().toLowerCase();

  const existing = departments.filter(d => d.name.toLowerCase().includes(term));
  const existingNames = new Set(departments.map(d => d.name.toLowerCase()));
  const suggested = SPECIALIZATION_CATALOG
    .filter(name => !existingNames.has(name.toLowerCase()) && name.toLowerCase().includes(term));
  const canCreateTyped = !!query.trim()
    && !existingNames.has(query.trim().toLowerCase())
    && !suggested.some(name => name.toLowerCase() === query.trim().toLowerCase());

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const pickNew = async (name: string) => {
    setCreating(true);
    try {
      const created = await onCreate(name);
      if (created) {
        onChange(created.id);
        close();
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 bg-black/20 border rounded-lg px-4 py-2 text-left outline-none transition-colors ${
          open ? 'border-pink-500/50' : 'border-white/10 hover:border-white/20'
        } ${selected ? 'text-white' : 'text-white/40'}`}
      >
        <span className="truncate">{selected ? selected.name : 'Select specialization...'}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <motion.div
            key="specialization-menu"
            initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: panelEase }}
            className="absolute left-0 right-0 z-40 mt-2 rounded-xl border border-white/15 bg-[#12122b] shadow-2xl overflow-hidden origin-top"
          >
            <div className="p-2 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search specializations..."
                  className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-pink-500/50"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto py-1">
              {existing.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[11px] uppercase tracking-wider text-white/40">In this facility</div>
                  {existing.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => { onChange(d.id); close(); }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors ${
                        d.id === value ? 'text-pink-400' : 'text-white/80'
                      }`}
                    >
                      <span className="truncate">{d.name}</span>
                      {d.id === value && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  ))}
                </>
              )}

              {suggested.length > 0 && (
                <>
                  <div className="px-3 py-1 mt-1 text-[11px] uppercase tracking-wider text-white/40">Add a standard specialization</div>
                  {suggested.map(name => (
                    <button
                      key={name}
                      type="button"
                      disabled={creating}
                      onClick={() => pickNew(name)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-white/70 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0 text-pink-400" />
                      <span className="truncate">{name}</span>
                    </button>
                  ))}
                </>
              )}

              {canCreateTyped && (
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => pickNew(query.trim())}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-pink-400 hover:bg-white/5 transition-colors disabled:opacity-50 border-t border-white/10 mt-1"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Create "{query.trim()}"</span>
                </button>
              )}

              {existing.length === 0 && suggested.length === 0 && !canCreateTyped && (
                <div className="px-3 py-4 text-sm text-white/40 text-center">No specializations found.</div>
              )}
            </div>
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </div>
  );
};

/** Consistent label wrapper so every field in the doctor form lines up. */
const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <div className={className}>
    <label className="block text-xs font-medium text-white/60 mb-1.5">{label}</label>
    {children}
  </div>
);

const inputClass = 'w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-pink-500/50 transition-colors';

interface DoctorDirectoryViewProps {
  /** SUPER_ADMIN manages doctors; ADMIN and MANAGER may only look. */
  canManage?: boolean;
}

/**
 * Doctor directory — the Command Center's `doctors` tab.
 * Creating, editing, photographing and retiring doctors all live here; the
 * server enforces the same boundary, so a read-only viewer who forces the
 * controls open still cannot write.
 */
export const DoctorDirectoryView: React.FC<DoctorDirectoryViewProps> = ({ canManage = false }) => {
  const shouldReduceMotion = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Doctors & Specializations state
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [doctors, setDoctors] = useState<ManagedDoctor[]>([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [showDoctorForm, setShowDoctorForm] = useState(false);
  const [showSpecializations, setShowSpecializations] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [newDoc, setNewDoc] = useState({ name: '', email: '', password: '', departmentId: '', qualification: '', experience: 0, consultationFee: 0 });
  const [newDocPhoto, setNewDocPhoto] = useState<string | null>(null);
  const [savingDoctor, setSavingDoctor] = useState(false);
  const newDocPhotoInput = useRef<HTMLInputElement>(null);
  const rowPhotoInput = useRef<HTMLInputElement>(null);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; departmentId: string; qualification: string; experienceYears: number; consultationFee: number }>(
    { name: '', departmentId: '', qualification: '', experienceYears: 0, consultationFee: 0 },
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [depts, docs] = await Promise.all([
        superAdminApi.getDepartments(),
        superAdminApi.getDoctors(),
      ]);
      setDepartments(depts);
      setDoctors(docs);
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'The doctor directory could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  /** Creates a specialization and folds it into local state — used by the picker too. */
  const createSpecialization = async (name: string) => {
    try {
      const created = await superAdminApi.createDepartment(name.trim());
      setDepartments(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      return created;
    } catch (err: any) {
      alert(err.message || 'Failed to create specialization');
      return null;
    }
  };

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    const created = await createSpecialization(newDeptName);
    if (created) setNewDeptName('');
  };

  const handleAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDoc.departmentId) {
      alert('Choose a specialization for this doctor.');
      return;
    }
    setSavingDoctor(true);
    try {
      // The photo travels as a data URL; the server validates it and stores a file.
      await superAdminApi.createDoctor({ ...newDoc, photo: newDocPhoto ?? undefined });
      setNewDoc({ name: '', email: '', password: '', departmentId: '', qualification: '', experience: 0, consultationFee: 0 });
      setNewDocPhoto(null);
      setShowDoctorForm(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to add doctor');
    } finally {
      setSavingDoctor(false);
    }
  };

  const handleNewDocPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setNewDocPhoto(await readImageAsDataUrl(file));
    } catch (err: any) {
      alert(err.message);
    }
  };

  /** Replace an existing doctor's photo — the stored file is swapped server-side. */
  const handleRowPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const doctorId = photoTargetId;
    e.target.value = '';
    setPhotoTargetId(null);
    if (!file || !doctorId) return;
    try {
      const photo = await readImageAsDataUrl(file);
      await superAdminApi.updateDoctor(doctorId, { photo });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update the doctor photo');
    }
  };

  const startEditing = (doc: ManagedDoctor) => {
    setEditingId(doc.id);
    setEditDraft({
      name: doc.name,
      departmentId: doc.departmentId,
      qualification: doc.qualification ?? '',
      experienceYears: doc.experienceYears ?? 0,
      consultationFee: doc.consultationFee ?? 0,
    });
  };

  const handleSaveDoctor = async (id: string) => {
    try {
      await superAdminApi.updateDoctor(id, editDraft);
      setEditingId(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update doctor');
    }
  };

  const handleDeleteDoctor = async (id: string) => {
    if (!window.confirm('Delete this doctor?')) return;
    try {
      const result = await superAdminApi.deleteDoctor(id);
      if (result?.deactivated && result.message) alert(result.message);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete doctor');
    }
  };

  const doctorQuery = doctorSearch.trim().toLowerCase();
  const visibleDoctors = doctorQuery
    ? doctors.filter(doc => [doc.name, doc.user?.email, doc.department?.name, doc.qualification]
        .some(value => String(value ?? '').toLowerCase().includes(doctorQuery)))
    : doctors;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-white/50">Loading...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{loadError}</p>
            <button onClick={loadData} data-plain className="mt-1 text-xs font-semibold text-red-200 underline underline-offset-2 hover:text-white">
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 overflow-y-auto">

        {/* Toolbar — counts on the left, the two actions on the right */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Stethoscope className="w-4 h-4 text-pink-400" />
            <span><span className="text-white font-semibold">{doctors.length}</span> doctors</span>
            <span className="text-white/25">•</span>
            <span><span className="text-white font-semibold">{departments.length}</span> specializations</span>
          </div>

          {canManage ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setShowSpecializations(!showSpecializations)}
                className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Manage specializations
                <ChevronDown className={`w-4 h-4 transition-transform ${showSpecializations ? 'rotate-180' : ''}`} />
              </button>
              <button
                onClick={() => setShowDoctorForm(!showDoctorForm)}
                className="flex items-center justify-center gap-2 bg-pink-500 hover:bg-pink-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {showDoctorForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {showDoctorForm ? 'Cancel' : 'Add Doctor'}
              </button>
            </div>
          ) : (
            <span className="text-xs text-white/45">View only — doctor management is a Super Admin action.</span>
          )}
        </div>

        {/* Specializations — collapsed by default so the page stays clean */}
        <AnimatePresence initial={false}>
        {showSpecializations && (
          <motion.div
            key="specializations"
            initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: panelEase }}
            className="overflow-hidden"
          >
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <form onSubmit={handleAddDept} className="flex flex-col sm:flex-row gap-2 mb-4">
              <input
                type="text"
                placeholder="New specialization (e.g. Cardiology)"
                className={inputClass + ' sm:flex-1'}
                value={newDeptName}
                onChange={e => setNewDeptName(e.target.value)}
                required
              />
              <button type="submit" className="bg-pink-500 hover:bg-pink-600 text-white px-5 py-2 rounded-lg font-medium shrink-0">
                Add
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              {departments.map(d => (
                <span key={d.id} className="bg-white/10 px-3 py-1.5 rounded-full text-white/80 text-sm">
                  {d.name}
                </span>
              ))}
              {departments.length === 0 && <div className="text-white/50 text-sm">No specializations yet.</div>}
            </div>
          </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Add Doctor — labelled fields on a grid that reflows down to mobile */}
        <AnimatePresence initial={false}>
        {showDoctorForm && (
          <motion.form
            key="add-doctor"
            onSubmit={handleAddDoctor}
            initial={shouldReduceMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: panelEase }}
            className="bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-6"
          >
            <h3 className="text-base font-semibold text-white mb-4">Add a doctor</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <Field label="Doctor name">
                <input
                  type="text"
                  placeholder="e.g. Sharma"
                  className={inputClass}
                  value={newDoc.name}
                  onChange={e => setNewDoc({ ...newDoc, name: e.target.value })}
                  required
                />
              </Field>

              <Field label="Email address">
                <input
                  type="email"
                  placeholder="name@hospital.com"
                  className={inputClass}
                  value={newDoc.email}
                  onChange={e => setNewDoc({ ...newDoc, email: e.target.value })}
                  required
                />
              </Field>

              <Field label="Initial password">
                <input
                  type="password"
                  placeholder="At least 6 characters"
                  className={inputClass}
                  value={newDoc.password}
                  onChange={e => setNewDoc({ ...newDoc, password: e.target.value })}
                  required
                  minLength={6}
                />
              </Field>

              <Field label="Specialization">
                <SpecializationPicker
                  departments={departments}
                  value={newDoc.departmentId}
                  onChange={id => setNewDoc({ ...newDoc, departmentId: id })}
                  onCreate={createSpecialization}
                />
              </Field>

              <Field label="Qualification">
                <input
                  type="text"
                  placeholder="e.g. MBBS, MD"
                  className={inputClass}
                  value={newDoc.qualification}
                  onChange={e => setNewDoc({ ...newDoc, qualification: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Experience (yrs)">
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    className={inputClass}
                    value={newDoc.experience || ''}
                    onChange={e => setNewDoc({ ...newDoc, experience: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Consultation fee">
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    className={inputClass}
                    value={newDoc.consultationFee || ''}
                    onChange={e => setNewDoc({ ...newDoc, consultationFee: Number(e.target.value) })}
                  />
                </Field>
              </div>
            </div>

            {/* Photo + submit */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-5 pt-5 border-t border-white/10">
              <div className="flex items-center gap-3">
                {newDocPhoto ? (
                  <img src={newDocPhoto} alt="Selected doctor" className="w-11 h-11 rounded-xl object-cover border border-white/20 shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 shrink-0">
                    <UserRound className="w-4 h-4" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => newDocPhotoInput.current?.click()}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/10 text-white/80 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {newDocPhoto ? 'Change photo' : 'Upload photo'}
                </button>
                {newDocPhoto && (
                  <button
                    type="button"
                    onClick={() => setNewDocPhoto(null)}
                    className="text-white/50 hover:text-white/80 text-sm font-medium"
                  >
                    Clear
                  </button>
                )}
                <input
                  ref={newDocPhotoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleNewDocPhoto}
                />
              </div>

              <button
                type="submit"
                disabled={savingDoctor}
                className="w-full sm:w-auto bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
              >
                {savingDoctor ? 'Saving...' : 'Save doctor'}
              </button>
            </div>
          </motion.form>
        )}
        </AnimatePresence>

        {/* Shared picker used by the photo action on each row */}
        <input
          ref={rowPhotoInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleRowPhoto}
        />

        {/* Doctors list */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <div className="relative sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
              <input
                type="text"
                value={doctorSearch}
                onChange={e => setDoctorSearch(e.target.value)}
                placeholder="Search doctors..."
                className="w-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-pink-500/50"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead className="bg-white/5 text-white/70 text-sm">
                <tr>
                  <th className="p-4 font-medium">Doctor</th>
                  <th className="p-4 font-medium hidden lg:table-cell">Email</th>
                  <th className="p-4 font-medium">Specialization</th>
                  <th className="p-4 font-medium hidden sm:table-cell">Experience</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {visibleDoctors.map(doc => (
                  <tr key={doc.id} className="text-white align-middle">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <DoctorAvatar doctor={doc} />
                        {editingId === doc.id ? (
                          <input
                            type="text"
                            className="bg-black/30 border border-white/20 rounded-lg px-2 py-1 text-white text-sm outline-none focus:border-pink-500/50 w-40"
                            value={editDraft.name}
                            onChange={e => setEditDraft({ ...editDraft, name: e.target.value })}
                          />
                        ) : (
                          <div className="min-w-0">
                            <div className="font-medium truncate">{doc.name}</div>
                            <div className="text-xs text-white/50 truncate lg:hidden">{doc.user?.email}</div>
                            {doc.qualification && <div className="text-xs text-white/50 truncate">{doc.qualification}</div>}
                            {doc.isActive === false && <div className="text-xs text-amber-400">Retired</div>}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-white/70 hidden lg:table-cell">{doc.user?.email}</td>
                    <td className="p-4">
                      {editingId === doc.id ? (
                        <select
                          className="bg-black/30 border border-white/20 rounded-lg px-2 py-1 text-white text-sm outline-none focus:border-pink-500/50 max-w-[10rem]"
                          value={editDraft.departmentId}
                          onChange={e => setEditDraft({ ...editDraft, departmentId: e.target.value })}
                        >
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-block bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-full text-xs font-semibold">
                          {doc.department?.name || 'Unknown'}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-white/70 hidden sm:table-cell">
                      {editingId === doc.id ? (
                        <input
                          type="number"
                          min={0}
                          className="bg-black/30 border border-white/20 rounded-lg px-2 py-1 text-white text-sm outline-none focus:border-pink-500/50 w-20"
                          value={editDraft.experienceYears || ''}
                          onChange={e => setEditDraft({ ...editDraft, experienceYears: Number(e.target.value) })}
                        />
                      ) : (
                        <span className="text-sm">{doc.experienceYears ? `${doc.experienceYears} yrs` : '—'}</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!canManage ? (
                          <span className="text-xs text-white/35">—</span>
                        ) : editingId === doc.id ? (
                          <>
                            <button
                              onClick={() => handleSaveDoctor(doc.id)}
                              title="Save"
                              className="p-2 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              title="Cancel"
                              className="p-2 rounded-lg text-white/50 hover:bg-white/10 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setPhotoTargetId(doc.id);
                                rowPhotoInput.current?.click();
                              }}
                              title="Change photo"
                              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            >
                              <Upload className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => startEditing(doc)}
                              title="Edit doctor"
                              className="p-2 rounded-lg text-blue-300 hover:bg-blue-500/10 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteDoctor(doc.id)}
                              title="Delete doctor"
                              className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleDoctors.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-white/50">
                      {doctorSearch ? `No doctors match "${doctorSearch}".` : 'No doctors registered yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
