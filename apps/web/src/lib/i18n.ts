/**
 * Lightweight bilingual dictionary (Indonesian default + English), kept
 * intentionally simple so the shell is i18n-ready without hard-blocking a
 * future i18n library (PRODUCT: UI language ID default + EN, user-selectable).
 *
 * The active locale is carried in a cookie and read server-side, so the first
 * paint is already localised (no client flash). Keys are flat dotted strings;
 * `t(locale, key)` falls back to Indonesian, then to the key itself.
 */

export const LOCALES = ['id', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'id';
export const LOCALE_COOKIE = 'bmi_locale';

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'id' || value === 'en';
}

type Dict = Readonly<Record<string, string>>;

const id: Dict = {
  'app.name': 'BMI Stooring System',
  'nav.dashboard': 'Dasbor',
  'nav.workOrders': 'Work Order',
  'nav.requests': 'Permintaan',
  'nav.schedule': 'Jadwal',
  'nav.approvals': 'Persetujuan',
  'nav.inventory': 'Inventori',
  'nav.vehicles': 'Kendaraan',
  'nav.signOut': 'Keluar',
  'nav.collapse': 'Perkecil menu',
  'nav.expand': 'Perbesar menu',

  'login.title': 'Masuk',
  'login.subtitle': 'Masuk untuk mengelola Work Order armada BMI.',
  'login.email': 'Email',
  'login.password': 'Kata sandi',
  'login.submit': 'Masuk',
  'login.error': 'Email atau kata sandi salah.',
  'login.hint': 'Akun contoh (mode setup): sysadmin@bmi.test / Bmi12345',

  'common.loading': 'Memuat…',
  'common.save': 'Simpan',
  'common.saveDraft': 'Simpan draft',
  'common.cancel': 'Batal',
  'common.create': 'Buat',
  'common.back': 'Kembali',
  'common.approve': 'Setujui',
  'common.reject': 'Tolak',
  'common.reason': 'Alasan',
  'common.none': '—',
  'common.all': 'Semua',
  'common.search': 'Cari',
  'common.role': 'Peran',
  'common.status': 'Status',
  'common.priority': 'Urgensi',
  'common.vehicle': 'Kendaraan',
  'common.actions': 'Aksi',
  'common.view': 'Lihat',
  'common.language': 'Bahasa',

  'dashboard.title': 'Dasbor',
  'dashboard.welcome': 'Selamat datang',
  'dashboard.notifications': 'Notifikasi belum dibaca',
  'dashboard.noCards': 'Tidak ada kartu untuk peran ini.',

  'wo.title': 'Work Order',
  'wo.number': 'Nomor',
  'wo.category': 'Kategori',
  'wo.description': 'Deskripsi',
  'wo.findingNote': 'Catatan temuan',
  'wo.findingNoteHelp': 'Catatan dari pelapor lapangan — hanya baca, tidak berubah saat Anda mengedit deskripsi.',
  'wo.createTitle': 'Buat Work Order',
  'wo.steps': 'Langkah',
  'wo.noSteps': 'Belum ada langkah.',
  'wo.create': 'Buat Work Order',
  'wo.list.empty': 'Tidak ada Work Order.',
  'wo.detail.steps': 'Langkah kerja',
  'wo.detail.context': 'Konteks',
  'wo.requiresDowntime': 'Perlu masuk bengkel',

  'requests.title': 'Permintaan',
  'requests.subtitle': 'Draft permintaan lapangan yang menunggu diproses Planner.',
  'requests.empty': 'Tidak ada permintaan draft.',
  'requests.compose': 'Susun Work Order',

  'step.title': 'Langkah',
  'step.module': 'Modul',
  'step.executor': 'Pelaksana',
  'step.verifier': 'Pemeriksa',
  'step.sequence': 'Urutan',
  'step.waitingFor': 'Menunggu',
  'step.assignee': 'Ditugaskan ke',

  'approvals.title': 'Kotak Persetujuan',
  'approvals.count': 'menunggu',
  'approvals.empty': 'Tidak ada item persetujuan.',
  'approvals.stage': 'Tahap',
  'approvals.mine': 'Milik Anda',

  'inventory.title': 'Inventori',
  'inventory.parts': 'Suku cadang',
  'inventory.tyres': 'Ban',
  'inventory.sku': 'SKU',
  'inventory.name': 'Nama',
  'inventory.qty': 'Jumlah',
  'inventory.avgCost': 'Biaya rata-rata',
  'inventory.empty': 'Tidak ada data.',

  'vehicles.title': 'Kendaraan',
  'vehicles.plate': 'Plat',
  'vehicles.odometer': 'Odometer',
  'vehicles.empty': 'Tidak ada kendaraan.',

  'schedule.title': 'Jadwal',
  'schedule.plannedDate': 'Tanggal rencana',
  'schedule.rolledOver': 'Digeser / terlambat',
  'schedule.empty': 'Tidak ada kartu jadwal.',

  'error.generic': 'Terjadi kesalahan.',
  'error.unauthorized': 'Sesi berakhir. Silakan masuk kembali.',
};

