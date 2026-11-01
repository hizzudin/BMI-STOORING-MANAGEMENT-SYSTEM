/**
 * Bilingual string table — Indonesian (default) + English, user-selectable
 * (PRODUCT.md "UI language"; PRD §7.11 / FG-15). Keeping the catalogue in a
 * plain typed object (not a runtime i18n lib) keeps the field bundle tiny for
 * older Android 8.0+ phones and makes every key type-checked at compile time.
 *
 * `Lang` defaults to `id`. Every user-facing label in the app resolves through
 * {@link makeT} so no screen hard-codes a single-language string.
 */

export const LANGS = ['id', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'id';

/** The translatable keys. Kept flat for simple, exhaustive typing. */
export interface Strings {
  appName: string;
  // Auth
  loginTitle: string;
  email: string;
  password: string;
  signIn: string;
  signingIn: string;
  signOut: string;
  loginFailed: string;
  // Menus
  menu: string;
  driverMenu: string;
  fieldCoordinatorMenu: string;
  systemAdminMenu: string;
  mechanicMenu: string;
  profile: string;
  // Driver actions
  inspection: string;
  odometer: string;
  reportBreakdown: string;
  history: string;
  // FC actions
  requests: string;
  purchase: string;
  // SysAdmin
  fieldReportBreakdown: string;
  // Breakdown flow
  breakdownTitle: string;
  vehicle: string;
  captureLocation: string;
  locationCaptured: string;
  locationNotCaptured: string;
  findingNote: string;
  findingNoteHint: string;
  findingNoteRequired: string;
  submitBreakdown: string;
  breakdownDone: string;
  // Odometer
  odometerReading: string;
  saveReading: string;
  odometerSaved: string;
  jumpWarning: string;
  // FC draft
  draftTitle: string;
  draftFindingNote: string;
  sendForReview: string;
  draftNoteRequired: string;
  draftSent: string;
  // Mechanic today list
  todayTasks: string;
  noTasksToday: string;
  rolledOver: string;
  urgentWord: string;
  highWord: string;
  normalWord: string;
  lowWord: string;
  // Profile / notifications (DQ-01)
  notificationSettings: string;
  pushNotifications: string;
  emailNotifications: string;
  language: string;
  save: string;
  saved: string;
  // Generic
  loading: string;
  retry: string;
  cancel: string;
  back: string;
  required: string;
}

const id: Strings = {
  appName: 'BMI Stooring',
  loginTitle: 'Masuk',
  email: 'Email',
  password: 'Kata sandi',
  signIn: 'Masuk',
  signingIn: 'Sedang masuk…',
  signOut: 'Keluar',
  loginFailed: 'Email atau kata sandi salah.',
  menu: 'Menu',
  driverMenu: 'Menu Sopir',
  fieldCoordinatorMenu: 'Menu Korlap',
  systemAdminMenu: 'Menu Admin Sistem',
  mechanicMenu: 'Menu Mekanik',
  profile: 'Profil',
  inspection: 'Inspeksi',
  odometer: 'Odometer',
  reportBreakdown: 'Lapor Mogok',
  history: 'Riwayat',
  requests: 'Permintaan',
  purchase: 'Pembelian',
  fieldReportBreakdown: 'Lapor Mogok (atas nama sopir)',
  breakdownTitle: 'Lapor Mogok',
  vehicle: 'Kendaraan',
  captureLocation: 'Ambil Lokasi',
  locationCaptured: 'Lokasi terekam',
  locationNotCaptured: 'Lokasi belum diambil',
  findingNote: 'Catatan temuan',
  findingNoteHint: 'Jelaskan apa yang terjadi (wajib).',
  findingNoteRequired: 'Catatan temuan wajib diisi.',
  submitBreakdown: 'Kirim Laporan',
  breakdownDone: 'Laporan terkirim. WO otomatis dibuat.',
  odometerReading: 'Angka odometer (km)',
  saveReading: 'Simpan',
  odometerSaved: 'Odometer tersimpan.',
  jumpWarning: 'Peringatan: lonjakan km tidak wajar.',
  draftTitle: 'Draf Permintaan',
  draftFindingNote: 'Catatan temuan',
  sendForReview: 'Kirim untuk Ditinjau',
  draftNoteRequired: 'Isi catatan temuan sebelum mengirim.',
  draftSent: 'Draf terkirim untuk ditinjau.',
  todayTasks: 'Tugas Hari Ini',
  noTasksToday: 'Tidak ada tugas hari ini.',
  rolledOver: 'Tertunda',
  urgentWord: 'Mendesak',
  highWord: 'Tinggi',
  normalWord: 'Normal',
  lowWord: 'Rendah',
  notificationSettings: 'Pengaturan Notifikasi',
  pushNotifications: 'Notifikasi push',
  emailNotifications: 'Notifikasi email',
  language: 'Bahasa',
  save: 'Simpan',
  saved: 'Tersimpan.',
  loading: 'Memuat…',
  retry: 'Coba lagi',
  cancel: 'Batal',
  back: 'Kembali',
  required: 'Wajib',
};

const en: Strings = {
  appName: 'BMI Stooring',
  loginTitle: 'Sign in',
  email: 'Email',
  password: 'Password',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  signOut: 'Sign out',
  loginFailed: 'Invalid email or password.',
  menu: 'Menu',
  driverMenu: 'Driver menu',
  fieldCoordinatorMenu: 'Field Coordinator menu',
  systemAdminMenu: 'System Admin menu',
  mechanicMenu: 'Mechanic menu',
  profile: 'Profile',
  inspection: 'Inspection',
  odometer: 'Odometer',
  reportBreakdown: 'Report breakdown',
  history: 'History',
  requests: 'Requests',
  purchase: 'Purchase',
  fieldReportBreakdown: 'Report breakdown (on a driver\u2019s behalf)',
  breakdownTitle: 'Report breakdown',
  vehicle: 'Vehicle',
  captureLocation: 'Capture location',
  locationCaptured: 'Location captured',
  locationNotCaptured: 'Location not captured yet',
  findingNote: 'Finding note',
  findingNoteHint: 'Describe what happened (required).',
  findingNoteRequired: 'A finding note is required.',
  submitBreakdown: 'Send report',
  breakdownDone: 'Report sent. A Work Order was auto-drafted.',
  odometerReading: 'Odometer reading (km)',
  saveReading: 'Save',
  odometerSaved: 'Odometer saved.',
  jumpWarning: 'Warning: unusual km jump.',
  draftTitle: 'Draft request',
  draftFindingNote: 'Finding note',
  sendForReview: 'Send for review',
  draftNoteRequired: 'Type a finding note before sending.',
  draftSent: 'Draft sent for review.',
  todayTasks: 'Today\u2019s tasks',
  noTasksToday: 'No tasks scheduled for today.',
  rolledOver: 'Rolled over',
  urgentWord: 'Urgent',
  highWord: 'High',
  normalWord: 'Normal',
  lowWord: 'Low',
  notificationSettings: 'Notification settings',
  pushNotifications: 'Push notifications',
  emailNotifications: 'Email notifications',
  language: 'Language',
  save: 'Save',
  saved: 'Saved.',
  loading: 'Loading…',
  retry: 'Retry',
  cancel: 'Cancel',
  back: 'Back',
  required: 'Required',
};

const TABLES: Record<Lang, Strings> = { id, en };

/** A translator bound to one language. */
export type Translator = (key: keyof Strings) => string;

/** Build a translator for a language, defaulting to Indonesian. */
export function makeT(lang: Lang = DEFAULT_LANG): Translator {
  const table = TABLES[lang] ?? TABLES[DEFAULT_LANG];
  return (key) => table[key];
}

/** The word to show on a priority's urgency pill, translated. */
export function priorityWord(
  t: Translator,
  priority: 'Urgent' | 'High' | 'Normal' | 'Low',
): string {
  switch (priority) {
    case 'Urgent':
      return t('urgentWord');
    case 'High':
      return t('highWord');
    case 'Normal':
      return t('normalWord');
    case 'Low':
      return t('lowWord');
    default: {
      const _exhaustive: never = priority;
      return _exhaustive;
    }
  }
}
