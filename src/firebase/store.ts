import { getFirebase } from './config.ts'
import { currentUser } from './auth.ts'
import type {
  Budget,
  Client,
  IssuerProfile,
  IssuerSnapshot,
  UserProfile,
} from '../domain/types.ts'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  query,
  where,
  type Firestore,
} from 'firebase/firestore'
import { loadLegacyState, hasLegacyData, saveLegacyBackup, type LegacyState } from '../storage/store.ts'

function db(): Firestore {
  return getFirebase().db
}

function requireUid(): string {
  const user = currentUser()
  if (!user) {
    throw new Error('No hay sesión iniciada.')
  }
  return user.uid
}

/**
 * Firestore rechaza los valores `undefined` (Unsupported field value: undefined).
 * Elimina recursivamente claves con valor `undefined`/`null` antes de setDoc.
 */
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitize)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || v === null) {
        continue
      }
      out[k] = sanitize(v)
    }
    return out
  }
  return value
}

// ---------- UserProfile ----------

export async function getUserProfile(uid = requireUid()): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db(), 'users', uid, 'profile', 'me'))
  if (!snap.exists()) {
    return null
  }
  const data = snap.data()
  return {
    uid,
    displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
    phone: typeof data.phone === 'string' ? data.phone : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  }
}

export async function saveUserProfile(
  profile: UserProfile,
  uid = requireUid(),
): Promise<void> {
  await setDoc(doc(db(), 'users', uid, 'profile', 'me'), sanitize(profile) as UserProfile, { merge: true })
}

// ---------- IssuerAssets ----------

export type IssuerAssets = {
  logoDataUrl?: string
  signatureDataUrl?: string
  updatedAt: string
}

async function loadIssuerAssets(uid: string, issuerId: string): Promise<IssuerAssets | null> {
  const snap = await getDoc(doc(db(), 'users', uid, 'issuerAssets', issuerId))
  if (!snap.exists()) return null
  const data = snap.data() as Record<string, unknown>
  return {
    logoDataUrl: typeof data.logoDataUrl === 'string' ? data.logoDataUrl : undefined,
    signatureDataUrl: typeof data.signatureDataUrl === 'string' ? data.signatureDataUrl : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
  }
}

async function saveIssuerAssets(uid: string, issuerId: string, assets: IssuerAssets): Promise<void> {
  await setDoc(doc(db(), 'users', uid, 'issuerAssets', issuerId), sanitize(assets) as Record<string, unknown>, { merge: true })
}

async function deleteIssuerAssets(uid: string, issuerId: string): Promise<void> {
  try {
    await deleteDoc(doc(db(), 'users', uid, 'issuerAssets', issuerId))
  } catch {
    // Documento no existe: ignorar
  }
}

// ---------- IssuerProfile ----------

const issuerConverter = {
  toFirestore(issuer: IssuerProfile): Record<string, unknown> {
    return { ...issuer }
  },
  fromFirestore(snap: { data(): object }): { id: string } & Omit<IssuerProfile, 'id'> {
    const data = snap.data() as Record<string, unknown>
    return {
      id: String(data.id ?? ''),
      ownerUid: String(data.ownerUid ?? ''),
      kind: data.kind === 'persona' ? 'persona' : 'empresa',
      name: String(data.name ?? ''),
      rut: data.rut ? String(data.rut) : undefined,
      phone: data.phone ? String(data.phone) : undefined,
      email: data.email ? String(data.email) : undefined,
      address: data.address ? String(data.address) : undefined,
      logoDataUrl: data.logoDataUrl ? String(data.logoDataUrl) : undefined,
      logoUrl: data.logoUrl ? String(data.logoUrl) : undefined,
      info: data.info ? String(data.info) : undefined,
      giro: data.giro ? String(data.giro) : undefined,
      signatureDataUrl: data.signatureDataUrl ? String(data.signatureDataUrl) : undefined,
      signatureUrl: data.signatureUrl ? String(data.signatureUrl) : undefined,
      signerName: data.signerName ? String(data.signerName) : undefined,
      signerRut: data.signerRut ? String(data.signerRut) : undefined,
      signerRole: data.signerRole ? String(data.signerRole) : undefined,
      isDefault: data.isDefault === true,
      createdAt: String(data.createdAt ?? new Date().toISOString()),
      updatedAt: String(data.updatedAt ?? new Date().toISOString()),
    }
  },
}

function mergeIssuerWithAssets(issuer: IssuerProfile, assets: IssuerAssets | null): IssuerProfile {
  if (!assets) return issuer
  const logo = assets.logoDataUrl ?? issuer.logoDataUrl ?? issuer.logoUrl
  const signature = assets.signatureDataUrl ?? issuer.signatureDataUrl ?? issuer.signatureUrl
  return { ...issuer, logoDataUrl: logo, signatureDataUrl: signature }
}

