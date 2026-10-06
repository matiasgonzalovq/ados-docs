export type CompanyConfig = {
  name: string
  rut?: string
  phone?: string
  email?: string
  address?: string
  logoDataUrl?: string
}

export type UserProfile = {
  uid: string
  displayName?: string
  phone?: string
  createdAt: string
}

export type IssuerKind = 'empresa' | 'persona'

export type RGB = [number, number, number]

export type IssuerProfile = {
  id: string
  ownerUid: string
  kind: IssuerKind
  name: string
  rut?: string
  phone?: string
  email?: string
  address?: string
  logoDataUrl?: string
  logoUrl?: string
  info?: string
  giro?: string
  signatureDataUrl?: string
  signatureUrl?: string
  signerName?: string
  signerRut?: string
  signerRole?: string
  isDefault?: boolean
  themeColor?: RGB
  createdAt: string
  updatedAt: string
}

export type IssuerSnapshot = {
  issuerId: string
  kind: IssuerKind
  name: string
  rut?: string
  phone?: string
  email?: string
  address?: string
  logoDataUrl?: string
  logoUrl?: string
  info?: string
  giro?: string
  signatureDataUrl?: string
  signatureUrl?: string
  signerName?: string
  signerRut?: string
  signerRole?: string
  themeColor?: RGB
}

export type Client = {
  id: string
  name: string
  rut?: string
  phone?: string
  address?: string
}

export type Unit = 'unidad' | 'm2' | 'm3' | 'ml' | 'hora' | 'jornada' | 'global'

export type BudgetStatus = 'pendiente' | 'se-realizara' | 'no-realizada'

export type ItemType = 'material' | 'mano-de-obra' | 'servicio' | 'otro'

export type ClientSnapshot = {
  name: string
  rut?: string
  phone?: string
  address?: string
}

export type CatalogCategory = 'mano-de-obra' | 'material' | 'servicio' | 'otro'

export type CatalogItem = {
  id: string
  name: string
  description?: string
  category: CatalogCategory
  unit: Unit
  unitPrice: number
  createdAt: string
  updatedAt: string
}

export type BudgetItem = {
  id: string
  description: string
  type: ItemType
  quantity: number
  unit: Unit
  unitPrice: number
  observation?: string
  groupName?: string
}

export type WorkDetail = {
  id: string
  description: string
}

export type BudgetSection = {
  id: string
  name: string
  items: BudgetItem[]
  workDetails?: WorkDetail[]
  globalAmount?: number
  globalLabel?: string
}

export type ValidityUnit = 'days' | 'months'
export type ExecutionTimeUnit = 'days' | 'weeks' | 'months'

export type Budget = {
  id: string
  number: number
  date: string
  clientId?: string
  clientSnapshot?: ClientSnapshot
  jobName: string
  jobAddress: string
  sections: BudgetSection[]
  discount: number
  ivaRate: number
  paymentTerms: string
  validity: string
  validityValue?: number
  validityUnit?: ValidityUnit
  executionTimeValue?: number
  executionTimeUnit?: ExecutionTimeUnit
  notes: string
  createdAt: string
  updatedAt: string
  isDraft?: boolean
  paymentMode?: string
  status?: BudgetStatus
  issuerSnapshot?: IssuerSnapshot
  signatureMode?: 'none' | 'manual' | 'saved'
  pricingMode?: 'standard' | 'insurance-adjustment'
  overheadRate?: number
  ufValue?: number
  ufConversionDate?: string
  deductibleUf?: number
  workTableTitle?: string
}