const en: Dict = {
  'app.name': 'BMI Stooring System',
  'nav.dashboard': 'Dashboard',
  'nav.workOrders': 'Work Orders',
  'nav.requests': 'Requests',
  'nav.schedule': 'Schedule',
  'nav.approvals': 'Approvals',
  'nav.inventory': 'Inventory',
  'nav.vehicles': 'Vehicles',
  'nav.signOut': 'Sign out',
  'nav.collapse': 'Collapse menu',
  'nav.expand': 'Expand menu',

  'login.title': 'Sign in',
  'login.subtitle': 'Sign in to manage the BMI fleet Work Orders.',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.error': 'Wrong email or password.',
  'login.hint': 'Example account (setup mode): sysadmin@bmi.test / Bmi12345',

  'common.loading': 'Loading…',
  'common.save': 'Save',
  'common.saveDraft': 'Save draft',
  'common.cancel': 'Cancel',
  'common.create': 'Create',
  'common.back': 'Back',
  'common.approve': 'Approve',
  'common.reject': 'Reject',
  'common.reason': 'Reason',
  'common.none': '—',
  'common.all': 'All',
  'common.search': 'Search',
  'common.role': 'Role',
  'common.status': 'Status',
  'common.priority': 'Urgency',
  'common.vehicle': 'Vehicle',
  'common.actions': 'Actions',
  'common.view': 'View',
  'common.language': 'Language',

  'dashboard.title': 'Dashboard',
  'dashboard.welcome': 'Welcome',
  'dashboard.notifications': 'Unread notifications',
  'dashboard.noCards': 'No cards for this role.',

  'wo.title': 'Work Orders',
  'wo.number': 'Number',
  'wo.category': 'Category',
  'wo.description': 'Description',
  'wo.findingNote': 'Finding note',
  'wo.findingNoteHelp': 'Note from the field originator — read only, unchanged when you edit the description.',
  'wo.createTitle': 'Create Work Order',
  'wo.steps': 'Steps',
  'wo.noSteps': 'No steps yet.',
  'wo.create': 'Create Work Order',
  'wo.list.empty': 'No Work Orders.',
  'wo.detail.steps': 'Work steps',
  'wo.detail.context': 'Context',
  'wo.requiresDowntime': 'Requires workshop downtime',

  'requests.title': 'Requests',
  'requests.subtitle': 'Field request drafts awaiting the Planner.',
  'requests.empty': 'No draft requests.',
  'requests.compose': 'Compose Work Order',

  'step.title': 'Step',
  'step.module': 'Module',
  'step.executor': 'Executor',
  'step.verifier': 'Verifier',
  'step.sequence': 'Sequence',
  'step.waitingFor': 'Waiting for',
  'step.assignee': 'Assigned to',

  'approvals.title': 'Approvals inbox',
  'approvals.count': 'waiting',
  'approvals.empty': 'No approval items.',
  'approvals.stage': 'Stage',
  'approvals.mine': 'Yours',

  'inventory.title': 'Inventory',
  'inventory.parts': 'Parts',
  'inventory.tyres': 'Tyres',
  'inventory.sku': 'SKU',
  'inventory.name': 'Name',
  'inventory.qty': 'Qty',
  'inventory.avgCost': 'Average cost',
  'inventory.empty': 'No data.',

  'vehicles.title': 'Vehicles',
  'vehicles.plate': 'Plate',
  'vehicles.odometer': 'Odometer',
  'vehicles.empty': 'No vehicles.',

  'schedule.title': 'Schedule',
  'schedule.plannedDate': 'Planned date',
  'schedule.rolledOver': 'Rolled over / late',
  'schedule.empty': 'No schedule cards.',

  'error.generic': 'Something went wrong.',
  'error.unauthorized': 'Session expired. Please sign in again.',
};

const DICTS: Record<Locale, Dict> = { id, en };

export function t(locale: Locale, key: string): string {
  return DICTS[locale][key] ?? DICTS.id[key] ?? key;
}

/** Bind a locale once and reuse the translator (ergonomic in components). */
export function translator(locale: Locale): (key: string) => string {
  return (key: string) => t(locale, key);
}