export async function listIssuers(uid = requireUid()): Promise<IssuerProfile[]> {
  const ref = collection(db(), 'users', uid, 'issuers')
  const q = query(ref, where('ownerUid', '==', uid))
  const snap = await getDocs(q)
  const results = await Promise.all(
    snap.docs.map(async (d) => {
      const issuer = issuerConverter.fromFirestore(d) as IssuerProfile
      issuer.id = d.id
      const assets = await loadIssuerAssets(uid, d.id)
      return mergeIssuerWithAssets(issuer, assets)
    }),
  )
  return results
}

export async function saveIssuer(issuer: IssuerProfile, uid = requireUid()): Promise<void> {
  const { logoDataUrl, signatureDataUrl, logoUrl, signatureUrl, ...rest } = issuer
  void logoUrl
  void signatureUrl

  await setDoc(doc(db(), 'users', uid, 'issuers', issuer.id), sanitize(rest) as IssuerProfile, { merge: true })

  const now = new Date().toISOString()
  const assets: IssuerAssets = { updatedAt: now }
  if (logoDataUrl !== undefined) assets.logoDataUrl = logoDataUrl
  if (signatureDataUrl !== undefined) assets.signatureDataUrl = signatureDataUrl

  const hasAssets = assets.logoDataUrl !== undefined || assets.signatureDataUrl !== undefined
  if (hasAssets) {
    await saveIssuerAssets(uid, issuer.id, assets)
  }
}

/** Normaliza un objeto de datos (sin Firebase) a IssuerProfile. Uso: lectura de documentos y tests. */
export function parseIssuer(value: unknown): IssuerProfile | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const data = value as Record<string, unknown>
  const name = typeof data.name === 'string' ? data.name : ''
  const id = typeof data.id === 'string' ? data.id : ''
  if (!name.trim() || !id) {
    return null
  }
  const flag = (k: string): string | undefined =>
    typeof data[k] === 'string' && String(data[k]).trim() !== '' ? String(data[k]) : undefined
  return {
    id,
    ownerUid: flag('ownerUid') ?? '',
    kind: data.kind === 'persona' ? 'persona' : 'empresa',
    name,
    rut: flag('rut'),
    phone: flag('phone'),
    email: flag('email'),
    address: flag('address'),
    logoDataUrl: flag('logoDataUrl'),
    logoUrl: flag('logoUrl'),
    info: flag('info'),
    giro: flag('giro'),
    signatureDataUrl: flag('signatureDataUrl'),
    signatureUrl: flag('signatureUrl'),
    signerName: flag('signerName'),
    signerRut: flag('signerRut'),
    signerRole: flag('signerRole'),
    isDefault: data.isDefault === true,
    createdAt: flag('createdAt') ?? new Date().toISOString(),
    updatedAt: flag('updatedAt') ?? new Date().toISOString(),
  }
}

export async function removeIssuerSignature(uid: string, issuerId: string): Promise<void> {
  const assets = await loadIssuerAssets(uid, issuerId)
  if (assets) {
    delete assets.signatureDataUrl
    assets.updatedAt = new Date().toISOString()
    await saveIssuerAssets(uid, issuerId, assets)
  }
}

export async function deleteIssuerDoc(id: string, uid = requireUid()): Promise<void> {
  await deleteDoc(doc(db(), 'users', uid, 'issuers', id))
  await deleteIssuerAssets(uid, id)
}

export async function setDefaultIssuer(id: string, uid = requireUid()): Promise<void> {
  const issuers = await listIssuers(uid)
  const batch = writeBatch(db())
  for (const iss of issuers) {
    if (iss.id === id) {
      batch.set(doc(db(), 'users', uid, 'issuers', iss.id), sanitize({ ...iss, isDefault: true }) as IssuerProfile, { merge: true })
    } else if (iss.isDefault) {
      batch.set(doc(db(), 'users', uid, 'issuers', iss.id), sanitize({ ...iss, isDefault: false }) as IssuerProfile, { merge: true })
    }
  }
  await batch.commit()
}

// ---------- Clients ----------

export async function listClients(uid = requireUid()): Promise<Client[]> {
  const ref = collection(db(), 'users', uid, 'clients')
  const snap = await getDocs(ref)
  return snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>
      const name = typeof data.name === 'string' ? data.name : ''
      if (!name.trim()) {
        return null
      }
      return {
        id: d.id,
        name,
        rut: data.rut ? String(data.rut) : undefined,
        phone: data.phone ? String(data.phone) : undefined,
        address: data.address ? String(data.address) : undefined,
      } as Client
    })
    .filter((c): c is Client => c !== null)
}

