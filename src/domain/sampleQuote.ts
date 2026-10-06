import type { Budget, IssuerProfile, IssuerSnapshot } from './types.ts'
import { snapshotFromIssuer } from './validators.ts'

export function createSampleQuote(issuer: IssuerProfile): Budget {
  const snap: IssuerSnapshot = snapshotFromIssuer(issuer)
  return {
    id: 'sample-' + crypto.randomUUID(),
    number: 0,
    date: new Date().toISOString(),
    clientSnapshot: {
      name: 'Cliente de prueba',
      rut: '12.345.678-9',
      phone: '+56 9 1234 5678',
      address: 'Avenida Ejemplo 123',
    },
    jobName: 'Remodelación vivienda',
    jobAddress: 'Los Ángeles, Chile',
    sections: [
      {
        id: 'sec-1',
        name: 'Obra general',
        items: [
          { id: 'item-1', description: 'Preparación y limpieza de terreno', type: 'servicio', quantity: 1, unit: 'global', unitPrice: 250000 },
          { id: 'item-2', description: 'Hormigón para radier', type: 'material', quantity: 2, unit: 'm3', unitPrice: 95000 },
        ],
      },
      {
        id: 'sec-2',
        name: 'Electricidad',
        items: [
          { id: 'item-3', description: 'Instalación eléctrica interior', type: 'servicio', quantity: 1, unit: 'global', unitPrice: 450000 },
        ],
      },
      {
        id: 'sec-3',
        name: 'Gasfitería',
        items: [
          { id: 'item-4', description: 'Instalación de cañerías', type: 'material', quantity: 10, unit: 'ml', unitPrice: 8500 },
        ],
      },
      {
        id: 'sec-4',
        name: 'Pintura (mixta)',
        workDetails: [
          { id: 'wd-1', description: 'Preparación de superficies' },
          { id: 'wd-2', description: 'Imprimación' },
        ],
        globalAmount: 180000,
        globalLabel: 'Monto global pintura',
        items: [
          { id: 'item-5', description: 'Pintura látex color blanco', type: 'material', quantity: 20, unit: 'unidad', unitPrice: 12000 },
        ],
      },
    ],
    discount: 0,
    ivaRate: 19,
    paymentTerms: '50% al iniciar / 50% al finalizar',
    validity: '15 días',
    validityValue: 15,
    validityUnit: 'days',
    notes: 'Documento generado únicamente para previsualizar el diseño del perfil emisor.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'pendiente',
    issuerSnapshot: snap,
    signatureMode: snap.signatureDataUrl ? 'saved' : 'manual',
  }
}