export async function saveClient(client: Client, uid = requireUid()): Promise<void> {
  await setDoc(doc(db(), 'users', uid, 'clients', client.id), sanitize(client) as Client, { merge: true })
}

export async function deleteClientDoc(id: string, uid = requireUid()): Promise<void> {
  await deleteDoc(doc(db(), 'users', uid, 'clients', id))
}

// ---------- Cotizaciones (quotes) ----------

export async function listQuotes(uid = requireUid()): Promise<Budget[]> {
  const ref = collection(db(), 'users', uid, 'quotes')
  const snap = await getDocs(ref)
  return snap.docs
    .map((d) => d.data() as Budget)
    .filter((b) => b && typeof b.id === 'string' && b.id !== '')
}

export async function saveQuote(budget: Budget, uid = requireUid()): Promise<void> {
  const clean: Record<string, unknown> = { ...budget }
  delete clean.paymentMode
  await setDoc(doc(db(), 'users', uid, 'quotes', budget.id), sanitize(clean) as Budget, { merge: true })
}

export async function deleteQuoteDoc(id: string, uid = requireUid()): Promise<void> {
  await deleteDoc(doc(db(), 'users', uid, 'quotes', id))
}

// ---------- Numeración por usuario ----------

export async function allocateNextQuoteNumber(uid = requireUid()): Promise<number> {
  const dbx = db()
  const counterRef = doc(dbx, 'users', uid, 'meta', 'counter')
  return runTransaction(dbx, async (tx) => {
    const snap = await tx.get(counterRef)
    const current = snap.exists() && typeof snap.data().nextNumber === 'number'
      ? snap.data().nextNumber
      : 1
    tx.set(counterRef, { nextNumber: current + 1 })
    return current
  })
}

// ---------- Migración ----------

export async function migrationFlag(uid = requireUid()): Promise<
  'pending' | 'done' | 'dismissed' | 'none'
> {
  const snap = await getDoc(doc(db(), 'users', uid, 'meta', 'migration'))
  if (!snap.exists()) {
    return 'none'
  }
  const v = snap.data().state
  return v === 'done' || v === 'dismissed' ? v : 'none'
}

export async function setMigrationFlag(
  state: 'done' | 'dismissed',
  uid = requireUid(),
): Promise<void> {
  await setDoc(
    doc(db(), 'users', uid, 'meta', 'migration'),
    { state, migratedAt: new Date().toISOString() },
    { merge: true },
  )
}

export async function migrateLegacyToFirestore(
  snapshot: IssuerSnapshot,
  uid = requireUid(),
): Promise<{ quotes: number; clients: number; issuers: number }> {
  const legacy = loadLegacyState()
  const dbx = db()
  const batch = writeBatch(dbx)

  // Perfil emisor legacy (empresa)
  const issuer: IssuerProfile = {
    id: 'issuer-legacy',
    ownerUid: uid,
    kind: 'empresa',
    name: (legacy.company?.name || 'Mi empresa').trim() || 'Mi empresa',
    rut: legacy.company?.rut,
    phone: legacy.company?.phone,
    email: legacy.company?.email,
    address: legacy.company?.address,
    logoDataUrl: legacy.company?.logoDataUrl,
    info: undefined,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  batch.set(doc(dbx, 'users', uid, 'issuers', issuer.id), issuer)
  const issuers = 1

  // Clientes
  let clients = 0
  for (const c of legacy.clients ?? []) {
    batch.set(doc(dbx, 'users', uid, 'clients', c.id), c)
    clients++
  }

  // Cotizaciones con issuerSnapshot del legacy
  let quotes = 0
  for (const b of legacy.budgets ?? []) {
    const withIssuer: Budget = {
      ...b,
      issuerSnapshot: b.issuerSnapshot ?? snapshot,
    }
    batch.set(doc(dbx, 'users', uid, 'quotes', b.id), withIssuer)
    quotes++
  }

  await batch.commit()

  // Contador: max(números)+1, o legacy si es mayor
  const nums = (legacy.budgets ?? []).map((b) => b.number).filter((n) => n > 0)
  const maxNum = nums.length ? Math.max(...nums) : 0
  const counterValue = legacy.nextBudgetNumber > maxNum + 1 ? legacy.nextBudgetNumber : maxNum + 1
  const counterRef = doc(dbx, 'users', uid, 'meta', 'counter')
  await runTransaction(dbx, async (tx) => {
    const snap = await tx.get(counterRef)
    const existing = snap.exists() && typeof snap.data().nextNumber === 'number'
      ? snap.data().nextNumber
      : 1
    tx.set(counterRef, { nextNumber: Math.max(existing, counterValue) })
  })

  saveLegacyBackup()

  return { quotes, clients, issuers }
}

export { hasLegacyData, type LegacyState }
